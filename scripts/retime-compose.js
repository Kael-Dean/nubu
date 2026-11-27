// Retime an episode compose.json from one voice take to another of the SAME script.
// Times map through the character alignment: an old time t sits between old char starts i and i+1 →
// the same fraction between new char starts i and i+1. After the last char, the tail keeps its length.
// usage: node scripts/retime-compose.js <compose.json> <oldAlignment.json> <newAlignment.json> <out.json>
//    or: node scripts/retime-compose.js <compose.json> --points a0:b0,a1:b1,... <out.json>   (piecewise-linear old→new, slope 1 outside)
// Mapped keys: t, at, until, start, end, lightsAt, lightsFull, tickAt, markAt, jitterAt, titleAt (anywhere),
// tags[].from/to, duration, audio.maxDuration, contact[].t. Left alone: value.from/to (counter numbers),
// stock.from (offset into the source file), every *dur / size / position field.
// Stock video clips (kind video, with dur) get `speed` so the clip still spans its scene.
const fs = require('fs');
const argv = process.argv.slice(2);
const POINTS = argv[1] === '--points' ? argv[2].split(',').map((p) => p.split(':').map(Number)) : null;
const [cfgPath, oldPath, newPath, outPath] = POINTS ? [argv[0], null, null, argv[3]] : argv;
const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
const al = (p) => { const a = JSON.parse(fs.readFileSync(p, 'utf8')).alignment; return { ch: a.characters, s: a.characterStartTimesSeconds, e: a.characterEndTimesSeconds }; };
const A = POINTS ? null : al(oldPath), B = POINTS ? null : al(newPath);
if (!POINTS && A.ch.join('') !== B.ch.join('')) { console.error('alignments are not the same text'); process.exit(1); }
const n = A ? A.s.length : 0;
function mapPoints(t) {
  const P = POINTS; if (t <= P[0][0]) return +(t + P[0][1] - P[0][0]).toFixed(3);
  for (let k = 1; k < P.length; k++) if (t <= P[k][0]) { const [a0, b0] = P[k - 1], [a1, b1] = P[k]; return +(b0 + (t - a0) * (b1 - b0) / (a1 - a0)).toFixed(3); }
  const [a, b] = P.at(-1); return +(t + b - a).toFixed(3);
}
function map(t) {
  if (POINTS) return mapPoints(t);
  if (t <= A.s[0]) return +(t * (B.s[0] / (A.s[0] || 1))).toFixed(3);
  const endA = A.e[n - 1], endB = B.e[n - 1];
  if (t >= endA) return +(endB + (t - endA)).toFixed(3);
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (A.s[m] <= t) lo = m; else hi = m; }
  // skip zero-length steps
  let i = lo, j = hi; while (j < n - 1 && A.s[j] === A.s[i]) j++;
  const u = A.s[j] > A.s[i] ? (t - A.s[i]) / (A.s[j] - A.s[i]) : 0;
  return +(B.s[i] + u * (B.s[j] - B.s[i])).toFixed(3);
}
const TIME_KEYS = new Set(['t', 'at', 'until', 'start', 'end', 'lightsAt', 'lightsFull', 'tickAt', 'markAt', 'jitterAt', 'titleAt', 'photoUntil', 'stockUntil']);
let count = 0;
function walk(o, parentKey) {
  if (Array.isArray(o)) return o.forEach((x) => walk(x, parentKey));
  if (!o || typeof o !== 'object') return;
  for (const k of Object.keys(o)) {
    const v = o[k];
    if (typeof v === 'number') {
      const isTime = TIME_KEYS.has(k) || (parentKey === 'tags' && (k === 'from' || k === 'to'));
      if (isTime && !(parentKey === 'value' && (k === 'from' || k === 'to'))) { o[k] = map(v); count++; }
    } else walk(v, k);
  }
}
// scene stock clips: remember old span before mapping
const spans = cfg.scenes.map((s) => [s.start, s.end]);
walk(cfg.scenes, 'scenes'); walk(cfg.nubuKeys, 'nubuKeys'); walk(cfg.tags, 'tags'); walk(cfg.contact, 'contact');
cfg.scenes.forEach((s, i) => {
  const st = s.stock;
  if (st && st.kind === 'video' && st.dur && s.type === 'cine') {
    const oldLen = spans[i][1] - spans[i][0], newLen = s.end - s.start;
    st.speed = +(oldLen / newLen).toFixed(5);            // <1 = slower
    st.dur = +(newLen).toFixed(3);
  }
});
cfg.duration = map(cfg.duration); if (cfg.audio && cfg.audio.maxDuration) cfg.audio.maxDuration = cfg.duration;
fs.writeFileSync(outPath, JSON.stringify(cfg, null, 1));
console.log(`mapped ${count} time fields · duration ${cfg.duration}`);
for (const s of cfg.scenes) console.log(s.id.padEnd(4), s.type.padEnd(9), s.start.toFixed(2), '-', s.end.toFixed(2), s.stock && s.stock.speed ? 'speed ' + s.stock.speed : '');
