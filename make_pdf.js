const puppeteer = require('puppeteer');
const path = require('path');

(async () => {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  await page.goto('file:///' + path.join(__dirname, 'manual.html').replace(/\\/g, '/'), { waitUntil: 'networkidle0' });
  await page.pdf({
    path: path.join(__dirname, 'Manual_Smart_Reactivation_Engine.pdf'),
    format: 'A4',
    printBackground: true,
    margin: { top: '0', bottom: '0', left: '0', right: '0' },
  });
  await browser.close();
  console.log('PDF ok');
})();
