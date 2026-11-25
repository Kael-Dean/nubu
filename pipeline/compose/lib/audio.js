// Audio layer for the compositor: synthesized SFX, music bed with speech ducking, final loudness.
//   buildAudio({cfg, R, cache, ff, FF, total, voice, alignment, scenes}) → { full, nomusic, report }
// Everything is deterministic (seeded noise, no downloads). Config: compose.json "audio" (see README).
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const Music = require('./music.js');

const SR = 48000;

// ---------------------------------------------------------------- tiny DSP
function rng(seed) { let s = seed >>> 0 || 1; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296 * 2 - 1; }; }
const N = (sec) => Math.round(sec * SR);
function normalize(buf) { let m = 0; for (const v of buf) m = Math.max(m, Math.abs(v)); if (m > 0) for (let i = 0; i < buf.length; i++) buf[i] /= m; return buf; }
function sine(buf, f0, f1, amp, dec, start = 0, att = 0.003) {
  let ph = 0; const n = buf.length;
  for (let i = start; i < n; i++) {
    const t = (i - start) / SR, k = Math.min(1, t / Math.max(att, 1e-4));
    const f = f1 == null ? f0 : f0 * Math.pow(f1 / f0, Math.min(1, t / 0.08));
    ph += 2 * Math.PI * f / SR;
    buf[i] += amp * k * Math.exp(-t / dec) * Math.sin(ph);
  }
}
const SFX = {
  // soft "pop": quick pitch drop + tiny click
  pop() { const b = new Float32Array(N(0.11)); sine(b, 740, 260, 1, 0.028, 0, 0.002); const r = rng(3); for (let i = 0; i < N(0.006); i++) b[i] += 0.25 * r() * (1 - i / N(0.006)); return normalize(b); },
  // bright "ting": bell partials, soft attack
  ting() { const b = new Float32Array(N(0.42)); sine(b, 1568, null, 1, 0.16); sine(b, 2349, null, 0.35, 0.09); sine(b, 3951, null, 0.12, 0.05); return normalize(b); },
  // two-note chime for CTA stickers
  chime() { const b = new Float32Array(N(0.5)); sine(b, 1319, null, 0.9, 0.14); sine(b, 2637, null, 0.2, 0.07); sine(b, 1976, null, 1, 0.18, N(0.075)); sine(b, 3951, null, 0.15, 0.06, N(0.075)); return normalize(b); },
  // airy whoosh: noise through a swept one-pole band
  whoosh() {
    const n = N(0.34), b = new Float32Array(n), r = rng(7); let lp = 0, lp2 = 0;
    for (let i = 0; i < n; i++) {
      const p = i / n, fc = 300 + 2600 * Math.sin(Math.PI * Math.min(1, p * 1.15)), a = 1 - Math.exp(-2 * Math.PI * fc / SR);
      lp += a * (r() - lp); lp2 += 0.05 * (lp - lp2);
      b[i] = (lp - lp2) * Math.pow(Math.sin(Math.PI * p), 2);
    }
    return normalize(b);
  },
  // stamp: low thud + short paper slap
  thud() {
    const b = new Float32Array(N(0.24)); sine(b, 120, 52, 1, 0.07, 0, 0.002);
    const r = rng(11); let prev = 0;
    for (let i = 0; i < N(0.03); i++) { const x = r(); b[i] += 0.55 * (x - prev) * Math.exp(-i / N(0.008)); prev = x; }
    return normalize(b);
  },
  // "nope" buzzer for X / cross-out marks: two short soft-square notes falling, "ตืด-ตือ" (warm, not harsh: few odd harmonics)
  buzz() {
    const b = new Float32Array(N(0.42));
    const note = (f, t0, dur) => { const s = N(t0), n = N(dur); for (let i = 0; i < n && s + i < b.length; i++) { const t = i / SR, env = Math.min(1, t / 0.006) * Math.min(1, (dur - t) / 0.03), ph = 2 * Math.PI * f * t; b[s + i] += env * (Math.sin(ph) + 0.33 * Math.sin(3 * ph) + 0.15 * Math.sin(5 * ph)); } };
    note(523, 0, 0.13); note(392, 0.16, 0.22);
    return normalize(b);
  },
  // tiny sparkle: four quick high pings
  sparkle() { const b = new Float32Array(N(0.34)); [[3520, 0], [4186, 0.045], [2960, 0.1], [4699, 0.16]].forEach(([f, t], k) => sine(b, f, null, 0.9 - k * 0.12, 0.045, N(t), 0.002)); return normalize(b); },
};

function writeWav(file, data) {
  const n = data.length, buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVE', 8); buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22); buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) buf.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(data[i] * 32767))), 44 + i * 2);
  fs.writeFileSync(file, buf);
}

// ---------------------------------------------------------------- cue derivation from the scene config
const PRIORITY = { thud: 5, buzz: 5, chime: 4, ting: 3, whoosh: 2, pop: 1, sparkle: 0 };
function deriveCues(scenes, map) {
  const c = [];
  const add = (t, kind, why) => { if (typeof t === 'number' && isFinite(t)) c.push({ t, kind, why }); };
  const S = Object.fromEntries(scenes.map((s) => [s.id, s]));
  for (const s of scenes) {
    const tp = s.type;
    if (tp === 'title') { (s.lines || []).forEach((l, i) => { if (l.card) add(l.at, 'pop', 'hook ticket'); }); }
    if (tp === 'card') { add(s.start + 0.02, 'whoosh', 'photo print'); add(s.cardAt, 'pop', 'ticket'); if (s.topics && s.topics[0]) add(s.topics[0].at, 'pop', 'topics'); }
    if (tp === 'map') {
      if (s.inset && s.stock) add(s.inset.t0, 'whoosh', 'footage window');
      (s.cards || []).forEach((cd) => add(cd.t, 'pop', 'map card'));
      for (const ev of map.events || []) if (ev.blink && ev.t >= s.start && ev.t < s.end) add(ev.t, 'ting', 'station ' + ev.blink);
      if (s.id === scenes.find((x) => x.type === 'map').id) add(s.start + 0.02, 'whoosh', 'map');
      for (const ev of map.events || []) if (ev.shakeAt != null && ev.shakeAt >= s.start && ev.shakeAt < s.end) add(ev.shakeAt, 'buzz', 'not open (shake)');
    }
    if (tp === 'sides') { add(s.start + 0.02, 'whoosh', 'traffic print'); (s.left || []).forEach((x) => add(x.t, x.hl ? 'ting' : 'pop', 'sticker')); }
    if (tp === 'checklist') { add(s.panelAt ?? s.start, 'pop', 'list'); (s.items || []).forEach((it) => add(it.tickAt, 'ting', 'tick')); }
    if (tp === 'warning') { add(s.boxAt ?? s.start, 'pop', 'caution'); (s.lines || []).forEach((l) => { if (l.big) add(l.t, 'thud', 'stamp'); }); (s.tips || []).forEach((x) => add(x.t, 'pop', 'tip')); if (s.art && s.art.strikeAt != null) add(s.art.strikeAt, 'buzz', 'price crossed out'); }
    if (tp === 'iconrow') { (s.tiles || []).forEach((ti) => { add(ti.t, 'pop', 'tile'); if (ti.mark === 'ok') add(ti.markAt, 'ting', 'ok mark'); if (ti.mark === 'no') add(ti.markAt, 'buzz', 'X mark'); }); }
    if (tp === 'meetup') { add(s.start + 0.02, 'whoosh', 'crowd print'); (s.cards || []).forEach((cd) => add(cd.t, 'pop', 'card')); }
    if (tp === 'closing') { add(s.start + 0.3, 'sparkle', 'hearts'); (s.buttons || []).forEach((b) => add(b.t, 'chime', 'CTA')); (s.messages || []).forEach((m) => add(m.t, 'sparkle', 'headline')); }
  }
  return c.sort((a, b) => a.t - b.t);
}
// keep the strongest cue in any 1.5 s window
function thin(cues, gap) {
  const keep = [];
  for (const q of cues.slice().sort((a, b) => PRIORITY[b.kind] - PRIORITY[a.kind] || a.t - b.t)) {
    if (keep.every((k) => Math.abs(k.t - q.t) >= gap)) keep.push(q);
  }
  return keep.sort((a, b) => a.t - b.t);
}

// ---------------------------------------------------------------- speech intervals (for ducking)
function speech(alignmentPath, mergeGap = 0.6) {
  const a = JSON.parse(fs.readFileSync(alignmentPath, 'utf8')).alignment;
  const ch = a.characters, st = a.characterStartTimesSeconds, en = a.characterEndTimesSeconds;
  const iv = [];
  for (let i = 0; i < ch.length; i++) {
    if (/\s/.test(ch[i])) continue;
    const s = st[i], e = en[i];
    if (iv.length && s - iv[iv.length - 1][1] < mergeGap) iv[iv.length - 1][1] = Math.max(iv[iv.length - 1][1], e);
    else iv.push([s, e]);
  }
  return iv;
}

function measure(FF, file) {
  const r = spawnSync(FF, ['-hide_banner', '-nostats', '-i', file, '-af', 'ebur128=peak=true', '-f', 'null', '-'], { encoding: 'utf8', maxBuffer: 1 << 26 });
  const s = r.stderr || '';
  const I = s.match(/I:\s+(-?[\d.]+) LUFS/g), P = s.match(/Peak:\s+(-?[\d.]+) dBFS/g);
  return { I: I ? parseFloat(I[I.length - 1].split(':')[1]) : null, TP: P ? parseFloat(P[P.length - 1].split(':')[1]) : null };
}

function buildAudio(o) {
  const A_ = o.cfg.audio || {}, A = A_;
  const dir = path.join(o.cache, 'audio'); fs.mkdirSync(dir, { recursive: true });
  const total = o.total, f = (v) => v.toFixed(3);
  const report = {};
  // voice (trimmed / padded to the video length)
  const voice = path.join(dir, 'voice.wav');
  // optional voice tone fix (audio.voiceEq, an ffmpeg filter chain) — e.g. tame the bright, piercing 3–4 kHz of a high cute voice
  const veq = o.cfg && o.cfg.audio && o.cfg.audio.voiceEq ? o.cfg.audio.voiceEq + ',' : '';
  o.ff(['-i', o.voice, '-af', `${veq}aresample=${SR},aformat=channel_layouts=mono,apad,atrim=duration=${f(total)}`, voice], 'voice wav');
  const vm = measure(o.FF, voice); report.voice = vm;
  // SFX track
  const sfxCfg = A.sfx || {};
  let cues = sfxCfg.events || deriveCues(o.scenes, o.map);
  const all = cues.length;
  cues = thin(cues.filter((q) => !(sfxCfg.skip || []).some((s) => Math.abs(s - q.t) < 0.05)), sfxCfg.minGap ?? 1.5);
  const MS = o.cfg._music;
  let snappedSfx = 0;
  if (MS) for (const q of cues) if (q.kind === 'whoosh') { const b = MS.grid.beats.reduce((p, c) => (Math.abs(c - q.t) < Math.abs(p - q.t) ? c : p), -99); if (Math.abs(b - q.t) <= 0.15 && Math.abs(b - q.t) > 0.005) { q.t = b; q.snapped = true; snappedSfx++; } }
  const bank = {}; for (const k in SFX) bank[k] = SFX[k]();
  // sound files that replace a synthesized kind: audio.sfx.files = { buzz: { file, maxSec } } — peak-normalised, trimmed, short fade-out
  for (const [k, spec] of Object.entries(sfxCfg.files || {})) {
    const pcm = Music.decode(o.FF, o.R(spec.file), SR), n = Math.min(pcm.length, N(spec.maxSec ?? 0.5));
    const b = new Float32Array(n); let m = 0; for (let i = 0; i < n; i++) { b[i] = pcm[i]; m = Math.max(m, Math.abs(b[i])); }
    const fo = Math.min(n, N(0.03)); for (let i = 0; i < n; i++) b[i] = (b[i] / (m || 1)) * (i >= n - fo ? (n - i) / fo : 1);
    bank[k] = b;
  }
  const busDb = sfxCfg.gainDb ?? ((vm.TP ?? -3) - (sfxCfg.belowVoiceDb ?? 10));
  const kindDb = Object.assign({ pop: -1, ting: -3, chime: -2, whoosh: -5, thud: 0, sparkle: -5 }, sfxCfg.kindDb || {});
  const track = new Float32Array(N(total + 1));
  for (const q of cues) {
    const s = bank[q.kind], g = Math.pow(10, (busDb + (kindDb[q.kind] || 0)) / 20), i0 = N(q.t);
    for (let i = 0; i < s.length && i0 + i < track.length; i++) track[i0 + i] += s[i] * g;
  }
  // brand stings (Nubu sonic logo): intro on the hook, outro resolving into the last frame
  const stings = [];
  if (A_.sting) {
    const Sg = A_.sting, g = Math.pow(10, (((vm.TP ?? -3) - (Sg.belowVoiceDb ?? 6))) / 20);
    // per-sting trim on top of the shared level (introGainDb / outroGainDb, dB, default 0)
    for (const [file, t, trim] of [[o.R(Sg.intro), Sg.introAt ?? 0, Sg.introGainDb ?? 0], [o.R(Sg.outro), Sg.outroAt != null ? Sg.outroAt : (MS ? MS.end - (Sg.outroEndPad ?? 1.55) : total - 1.55), Sg.outroGainDb ?? 0]]) {
      const pcm = Music.decode(o.FF, file, SR), i0 = N(t), gg = g * Math.pow(10, trim / 20);
      for (let i = 0; i < pcm.length && i0 + i < track.length; i++) track[i0 + i] += pcm[i] * gg;
      stings.push({ file: path.basename(file), t: +t.toFixed(2) });
    }
  }
  const sfx = path.join(dir, 'sfx.wav'); writeWav(sfx, track);
  fs.writeFileSync(path.join(dir, 'sfx_cues.json'), JSON.stringify(cues, null, 1));
  const counts = {}; cues.forEach((q) => (counts[q.kind] = (counts[q.kind] || 0) + 1));
  report.sfx = { candidates: all, placed: cues.length, counts, busDb: +busDb.toFixed(1), whooshSnapped: snappedSfx, stings };
  // music bed with speech ducking (volume automation from the alignment)
  let music = null;
  if (A.music && A.music.file && MS) {
    const M = A.music, src = o.R(M.file), mm = measure(o.FF, src);
    const gapDb = M.gainDb ?? ((vm.I - (M.gapBelowVoiceLu ?? 8)) - mm.I);
    const iv = speech(o.alignment, M.mergeGap ?? 0.2).map(([p, q]) => [Math.max(p, M.noDuckUntil ?? 0.9), q]).filter(([p, q]) => q > p);
    const drops = (MS.drops || []).map((d) => [d - (M.dropBefore ?? 0.45), d]);
    const bed = Music.renderBed({ FF: o.FF, file: src, A: MS.A, start: MS.start, total, gapDb, duckDb: M.duckDb ?? 7, iv, drops, fadeIn: M.fadeIn ?? 0.3, fadeOut: M.fadeOut ?? 1.0, xfade: 0.12 });
    music = path.join(dir, 'music.wav'); writeWav(music, bed.pcm);
    report.music = { file: M.file, bpm: MS.A.bpm, key: MS.A.key, inPoint: +MS.A.inPoint.toFixed(2), entersAt: MS.start, loops: bed.loops, sourceLUFS: mm.I, gapGainDb: +gapDb.toFixed(1), duckDb: M.duckDb ?? 7, drops: drops.map((d) => d.map((v) => +v.toFixed(2))), end: +total.toFixed(3) };
  } else if (A.music && A.music.file) {
    const M = A.music, src = o.R(M.file);
    const mm = measure(o.FF, src);
    const gapDb = M.gainDb ?? ((vm.I - (M.gapBelowVoiceLu ?? 8)) - mm.I);       // level in speech gaps
    const duck = M.duckDb ?? 5, up = 0.2, down = 0.35, free = M.noDuckUntil ?? 0.9;
    const iv = speech(o.alignment, M.mergeGap ?? 0.2).map(([a, b]) => [Math.max(a, free), b]).filter(([a, b]) => b > a);
    const sum = iv.map(([a, b]) => `clip((t-${f(a - up)})/${up},0,1)*clip((${f(b + down)}-t)/${down},0,1)`).join('+') || '0';
    const expr = `pow(10,(${gapDb.toFixed(2)}-${duck}*min(1,${sum}))/20)`;
    fs.writeFileSync(path.join(dir, 'music_gain.txt'), expr);
    music = path.join(dir, 'music.wav');
    const fo = M.fadeOut ?? 2;
    o.ff(['-ss', String(M.offset || 0), '-i', src, '-af',
      `aresample=${SR},aformat=channel_layouts=mono,atrim=duration=${f(total)},asetpts=PTS-STARTPTS,volume='${expr}':eval=frame,afade=t=in:d=${M.fadeIn ?? 0.3},afade=t=out:st=${f(total - fo)}:d=${fo},apad,atrim=duration=${f(total)}`, music], 'music bed');
    report.music = { file: M.file, sourceLUFS: mm.I, gapGainDb: +gapDb.toFixed(1), duckDb: duck, speechIntervals: iv.length };
  }
  // mixes → one static gain to -14 LUFS, then a true-peak limiter at -1.5 dBFS
  const mix = (inputs, out, label) => {
    const raw = out.replace(/\.wav$/, '_raw.wav');
    o.ff([...inputs.flatMap((x) => ['-i', x]), '-filter_complex', `${inputs.map((_, i) => `[${i}:a]`).join('')}amix=inputs=${inputs.length}:normalize=0:duration=first[m]`, '-map', '[m]', raw], label + ' mix');
    const m = measure(o.FF, raw);
    let g = (A.targetLUFS ?? -14) - m.I, res;
    for (let pass = 0; pass < 3; pass++) { // the limiter shaves a little loudness: correct the gain until within 0.2 LU
      o.ff(['-i', raw, '-af', `volume=${g.toFixed(2)}dB,alimiter=limit=${Math.pow(10, -1.6 / 20).toFixed(4)}:attack=3:release=60:level=false,aresample=${SR}`, out], label + ' norm');
      res = measure(o.FF, out);
      if (Math.abs(res.I - (A.targetLUFS ?? -14)) <= 0.2) break;
      g += (A.targetLUFS ?? -14) - res.I;
    }
    res.gainDb = +g.toFixed(2); return res;
  };
  const full = path.join(dir, 'mix_full.wav'), nomusic = path.join(dir, 'mix_nomusic.wav');
  report.full = mix(music ? [voice, music, sfx] : [voice, sfx], full, 'full');
  report.nomusic = mix([voice, sfx], nomusic, 'nomusic');
  if (music) { // music stem at the same static gain as the full mix, for the report
    const fullRaw = measure(o.FF, full.replace(/\.wav$/, '_raw.wav'));
    const g = report.full.gainDb ?? ((A.targetLUFS ?? -14) - fullRaw.I);
    const ms = measure(o.FF, music);
    report.music.stemLUFSinMix = ms.I != null ? +(ms.I + g).toFixed(1) : null;
  }
  return { full, nomusic, report };
}

module.exports = { buildAudio, SFX, deriveCues, thin, speech, measure, writeWav };
