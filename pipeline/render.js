// Render Nubu from the exported .riv frame by frame, driven by a viseme timeline.
// usage: node pipeline/render.js <timeline.json> <outDir> [--audio voice.mp3] [--riv character/rive/export/round5/nubu.riv] [--w 690 --h 695] [--fps 30]
// timeline.json: { "duration": 5, "events": [ { "t": 0.0, "set": { "viseme": 0, "expression": 1 } }, { "t": 0.3, "fire": "blink" } ] }
const http = require('http');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { chromium } = require('playwright');
const ffmpeg = require('ffmpeg-static');

const ROOT = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const timeline = JSON.parse(fs.readFileSync(args[0], 'utf8'));
const outDir = path.resolve(args[1]);
// default size = half of artboard Nubu_Front (1380 x 1389 since round 5: +120 px headroom on top)
const FPS = +opt('fps', 30), W = +opt('w', 690), H = +opt('h', 695), audio = opt('audio', null);
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.wasm': 'application/wasm', '.riv': 'application/octet-stream' };

const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});

(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const framesDir = path.join(outDir, 'frames');
  fs.rmSync(framesDir, { recursive: true, force: true }); fs.mkdirSync(framesDir, { recursive: true });

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  page.on('console', m => { if (m.type() === 'error') console.log('[page]', m.text()); });
  const riv = opt('riv', 'character/rive/export/nubu.riv').replace(/\\/g, '/').replace(/^\/+/, '');
  await page.goto(`http://127.0.0.1:${port}/pipeline/render.html?w=${W}&h=${H}&src=${encodeURIComponent('/' + riv)}`);
  // the runtime loads asynchronously; keep stepping the fake clock until onLoad fires
  for (let i = 0; i < 600; i++) {
    const s = await page.evaluate(() => { window.__step(1 / 60); return { ready: window.__ready, err: window.__error }; });
    if (s.err) throw new Error('Rive load error: ' + s.err);
    if (s.ready) break;
    await page.waitForTimeout(10);
  }
  if (!(await page.evaluate(() => window.__ready))) throw new Error('Rive did not load');
  if (!(await page.evaluate(() => window.__vm))) throw new Error('no view model instance bound (autoBind)');

  const events = (timeline.events || []).slice().sort((a, b) => a.t - b.t);
  const total = Math.round(timeline.duration * FPS);
  let ei = 0;
  const canvas = await page.$('#c');
  for (let f = 0; f < total; f++) {
    const t = f / FPS;
    const due = [];
    while (ei < events.length && events[ei].t <= t + 1e-6) due.push(events[ei++]);
    await page.evaluate(({ due, dt, first }) => {
      for (const e of due) {
        if (e.set) for (const [k, v] of Object.entries(e.set)) window.__set(k, v);
        if (e.fire) window.__fire(e.fire);
      }
      window.__step(first ? 0 : dt);
    }, { due, dt: 1 / FPS, first: f === 0 });
    await canvas.screenshot({ path: path.join(framesDir, `f${String(f).padStart(5, '0')}.png`), omitBackground: true });
    if (f % 30 === 0) process.stdout.write(`frame ${f}/${total}\r`);
  }
  await browser.close(); server.close();

  const inFrames = ['-framerate', String(FPS), '-i', path.join(framesDir, 'f%05d.png')];
  const aud = audio ? ['-i', path.resolve(audio)] : [];
  // transparent WebM (VP9 + alpha) for compositing over news footage
  // audio is padded with silence so the video (not the audio) sets the length — the tail after speech is kept
  // (apad with an explicit whole_dur: an unbounded apad + -shortest never terminates inside a filter_complex)
  const dur = (total / FPS).toFixed(3);
  execFileSync(ffmpeg, ['-y', ...inFrames, ...aud, '-c:v', 'libvpx-vp9', '-pix_fmt', 'yuva420p', '-b:v', '0', '-crf', '28', ...(audio ? ['-af', `apad=whole_dur=${dur}`, '-c:a', 'libopus'] : []), '-t', dur, path.join(outDir, 'nubu_talk.webm')], { stdio: 'ignore' });
  // MP4 on mint background for quick preview
  execFileSync(ffmpeg, ['-y', ...inFrames, ...aud, '-filter_complex', `color=c=0x3cc8aa:s=${W}x${H}:r=${FPS}[bg];[bg][0:v]overlay=shortest=1,crop=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p[v]${audio ? `;[1:a]apad=whole_dur=${dur}[a]` : ''}`, '-map', '[v]', ...(audio ? ['-map', '[a]', '-c:a', 'aac'] : []), '-t', dur, '-c:v', 'libx264', '-crf', '20', path.join(outDir, 'nubu_talk_preview.mp4')], { stdio: 'ignore', timeout: 300000 });
  console.log(`\ndone: ${total} frames -> ${outDir}`);
})().catch(e => { console.error('FAILED:', e.message); server.close(); process.exit(1); });
