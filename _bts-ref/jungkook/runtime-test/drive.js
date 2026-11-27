// Serve the test page on localhost, drive every JungkookVM field through the real runtime + state machine,
// and save a labelled frame per scenario plus a contact sheet. usage: node drive.js
const { chromium } = require('D:/NUBU/node_modules/playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = __dirname, OUT = path.join(ROOT, 'frames'); fs.mkdirSync(OUT, { recursive: true });
const types = { '.html': 'text/html', '.js': 'text/javascript', '.wasm': 'application/wasm', '.riv': 'application/octet-stream' };
const srv = http.createServer((q, s) => { const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]) === '/' ? 'index.html' : decodeURIComponent(q.url.split('?')[0]));
  if (!f.startsWith(ROOT) || !fs.existsSync(f)) { s.writeHead(404); return s.end(); } s.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(s); });
const wait = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  await new Promise(r => srv.listen(5178, '127.0.0.1', r));
  const br = await chromium.launch(); const pg = await br.newPage({ viewport: { width: 800, height: 1000 } });
  const consoleErr = []; pg.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') consoleErr.push(m.text()); });
  await pg.goto('http://127.0.0.1:5178/'); await pg.waitForFunction(() => window.__ready || window.__errors.length, null, { timeout: 30000 });
  const info = await pg.evaluate(() => ({ errors: window.__errors, fields: window.__fields, enums: window.__enums, sms: window.__rive && window.__rive.stateMachineNames, playing: window.__rive && window.__rive.isPlaying }));
  console.log(JSON.stringify(info));
  if (!info.fields) { await br.close(); srv.close(); return; }
  const canvas = pg.locator('#c');
  const reset = async () => pg.evaluate(e => { setVM('expression', e.expression[0]); setVM('gesture', 'none'); setVM('stance', 'aPose'); setVM('headTurn', 0); setVM('talking', false); }, info.enums);
  const shots = [];
  const shot = async (name, settle = 1200) => { await wait(settle); const f = path.join(OUT, name + '.png'); await canvas.screenshot({ path: f }); shots.push(name); };
  const scen = [];
  await reset(); await shot('00_rest_aPose', 1500);
  for (const e of info.enums.expression) { await reset(); await pg.evaluate(v => setVM('expression', v), e); await shot('expr_' + e); }
  for (const st of info.enums.stance) for (const g of info.enums.gesture) { if (g === 'none' && st === 'aPose') continue; await reset(); await pg.evaluate(([s, gg]) => { setVM('stance', s); setVM('gesture', gg); }, [st, g]); await shot(`gest_${st}_${g}`, 1500); }
  // head turn: settle + mid-fade frames
  for (const v of [-1, -0.4, 0.4, 1]) { await reset(); await pg.evaluate(x => setVM('headTurn', x), v); await shot('turn_' + v, 1200); }
  await reset(); await pg.evaluate(() => setVM('headTurn', 1)); await shot('turn_fade_40ms', 40);
  await reset(); await pg.evaluate(() => { setVM('headTurn', -1); setVM('expression', 'happy'); }); await shot('turn_-1_happy');
  await reset(); await pg.evaluate(() => { setVM('headTurn', 1); setVM('talking', true); }); await shot('turn_1_talking');
  // talking: several frames
  await reset(); await pg.evaluate(() => setVM('talking', true)); for (let i = 0; i < 4; i++) await shot('talk_' + i, i ? 110 : 800);
  // blink: sample the eye region over 6 s
  await reset(); await wait(500); const eyeSig = [];
  for (let i = 0; i < 60; i++) { const b = await canvas.screenshot({ clip: undefined }); eyeSig.push(b.length); await wait(100); }
  fs.writeFileSync(path.join(OUT, 'blink_sizes.json'), JSON.stringify(eyeSig));
  console.log('shots', shots.length, 'consoleErr', JSON.stringify(consoleErr.slice(0, 10)), 'pageErr', JSON.stringify(await pg.evaluate(() => window.__errors)));
  fs.writeFileSync(path.join(OUT, 'shots.json'), JSON.stringify(shots));
  await br.close(); srv.close();
})();
