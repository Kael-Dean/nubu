// Shorten long silences in a voice take and shift its character alignment to match.
// usage: node scripts/trim-pauses.js <inDir> <outDir> [--keep 0.3] [--min 0.35] [--db -38] [--protect a-b,c-d]
// Silences longer than --min keep --keep seconds (half at each side). Silences that START inside a protected
// range (seconds, in the input's timeline) are left alone, so scenes timed to the voice frame by frame
// (e.g. pre-rendered film inserts) keep their exact length.
const fs = require('fs');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');
const ffmpeg = require('ffmpeg-static');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const [inDir, outDir] = args;
const KEEP = +opt('keep', 0.3), MIN = +opt('min', 0.35), DB = opt('db', '-38');
const protect = (opt('protect', '') || '').split(',').filter(Boolean).map((r) => r.split('-').map(Number));
const inMp3 = path.join(inDir, 'voice.mp3');

const r = spawnSync(ffmpeg, ['-hide_banner', '-i', inMp3, '-af', `silencedetect=noise=${DB}dB:d=${MIN}`, '-f', 'null', '-'], { encoding: 'utf8' });
const log = r.stderr;
const starts = [...log.matchAll(/silence_start: ([0-9.]+)/g)].map((m) => +m[1]);
const ends = [...log.matchAll(/silence_end: ([0-9.]+)/g)].map((m) => +m[1]);
const cuts = [];
for (let i = 0; i < Math.min(starts.length, ends.length); i++) {
  const a = starts[i], b = ends[i];
  if (a < 0.05) continue;                                   // leading silence: leave
  if (protect.some(([p0, p1]) => a < p1 && b > p0)) continue;   // any overlap with a protected range
  const d = b - a; if (d <= KEEP) continue;
  cuts.push([a + KEEP / 2, b - KEEP / 2]);
}
const removedBefore = (t) => { let s = 0; for (const [a, b] of cuts) { if (t >= b) s += b - a; else if (t > a) s += t - a; } return s; };
const keepExpr = cuts.map(([a, b]) => `between(t,${a.toFixed(4)},${b.toFixed(4)})`).join('+');
fs.mkdirSync(outDir, { recursive: true });
execFileSync(ffmpeg, ['-y', '-loglevel', 'error', '-i', inMp3, '-af',
  cuts.length ? `aselect='not(${keepExpr})',asetpts=N/SR/TB` : 'anull', '-c:a', 'libmp3lame', '-b:a', '192k', path.join(outDir, 'voice.mp3')]);
const a = JSON.parse(fs.readFileSync(path.join(inDir, 'alignment.json'), 'utf8'));
for (const k of ['alignment', 'normalizedAlignment']) {
  const al = a[k]; if (!al) continue;
  for (const f of Object.keys(al)) if (/Seconds|seconds/.test(f)) al[f] = al[f].map((t) => +(t - removedBefore(t)).toFixed(4));
}
a.trimmedPauses = { keep: KEEP, min: MIN, db: DB, protect, cuts: cuts.map(([x, y]) => [+x.toFixed(3), +y.toFixed(3)]) };
fs.writeFileSync(path.join(outDir, 'alignment.json'), JSON.stringify(a, null, 1));
const total = cuts.reduce((s, [x, y]) => s + y - x, 0);
console.log(`trimmed ${cuts.length} pauses, ${total.toFixed(2)} s removed -> ${outDir}`);
