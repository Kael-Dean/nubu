// Record the live runtime (state machine running) through every gesture/stance/turn transition.
// Writes rec/run.webm + rec/timeline.json (ms offsets of each change). usage: node record.js
const { chromium } = require('D:/NUBU/node_modules/playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = __dirname, OUT = path.join(ROOT, 'rec');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.wasm': 'application/wasm', '.riv': 'application/octet-stream' };
const srv = http.createServer((q, s) => { const u = decodeURIComponent(q.url.split('?')[0]); const f = path.join(ROOT, u === '/' ? 'rec.html' : u);
  if (!f.startsWith(ROOT) || !fs.existsSync(f)) { s.writeHead(404); return s.end(); } s.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(s); });
const wait = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  await new Promise(r => srv.listen(5180, '127.0.0.1', r));
  const br = await chromium.launch(); const ctx = await br.newContext({ viewport: { width: 820, height: 1000 }, recordVideo: { dir: OUT, size: { width: 820, height: 1000 } } });
  const pg = await ctx.newPage(); const t0 = Date.now(); const tl = [];
  await pg.goto('http://127.0.0.1:5180/'); await pg.waitForFunction(() => window.__ready, null, { timeout: 30000 });
  // hide the control panel so only the character is in the video
  await pg.addStyleTag({ content: 'aside{display:none!important} canvas{height:100vh!important}' });
  await pg.evaluate(() => new Promise(r => requestAnimationFrame(() => { window.__rive.resizeDrawingSurfaceToCanvas(); r(); }))); // drawing surface must match the new CSS size, or the video is stretched
  const set = async (k, v) => { await pg.evaluate(([k, v]) => setVM(k, v), [k, v]); tl.push({ t: Date.now() - t0, k, v }); };
  await wait(1200);
  const G = ['wave', 'peace', 'point', 'thumbsUp', 'holdMic', 'fingerHeart', 'flex'];
  for (const g of G) { await set('gesture', g); await wait(1300); await set('gesture', 'none'); await wait(900); }
  // gesture → gesture without passing through none
  await set('gesture', 'wave'); await wait(900); await set('gesture', 'peace'); await wait(900); await set('gesture', 'flex'); await wait(900); await set('gesture', 'none'); await wait(900);
  // stance switch
  await set('stance', 'aPose'); await wait(1000); await set('stance', 'natural'); await wait(1000);
  // expressions + talking + head turn
  for (const e of ['happy', 'laugh', 'surprised', 'wink', 'sad', 'neutral']) { await set('expression', e); await wait(700); }
  await set('talking', true); await wait(1500); await set('talking', false); await wait(400);
  for (const v of [-0.3, -0.6, -1, -0.6, 0, 0.6, 1, 0.6, 0]) { await set('headTurn', v); await wait(450); }
  await set('gesture', 'holdMic'); await set('talking', true); await wait(1800); await set('talking', false); await set('gesture', 'none'); await wait(1000);
  fs.writeFileSync(path.join(OUT, 'timeline.json'), JSON.stringify(tl, null, 1));
  const vp = await pg.video().path(); await ctx.close(); fs.renameSync(vp, path.join(OUT, 'run.webm')); await br.close(); srv.close();
  console.log('events', tl.length, 'duration', ((Date.now() - t0) / 1000).toFixed(1) + 's');
})();
