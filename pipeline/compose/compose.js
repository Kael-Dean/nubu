#!/usr/bin/env node
// Nubu scene compositor.
//   node pipeline/compose/compose.js <episode compose.json> [--job main|teaser|all] [--draft] [--keep]
//        [--stills t1,t2,...]   (scene backgrounds only, quick look, no Nubu/subs)
//        [--contact]            (contact sheet from the finished main video)
// Steps per job: stock prep → subtitle/tag PNGs → scene capture (Playwright, seek(t)) → ffmpeg composite.
const fs = require('fs');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const { pathToFileURL } = require('url');
const { chromium } = require('playwright');
const FF = require('ffmpeg-static');
const Track = require('./lib/track.js');
const Subs = require('./lib/subs.js');

const HERE = __dirname;
const args = process.argv.slice(2);
const cfgPath = path.resolve(args[0] || '');
if (!fs.existsSync(cfgPath)) { console.error('usage: node compose.js <compose.json> [--job main|teaser|all]'); process.exit(1); }
const opt = (name, def) => { const i = args.indexOf('--' + name); return i < 0 ? def : (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true); };
const JOB = opt('job', 'all');
const DRAFT = !!opt('draft', false);
const CFG = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
const EP = path.dirname(cfgPath);
const R = (p) => path.resolve(EP, p);
const FPS = CFG.fps || 30;
const CACHE = R(CFG.cache || 'render/compose_cache');
fs.mkdirSync(CACHE, { recursive: true });
const log = (...a) => console.log(`[${new Date().toISOString().slice(11, 19)}]`, ...a);

function ff(argv, label) {
  const r = spawnSync(FF, ['-hide_banner', '-loglevel', 'error', '-y', ...argv], { stdio: ['ignore', 'inherit', 'inherit'], maxBuffer: 1 << 26 });
  if (r.status !== 0) throw new Error('ffmpeg failed: ' + (label || argv.join(' ')));
}

// ---------------------------------------------------------------- config helpers
function resolveScene(sc) {
  let s = { ...sc };
  if (s.inherit) for (const k of [].concat(s.inherit)) s = { ...CFG.shared[k], ...s };
  return s;
}
const SCENES = CFG.scenes.map(resolveScene);

// ---------------------------------------------------------------- stock prep
function prepStock(sc, layout, W, H, key) {
  const st = sc.stock && (sc.stock[layout] || sc.stock);
  if (!st || !st.file) return null;
  const file = path.resolve(R(CFG.stockDir || '../../assets/stock'), st.file);
  if (!fs.existsSync(file)) { log(`stock missing for ${sc.id}: ${st.file} → graphic fallback`); return null; }
  const dir = path.join(CACHE, `stock_${key}_${layout}`);
  const w = st.w || W, h = st.h || H;
  const blur = st.blur ?? 5;
  if (st.kind === 'image') {
    const out = path.join(dir, 'still.jpg');
    const stamp = JSON.stringify([st, w, h]);
    if (!fs.existsSync(out) || fs.readFileSync(path.join(dir, 'stamp'), 'utf8') !== stamp) {
      fs.mkdirSync(dir, { recursive: true });
      const vf = [st.crop ? `crop=${st.crop}` : null, `scale=${w}:${h}:force_original_aspect_ratio=increase`, `crop=${w}:${h}`,
        st.grade || 'eq=brightness=-0.10:saturation=0.75:gamma=0.9,colorbalance=rs=0.04:bs=0.14:rm=0.02:bm=0.10', blur ? `gblur=sigma=${blur}` : null].filter(Boolean).join(',');
      ff(['-i', file, '-vf', vf, '-q:v', '2', out], 'stock image');
      fs.writeFileSync(path.join(dir, 'stamp'), stamp);
    }
    return { kind: 'image', image: pathToFileURL(out).href, credit: st.credit || null };
  }
  const dur = st.dur || (sc.end - sc.start) + 0.5;
  const n = Math.ceil(dur * FPS);
  const stamp = JSON.stringify([st, w, h, n]);
  if (!fs.existsSync(path.join(dir, 'stamp')) || fs.readFileSync(path.join(dir, 'stamp'), 'utf8') !== stamp) {
    fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
    const vf = [st.crop ? `crop=${st.crop}` : null, st.speed ? `setpts=PTS/${st.speed}` : null, `fps=${FPS}`, `scale=${w}:${h}:force_original_aspect_ratio=increase`, `crop=${w}:${h}`,
      st.grade || 'eq=brightness=-0.06:saturation=0.8', blur ? `gblur=sigma=${blur}` : null].filter(Boolean).join(',');
    ff(['-stream_loop', '-1', '-ss', String(st.from || 0), '-i', file, '-t', String(dur), '-vf', vf, '-frames:v', String(n), '-q:v', '3', path.join(dir, '%05d.jpg')], 'stock video');
    fs.writeFileSync(path.join(dir, 'stamp'), stamp);
  }
  const frames = fs.readdirSync(dir).filter((f) => f.endsWith('.jpg')).sort().map((f) => pathToFileURL(path.join(dir, f)).href);
  return { kind: 'video', frames, fps: FPS, at: st.at };
}

// ---------------------------------------------------------------- jobs
// A job = output size + list of segments. Each segment plays source time [from,to) of the voice/Nubu
// and contains scene pieces. Main = one segment covering the episode.
function mainJob() {
  const LAY = CFG.layout || '16x9', L = CFG.layouts[LAY];
  return {
    name: 'main', layout: LAY, W: L.W, H: L.H, out: R(CFG.outputs.main),
    segments: [{ from: 0, to: CFG.duration, scenes: SCENES.map((s) => s.id) }],
    nubuKeys: CFG.nubuKeys, modes: L.nubuModes, tags: CFG.tags || [], subsLayout: L.subs, tagLayout: L.tag,
  };
}
function teaserJob() {
  const T = CFG.teaser, L = CFG.layouts[T.layout];
  return {
    name: 'teaser', layout: T.layout, W: L.W, H: L.H, out: R(CFG.outputs.teaser),
    segments: T.segments, nubuKeys: T.nubuKeys, modes: L.nubuModes, tags: T.tags || [], subsLayout: L.subs, tagLayout: L.tag,
    sceneDefs: Object.fromEntries((T.scenes || []).map((s) => [s.id, resolveScene(s)])),
  };
}

function planPieces(job) {
  let local = 0;
  const pieces = [];
  job.segments.forEach((seg, si) => {
    seg.local = local;
    const dur = seg.to - seg.from;
    for (const id of seg.scenes) {
      const sc = (job.sceneDefs && job.sceneDefs[id]) || SCENES.find((s) => s.id === id);
      if (!sc) throw new Error('unknown scene ' + id);
      const a = Math.max(seg.from, sc.start ?? seg.from), b = Math.min(seg.to, sc.end ?? seg.to);
      if (b <= a + 1e-6) continue;
      const f0 = Math.round((local + (a - seg.from)) * FPS), f1 = Math.round((local + (b - seg.from)) * FPS);
      pieces.push({ job: job.name, si, sc, from: a, to: b, f0, f1, timeOffset: seg.from - local, file: path.join(CACHE, `${job.name}_${String(pieces.length).padStart(2, '0')}_${sc.id}.mp4`) });
    }
    local += dur;
  });
  job.total = local;
  return pieces;
}

async function capturePieces(browser, job, pieces, workers = 4) {
  const queue = pieces.slice();
  const t0 = Date.now();
  let done = 0;
  async function worker() {
    const page = await browser.newPage({ viewport: { width: job.W, height: job.H }, deviceScaleFactor: 1 });
    page.on('pageerror', (e) => console.error('page error:', e.message));
    page.on('console', (m) => { if (m.type() === 'error') console.error('console:', m.text()); });
    while (queue.length) {
      const pc = queue.shift();
      const sc = pc.sc;
      const stock = prepStock(sc, job.layout, job.W, job.H, `${job.name}_${sc.id}`);
      // skip capture when nothing that affects this piece changed
      const srcFiles = ['scenes/' + sc.type + '.html', 'scenes/_runtime.js', 'scenes/_base.css', 'fonts/fonts.css', 'lib/track.js'].map((f) => fs.statSync(path.join(HERE, f)).mtimeMs);
      const hash = require('crypto').createHash('sha1').update(JSON.stringify([sc, CFG.theme || null, CFG.themeDeco || null, pc.from, pc.to, pc.f0, pc.f1, job.layout, job.nubuKeys, job.modes, srcFiles, stock && (stock.frames ? stock.frames.length : stock.image), DRAFT])).digest('hex');
      if (!opt('fresh', false) && fs.existsSync(pc.file) && fs.existsSync(pc.file + '.hash') && fs.readFileSync(pc.file + '.hash', 'utf8') === hash) {
        done++; log(`  cached   ${path.basename(pc.file)} [${done}/${pieces.length}]`); continue;
      }
      await page.goto(pathToFileURL(path.join(HERE, 'scenes', sc.type + '.html')).href);
      await page.evaluate((p) => window.setup(p), {
        W: job.W, H: job.H, layout: job.layout, scene: sc, start: sc.start ?? pc.from, end: sc.end ?? pc.to,
        nubu: { keys: job.nubuKeys, modes: job.modes }, timeOffset: pc.timeOffset, stock, theme: CFG.theme || null, deco: CFG.themeDeco || null,
      });
      const n = pc.f1 - pc.f0;
      const enc = spawn(FF, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
        '-c:v', 'libx264', '-preset', DRAFT ? 'ultrafast' : 'medium', '-crf', DRAFT ? '26' : '15', '-pix_fmt', 'yuv420p', '-r', String(FPS), pc.file], { stdio: ['pipe', 'inherit', 'inherit'] });
      const closed = new Promise((res, rej) => enc.on('close', (c) => (c === 0 ? res() : rej(new Error('encode failed ' + pc.file)))));
      for (let i = 0; i < n; i++) {
        const tSrc = pc.from + i / FPS;
        await page.evaluate((t) => window.seek(t), tSrc);
        const buf = await page.screenshot({ type: 'jpeg', quality: DRAFT ? 80 : 95 });
        if (!enc.stdin.write(buf)) await new Promise((r) => enc.stdin.once('drain', r));
      }
      enc.stdin.end();
      await closed;
      done++;
      fs.writeFileSync(pc.file + '.hash', hash);
      log(`  captured ${path.basename(pc.file)} (${n} frames) [${done}/${pieces.length}]`);
    }
    await page.close();
  }
  await Promise.all(Array.from({ length: Math.min(workers, pieces.length) }, worker));
  return (Date.now() - t0) / 1000;
}

// ---------------------------------------------------------------- subtitles + tags
function buildCues(job) {
  const toks = Subs.tokens(R(CFG.alignment));
  const so = CFG.subs || {};
  let cues = [];
  for (const seg of job.segments) {
    if (seg.silent) continue;
    if (job.name === 'main') cues = cues.concat(Subs.buildCues(toks, so));
    else cues = cues.concat(Subs.cuesInWindow(toks, seg.from, seg.to, seg.local, so));
  }
  // subs.hide: cues whose text a headline already shows on screen
  if (so.hide) cues = cues.filter((c) => !so.hide.includes(c.text.replace(/\s+/g, '')) && !so.hide.includes(c.text));
  // subs.split: { token: [part, part] } — break a long unspaced phrase at a natural point (display only)
  for (const c of cues) c.tokens = c.tokens.flatMap((tk) => (so.split && so.split[tk]) || [tk]);
  // subs.glue: ["ที่ราชมัง แล้ว", ...] joins two tokens without the space
  for (const g of so.glue || []) for (const c of cues) {
    for (let i = 0; i + 1 < c.tokens.length; i++) if (c.tokens[i] + ' ' + c.tokens[i + 1] === g) { c.tokens.splice(i, 2, c.tokens[i] + c.tokens[i + 1]); }
    c.text = c.text.split(g).join(g.replace(' ', ''));
  }
  return cues;
}

async function renderUiLayers(browser, job, cues) {
  const page = await browser.newPage({ viewport: { width: job.W, height: job.H } });
  await page.goto(pathToFileURL(path.join(HERE, 'overlay.html')).href);
  const dir = path.join(CACHE, `ui_${job.name}`);
  fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
  const blank = path.join(dir, 'blank.png');
  await page.evaluate((s) => window.renderState(s), { W: job.W, H: job.H, theme: CFG.theme || null });
  await page.screenshot({ path: blank, omitBackground: true });
  const S = job.subsLayout, T = job.tagLayout;
  // subtitle stream (centred at W/2; ffmpeg slides it to the free area)
  const subList = [];
  const boxes = [];
  let i = 0;
  for (const c of cues) {
    const f = path.join(dir, `sub_${String(i++).padStart(3, '0')}.png`);
    const box = await page.evaluate((s) => window.renderState(s), { W: job.W, H: job.H, sub: { tokens: c.tokens, maxW: S.maxW, bottom: S.bottom, fontSize: S.fontSize } });
    await page.screenshot({ path: f, omitBackground: true });
    subList.push({ start: c.start, end: c.end, file: f });
    boxes.push({ ...c, box: box.sub });
  }
  const tagList = [];
  i = 0;
  for (const tg of job.tags) {
    if (tg.when && !tg.when.every((p) => fs.existsSync(R(p)))) continue;
    const f = path.join(dir, `tag_${String(i++).padStart(3, '0')}.png`);
    const box = await page.evaluate((s) => window.renderState(s), { W: job.W, H: job.H, tag: { text: tg.text, x: T.x, bottom: T.bottom, top: T.top, fontSize: T.fontSize } });
    await page.screenshot({ path: f, omitBackground: true });
    tagList.push({ start: tg.from, end: tg.to, file: f, box: box.tag, text: tg.text });
  }
  await page.close();
  const writeConcat = (list, name) => {
    const lines = ['ffconcat version 1.0'];
    let t = 0, lastFile = blank;
    const sorted = list.slice().sort((a, b) => a.start - b.start);
    for (const it of sorted) {
      const s = Math.max(it.start, t);
      if (s > t + 1e-3) { lines.push(`file '${blank.replace(/\\/g, '/')}'`, `duration ${(s - t).toFixed(4)}`); }
      const e = Math.min(it.end, job.total);
      if (e > s) { lines.push(`file '${it.file.replace(/\\/g, '/')}'`, `duration ${(e - s).toFixed(4)}`); t = e; lastFile = it.file; }
    }
    if (job.total > t) { lines.push(`file '${blank.replace(/\\/g, '/')}'`, `duration ${(job.total - t + 0.5).toFixed(4)}`); lastFile = blank; }
    lines.push(`file '${lastFile.replace(/\\/g, '/')}'`);
    const p = path.join(dir, name);
    fs.writeFileSync(p, lines.join('\n'));
    return p;
  };
  return { subs: writeConcat(subList, 'subs.ffconcat'), tags: writeConcat(tagList, 'tags.ffconcat'), boxes, tagBoxes: tagList };
}

// ---------------------------------------------------------------- final composite
function composite(job, pieces, ui) {
  const list = path.join(CACHE, `${job.name}_bg.txt`);
  fs.writeFileSync(list, pieces.map((p) => `file '${p.file.replace(/\\/g, '/')}'`).join('\n'));
  const nubuFile = R(CFG.nubu), voice = R(CFG.voice);
  const g = [];
  // Nubu: trim per segment (keeps lip sync), optional ping-pong idle for silent segments
  const nb = [];
  job.segments.forEach((seg, i) => {
    const n = seg.nubu || { from: seg.from, to: seg.to };
    if (n.pingpong) {
      const len = n.to - n.from, need = seg.to - seg.from, reps = Math.ceil(need / (2 * len));
      g.push(`[1:v]trim=start=${n.from}:end=${n.to},setpts=PTS-STARTPTS,split=2[pa${i}][pb${i}]`);
      g.push(`[pb${i}]reverse[pr${i}]`);
      g.push(`[pa${i}][pr${i}]concat=n=2:v=1:a=0,loop=loop=${reps - 1}:size=${Math.round(2 * len * FPS)}:start=0,setpts=N/${FPS}/TB,trim=duration=${need}[n${i}]`);
    } else {
      g.push(`[1:v]trim=start=${n.from}:end=${n.to},setpts=PTS-STARTPTS[n${i}]`);
    }
    nb.push(`[n${i}]`);
  });
  if (nb.length > 1) g.push(`${nb.join('')}concat=n=${nb.length}:v=1:a=0[nall]`); else g.push(`${nb[0]}null[nall]`);
  const ex = (p) => Track.ffExpr(job.nubuKeys, job.modes, p);
  g.push(`[nall]format=yuva420p,fps=${FPS},scale=w='2*trunc((${ex('w')})/2)':h='2*trunc((${ex('h')})/2)':eval=frame:flags=bicubic,format=yuva420p[nub]`);
  g.push(`[0:v]fps=${FPS},setpts=N/${FPS}/TB[bg]`);
  g.push(`[bg][nub]overlay=x='${ex('x')}':y='${ex('y')}':eval=frame:format=auto:eof_action=pass[v1]`);
  g.push(`[2:v]format=rgba,fps=${FPS}[subs]`);
  g.push(`[3:v]format=rgba,fps=${FPS}[tags]`);
  g.push(`[v1][subs]overlay=x='(${ex('sub')})-${job.W / 2}':y='(${ex('suby')})-${job.subsLayout.bottom}':eval=frame:format=auto:eof_action=pass[v2]`);
  g.push(`[v2][tags]overlay=0:0:format=auto:eof_action=pass,format=yuv420p,trim=duration=${job.total.toFixed(3)}[v]`);
  // audio
  const au = [];
  job.segments.forEach((seg, i) => {
    if (seg.silent) g.push(`anullsrc=r=44100:cl=mono,atrim=duration=${seg.to - seg.from}[a${i}]`);
    else g.push(`[4:a]atrim=start=${seg.from}:end=${seg.to},asetpts=PTS-STARTPTS,aresample=44100,aformat=channel_layouts=mono[a${i}]`);
    au.push(`[a${i}]`);
  });
  g.push(`${au.join('')}concat=n=${au.length}:v=0:a=1,loudnorm=I=-12.7:TP=-1.5:LRA=11,aresample=48000,apad,atrim=duration=${job.total.toFixed(3)}[a]`);
  const script = path.join(CACHE, `${job.name}_graph.txt`);
  fs.writeFileSync(script, g.join(';\n'));
  fs.mkdirSync(path.dirname(job.out), { recursive: true });
  ff(['-f', 'concat', '-safe', '0', '-i', list,
    '-c:v', 'libvpx-vp9', '-i', nubuFile,
    '-f', 'concat', '-safe', '0', '-i', ui.subs,
    '-f', 'concat', '-safe', '0', '-i', ui.tags,
    '-i', voice,
    '-filter_complex_script', script, '-map', '[v]', '-map', '[a]',
    '-c:v', 'libx264', '-preset', DRAFT ? 'veryfast' : 'slow', '-crf', DRAFT ? '23' : '17', '-pix_fmt', 'yuv420p', '-r', String(FPS),
    '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', job.out], 'composite ' + job.name);
}

// ---------------------------------------------------------------- self-check: subtitles vs Nubu
function checkOverlap(job, ui) {
  const issues = [];
  // Nubu visual body inside its frame (fractions): body + feet
  const parts = [[0.12, 0.06, 0.90, 0.90], [0.24, 0.90, 0.78, 0.995]];
  for (const c of ui.boxes) {
    for (let t = c.start; t < c.end; t += 1 / FPS) {
      const r = Track.rectAt(t, job.nubuKeys, job.modes);
      const dx = r.sub - job.W / 2;
      const dy = r.suby - job.subsLayout.bottom;
      const b = { x0: c.box.x + dx, x1: c.box.x + c.box.w + dx, y0: c.box.y + dy, y1: c.box.y + c.box.h + dy };
      for (const [a0, b0, a1, b1] of parts) {
        const n = { x0: r.x + r.w * a0, x1: r.x + r.w * a1, y0: r.y + r.h * b0, y1: r.y + r.h * b1 };
        const ox = Math.min(b.x1, n.x1) - Math.max(b.x0, n.x0), oy = Math.min(b.y1, n.y1) - Math.max(b.y0, n.y0);
        if (ox > 0 && oy > 0) { issues.push(`t=${t.toFixed(2)} sub "${c.text.slice(0, 20)}…" overlaps Nubu by ${ox.toFixed(0)}x${oy.toFixed(0)}px`); t = c.end; break; }
      }
      if (b.x0 < 20 || b.x1 > (job.subsLayout.maxRight || job.W - 20)) { issues.push(`t=${t.toFixed(2)} sub "${c.text.slice(0, 20)}…" off-screen`); break; }
    }
    if (c.end - c.start < 1.0) issues.push(`sub "${c.text.slice(0, 20)}…" only ${(c.end - c.start).toFixed(2)}s`);
  }
  for (const tg of ui.tagBoxes) for (const c of ui.boxes) {
    if (c.end <= tg.start || c.start >= tg.end) continue;
    const r = Track.rectAt(Math.max(c.start, tg.start), job.nubuKeys, job.modes);
    const dx = r.sub - job.W / 2, dy = r.suby - job.subsLayout.bottom;
    if (tg.box.y < c.box.y + c.box.h + dy && tg.box.y + tg.box.h > c.box.y + dy && tg.box.x + tg.box.w > c.box.x + dx && tg.box.x < c.box.x + c.box.w + dx) issues.push(`tag "${tg.text.slice(0, 16)}" overlaps sub at ${c.start.toFixed(2)}`);
  }
  return issues;
}

// ---------------------------------------------------------------- main
async function runJob(browser, job) {
  const T0 = Date.now();
  const pieces = planPieces(job);
  log(`${job.name}: ${job.W}x${job.H}, ${job.total.toFixed(2)}s, ${pieces.length} scene pieces`);
  const cues = buildCues(job);
  fs.writeFileSync(path.join(CACHE, `${job.name}_cues.json`), JSON.stringify(cues.map((c) => ({ start: +c.start.toFixed(3), end: +c.end.toFixed(3), speech: +c.speechStart.toFixed(3), text: c.text })), null, 1));
  const ui = await renderUiLayers(browser, job, cues);
  const issues = checkOverlap(job, ui);
  log(`  layout check: ${issues.length ? issues.length + ' issue(s)' : 'subtitles clear of Nubu'}`);
  issues.slice(0, 30).forEach((s) => log('   ! ' + s));
  const capSec = await capturePieces(browser, job, pieces);
  log(`  scenes captured in ${capSec.toFixed(0)}s`);
  const t1 = Date.now();
  composite(job, pieces, ui);
  log(`  composited → ${job.out} in ${((Date.now() - t1) / 1000).toFixed(0)}s (job total ${((Date.now() - T0) / 1000).toFixed(0)}s)`);
}

async function stills(times) {
  const LAY = CFG.layout || '16x9', L = CFG.layouts[LAY];
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: L.W, height: L.H } });
  page.on('pageerror', (e) => console.error('page error:', e.message));
  const dir = path.join(CACHE, 'stills'); fs.mkdirSync(dir, { recursive: true });
  for (const t of times) {
    const sc = SCENES.find((s) => t >= s.start && t < s.end);
    const stock = prepStock(sc, LAY, L.W, L.H, `main_${sc.id}`);
    await page.goto(pathToFileURL(path.join(HERE, 'scenes', sc.type + '.html')).href);
    await page.evaluate((p) => window.setup(p), { W: L.W, H: L.H, layout: LAY, scene: sc, start: sc.start, end: sc.end, nubu: { keys: CFG.nubuKeys, modes: L.nubuModes }, timeOffset: 0, stock, theme: CFG.theme || null, deco: CFG.themeDeco || null });
    await page.evaluate((x) => window.seek(x), t);
    const f = path.join(dir, `still_${t.toFixed(2)}.png`);
    await page.screenshot({ path: f });
    log('still', f);
  }
  await browser.close();
}

function contact() {
  const C = CFG.contact, src = R(CFG.outputs.main), out = R(CFG.outputs.contact);
  const L = CFG.layouts[CFG.layout || '16x9'], TW = Math.round(L.W / 3), TH = Math.round(L.H / 3);
  const dir = path.join(CACHE, 'contact'); fs.mkdirSync(dir, { recursive: true });
  const files = C.map((c, i) => {
    const f = path.join(dir, `c${i}.png`);
    const label = `${c.label}  ${c.t.toFixed(1)}s`.replace(/:/g, '\\:');
    ff(['-ss', String(c.t), '-i', src, '-frames:v', '1', '-vf', `scale=${TW}:${TH},drawtext=fontfile='C\\:/Windows/Fonts/LeelaUIb.ttf':text='${label}':x=12:y=10:fontsize=24:fontcolor=white:box=1:boxcolor=black@0.6:boxborderw=6`, f], 'contact frame');
    return f;
  });
  const cols = L.W > L.H ? 3 : 5, rows = Math.ceil(files.length / cols);
  const inputs = files.flatMap((f) => ['-i', f]);
  const pads = files.map((_, i) => `[${i}:v]`).join('');
  ff([...inputs, '-filter_complex', `${pads}xstack=inputs=${files.length}:layout=${files.map((_, i) => `${(i % cols) * TW}_${Math.floor(i / cols) * TH}`).join('|')}:fill=black`, out], 'contact sheet');
  log('contact sheet →', out);
}

(async () => {
  if (opt('stills', null)) return stills(String(opt('stills')).split(',').map(Number));
  if (opt('contact', false) === true) return contact();
  const browser = await chromium.launch();
  try {
    if (JOB === 'main' || JOB === 'all') await runJob(browser, mainJob());
    if ((JOB === 'teaser' || JOB === 'all') && CFG.teaser) await runJob(browser, teaserJob());
  } finally { await browser.close(); }
  if ((JOB === 'main' || JOB === 'all') && CFG.contact) contact();
})().catch((e) => { console.error(e); process.exit(1); });
