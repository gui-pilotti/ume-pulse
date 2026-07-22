// Column indices for packed customer arrays
export const C = {
  ID: 0, IDADE: 1, SEXO: 2, DT_ENTRADA: 3, COMPRAS: 4,
  LIM_DISP: 5, LIM_TOTAL: 6, AUMENTO: 7, DT_ULT_COMPRA: 8,
  QTD_VAREJOS: 9, TEM_APP: 10, PARCELAS: 11, TAXA_JUROS: 12, SCORE: 13
};

export function excelToDate(serial) {
  if (!serial) return null;
  return new Date((serial - 25569) * 86400000);
}

export function daysSince(serial, refDate = new Date()) {
  if (!serial) return Infinity;
  const d = excelToDate(serial);
  return Math.floor((refDate - d) / 86400000);
}

export const CHANNELS = {
  whatsapp: { label: 'WhatsApp', cost: 0.30, openRate: 0.35, color: '#25D366' },
  sms: { label: 'SMS', cost: 0.03, openRate: 0.05, color: '#5B93FF' },
  push: { label: 'Push', cost: 0, openRate: 0.04, color: '#FF6B35' },
};

export const ASSUMPTIONS = {
  processingFee: 0.03,
  cacMedio: 50,
  cacPromotor: 75,
  cacVendedor: 40,
};

export function formatBRL(v) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
}

export function formatNum(v) {
  return new Intl.NumberFormat('pt-BR').format(v);
}

export function formatPct(v) {
  return (v * 100).toFixed(1) + '%';
}

// Sem app: WhatsApp (35% abertura) em vez de SMS (5% abertura) — Informações Relevantes
export function recommendChannel(customer) {
  if (customer[C.TEM_APP]) return 'push';
  return 'whatsapp';
}

// Full base context (from the original spreadsheet) — for explicit exclusion display
export const BASE_TOTALS = {
  total: 200592,
  negadas: 151855,
  adimplentes: 43188,
  inadimplentes: 5549,
};

export const EMPTY_FILTERS = {
  comprasMin: '', comprasMax: '', scoreMin: '', scoreMax: '',
  limDispMin: '', limDispMax: '', dormanciaMin: '', dormanciaMax: '',
  temApp: 'todos', sexo: 'todos', idadeMin: '', idadeMax: '',
  varejosMin: '', varejosMax: '',
  parcelasMin: '', parcelasMax: '',
  jurosMin: '', jurosMax: '',
};

export function applyFilters(customers, filters) {
  return customers.filter(c => {
    const compras = c[C.COMPRAS];
    const score = c[C.SCORE];
    const limDisp = c[C.LIM_DISP];
    const dorm = daysSince(c[C.DT_ULT_COMPRA]);
    const idade = c[C.IDADE];
    const varejos = c[C.QTD_VAREJOS];
    const parcelas = c[C.PARCELAS];
    const juros = c[C.TAXA_JUROS];

    if (filters.comprasMin !== '' && compras < Number(filters.comprasMin)) return false;
    if (filters.comprasMax !== '' && compras > Number(filters.comprasMax)) return false;
    if (filters.scoreMin !== '' && score < Number(filters.scoreMin)) return false;
    if (filters.scoreMax !== '' && score > Number(filters.scoreMax)) return false;
    if (filters.limDispMin !== '' && limDisp < Number(filters.limDispMin)) return false;
    if (filters.limDispMax !== '' && limDisp > Number(filters.limDispMax)) return false;
    if (filters.dormanciaMin !== '' && dorm < Number(filters.dormanciaMin)) return false;
    if (filters.dormanciaMax !== '' && dorm > Number(filters.dormanciaMax)) return false;
    if (filters.temApp === 'sim' && !c[C.TEM_APP]) return false;
    if (filters.temApp === 'nao' && c[C.TEM_APP]) return false;
    if (filters.sexo === 'M' && c[C.SEXO] !== 1) return false;
    if (filters.sexo === 'F' && c[C.SEXO] !== 0) return false;
    if (filters.idadeMin !== '' && idade < Number(filters.idadeMin)) return false;
    if (filters.idadeMax !== '' && idade > Number(filters.idadeMax)) return false;
    if (filters.varejosMin && varejos < Number(filters.varejosMin)) return false;
    if (filters.varejosMax && varejos > Number(filters.varejosMax)) return false;
    if (filters.parcelasMin && (!parcelas || parcelas < Number(filters.parcelasMin))) return false;
    if (filters.parcelasMax && (!parcelas || parcelas > Number(filters.parcelasMax))) return false;
    if (filters.jurosMin && (!juros || juros < Number(filters.jurosMin) / 100)) return false;
    if (filters.jurosMax && (!juros || juros > Number(filters.jurosMax) / 100)) return false;
    return true;
  });
}
