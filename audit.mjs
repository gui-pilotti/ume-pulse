import { readFileSync } from 'fs';

const customers = JSON.parse(readFileSync('E:/UME/app/src/data/customers.json', 'utf8'));
const C = { ID:0,IDADE:1,SEXO:2,DT_ENTRADA:3,COMPRAS:4,LIM_DISP:5,LIM_TOTAL:6,
            AUMENTO:7,DT_ULT_COMPRA:8,QTD_VAREJOS:9,TEM_APP:10,PARCELAS:11,TAXA_JUROS:12,SCORE:13 };
const now = Date.now();
function days(s){ return s ? Math.floor((now-(s-25569)*86400000)/86400000) : Infinity; }
const h = t => console.log('\n══════════════════════════════════════════════\n  '+t+'\n══════════════════════════════════════════════');
const pct = (v,t) => (v/t*100).toFixed(1)+'%';

// ── INTEGRIDADE ───────────────────────────────
h('0. INTEGRIDADE DA BASE');
const scores=[], lims=[];
for(const c of customers){ scores.push(c[C.SCORE]||0); lims.push(c[C.LIM_DISP]||0); }
scores.sort((a,b)=>a-b); lims.sort((a,b)=>a-b);
console.log(`Total: ${customers.length}`);
console.log(`Score: min=${scores[0]}, max=${scores[scores.length-1]}, med=${scores[Math.floor(scores.length/2)]}`);
console.log(`Limite: min=R$${lims[0].toFixed(0)}, max=R$${lims[lims.length-1].toFixed(0)}, med=R$${lims[Math.floor(lims.length/2)].toFixed(0)}`);

// ── MÉDIAS GLOBAIS (compradores com histórico) ─
const buyers = customers.filter(c=>c[C.TAXA_JUROS]&&c[C.PARCELAS]);
const gJuros = buyers.reduce((s,c)=>s+c[C.TAXA_JUROS],0)/buyers.length;
const gParc  = buyers.reduce((s,c)=>s+c[C.PARCELAS],0)/buyers.length;
const jurosArr = buyers.map(c=>c[C.TAXA_JUROS]).sort((a,b)=>a-b);
const parcArr  = buyers.map(c=>c[C.PARCELAS]).sort((a,b)=>a-b);
h('1. MÉDIAS GLOBAIS DA PLANILHA (base do revPerClient)');
console.log(`Compradores com juros+parcelas: ${buyers.length} (${pct(buyers.length,customers.length)})`);
console.log(`Taxa juros: avg=${(gJuros*100).toFixed(2)}%, med=${(jurosArr[Math.floor(jurosArr.length/2)]*100).toFixed(2)}%, min=${(jurosArr[0]*100).toFixed(2)}%, max=${(jurosArr[jurosArr.length-1]*100).toFixed(2)}%`);
console.log(`Parcelas: avg=${gParc.toFixed(2)}, med=${parcArr[Math.floor(parcArr.length/2)]}, min=${parcArr[0]}, max=${parcArr[parcArr.length-1]}`);

// ── SEGMENTOS ─────────────────────────────────
h('2. AUDITORIA DOS SEGMENTOS');
const segs = [
  {label:'Nunca compraram (com app)',   f:c=>c[C.COMPRAS]===0&&c[C.TEM_APP]},
  {label:'Nunca compraram (sem app)',   f:c=>c[C.COMPRAS]===0&&!c[C.TEM_APP]},
  {label:'Compraram 1 vez',            f:c=>c[C.COMPRAS]===1},
  {label:'Recorrentes 2-5x',           f:c=>c[C.COMPRAS]>=2&&c[C.COMPRAS]<=5},
  {label:'Recorrentes 6+',             f:c=>c[C.COMPRAS]>=6},
];
for(const seg of segs){
  const g=customers.filter(seg.f);
  const limMedio=g.reduce((s,c)=>s+(c[C.LIM_DISP]||0),0)/g.length;
  const comApp=g.filter(c=>c[C.TEM_APP]).length;
  const comJuros=g.filter(c=>c[C.TAXA_JUROS]&&c[C.PARCELAS]).length;
  let cost=0; const ch={push:0,wpp:0,sms:0};
  for(const c of g){
    if(c[C.TEM_APP]){ch.push++;}
    else if((c[C.LIM_DISP]||0)*0.03>2){cost+=0.30;ch.wpp++;}
    else{cost+=0.03;ch.sms++;}
  }
  const avgJ=g.reduce((s,c)=>s+(c[C.TAXA_JUROS]||gJuros),0)/g.length;
  const avgP=g.reduce((s,c)=>s+(c[C.PARCELAS]||gParc),0)/g.length;
  const ticket=limMedio*0.5;
  const rev=ticket*0.03+ticket*avgJ*avgP;
  const dorms=g.map(c=>days(c[C.DT_ULT_COMPRA])).filter(d=>d<Infinity);
  const dormMedia=dorms.length?Math.round(dorms.reduce((a,b)=>a+b,0)/dorms.length):null;

  console.log(`\n── ${seg.label}`);
  console.log(`   n=${g.length} (${pct(g.length,customers.length)})`);
  console.log(`   Limite médio: R$${limMedio.toFixed(0)} [DADO REAL]`);
  console.log(`   Score médio: ${(g.reduce((s,c)=>s+(c[C.SCORE]||0),0)/g.length).toFixed(0)} [DADO REAL]`);
  console.log(`   Com app: ${comApp} (${pct(comApp,g.length)}) [DADO REAL]`);
  console.log(`   Com juros/parcelas históricos: ${comJuros} (${pct(comJuros,g.length)}) — resto usa fallback gJuros/gParc`);
  console.log(`   avgJuros usada: ${(avgJ*100).toFixed(2)}% | avgParcelas: ${avgP.toFixed(2)}`);
  console.log(`   Custo total: R$${cost.toFixed(2)} (push:${ch.push} wpp:${ch.wpp} sms:${ch.sms}) [DADO REAL]`);
  if(dormMedia) console.log(`   Dormência média: ${dormMedia}d [DADO REAL]`);
  console.log(`   revPerClient = R$${ticket.toFixed(0)}×0.03 + R$${ticket.toFixed(0)}×${(avgJ*100).toFixed(2)}%×${avgP.toFixed(2)} = R$${rev.toFixed(2)}`);
  console.log(`   [ticket=50%×limite: HIPÓTESE | juros/parc: DADO REAL para ${comJuros} clientes, fallback para ${g.length-comJuros}]`);

  const treat=Math.round(g.length*0.9);
  const tCost=cost*0.9;
  const be=tCost>0?(tCost/rev/treat*100):0;
  console.log(`   Break-even: ${be.toFixed(4)}% [CALCULADO]`);
  console.log(`   Cenários (tratamento=${treat}, controle 10%):`);
  for(const r of [0.5,1,2]){
    const conv=Math.round(treat*r/100);
    const revenue=conv*rev;
    const profit=revenue-tCost;
    console.log(`     ${r}%: ${conv} conv → receita R$${revenue.toFixed(0)} − custo R$${tCost.toFixed(0)} = lucro R$${profit.toFixed(0)}`);
  }
}

// ── revPerClient: VARIÂNCIA ──────────────────
h('3. VARIÂNCIA DO revPerClient (o app usa uma média — quão representativa é?)');
const withData=customers.filter(c=>c[C.TAXA_JUROS]&&c[C.PARCELAS]&&c[C.LIM_DISP]);
const revs=withData.map(c=>{const t=c[C.LIM_DISP]*0.5;return t*0.03+t*c[C.TAXA_JUROS]*c[C.PARCELAS];}).sort((a,b)=>a-b);
const avg=revs.reduce((a,b)=>a+b,0)/revs.length;
const std=Math.sqrt(revs.reduce((s,v)=>s+(v-avg)**2,0)/revs.length);
console.log(`Clientes com dados completos: ${withData.length}`);
console.log(`revPerClient: avg=R$${avg.toFixed(2)}, std=R$${std.toFixed(2)}`);
console.log(`P10=R$${revs[Math.floor(revs.length*0.1)].toFixed(2)}, P25=R$${revs[Math.floor(revs.length*0.25)].toFixed(2)}, P50=R$${revs[Math.floor(revs.length*0.5)].toFixed(2)}, P75=R$${revs[Math.floor(revs.length*0.75)].toFixed(2)}, P90=R$${revs[Math.floor(revs.length*0.9)].toFixed(2)}`);
console.log(`Coef. variação: ${(std/avg*100).toFixed(1)}% — ${std/avg>0.5?'ALTA variância: média não representa bem a base':'variância aceitável'}`);

// ── TICKET: VALIDAÇÃO DA PREMISSA 50% ────────
h('4. TICKET = 50% LIMITE — É DEFENSÁVEL?');
console.log(`A planilha não tem valor de transação → não é possível validar diretamente.`);
console.log(`O que sabemos:`);
console.log(`  Limite disponível (LIM_DISP) = limite que o cliente ainda pode usar`);
console.log(`  Limite total (LIM_TOTAL) também existe na planilha`);
const limDispTotal=customers.reduce((s,c)=>s+(c[C.LIM_DISP]||0),0);
const limTotTotal=customers.reduce((s,c)=>s+(c[C.LIM_TOTAL]||0),0);
const avgLimDisp=limDispTotal/customers.length;
const avgLimTot=limTotTotal/customers.length;
console.log(`  LIM_DISP médio: R$${avgLimDisp.toFixed(0)} | LIM_TOTAL médio: R$${avgLimTot.toFixed(0)}`);
console.log(`  Uso médio aparente do crédito: ${((1-limDispTotal/limTotTotal)*100).toFixed(1)}% (LIM_TOTAL - LIM_DISP)`);
console.log(`  → Isso é o que foi parcelado/comprometido, não necessariamente em 1 transação`);
console.log(`  → Premissa 50% do LIM_DISP é razoável mas não verificável com estes dados`);

// ── OPORTUNIDADE TOTAL ───────────────────────
h('5. OPORTUNIDADE TOTAL (números finais)');
const limTotalAll=customers.reduce((s,c)=>s+(c[C.LIM_DISP]||0),0);
const maxRev=customers.reduce((s,c)=>{const t=(c[C.LIM_DISP]||0)*0.5;const j=c[C.TAXA_JUROS]||gJuros;const p=c[C.PARCELAS]||gParc;return s+t*0.03+t*j*p;},0);
console.log(`Limite disponível total: R$${(limTotalAll/1e6).toFixed(2)}M`);
console.log(`Receita teórica total (100% conv): R$${(maxRev/1e6).toFixed(2)}M ← teto impossível`);
console.log(`Receita a 0.5%: R$${(maxRev*0.005).toFixed(0)} (${(maxRev*0.005/1000).toFixed(0)}k)`);
console.log(`Receita a 1.0%: R$${(maxRev*0.01).toFixed(0)} (${(maxRev*0.01/1000).toFixed(0)}k)`);
console.log(`Receita a 2.0%: R$${(maxRev*0.02).toFixed(0)} (${(maxRev*0.02/1000).toFixed(0)}k)`);

// ── CHECKLIST ────────────────────────────────
h('6. CHECKLIST: DADO REAL vs. HIPÓTESE');
console.log(`
DADO REAL (direto da planilha):
  ✅ Contagens por segmento
  ✅ Limite médio disponível por segmento
  ✅ Score médio por segmento
  ✅ % com app por segmento
  ✅ Dormência por segmento (quem tem DT_ULT_COMPRA)
  ✅ Custo de contato por canal (push/wpp/sms — custo fixo, não da planilha)
  ✅ Taxa de juros e parcelas dos ${buyers.length} compradores históricos
  ✅ Break-even (derivado de custo + revPerClient)

HIPÓTESE RAZOÁVEL (não verificável com estes dados, mas defensável):
  ⚠️  Ticket = 50% do limite disponível
      Sem valor de transação na planilha. Proxy padrão em modelos de crédito.
  ⚠️  Nunca-compraram terão condições similares aos históricos
      ${customers.filter(c=>c[C.COMPRAS]===0&&!(c[C.TAXA_JUROS]&&c[C.PARCELAS])).length} clientes sem histórico → usa fallback ${(gJuros*100).toFixed(2)}%/${gParc.toFixed(2)}x

HIPÓTESE SEM BASE (benchmarks externos, não planilha):
  ❌ Taxas de conversão 0.5% / 1% / 2%
     A planilha NÃO tem dados de campanhas anteriores.
     Impossível validar. Só a primeira rodada com grupo de controle calibra.
`);
