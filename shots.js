const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, 'manual_assets');
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT);

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1.5 });

  await page.goto('http://localhost:5173', { waitUntil: 'networkidle0', timeout: 60000 });
  await sleep(1500);

  // clean state
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle0' });
  await sleep(1500);

  const clickText = async (text, tag = 'button') => {
    await page.evaluate((text, tag) => {
      const els = [...document.querySelectorAll(tag)];
      const el = els.find(e => e.textContent.trim().includes(text));
      if (el) el.click();
    }, text, tag);
    await sleep(600);
  };

  // 1. Dashboard full
  await page.screenshot({ path: path.join(OUT, '01-dashboard.png'), fullPage: true });
  console.log('01 dashboard ok');

  // 2. Segmentação inicial
  await clickText('Segmentação');
  await page.screenshot({ path: path.join(OUT, '02-segmentacao.png'), fullPage: true });
  console.log('02 segmentacao ok');

  // 3. Preset aplicado
  await clickText('Nunca compraram, score alto');
  await sleep(800);
  await page.screenshot({ path: path.join(OUT, '03-preset.png'), fullPage: true });
  console.log('03 preset ok');

  // 4. Salvar segmento
  await clickText('Salvar Segmento');
  await page.type('input[placeholder="Nome do segmento..."]', 'Nunca compraram score 700+');
  await sleep(300);
  await clickText('Salvar');
  await sleep(800);
  await page.screenshot({ path: path.join(OUT, '04-segmento-salvo.png'), fullPage: true });
  console.log('04 salvo ok');

  // 5. Campanha - selecionar segmento
  await clickText('Campanha');
  await sleep(500);
  await page.click('.segment-option input[type="checkbox"]');
  await sleep(1200);
  await page.screenshot({ path: path.join(OUT, '05-campanha.png'), fullPage: true });
  console.log('05 campanha ok');

  // 6. Premissas abertas
  await clickText('Editar');
  await sleep(500);
  await page.screenshot({ path: path.join(OUT, '06-premissas.png'), fullPage: true });
  console.log('06 premissas ok');

  // 7. Cenários
  await clickText('Cenários');
  await sleep(800);
  await page.screenshot({ path: path.join(OUT, '07-cenarios.png'), fullPage: true });
  console.log('07 cenarios ok');

  await browser.close();
  console.log('done');
})();
