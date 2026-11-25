// Music analysis + brand sting + music bed rendering (all in code, deterministic).
//   analyze(FF, file, cacheDir) → { bpm, beat, beats[], bars[], downbeat, key, tonicMidi, mode, inPoint, barRms[] }
//   sting(tonicMidi, kind) → Float32Array @48k     kind: 'intro' | 'outro'
//   renderBed({...}) → Float32Array @48k            music from inPoint, bar-looped, ducked, drop, fades
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const AR = 22050;   // analysis rate
const SR = 48000;   // output rate

function decode(FF, file, rate) {
  const r = spawnSync(FF, ['-hide_banner', '-loglevel', 'error', '-i', file, '-ac', '1', '-ar', String(rate), '-f', 'f32le', '-'], { maxBuffer: 1 << 30 });
  if (r.status !== 0) throw new Error('decode failed ' + file);
  const b = r.stdout; return new Float32Array(b.buffer, b.byteOffset, b.length / 4);
}

// ---------------------------------------------------------------- tempo / beats / bars / key / in-point
function analyze(FF, file, cacheDir, opt = {}) {
  const st = fs.statSync(file);
  const cache = path.join(cacheDir, 'music_analysis.json');
  if (fs.existsSync(cache)) { const c = JSON.parse(fs.readFileSync(cache, 'utf8')); if (c.stamp === st.size + ':' + st.mtimeMs && JSON.stringify(c.opt) === JSON.stringify(opt)) return c; }
  const x = decode(FF, file, AR);
  const hop = 512, win = 1024, nF = Math.floor((x.length - win) / hop);
  const eAll = new Float32Array(nF), eLow = new Float32Array(nF);
  let lp = 0;
  const low = new Float32Array(x.length); const a = 1 - Math.exp(-2 * Math.PI * 150 / AR);
  for (let i = 0; i < x.length; i++) { lp += a * (x[i] - lp); low[i] = lp; }
  for (let f = 0; f < nF; f++) {
    let s = 0, sl = 0; const o = f * hop;
    for (let i = 0; i < win; i++) { s += x[o + i] * x[o + i]; sl += low[o + i] * low[o + i]; }
    eAll[f] = Math.log(1e-9 + s / win); eLow[f] = Math.log(1e-9 + sl / win);
  }
  const onset = new Float32Array(nF), onLow = new Float32Array(nF);
  for (let f = 1; f < nF; f++) { onset[f] = Math.max(0, eAll[f] - eAll[f - 1]) + Math.max(0, eLow[f] - eLow[f - 1]); onLow[f] = Math.max(0, eLow[f] - eLow[f - 1]); }
  // tempo: autocorrelation over 60..180 BPM, mild preference around 100
  const fps = AR / hop; let best = null;
  const ac = (L) => { let s = 0; for (let f = L; f < nF; f++) s += onset[f] * onset[f - L]; return s / (nF - L); };
  for (let bpm = 60; bpm <= 180; bpm += 0.25) {
    const L = 60 * fps / bpm, L0 = Math.floor(L), fr = L - L0;
    const v = (1 - fr) * ac(L0) + fr * ac(L0 + 1);
    const w = Math.exp(-0.5 * Math.pow(Math.log2(bpm / 100) / 0.9, 2));
    if (!best || v * w > best.s) best = { bpm, s: v * w, L };
  }
  const P = best.L; // frames per beat
  // phase
  let ph = 0, phS = -1;
  for (let o = 0; o < P; o += 0.25) { let s = 0; for (let k = o; k < nF; k += P) s += onset[Math.round(k)] || 0; if (s > phS) { phS = s; ph = o; } }
  const beatSec = P / fps, t0 = ph / fps;
  const beats = []; for (let t = t0; t < x.length / AR; t += beatSec) beats.push(+t.toFixed(4));
  // downbeat: the beat-in-bar with the most low-band onset
  const sums = [0, 0, 0, 0]; beats.forEach((t, i) => { sums[i % 4] += onLow[Math.round(t * fps)] || 0; });
  const db = sums.indexOf(Math.max(...sums));
  const bars = beats.filter((_, i) => i % 4 === db);
  // bar energy (RMS) → catchiest in-point: bar after the intro with the most energy over the next 4 bars
  const rmsAt = (a0, a1) => { let s = 0, n = 0; for (let i = Math.floor(a0 * AR); i < Math.min(x.length, a1 * AR); i++) { s += x[i] * x[i]; n++; } return Math.sqrt(s / Math.max(1, n)); };
  const barRms = bars.map((b, i) => rmsAt(b, bars[i + 1] ?? x.length / AR));
  const skip = opt.skipIntro ?? 8;
  let inIdx = 0, inS = -1;
  // fixed in-point (narrative tracks: play straight through from here instead of jumping to the loudest bar)
  if (opt.inPoint != null) { inIdx = Math.max(0, bars.findIndex((b) => b >= opt.inPoint - 1e-6)); inS = Infinity; }
  for (let i = 0; inS !== Infinity && i + 4 < bars.length; i++) { if (bars[i] < skip) continue; const s = (barRms[i] + barRms[i + 1] + barRms[i + 2] + barRms[i + 3]) / 4; if (s > inS * 1.03) { inS = s; inIdx = i; } }
  // key: Goertzel chroma + Krumhansl profiles
  const chroma = new Array(12).fill(0), W = 8192;
  for (let o = Math.floor(AR * 2); o + W < x.length; o += AR) {
    for (let m = 45; m <= 81; m++) {
      const f = 440 * Math.pow(2, (m - 69) / 12), k = 2 * Math.cos(2 * Math.PI * f / AR); let s1 = 0, s2 = 0;
      for (let i = 0; i < W; i++) { const s0 = x[o + i] * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / W)) + k * s1 - s2; s2 = s1; s1 = s0; }
      chroma[m % 12] += Math.sqrt(Math.max(0, s1 * s1 + s2 * s2 - k * s1 * s2));
    }
  }
  const MAJ = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88], MIN = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
  const corr = (p, r) => { const c = chroma.map((_, i) => chroma[(i + r) % 12]); const mc = c.reduce((a, b) => a + b) / 12, mp = p.reduce((a, b) => a + b) / 12; let n = 0, d1 = 0, d2 = 0; for (let i = 0; i < 12; i++) { n += (c[i] - mc) * (p[i] - mp); d1 += (c[i] - mc) ** 2; d2 += (p[i] - mp) ** 2; } return n / Math.sqrt(d1 * d2); };
  let key = null; for (let r = 0; r < 12; r++) for (const [mode, p] of [['major', MAJ], ['minor', MIN]]) { const v = corr(p, r); if (!key || v > key.v) key = { r, mode, v }; }
  const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const out = {
    stamp: st.size + ':' + st.mtimeMs, opt, duration: x.length / AR,
    bpm: +(60 / beatSec).toFixed(2), beat: beatSec, firstBeat: t0, downbeatIndex: db, beats, bars, barRms: barRms.map((v) => +v.toFixed(4)),
    inPoint: bars[inIdx], inBar: inIdx,
    key: NAMES[key.r] + ' ' + key.mode, tonic: key.r, mode: key.mode, keyCorr: +key.v.toFixed(3),
  };
  fs.mkdirSync(cacheDir, { recursive: true }); fs.writeFileSync(cache, JSON.stringify(out));
  return out;
}

// ---------------------------------------------------------------- brand sting (kalimba / music-box + sparkle tail)
function sting(tonicPc, mode, kind = 'intro') {
  const major = mode === 'minor' ? (tonicPc + 3) % 12 : tonicPc;  // always sing in the (relative) major
  const base = 72 + ((major - 0 + 12) % 12);                       // tonic in octave 5 (C5..B5)
  const T = base > 77 ? base - 12 : base;                          // keep it in a sweet range
  const deg = { 1: 0, 2: 2, 3: 4, 5: 7, 6: 9 };
  const seq = kind === 'outro'
    ? [[12 + deg[5], 0, 0.9], [12 + deg[3], 0.15, 0.9], [12 + deg[2], 0.30, 0.9], [12 + deg[1], 0.47, 1.0]]   // 5'-3'-2'-1' resolves home
    : [[deg[5], 0, 0.85], [12 + deg[1], 0.13, 0.9], [12 + deg[3], 0.26, 0.95], [12 + deg[5], 0.40, 1.0]];      // 5-1'-3'-5' rises
  const len = kind === 'outro' ? 1.6 : 1.45, n = Math.round(len * SR), b = new Float32Array(n);
  for (const [semi, t, amp] of seq) {
    const f = 440 * Math.pow(2, (T + semi - 69) / 12), i0 = Math.round(t * SR);
    let s1 = 1;
    for (let i = i0; i < n; i++) {
      const u = (i - i0) / SR, att = Math.min(1, u / 0.004);
      const v = Math.sin(2 * Math.PI * f * u) * Math.exp(-u / 0.55)
        + 0.32 * Math.sin(2 * Math.PI * 2 * f * u) * Math.exp(-u / 0.22)
        + 0.10 * Math.sin(2 * Math.PI * 5.4 * f * u) * Math.exp(-u / 0.045);     // tine "ping"
      b[i] += amp * att * v;
      s1 = 0;
    }
  }
  // sparkle tail: tiny high pings after the last note
  const lastT = seq[seq.length - 1][1];
  [[3.0, 0.10], [4.0, 0.17], [3.36, 0.25], [5.0, 0.33]].forEach(([mult, dt], k) => {
    const f = 440 * Math.pow(2, (T + 12 - 69) / 12) * mult / 2, i0 = Math.round((lastT + dt) * SR);
    for (let i = i0; i < n; i++) { const u = (i - i0) / SR; b[i] += (0.16 - k * 0.025) * Math.min(1, u / 0.002) * Math.exp(-u / 0.06) * Math.sin(2 * Math.PI * f * u); }
  });
  // gentle fade at the very end, normalise
  const fo = Math.round(0.12 * SR); for (let i = 0; i < fo; i++) b[n - 1 - i] *= i / fo;
  let m = 0; for (const v of b) m = Math.max(m, Math.abs(v)); for (let i = 0; i < n; i++) b[i] /= m;
  return b;
}

// ---------------------------------------------------------------- music bed
// o: { FF, file, A (analysis), start (timeline s where the in-point lands), total, gapDb, duckDb, iv (speech), drops:[[t0,t1]], fadeIn, fadeOut, xfade }
function renderBed(o) {
  const x = decode(o.FF, o.file, SR), A = o.A;
  const n = Math.round(o.total * SR), out = new Float32Array(n);
  const inS = Math.round(A.inPoint * SR);
  const lastBar = loopEndOf(A);
  const loopEnd = Math.round(lastBar * SR), xf = Math.round((o.xfade ?? 0.12) * SR);
  // build source index stream: in-point → last full bar, then back to the in-point with a crossfade
  let src = inS, i = Math.round(o.start * SR), loops = 0;
  while (i < n) {
    if (src >= loopEnd) { // crossfade the next xf samples from the loop start
      for (let k = 0; k < xf && i < n; k++, i++) { const w = k / xf; out[i] = (1 - w) * (x[loopEnd + k] || 0) + w * x[inS + k]; }
      src = inS + xf; loops++; continue;
    }
    out[i++] = x[src++];
  }
  // gain automation: gaps at gapDb, speech ducked, drops, fades
  const up = 0.2, down = 0.35, g = new Float32Array(n);
  for (let k = 0; k < n; k++) g[k] = 0;
  for (const [a, b] of o.iv) {
    const k0 = Math.max(0, Math.round((a - up) * SR)), k1 = Math.min(n, Math.round((b + down) * SR));
    for (let k = k0; k < k1; k++) { const t = k / SR; g[k] += Math.min(1, Math.max(0, (t - (a - up)) / up)) * Math.min(1, Math.max(0, ((b + down) - t) / down)); }
  }
  const fi = o.fadeIn ?? 0.3, fo = o.fadeOut ?? 1.2;
  for (let k = 0; k < n; k++) {
    const t = k / SR;
    let gain = Math.pow(10, (o.gapDb - o.duckDb * Math.min(1, g[k])) / 20);
    gain *= Math.min(1, Math.max(0, (t - o.start) / fi));
    gain *= Math.min(1, Math.max(0, (o.total - t) / fo));
    for (const [d0, d1] of o.drops || []) { // music drop: 40 ms out before d0+0.04, silent, 30 ms back at d1
      if (t >= d0 && t < d1) gain *= Math.max(0, 1 - (t - d0) / 0.04);
      if (t >= d1 && t < d1 + 0.03) gain *= (t - d1) / 0.03;
    }
    out[k] *= gain;
  }
  return { pcm: out, loops };
}

// loop end = start of the first bar after the last "full" bar (skips the fade-out / silent tail)
function loopEndOf(A) { const med = A.barRms.slice().sort((a, b) => a - b)[Math.floor(A.barRms.length / 2)]; let i = A.barRms.length - 1; while (i > 0 && A.barRms[i] < med * 0.6) i--; return A.bars[Math.min(A.bars.length - 1, i + 1)]; }

// beat grid on the timeline (in-point lands on `start`)
function timelineBeats(A, start, total) {
  const rel = A.beats.filter((b) => b >= A.inPoint - 1e-6).map((b) => b - A.inPoint);
  const period = loopEndOf(A) - A.inPoint;
  const beats = [], bars = [];
  for (let L = 0; start + L * period < total + 1; L++) for (let j = 0; j < rel.length; j++) {
    const t = start + L * period + rel[j]; if (rel[j] >= period - 1e-3) continue;
    beats.push(t); if (j % 4 === 0) bars.push(t);
  }
  return { beats, bars };
}

module.exports = { loopEndOf, analyze, sting, renderBed, timelineBeats, decode, SR };
