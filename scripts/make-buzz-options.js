// Low-pitched "no" buzzer options for X / cross-out marks. node scripts/make-buzz-options.js
const fs = require('fs'); const SR = 44100;
const OUT = 'D:/NUBU/assets/audio/sfx_options';
const N = s => Math.round(s * SR);
function osc(kind, ph) { const x = ph % (2 * Math.PI) / (2 * Math.PI); return kind === 'saw' ? 2 * x - 1 : kind === 'sq' ? (x < 0.5 ? 1 : -1) : kind === 'tri' ? 4 * Math.abs(x - 0.5) - 1 : Math.sin(ph); }
function note(b, { f0, f1 = f0, t0 = 0, dur, kind = 'sq', amp = 1, att = 0.008, rel = 0.05, wob = 0 }) {
  let ph = 0; const s = N(t0), n = N(dur);
  for (let i = 0; i < n && s + i < b.length; i++) {
    const t = i / SR, f = f0 * Math.pow(f1 / f0, t / dur) * (1 + wob * Math.sin(2 * Math.PI * 28 * t));
    ph += 2 * Math.PI * f / SR;
    const env = Math.min(1, t / att) * Math.min(1, (dur - t) / rel);
    b[s + i] += amp * env * osc(kind, ph);
  }
}
function lowpass(b, fc) { const a = 1 - Math.exp(-2 * Math.PI * fc / SR); let y = 0; for (let i = 0; i < b.length; i++) { y += a * (b[i] - y); b[i] = y; } }
function finish(b, fc, peak = 0.7) { lowpass(b, fc); lowpass(b, fc); let m = 0; for (const v of b) m = Math.max(m, Math.abs(v)); for (let i = 0; i < b.length; i++) b[i] = b[i] / m * peak; return b; }
function wav(file, d) { const n = d.length, buf = Buffer.alloc(44 + n * 2); buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVEfmt ', 8); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22); buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(n * 2, 40); for (let i = 0; i < n; i++) buf.writeInt16LE(Math.round(d[i] * 32767), 44 + i); fs.writeFileSync(file, buf); }
const V = {
  '1_game-show-wrong_EHHH': () => { const b = new Float32Array(N(0.62)); note(b, { f0: 118, dur: 0.58, kind: 'saw', att: 0.01, rel: 0.12, wob: 0.012 }); note(b, { f0: 177, dur: 0.58, kind: 'saw', amp: 0.35, att: 0.01, rel: 0.12 }); return finish(b, 900); },
  '2_two-tone-low_dum-dum': () => { const b = new Float32Array(N(0.5)); note(b, { f0: 165, dur: 0.17, kind: 'sq', rel: 0.03 }); note(b, { f0: 123, t0: 0.2, dur: 0.27, kind: 'sq', rel: 0.06 }); return finish(b, 700); },
  '3_deep-fall_tuuuu': () => { const b = new Float32Array(N(0.6)); note(b, { f0: 150, f1: 82, dur: 0.56, kind: 'saw', att: 0.012, rel: 0.1 }); return finish(b, 650); },
  '4_soft-low_bom-bom': () => { const b = new Float32Array(N(0.5)); note(b, { f0: 147, f1: 135, dur: 0.16, kind: 'tri', att: 0.006, rel: 0.05 }); note(b, { f0: 110, f1: 98, t0: 0.19, dur: 0.28, kind: 'tri', att: 0.006, rel: 0.1 }); note(b, { f0: 220, f1: 196, dur: 0.16, kind: 'sin', amp: 0.25 }); return finish(b, 600); },
  '5_triple-dud_dut-dut-dutt': () => { const b = new Float32Array(N(0.62)); note(b, { f0: 138, dur: 0.1, kind: 'sq', rel: 0.02 }); note(b, { f0: 138, t0: 0.15, dur: 0.1, kind: 'sq', rel: 0.02 }); note(b, { f0: 104, t0: 0.3, dur: 0.28, kind: 'sq', rel: 0.08 }); return finish(b, 750); },
};
for (const [name, fn] of Object.entries(V)) wav(`${OUT}/${name}.wav`, fn());
console.log(Object.keys(V).join('\n'));
