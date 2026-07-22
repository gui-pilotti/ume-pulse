const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

const wb = XLSX.readFile(path.join(__dirname, '(Ume) Case_builder_ base.xlsx'));

// --- Customers ---
const customers = XLSX.utils.sheet_to_json(wb.Sheets['Base de Clientes']);

function excelDate(serial) {
  if (typeof serial !== 'number') return null;
  const d = new Date((serial - 25569) * 86400000);
  return d.toISOString().slice(0, 10);
}

const processed = customers
  .filter(r => r['Situação'] === 'Adimplente')
  .map((r, i) => ({
    id: i,
    idade: r['Idade'],
    sexo: r['Sexo'] === 'Masculino' ? 'M' : 'F',
    dtEntrada: excelDate(r['Data de Entrada na Ume']),
    compras: r['Qtd de Compras'],
    limDisp: typeof r['Limite Disponível'] === 'number' ? r['Limite Disponível'] : 0,
    limTotal: typeof r['Limite Total'] === 'number' ? r['Limite Total'] : 0,
    aumento: r['Já teve Aumento de limite?'] === 'Sim',
    dtUltCompra: excelDate(r['Data da Última Compra ']),
    qtdVarejos: typeof r['Qtd de Varejos que já comprou'] === 'number' ? r['Qtd de Varejos que já comprou'] : 0,
    temApp: r['Tem App?'] === 'Sim',
    parcelas: typeof r['N. Médio de Parcelas'] === 'number' ? r['N. Médio de Parcelas'] : 0,
    taxaJuros: typeof r['Taxa de Juros Média ( ao mês)'] === 'number' ? r['Taxa de Juros Média ( ao mês)'] : 0,
    score: r['Score de Crédito'],
  }));

console.log('Adimplentes:', processed.length);

// --- Retail ---
const retail = XLSX.utils.sheet_to_json(wb.Sheets['Base de Varejo']).map(r => ({
  nome: r['Varejo'],
  segmento: r['Segmento'],
  lojas: r['Lojas'],
  dtEntrada: excelDate(r['Mês de Entrada']),
  txRecorrentes: r['Transações Recorrentes por mês'],
  vendasRecorrentes: r['Vendas Recorrentes por mês'],
  txConversoes: r['Transações de Conversões por mês'],
  vendasConversoes: r['Vendas de Conversões por mês'],
  originacao: r['Originação Total'],
}));

console.log('Varejo:', retail.length);

fs.writeFileSync(
  path.join(__dirname, 'app', 'src', 'data', 'customers.json'),
  JSON.stringify(processed)
);
fs.writeFileSync(
  path.join(__dirname, 'app', 'src', 'data', 'retail.json'),
  JSON.stringify(retail)
);
console.log('Done');
