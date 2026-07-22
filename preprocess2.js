const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

const wb = XLSX.readFile(path.join(__dirname, '(Ume) Case_builder_ base.xlsx'));
const customers = XLSX.utils.sheet_to_json(wb.Sheets['Base de Clientes']);

function excelDate(serial) {
  if (typeof serial !== 'number') return null;
  return serial; // keep as serial number, convert in browser
}

// Pack as arrays to save space: [id, idade, sexo, dtEntrada, compras, limDisp, limTotal, aumento, dtUltCompra, qtdVarejos, temApp, parcelas, taxaJuros, score]
const processed = customers
  .filter(r => r['Situação'] === 'Adimplente')
  .map((r, i) => [
    i,
    r['Idade'],
    r['Sexo'] === 'Masculino' ? 1 : 0,
    typeof r['Data de Entrada na Ume'] === 'number' ? r['Data de Entrada na Ume'] : 0,
    r['Qtd de Compras'],
    typeof r['Limite Disponível'] === 'number' ? Math.round(r['Limite Disponível'] * 100) / 100 : 0,
    typeof r['Limite Total'] === 'number' ? Math.round(r['Limite Total'] * 100) / 100 : 0,
    r['Já teve Aumento de limite?'] === 'Sim' ? 1 : 0,
    typeof r['Data da Última Compra '] === 'number' ? r['Data da Última Compra '] : 0,
    typeof r['Qtd de Varejos que já comprou'] === 'number' ? r['Qtd de Varejos que já comprou'] : 0,
    r['Tem App?'] === 'Sim' ? 1 : 0,
    typeof r['N. Médio de Parcelas'] === 'number' ? r['N. Médio de Parcelas'] : 0,
    typeof r['Taxa de Juros Média ( ao mês)'] === 'number' ? Math.round(r['Taxa de Juros Média ( ao mês)'] * 10000) / 10000 : 0,
    r['Score de Crédito'],
  ]);

console.log('Adimplentes:', processed.length);

const output = JSON.stringify(processed);
fs.writeFileSync(path.join(__dirname, 'app', 'src', 'data', 'customers.json'), output);
console.log('Size:', (output.length / 1024 / 1024).toFixed(2), 'MB');

// Retail stays the same (small)
const retail = XLSX.utils.sheet_to_json(wb.Sheets['Base de Varejo']).map(r => ({
  n: r['Varejo'],
  s: r['Segmento'],
  l: r['Lojas'],
  vr: Math.round(r['Vendas Recorrentes por mês']),
  vc: Math.round(r['Vendas de Conversões por mês'] || 0),
  o: Math.round(r['Originação Total']),
}));
fs.writeFileSync(path.join(__dirname, 'app', 'src', 'data', 'retail.json'), JSON.stringify(retail));
console.log('Done');
