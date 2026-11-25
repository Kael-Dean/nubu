// Add per-frame talking motion (bob = squash on loud syllables, tilt = slow head sway) to a render timeline, from the voice audio.
// usage: node pipeline/talk-motion.js <timeline.json> <voice.mp3> [--fps 30] [--bob 1] [--tilt 1] [--seed 7]
// Writes the timeline back in place. Values drive the Rive view model numbers `bob` (0..1) and `tilt` (-1..1).
const fs = require('fs');
const { execFileSync } = require('child_process');
const ffmpeg = require('ffmpeg-static');

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const [tlPath, audioPath] = args;
const FPS = +opt('fps', 30), BOB = +opt('bob', 1), TILT = +opt('tilt', 1);
let seed = +opt('seed', 7);
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);   // deterministic

const SR = 16000;
const raw = execFileSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-i', audioPath, '-ac', '1', '-ar', String(SR), '-f', 'f32le', '-'], { maxBuffer: 1 << 28 });
const x = new Float32Array(raw.buffer, raw.byteOffset, raw.length / 4);

const tl = JSON.parse(fs.readFileSync(tlPath, 'utf8'));
const frames = Math.round(tl.duration * FPS), hop = SR / FPS;
// RMS per video frame
const rms = [];
for (let f = 0; f < frames; f++) {
  const a = Math.floor(f * hop), b = Math.min(x.length, Math.floor((f + 1) * hop));
  let s = 0; for (let i = a; i < b; i++) s += x[i] * x[i];
  rms.push(b > a ? Math.sqrt(s / (b - a)) : 0);
}
const sorted = rms.filter(v => v > 0.003).sort((p, q) => p - q);
const ref = sorted.length ? sorted[Math.floor(sorted.length * 0.95)] : 1;

// bob: follow the PHRASE loudness, not each syllable (per-syllable tracking looked jittery/bouncy).
// 1) slow envelope (attack ~0.2 s, release ~0.45 s), 2) critically damped spring on top so there are no
// corners, 3) lower ceiling. Tunables: --bob (amplitude), --bobhz (spring frequency, lower = softer).
// defaults = "lively but smooth" (user-approved 2026-11-25: between the old per-syllable bounce and 0.55/2.2/0.2)
const BOB_MAX = +opt('bobmax', 0.75), HZ = +opt('bobhz', 3.0), ATK = +opt('bobattack', 0.12);
let env = 0;
const envs = rms.map(v => {
  const n = Math.min(1, v / ref);
  env += (n - env) * (n > env ? 1 - Math.exp(-1 / (ATK * FPS)) : 1 - Math.exp(-1 / (0.45 * FPS)));
  return env;
});
const w = 2 * Math.PI * HZ, dt = 1 / FPS;
let pos = 0, vel = 0;
const bob = envs.map(e => {
  const target = Math.pow(e, 0.9) * BOB_MAX;
  const acc = w * w * (target - pos) - 2 * w * vel;   // critically damped
  vel += acc * dt; pos += vel * dt;
  return Math.max(0, Math.min(1, pos)) * BOB;
});

// tilt: pick a new lean at each phrase start (after >= 0.25 s silence), ease toward it; relax to 0 in long silences
const speaking = rms.map(v => v > ref * 0.12);
// A critically damped spring moves toward the target (ease-in AND ease-out). The old exponential chase started each
// lean at full speed, which read as a jolt at every phrase. New leans only after >= 0.5 s pause; smaller range.
let target = 0, silentFrames = 99, side = rand() < 0.5 ? -1 : 1, lastFlip = -999;
const TW = 2 * Math.PI * +opt('tilthz', 1.1), TMAX = +opt('tiltmax', 0.85);
let tp = 0, tv = 0;
const tilt = [];
for (let f = 0; f < frames; f++) {
  if (speaking[f]) {
    if (silentFrames >= Math.round(0.5 * FPS) && f - lastFlip > 1.5 * FPS) { side = -side; target = side * TMAX * (0.5 + 0.5 * rand()); lastFlip = f; }
    silentFrames = 0;
  } else { silentFrames++; if (silentFrames > Math.round(0.9 * FPS)) target = 0; }
  tv += (TW * TW * (target - tp) - 2 * TW * tv) * dt; tp += tv * dt;
  tilt.push(tp * TILT);
}

tl.events = (tl.events || []).filter(e => !(e.set && ('bob' in e.set || 'tilt' in e.set)));
for (let f = 0; f < frames; f++) tl.events.push({ t: +(f / FPS).toFixed(4), set: { bob: +bob[f].toFixed(3), tilt: +tilt[f].toFixed(3) } });
tl.events.sort((a, b) => a.t - b.t);
fs.writeFileSync(tlPath, JSON.stringify(tl));
const peak = Math.max(...bob), avg = bob.reduce((s, v) => s + v, 0) / frames;
console.log(`talk-motion: ${frames} frames · bob avg ${avg.toFixed(2)} peak ${peak.toFixed(2)} · tilt range ${Math.min(...tilt).toFixed(2)}..${Math.max(...tilt).toFixed(2)} -> ${tlPath}`);
