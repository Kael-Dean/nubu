// Renders the type specimen: node pipeline/compose/specimen/specimen.js [out.png]
const path = require('path'); const { pathToFileURL } = require('url'); const { chromium } = require('playwright');
const out = path.resolve(process.argv[2] || path.join(__dirname, '../../../exports/type_specimen.png'));
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 2400, height: 1400 } });
  await p.goto(pathToFileURL(path.join(__dirname, 'specimen.html')).href);
  await p.evaluate(() => window.ready);
  await p.screenshot({ path: out, fullPage: true }); await b.close(); console.log('specimen →', out);
})();
