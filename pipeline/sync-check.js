// Measure lip-sync offset: (A) intended viseme timeline vs audio loudness, (B) rendered mouth opening vs audio loudness,
// (C) rendered mouth vs intended timeline. Positive lag = mouth is LATE relative to the reference.
// usage: node pipeline/sync-check.js <timeline.json> <voice.mp3> <framesDir> [--fps 30]
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const ffmpeg = require('ffmpeg-static');
const { PNG } = (() => { try { return require('pngjs'); } catch { return {}; } })();

const [tlPath, audioPath, framesDir] = process.argv.slice(2);
const FPS = 30;
const tl = JSON.parse(fs.readFileSync(tlPath, 'utf8'));
const frames = Math.round(tl.duration * FPS);

// audio loudness per frame
const SR = 16000;
const raw = execFileSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-i', audioPath, '-ac', '1', '-ar', String(SR), '-f', 'f32le', '-'], { maxBuffer: 1 << 28 });
const x = new Float32Array(raw.buffer, raw.byteOffset, raw.length / 4);
const rms = [];
for (let f = 0; f < frames; f++) { const a = Math.floor(f * SR / FPS), b = Math.min(x.length, Math.floor((f + 1) * SR / FPS)); let s = 0; for (let i = a; i < b; i++) s += x[i] * x[i]; rms.push(b > a ? Math.sqrt(s / (b - a)) : 0); }

// intended mouth opening per frame from the timeline
const OPEN = { 0: 0, 7: 0.15, 9: 0.2, 4: 0.3, 1: 0.4, 8: 0.45, 3: 0.55, 5: 0.5, 10: 0.7, 2: 1, 6: 0.8, '-1': 0.6 };
const vis = tl.events.filter(e => e.set && e.set.viseme !== undefined).sort((a, b) => a.t - b.t);
const intended = [];
for (let f = 0, k = 0, cur = 0; f < frames; f++) { while (k < vis.length && vis[k].t <= f / FPS + 1e-6) cur = vis[k++].set.viseme; intended.push(OPEN[cur] ?? 0.4); }

function corrAtLag(a, b, lag) { // correlate a[t] with b[t - lag]  (lag > 0: a is later than b)
  const xs = [], ys = [];
  for (let t = 0; t < a.length; t++) { const u = t - lag; if (u >= 0 && u < b.length) { xs.push(a[t]); ys.push(b[u]); } }
  const mx = xs.reduce((s, v) => s + v, 0) / xs.length, my = ys.reduce((s, v) => s + v, 0) / ys.length;
  let n = 0, dx = 0, dy = 0; for (let i = 0; i < xs.length; i++) { n += (xs[i] - mx) * (ys[i] - my); dx += (xs[i] - mx) ** 2; dy += (ys[i] - my) ** 2; }
  return n / Math.sqrt(dx * dy);
}
function bestLag(a, b, label) {
  let best = -2, bl = 0; const row = [];
  for (let lag = -8; lag <= 8; lag++) { const c = corrAtLag(a, b, lag); row.push(`${lag}:${c.toFixed(2)}`); if (c > best) { best = c; bl = lag; } }
  console.log(`${label}: best lag ${bl} frames (${(bl * 1000 / FPS).toFixed(0)} ms), r=${best.toFixed(2)}\n   ${row.join(' ')}`);
  return bl;
}
bestLag(intended, rms, 'A intended mouth vs audio');

// rendered mouth opening (pink/dark pixels in the mouth box) — needs sharp from the scratch tool dir or pngjs
(async () => {
  let sharp; try { sharp = require('sharp'); } catch { sharp = require(process.env.SHARP_PATH); }
  const meta = await sharp(path.join(framesDir, 'f00000.png')).metadata();
  // mouth box in artboard coords (front view): x 598..788, y 683..848 → scaled to the frame size
  const sx = meta.width / 1380, sy = meta.height / 1389;
  const box = { x0: Math.round(612 * sx), x1: Math.round(776 * sx), y0: Math.round(690 * sy), y1: Math.round(845 * sy) };
  const opened = [];
  for (let f = 0; f < frames; f++) {
    const { data, info } = await sharp(path.join(framesDir, `f${String(f).padStart(5, '0')}.png`)).raw().toBuffer({ resolveWithObject: true });
    let n = 0;
    for (let y = box.y0; y < box.y1; y++) for (let xx = box.x0; xx < box.x1; xx++) { const p = (y * info.width + xx) * info.channels; const r = data[p], g = data[p + 1], b = data[p + 2]; if (data[p + 3] > 128 && (r - g > 55 || (r + g + b) / 3 < 110)) n++; }
    opened.push(n);
  }
  bestLag(opened, rms, 'B rendered mouth vs audio');
  bestLag(opened, intended, 'C rendered mouth vs intended timeline');
})();
