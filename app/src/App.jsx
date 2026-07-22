import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import customersData from './data/customers.json';
import retailData from './data/retail.json';
import { C, daysSince, CHANNELS, ASSUMPTIONS, BASE_TOTALS, formatBRL, formatNum, formatPct, recommendChannel, applyFilters, EMPTY_FILTERS } from './utils';
import './App.css';

// Ticket médio calculado das transações recorrentes reais da Base de Varejo
const { _totalTr, _totalVr } = retailData.reduce(
  (acc, r) => ({ _totalTr: acc._totalTr + r.tr, _totalVr: acc._totalVr + r.vr }),
  { _totalTr: 0, _totalVr: 0 }
);
const TICKET_MEDIO_REDE = _totalVr / _totalTr;

const CHANNEL_LIMITS = { whatsapp: 300, sms: 160, push_title: 40, push_body: 120 };
const BLOCKED_PROMISES = /aprovação garantida|sem juros|juros zero|100% aprovado|crédito pré-?aprovado|limite ilimitado/gi;
const PII_REGEX = /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b|[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-z]{2,}|\(\d{2}\)\s?\d{4,5}-?\d{4}/g;

function auditMessage(channel, body) {
  const issues = [];
  if (BLOCKED_PROMISES.test(body)) issues.push('Contém promessa não sustentada');
  BLOCKED_PROMISES.lastIndex = 0;
  if (PII_REGEX.test(body)) issues.push('Contém dado pessoal');
  PII_REGEX.lastIndex = 0;
  const limit = channel === 'push' ? CHANNEL_LIMITS.push_body : CHANNEL_LIMITS[channel];
  if (body.length > limit) issues.push(`${body.length}/${limit} caracteres`);
  return issues;
}

function isControl(id, controlPct) {
  return (id * 2654435761 % 100) < controlPct;
}

function computeRevStats(group, avgJuros, avgParcelas) {
  // Ticket: média real das transações recorrentes da rede de varejos parceiros (Base de Varejo)
  // Juros e parcelas: dados reais do cliente; se não disponível (clientes sem histórico),
  // usa a média dos 23.047 clientes adimplentes com compras registradas
  const revs = group.map(c => {
    const ticket = TICKET_MEDIO_REDE;
    const j = c[C.TAXA_JUROS] || avgJuros;
    const p = c[C.PARCELAS] || avgParcelas;
    return ticket * ASSUMPTIONS.processingFee + ticket * j * p;
  }).sort((a, b) => a - b);
  const n = revs.length;
  if (!n) return { revMean: 0, revP25: 0, revMedian: 0, revP75: 0 };
  return {
    revMean:   revs.reduce((a, b) => a + b, 0) / n,
    revP25:    revs[Math.floor(n * 0.25)],
    revMedian: revs[Math.floor(n * 0.5)],
    revP75:    revs[Math.floor(n * 0.75)],
  };
}

const SEGMENTS = [
  {
    id: 'never-app',
    name: 'Nunca compraram (com app)',
    why: seg => `Push é grátis — teste sem risco financeiro. ${formatNum(seg.count)} clientes contactáveis a custo zero.`,
    filter: c => c[C.COMPRAS] === 0 && c[C.TEM_APP],
    suggested: false,
  },
  {
    id: 'never-noapp',
    name: 'Nunca compraram (sem app)',
    why: seg => `Maior massa da base: ${formatNum(seg.count)} clientes com ${formatBRL(seg.limMedio * seg.count)} em limite parado. CAC já foi pago.`,
    filter: c => c[C.COMPRAS] === 0 && !c[C.TEM_APP],
  },
  {
    id: 'once',
    name: 'Compraram 1 vez',
    why: seg => `Provaram o produto mas não voltaram. ${formatPct(seg.comApp / seg.count)} têm app — push + WhatsApp.`,
    filter: c => c[C.COMPRAS] === 1,
  },
  {
    id: 'recurrent-low',
    name: 'Recorrentes (2-5 compras)',
    why: () => 'Hábito começando. Parou — por quê? Alto potencial de reengajamento.',
    filter: c => c[C.COMPRAS] >= 2 && c[C.COMPRAS] <= 5,
  },
  {
    id: 'recurrent-high',
    name: 'Recorrentes (6+ compras)',
    why: seg => `Grupo mais valioso: limite médio ${formatBRL(seg.limMedio)} e maior receita por reativação.`,
    filter: c => c[C.COMPRAS] >= 6,
  },
];

function demoVariants(pctNunca) {
  const nunca = pctNunca > 50;
  return [
    { channel: 'whatsapp', variants: [
      { label: 'A', body: nunca
        ? 'Oi! Seu crédito Ume está aprovado e pronto pra usar 💚 Parcele suas compras nos varejos parceiros. Responda AQUI e veja onde comprar.'
        : 'Sentimos sua falta! Seu limite Ume continua disponível. Volte a parcelar nos varejos parceiros perto de você. Responda AQUI para ver as lojas.' },
      { label: 'B', body: nunca
        ? 'Você já tem crédito aprovado na Ume. Sem burocracia: escolha a loja parceira e parcele. Responda SIM para saber mais.'
        : 'Faz tempo! Seu crédito Ume continua ativo. Aproveite para parcelar aquela compra que está adiando. Responda SIM.' },
    ]},
    { channel: 'sms', variants: [
      { label: 'A', body: 'Ume: seu credito esta aprovado com limite disponivel. Parcele nos varejos parceiros. ume.com.br' },
      { label: 'B', body: 'Seu limite Ume esta parado! Use para parcelar em lojas parceiras perto de voce. ume.com.br' },
    ]},
    { channel: 'push', variants: [
      { label: 'A', body: 'Você tem crédito disponível na Ume. Toque para ver onde usar.' },
      { label: 'B', body: 'Seu crédito Ume está ativo. Veja os varejos parceiros perto de você.' },
    ]},
  ];
}

export default function App() {
  const customers = useMemo(() => customersData, []);

  const [showLanding, setShowLanding] = useState(true);
  const [selectedSegment, setSelectedSegment] = useState(null);
  const [customFilters, setCustomFilters] = useState(EMPTY_FILTERS);
  const [channelMode, setChannelMode] = useState('smart');
  const [forcedChannel, setForcedChannel] = useState('whatsapp');
  const [controlPct, setControlPct] = useState(10);
  const [scoreMin, setScoreMin] = useState(0);
  const [exported, setExported] = useState(false);
  const [copiedVariant, setCopiedVariant] = useState(null);
  const [guardrails, setGuardrails] = useState({ overlap: false, cooldown: false });

  const step2Ref = useRef(null);

  // F1: scroll automático + F11: reset de config ao trocar segmento
  const selectSegment = useCallback((i) => {
    setSelectedSegment(prev => {
      if (prev !== i) {
        setChannelMode('smart');
        setForcedChannel('whatsapp');
        setControlPct(10);
        setScoreMin(0);
        setExported(false);
        setGuardrails({ overlap: false, cooldown: false });
      }
      return i;
    });
    if (i !== CUSTOM_IDX) {
      setTimeout(() => step2Ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
    }
  }, []);

  const baseStats = useMemo(() => {
    let limTotal = 0, comApp = 0, nuncaComprou = 0, limNunca = 0;
    for (const c of customers) {
      limTotal += c[C.LIM_DISP] || 0;
      if (c[C.TEM_APP]) comApp++;
      if (c[C.COMPRAS] === 0) { nuncaComprou++; limNunca += c[C.LIM_DISP] || 0; }
    }
    return { limTotal, comApp, nuncaComprou, limNunca };
  }, [customers]);

  // Média real da planilha — usada como fallback para quem ainda não comprou
  const dataAvg = useMemo(() => {
    let jSum = 0, pSum = 0, n = 0;
    for (const c of customers) {
      if (c[C.TAXA_JUROS] && c[C.PARCELAS]) { jSum += c[C.TAXA_JUROS]; pSum += c[C.PARCELAS]; n++; }
    }
    return { avgJuros: n ? jSum / n : 0.115, avgParcelas: n ? pSum / n : 6.5, nComHistorico: n };
  }, [customers]);

  const segmentData = useMemo(() => {
    return SEGMENTS.map(seg => {
      const group = customers.filter(seg.filter);
      if (!group.length) return { ...seg, count: 0 };
      const limMedio = group.reduce((s, c) => s + (c[C.LIM_DISP] || 0), 0) / group.length;
      const scoreMedio = group.reduce((s, c) => s + (c[C.SCORE] || 0), 0) / group.length;
      const comApp = group.filter(c => c[C.TEM_APP]).length;
      let cost = 0;
      for (const c of group) cost += CHANNELS[recommendChannel(c)].cost;
      const dormDays = group.map(c => daysSince(c[C.DT_ULT_COMPRA])).filter(d => d < Infinity);
      const dormMedia = dormDays.length ? Math.round(dormDays.reduce((a, b) => a + b, 0) / dormDays.length) : null;
      const { revMean, revP25, revMedian, revP75 } = computeRevStats(group, dataAvg.avgJuros, dataAvg.avgParcelas);
      return { ...seg, count: group.length, limMedio, scoreMedio, comApp, cost, dormMedia,
               revPerClient: revMedian, revP25, revMedian, revP75, ids: group.map(c => c[C.ID]) };
    });
  }, [customers]);

  const CUSTOM_IDX = SEGMENTS.length; // index 5

  const customSegment = useMemo(() => {
    if (selectedSegment !== CUSTOM_IDX) return null;
    const group = applyFilters(customers, customFilters);
    if (!group.length) return { id: 'custom', name: 'Personalizado', count: 0, filter: () => false };
    const limMedio = group.reduce((s, c) => s + (c[C.LIM_DISP] || 0), 0) / group.length;
    const scoreMedio = group.reduce((s, c) => s + (c[C.SCORE] || 0), 0) / group.length;
    const comApp = group.filter(c => c[C.TEM_APP]).length;
    let cost = 0;
    for (const c of group) cost += CHANNELS[recommendChannel(c)].cost;
    const dormDays = group.map(c => daysSince(c[C.DT_ULT_COMPRA])).filter(d => d < Infinity);
    const dormMedia = dormDays.length ? Math.round(dormDays.reduce((a, b) => a + b, 0) / dormDays.length) : null;
    const { revMean, revP25, revMedian, revP75 } = computeRevStats(group, dataAvg.avgJuros, dataAvg.avgParcelas);
    const ids = group.map(c => c[C.ID]);
    // Build a filter function that matches by ID set for reuse in projection
    const idSet = new Set(ids);
    return { id: 'custom', name: 'Personalizado', count: group.length, limMedio, scoreMedio, comApp, cost, dormMedia,
             revPerClient: revMedian, revP25, revMedian, revP75, ids, filter: c => idSet.has(c[C.ID]) };
  }, [selectedSegment, customers, customFilters]);

  const selected = selectedSegment === null
    ? null
    : selectedSegment === CUSTOM_IDX
      ? customSegment
      : segmentData[selectedSegment];

  const CONV_SCENARIOS = [
    { label: 'Conservador', pct: 0.02 },
    { label: 'Base',        pct: 0.05 },
    { label: 'Otimista',    pct: 0.10 },
  ];

  const projection = useMemo(() => {
    if (!selected || !selected.count) return null;
    const rawGroup = customers.filter(selected.filter);

    // Exclusão por score mínimo
    const excludedByScore = scoreMin > 0 ? rawGroup.filter(c => (c[C.SCORE] || 0) < scoreMin).length : 0;
    const group = scoreMin > 0 ? rawGroup.filter(c => (c[C.SCORE] || 0) >= scoreMin) : rawGroup;
    if (!group.length) return null;

    // Canal único forçado: push só alcança quem tem app — exclui sem-app de ambos os grupos
    const eligible = (channelMode === 'forced' && forcedChannel === 'push')
      ? group.filter(c => c[C.TEM_APP])
      : group;
    const unreachableCount = group.length - eligible.length;

    const treatment = [], control = [];
    for (const c of eligible) (isControl(c[C.ID], controlPct) ? control : treatment).push(c);

    const reachable = treatment;

    let totalCost = 0;
    const channels = { push: 0, whatsapp: 0, sms: 0 };
    for (const c of reachable) {
      const ch = channelMode === 'smart' ? recommendChannel(c) : forcedChannel;
      totalCost += CHANNELS[ch].cost;
      channels[ch]++;
    }

    // Break-even: reativações necessárias para cobrir o custo total
    const conversionsNeeded = totalCost > 0 ? Math.ceil(totalCost / selected.revPerClient) : 0;
    const breakeven = totalCost > 0 && reachable.length > 0
      ? (conversionsNeeded / reachable.length * 100)
      : 0;

    return { treatment: reachable, unreachableCount, control, totalCost, channels, breakeven, conversionsNeeded, excludedByScore, filteredCount: group.length };
  }, [selected, customers, controlPct, channelMode, forcedChannel, scoreMin]);

  const projectedOpens = useMemo(() => {
    if (!projection) return 0;
    return Math.round(
      (projection.channels.push     || 0) * CHANNELS.push.openRate +
      (projection.channels.whatsapp || 0) * CHANNELS.whatsapp.openRate +
      (projection.channels.sms      || 0) * CHANNELS.sms.openRate
    );
  }, [projection]);

  const exportCSV = () => {
    if (!projection) return;
    const exportTreatment = projection.treatment;
    const headers = 'ID,Score,LimiteDisponivel,Compras,Dormencia,TemApp,Grupo,Canal\n';
    const allClients = [
      ...exportTreatment.map(c => ({ c, grupo: 'tratamento' })),
      ...projection.control.map(c => ({ c, grupo: 'controle' })),
    ];
    const rows = allClients.map(({ c, grupo }) => {
      const ch = channelMode === 'smart' ? recommendChannel(c) : forcedChannel;
      const d = daysSince(c[C.DT_ULT_COMPRA]);
      return [c[C.ID], c[C.SCORE], c[C.LIM_DISP], c[C.COMPRAS], d === Infinity ? '' : d,
        c[C.TEM_APP] ? 'Sim' : 'Não', grupo, grupo === 'controle' ? '' : CHANNELS[ch].label].join(',');
    }).join('\n');
    const blob = new Blob([headers + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ume_${selected.id}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setExported(true);
  };

  const pctNunca = selected ? customers.filter(selected.filter).filter(c => c[C.COMPRAS] === 0).length / selected.count * 100 : 0;
  const exportCount = projection ? projection.treatment.length + projection.control.length : 0;

  if (showLanding) {
    return (
      <div className="landing">
        <div className="landing-left">
          <div className="landing-left-content">
            <div className="landing-logo-large">
              <span className="logo-text">ume</span><span className="logo-dot">.</span>
              <span className="logo-sub">pulse</span>
            </div>
            <p className="landing-tagline-left">Planeje sua campanha de reativação</p>
            <div className="landing-decor" />
          </div>
        </div>
        <div className="landing-right">
          <div className="landing-right-content">
            <div className="landing-badge">Smart Reactivation Engine</div>
            <h1 className="landing-h1">
              R$ 20M parado.<br /><span>Pronto pra crescer.</span>
            </h1>
            <p className="landing-desc">
              Descubra quem reativar, por qual canal e quanto isso vale, com dados reais e sem achismo. Tudo pronto em 4 passos.
            </p>
            <div className="landing-features">
              <div className="landing-feature">
                <span className="feature-icon">📊</span>
                <span>Segmentação inteligente</span>
              </div>
              <div className="landing-feature">
                <span className="feature-icon">💚</span>
                <span>ROI projetado com dados reais</span>
              </div>
              <div className="landing-feature">
                <span className="feature-icon">⚡</span>
                <span>Pronto pra executar</span>
              </div>
            </div>
            <button className="landing-cta-primary" onClick={() => setShowLanding(false)}>
              Começar agora →
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="header">
        <button
          className="logo logo-button"
          onClick={() => setShowLanding(true)}
          title="Voltar para a home"
          aria-label="Voltar para a home"
        >
          <div className="logo-wordmark">
            <span className="logo-text">ume</span><span className="logo-dot">.</span>
            <span className="logo-sub">pulse</span>
          </div>
        </button>
      </header>

      <main className="main">
        {/* ── HERO ── */}
        <section className="hero-section">
          <div className="eyebrow">O problema</div>
          <h1>R$ {(baseStats.limTotal / 1e6).toFixed(0)}M em crédito aprovado parado</h1>
          <p className="hero-sub">
            {formatNum(customers.length)} clientes adimplentes.{' '}
            {formatNum(baseStats.nuncaComprou)} nunca compraram.{' '}
            100% dos que compraram estão dormentes.
          </p>
          <div className="hero-stats">
            <div className="hero-stat">
              <div className="hero-stat-value">{formatNum(BASE_TOTALS.total)}</div>
              <div className="hero-stat-label">cadastrados</div>
            </div>
            <div className="hero-stat-arrow">→</div>
            <div className="hero-stat">
              <div className="hero-stat-value">{formatNum(BASE_TOTALS.adimplentes)}</div>
              <div className="hero-stat-label">adimplentes</div>
            </div>
            <div className="hero-stat-arrow">→</div>
            <div className="hero-stat">
              <div className="hero-stat-value">{formatPct(baseStats.nuncaComprou / customers.length)}</div>
              <div className="hero-stat-label">nunca compraram</div>
            </div>
            <div className="hero-stat-arrow">→</div>
            <div className="hero-stat">
              <div className="hero-stat-value">0</div>
              <div className="hero-stat-label">clientes ativos</div>
            </div>
          </div>
          <p className="hero-footnote">
            Excluídos: {formatNum(BASE_TOTALS.negadas)} crédito negado + {formatNum(BASE_TOTALS.inadimplentes)} inadimplentes.
          </p>
        </section>

        {/* ── STEP 1: Quem reativar? ── */}
        <section className="step-section">
          <div className="step-header">
            <span className="step-number">1</span>
            <div>
              <h2>Quem reativar?</h2>
              <p className="step-sub">Escolha um grupo. Os números mostram o potencial de cada um.</p>
            </div>
          </div>

          <div className="segment-grid">
            {segmentData.map((seg, i) => (
              <button
                key={seg.id}
                className={`segment-card ${selectedSegment === i ? 'selected' : ''}`}
                onClick={() => selectSegment(i)}
              >
                <h3>
                  {seg.name}
                  {seg.suggested && <span className="chip-suggested">Para começar</span>}
                </h3>
                <div className="segment-numbers">
                  <span className="segment-big">{formatNum(seg.count)}</span>
                  <span className="segment-label">clientes</span>
                </div>
                <p className="segment-why">{seg.why(seg)}</p>
                <div className="segment-meta">
                  <span>Receita/reativação: {seg.revP25 === seg.revP75
                    ? <>{formatBRL(seg.revPerClient)} <span className="meta-range">(estimativa única — sem histórico individual)</span></>
                    : <>{formatBRL(seg.revP25)} – {formatBRL(seg.revP75)} <span className="meta-range">(intervalo)</span></>
                  }</span>
                  <span>Limite médio: {formatBRL(seg.limMedio)}</span>
                  {seg.comApp > 0 && <span>{formatPct(seg.comApp / seg.count)} com app · push grátis</span>}
                  {seg.dormMedia && <span>Dormência média: {seg.dormMedia} dias</span>}
                </div>
              </button>
            ))}

            {/* Card personalizado */}
            <button
              className={`segment-card segment-card-custom ${selectedSegment === CUSTOM_IDX ? 'selected segment-card-custom-active' : ''}`}
              onClick={() => selectSegment(CUSTOM_IDX)}
            >
              <h3>Personalizar segmento</h3>
              <div className="segment-numbers">
                {selectedSegment === CUSTOM_IDX && customSegment?.count > 0
                  ? <><span className="segment-big">{formatNum(customSegment.count)}</span><span className="segment-label">clientes</span></>
                  : <span className="segment-label custom-hint">Defina os critérios abaixo →</span>
                }
              </div>
              {selectedSegment === CUSTOM_IDX && customSegment?.count > 0 && (
                <div className="segment-meta">
                  <span>Receita/reativação: {formatBRL(customSegment.revP25)} – {formatBRL(customSegment.revP75)} <span className="meta-range">(intervalo)</span></span>
                  <span>Limite médio: {formatBRL(customSegment.limMedio)}</span>
                  {customSegment.comApp > 0 && <span>{formatPct(customSegment.comApp / customSegment.count)} com app</span>}
                  {customSegment.dormMedia && <span>Dormência média: {customSegment.dormMedia} dias</span>}
                </div>
              )}
              <p className="segment-why">Combine compras, score, dormência, canal e perfil.</p>
            </button>
          </div>

          {/* Filtros do segmento personalizado */}
          {selectedSegment === CUSTOM_IDX && (
            <div className="custom-filters">

              {/* PERFIL */}
              <div className="cf-group">
                <div className="cf-group-label">Perfil</div>
                <div className="cf-row">
                  <span className="cf-row-label">Sexo</span>
                  <select value={customFilters.sexo} onChange={e => setCustomFilters(f => ({ ...f, sexo: e.target.value }))}>
                    <option value="todos">Todos</option>
                    <option value="F">Feminino</option>
                    <option value="M">Masculino</option>
                  </select>
                </div>
                <div className="cf-row">
                  <span className="cf-row-label">Idade</span>
                  <div className="cf-range">
                    <input type="number" min="18" max="100" value={customFilters.idadeMin}
                      onChange={e => setCustomFilters(f => ({ ...f, idadeMin: e.target.value }))} placeholder="18" />
                    <span className="cf-dash">–</span>
                    <input type="number" min="18" max="100" value={customFilters.idadeMax}
                      onChange={e => setCustomFilters(f => ({ ...f, idadeMax: e.target.value }))} placeholder="100" />
                    <span className="cf-unit">anos</span>
                  </div>
                </div>
              </div>

              {/* COMPORTAMENTO */}
              <div className="cf-group">
                <div className="cf-group-label">Comportamento</div>
                <div className="cf-row">
                  <span className="cf-row-label">Compras</span>
                  <div className="cf-range">
                    <input type="number" min="0" value={customFilters.comprasMin}
                      onChange={e => setCustomFilters(f => ({ ...f, comprasMin: e.target.value }))} placeholder="0" />
                    <span className="cf-dash">–</span>
                    <input type="number" min="0" value={customFilters.comprasMax}
                      onChange={e => setCustomFilters(f => ({ ...f, comprasMax: e.target.value }))} placeholder="∞" />
                  </div>
                </div>
                <div className="cf-row">
                  <span className="cf-row-label">Dormência</span>
                  <div className="cf-range">
                    <input type="number" min="0" value={customFilters.dormanciaMin}
                      onChange={e => setCustomFilters(f => ({ ...f, dormanciaMin: e.target.value }))} placeholder="0" />
                    <span className="cf-dash">–</span>
                    <input type="number" min="0" value={customFilters.dormanciaMax}
                      onChange={e => setCustomFilters(f => ({ ...f, dormanciaMax: e.target.value }))} placeholder="∞" />
                    <span className="cf-unit">dias</span>
                  </div>
                </div>
                <div className="cf-row">
                  <span className="cf-row-label">Varejos</span>
                  <div className="cf-range">
                    <input type="number" min="0" value={customFilters.varejosMin}
                      onChange={e => setCustomFilters(f => ({ ...f, varejosMin: e.target.value }))} placeholder="0" />
                    <span className="cf-dash">–</span>
                    <input type="number" min="0" value={customFilters.varejosMax}
                      onChange={e => setCustomFilters(f => ({ ...f, varejosMax: e.target.value }))} placeholder="∞" />
                  </div>
                </div>
                <div className="cf-row">
                  <span className="cf-row-label">Parcelas <small>(média)</small></span>
                  <div className="cf-range">
                    <input type="number" min="1" max="24" value={customFilters.parcelasMin}
                      onChange={e => setCustomFilters(f => ({ ...f, parcelasMin: e.target.value }))} placeholder="1" />
                    <span className="cf-dash">–</span>
                    <input type="number" min="1" max="24" value={customFilters.parcelasMax}
                      onChange={e => setCustomFilters(f => ({ ...f, parcelasMax: e.target.value }))} placeholder="24" />
                    <span className="cf-unit">x</span>
                  </div>
                </div>
                <div className="cf-row">
                  <span className="cf-row-label">Juros <small>(média)</small></span>
                  <div className="cf-range">
                    <input type="number" min="0" max="30" step="0.1" value={customFilters.jurosMin}
                      onChange={e => setCustomFilters(f => ({ ...f, jurosMin: e.target.value }))} placeholder="0" />
                    <span className="cf-dash">–</span>
                    <input type="number" min="0" max="30" step="0.1" value={customFilters.jurosMax}
                      onChange={e => setCustomFilters(f => ({ ...f, jurosMax: e.target.value }))} placeholder="30" />
                    <span className="cf-unit">% a.m.</span>
                  </div>
                </div>
              </div>

              {/* CRÉDITO */}
              <div className="cf-group">
                <div className="cf-group-label">Crédito</div>
                <div className="cf-row">
                  <span className="cf-row-label">Score <small>(550–1000)</small></span>
                  <div className="cf-range">
                    <input type="number" min="550" max="1000" value={customFilters.scoreMin}
                      onChange={e => setCustomFilters(f => ({ ...f, scoreMin: e.target.value }))} placeholder="550" />
                    <span className="cf-dash">–</span>
                    <input type="number" min="550" max="1000" value={customFilters.scoreMax}
                      onChange={e => setCustomFilters(f => ({ ...f, scoreMax: e.target.value }))} placeholder="1000" />
                  </div>
                </div>
                <div className="cf-row">
                  <span className="cf-row-label">Limite disp. mín.</span>
                  <div className="cf-range">
                    <input type="number" min="0" value={customFilters.limDispMin}
                      onChange={e => setCustomFilters(f => ({ ...f, limDispMin: e.target.value }))} placeholder="0" />
                    <span className="cf-unit">R$</span>
                  </div>
                </div>
              </div>

              {/* CANAL */}
              <div className="cf-group cf-group-last">
                <div className="cf-group-label">Canal</div>
                <div className="cf-row">
                  <span className="cf-row-label">App</span>
                  <select value={customFilters.temApp} onChange={e => setCustomFilters(f => ({ ...f, temApp: e.target.value }))}>
                    <option value="todos">Todos</option>
                    <option value="sim">Com app (push grátis)</option>
                    <option value="nao">Sem app</option>
                  </select>
                </div>
              </div>

              {customSegment?.count === 0 && (
                <p className="cf-empty">Nenhum cliente encontrado com esses critérios.</p>
              )}
              <button className="cf-reset" onClick={() => setCustomFilters(EMPTY_FILTERS)}>Limpar filtros</button>
            </div>
          )}
        </section>

        {/* ── STEP 2: Vale a pena? ── */}
        {selected && projection && (
          <section className="step-section" ref={step2Ref}>
            <div className="step-header">
              <span className="step-number">2</span>
              <div>
                <h2>Vale a pena?</h2>
                <p className="step-sub">Projeção de retorno por cenário · configure o canal e a proteção da base.</p>
              </div>
            </div>

            {/* ── Receita por reativação ── */}
            <div className="viability-revenue">
              Cada reativação gera <strong>{formatBRL(selected.revPerClient)}</strong> em receita
              {selected.revP25 === selected.revP75
                ? <span className="viability-caveat"> — média de {formatNum(dataAvg.nComHistorico)} compradores (sem histórico individual)</span>
                : <span className="viability-range"> · varia de {formatBRL(selected.revP25)} a {formatBRL(selected.revP75)} neste segmento</span>
              }
            </div>

            {/* ── Cards de cenário ── */}
            <div className="scenario-grid">
              {CONV_SCENARIOS.map(s => {
                const conversions = Math.round(projectedOpens * s.pct);
                const revenue = conversions * selected.revPerClient;
                const net = revenue - projection.totalCost;
                return (
                  <div key={s.label} className="scenario-card">
                    <div className="sc-header">
                      <span className="sc-label">{s.label}</span>
                      <span className="sc-pct">{formatPct(s.pct)} dos que abrirem compram</span>
                    </div>
                    <div className="sc-body">
                      <span className="sc-stat">{formatNum(projectedOpens)} aberturas → {formatNum(conversions)} compras</span>
                      <div className="sc-net-row">
                        <span className="sc-net-label">Retorno líquido</span>
                        <span className={`sc-net ${net >= 0 ? 'positive' : 'negative'}`}>{formatBRL(net)}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* ── Regra de break-even ── */}
            <div className="be-rule">
              Para cobrir o custo de <strong>{projection.totalCost === 0 ? 'R$ 0,00' : formatBRL(projection.totalCost)}</strong>:&nbsp;
              {projection.totalCost === 0
                ? <span>canal gratuito — <strong>qualquer reativação é lucro</strong></span>
                : <><strong>{projection.conversionsNeeded} {projection.conversionsNeeded === 1 ? 'reativação' : 'reativações'}</strong> de {formatNum(projection.treatment.length)} clientes — <strong>{projection.breakeven.toFixed(2)}% de conversão</strong></>
              }
              <span className="be-rule-source"> · Receita: ticket {formatBRL(TICKET_MEDIO_REDE)} · {(dataAvg.avgJuros*100).toFixed(1)}% a.m. · {dataAvg.avgParcelas.toFixed(1)}x parcelas · 3% taxa</span>
            </div>

            {/* ── Configuração ── */}
            <div className="config-block-header">Configure a campanha</div>
            <div className="channel-config">
              <div className="config-row">
                <div className="config-row-label">Canal</div>
                <div className="config-row-body">
                  <div className="channel-options">
                    <label className={channelMode === 'smart' ? 'selected' : ''}>
                      <input type="radio" name="ch" checked={channelMode === 'smart'} onChange={() => setChannelMode('smart')} />
                      <strong>Inteligente</strong> — push se tem app (grátis), WhatsApp se não tem app (35% abertura)
                    </label>
                    <label className={channelMode === 'forced' ? 'selected' : ''}>
                      <input type="radio" name="ch" checked={channelMode === 'forced'} onChange={() => setChannelMode('forced')} />
                      <strong>Canal único</strong>
                      {channelMode === 'forced' && (
                        <select value={forcedChannel} onChange={e => setForcedChannel(e.target.value)} style={{ marginLeft: '0.5rem' }}>
                          {Object.entries(CHANNELS).map(([k, v]) => (
                            <option key={k} value={k}>{v.label} — {v.cost === 0 ? 'grátis' : formatBRL(v.cost) + '/msg'}</option>
                          ))}
                        </select>
                      )}
                    </label>
                  </div>
                  {projection.unreachableCount > 0 && (
                    <p className="warn-unreachable">
                      ⚠ {formatNum(projection.unreachableCount)} clientes sem app não receberão push e foram excluídos da campanha.
                      Use o modo <strong>Inteligente</strong> para alcançá-los via WhatsApp ou SMS.
                    </p>
                  )}
                </div>
              </div>

              <div className="config-row">
                <div className="config-row-label">Custo</div>
                <div className="config-row-body">
                  <div className="cost-summary">
                    <span className="cost-total">{projection.totalCost === 0 ? 'R$ 0,00 (push gratuito)' : formatBRL(projection.totalCost)}</span>
                    <span className="cost-breakdown">
                      {Object.entries(projection.channels).filter(([,v]) => v > 0).map(([k,v]) =>
                        `${formatNum(v)} ${CHANNELS[k].label}`
                      ).join(' · ')}
                    </span>
                    <span className="cost-breakeven-inline">
                      Break-even: <strong>{projection.conversionsNeeded} {projection.conversionsNeeded === 1 ? 'reativação' : 'reativações'}</strong> de {formatNum(projection.treatment.length)} clientes — {projection.breakeven.toFixed(2)}% de conversão
                    </span>
                  </div>
                </div>
              </div>

              <div className="config-row">
                <div className="config-row-label">Controle</div>
                <div className="config-row-body">
                  <div className="control-config">
                    <label>
                      Tamanho do grupo:
                      <select value={controlPct} onChange={e => { setControlPct(Number(e.target.value)); setExported(false); }}>
                        {[5, 10, 15, 20].map(v => <option key={v} value={v}>{v}%</option>)}
                      </select>
                    </label>
                    <span className="control-explain">
                      {formatNum(projection.control.length)} clientes não recebem mensagem — são a prova de que o resultado veio da campanha.
                    </span>
                  </div>
                </div>
              </div>

              <div className="config-row config-row-advanced">
                <div className="config-row-label">Filtro avançado</div>
                <div className="config-row-body">
                  <div className="exclusion-row" style={{ marginBottom: 0 }}>
                    <label className="exclusion-item">
                      Excluir score abaixo de
                      <select value={scoreMin} onChange={e => { setScoreMin(Number(e.target.value)); setExported(false); }}>
                        <option value={0}>Sem filtro (min. 550 na base)</option>
                        <option value={600}>≥ 600</option>
                        <option value={650}>≥ 650</option>
                        <option value={700}>≥ 700</option>
                        <option value={750}>≥ 750</option>
                        <option value={800}>≥ 800</option>
                      </select>
                    </label>
                    {projection.excludedByScore > 0 && (
                      <span className="exclusion-badge">
                        {formatNum(projection.excludedByScore)} removidos · {formatNum(projection.filteredCount)} permanecem
                      </span>
                    )}
                  </div>
                  <div className="exclusion-note" style={{ marginTop: '0.4rem' }}>
                    Cooldown de 30 dias aplicado pelo disparador — clientes contactados recentemente são excluídos automaticamente.
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* ── GUARDRAILS ── */}
        {selected && projection && (
          <div className="guardrail-gate">
            <div className="guardrail-gate-header">
              <span className="guardrail-gate-title">Proteções antes de avançar</span>
              <span className="guardrail-gate-sub">O Pulse protege o histórico conhecido; o CRM completa a verificação.</span>
            </div>
            <div className={`guardrail-item ${guardrails.overlap ? 'checked' : ''}`}
                 onClick={() => setGuardrails(g => ({ ...g, overlap: !g.overlap }))}>
              <input type="checkbox" checked={guardrails.overlap} readOnly />
              <div className="guardrail-body">
                <strong>Sobreposição verificada</strong>
                <span>Confirme que estes {formatNum(projection.treatment.length)} clientes não estão em outra campanha ativa nos últimos 30 dias.</span>
              </div>
              <span className={`guardrail-badge ${guardrails.overlap ? 'done' : 'pending'}`}>
                {guardrails.overlap ? 'Confirmado' : 'Pendente'}
              </span>
            </div>
            <div className={`guardrail-item ${guardrails.cooldown ? 'checked' : ''}`}
                 onClick={() => setGuardrails(g => ({ ...g, cooldown: !g.cooldown }))}>
              <input type="checkbox" checked={guardrails.cooldown} readOnly />
              <div className="guardrail-body">
                <strong>Cooldown externo confirmado</strong>
                <span>Valide no CRM no máximo 1 contato por cliente em 30 dias.</span>
              </div>
              <span className={`guardrail-badge ${guardrails.cooldown ? 'done' : 'pending'}`}>
                {guardrails.cooldown ? 'Confirmado' : 'Pendente'}
              </span>
            </div>
          </div>
        )}

        {/* ── STEP 3: Executar ── */}
        {selected && projection && guardrails.overlap && guardrails.cooldown && (
          <section className="step-section">
            <div className="step-header">
              <span className="step-number">3</span>
              <div>
                <h2>Executar</h2>
                <p className="step-sub">Revise as mensagens e exporte a lista para o disparador.</p>
              </div>
            </div>

            {/* F9: Mensagens sempre visíveis, sem toggle — com botão Copiar */}
            <div className="messages-block">
              <div className="privacy-banner">
                🔒 Mensagens geradas sem dados individuais — apenas perfil agregado do segmento.
              </div>
              <div className="messages-grid">
                {demoVariants(pctNunca).map(ch => (
                  <div key={ch.channel} className="message-channel">
                    <h4>
                      <span className="channel-dot" style={{ background: CHANNELS[ch.channel].color }} />
                      {CHANNELS[ch.channel].label}
                    </h4>
                    {ch.variants.map(v => {
                      const issues = auditMessage(ch.channel, v.body);
                      const limit = ch.channel === 'push' ? CHANNEL_LIMITS.push_body : CHANNEL_LIMITS[ch.channel];
                      const varKey = `${ch.channel}-${v.label}`;
                      return (
                        <div key={v.label} className="message-card">
                          <div className="message-header">
                            <span className="variant-badge">{v.label}</span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                              <span className={`char-counter ${v.body.length > limit ? 'over' : ''}`}>{v.body.length}/{limit}</span>
                              <button className="btn-copy" onClick={() => {
                                navigator.clipboard.writeText(v.body);
                                setCopiedVariant(varKey);
                                setTimeout(() => setCopiedVariant(null), 2000);
                              }}>
                                {copiedVariant === varKey ? '✓ Copiado' : 'Copiar'}
                              </button>
                            </div>
                          </div>
                          <p>{v.body}</p>
                          {issues.map((iss, k) => (
                            <div key={k} className="message-issue">⚠️ {iss}</div>
                          ))}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>

            {/* F4: Botão com breakdown tratamento + controle */}
            <div className="export-block">
              <button className="btn-export" onClick={exportCSV}>
                {`Exportar lista — ${formatNum(projection.treatment.length)} tratamento + ${formatNum(projection.control.length)} controle`}
              </button>
              <p className="export-detail">
                CSV com colunas: ID, Score, Limite, Compras, Dormência, App, <strong>Grupo</strong> (tratamento/controle), <strong>Canal</strong>.
              </p>
            </div>

            {/* F7: Checklist pós-export */}
            {exported && (
              <div className="post-export-checklist">
                <div className="pec-title">✓ CSV baixado — próximos passos</div>
                <ol className="pec-steps">
                  <li>Importe o arquivo no disparador e <strong>separe pelo campo Grupo</strong> (tratamento envia, controle fica quieto)</li>
                  <li>Configure <strong>cooldown de 30 dias</strong> no disparador para evitar reenvio acidental</li>
                  <li>Volte em <strong>7 dias</strong> e verifique o limiar: ≥ <strong>{projection.conversionsNeeded} reativações</strong> no grupo tratamento para escalar</li>
                </ol>
              </div>
            )}
          </section>
        )}

        {/* ── STEP 4: Medir ── */}
        {selected && projection && guardrails.overlap && guardrails.cooldown && (
          <section className="step-section measure-section">
            <div className="step-header">
              <span className="step-number">4</span>
              <div>
                <h2>Medir</h2>
                <p className="step-sub">Sem isso, você está no escuro — como antes.</p>
              </div>
            </div>

            <div className="measure-steps">
              <div className="measure-step">
                <div className="measure-when">Agora</div>
                <div className="measure-what">
                  <strong>Dispare apenas para o grupo "tratamento"</strong>{' '}
                  ({formatNum(projection.treatment.length)} clientes).
                  O grupo "controle" ({formatNum(projection.control.length)}) não recebe nada — é a prova de que o resultado veio da campanha, não de outro fator.
                  Use variantes A e B — metade cada.
                </div>
              </div>
              <div className="measure-step">
                <div className="measure-when">Medição</div>
                <div className="measure-what">
                  <strong>Medição final:</strong> compare % de compradores no tratamento vs. controle.
                  A diferença é o <strong>efeito causal</strong> da campanha — não correlação, não feeling.
                  Se tratamento = controle, a campanha não surtiu efeito — os clientes teriam comprado de qualquer forma.
                </div>
              </div>
              <div className="measure-step">
                <div className="measure-when">Depois</div>
                <div className="measure-what">
                  <strong>Decida com dados:</strong> ROI positivo → escale para os outros segmentos.
                  ROI negativo → mude o público, a mensagem ou o canal.
                  Compare variantes A vs. B — a melhor vira padrão da próxima campanha.
                  O grupo de controle desta rodada pode receber a próxima campanha otimizada.
                </div>
              </div>
            </div>
          </section>
        )}

        <footer className="app-footer" />
      </main>
    </div>
  );
}
