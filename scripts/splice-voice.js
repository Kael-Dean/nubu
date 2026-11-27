// Replace one phrase of a voice take with a newly generated patch (same voice), keeping the alignment consistent.
// usage: node scripts/splice-voice.js <baseDir> <patchDir> <outDir> "<old phrase>" [--patch-end 2.69] [--display "<subtitle text>"]
// baseDir/patchDir hold voice.mp3 + alignment.json. The old phrase's audio (first char start → last char end) is cut out
// and the patch audio (0 → --patch-end, default: last char end) goes in its place. Text after the phrase shifts by the
// length difference. --display rewrites the patch characters (e.g. drop extra letters the TTS needed) for subtitles:
// the display text must be a prefix-compatible shortening; dropped trailing chars fold into the last kept char.
// Prints the piecewise time map (old → new) to use with retime-compose.js --points.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const ffmpeg = require('ffmpeg-static');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const [baseDir, patchDir, outDir, phrase] = args;
const load = (d) => JSON.parse(fs.readFileSync(path.join(d, 'alignment.json'), 'utf8'));
const base = load(baseDir), patch = load(patchDir);
const A = base.alignment, P = patch.alignment;
const text = A.characters.join('');
const i0 = text.indexOf(phrase);
if (i0 < 0) { console.error('phrase not found'); process.exit(1); }
const i1 = i0 + phrase.length;                       // first char after the phrase
const cutA = A.characterStartTimesSeconds[i0], cutB = A.characterEndTimesSeconds[i1 - 1];
const pEnd = +opt('patch-end', P.characterEndTimesSeconds.at(-1));
const delta = pEnd - (cutB - cutA);

// patch characters, optionally rewritten for display
let pc = P.characters.slice(), ps = P.characterStartTimesSeconds.slice(), pe = P.characterEndTimesSeconds.slice();
const disp = opt('display');
if (disp) {
  const d = [...disp];
  if (d.length > pc.length || pc.slice(0, d.length - 1).join('') !== d.slice(0, -1).join('')) { console.error('--display must keep the patch text up to its last char'); process.exit(1); }
  const end = pe.at(-1);
  pc = d; ps = ps.slice(0, d.length); pe = pe.slice(0, d.length); pe[pe.length - 1] = end;
}
const shift = (arr, from, to, f) => arr.slice(from, to).map(f);
const out = { ...base, text: undefined, splice: { phrase, with: pc.join(''), at: cutA, oldEnd: cutB, newEnd: cutA + pEnd, delta } };
const mk = (S, E, C) => ({
  characters: [...C.slice(0, i0), ...pc, ...C.slice(i1)],
  characterStartTimesSeconds: [...S.slice(0, i0), ...ps.map((t) => +(t + cutA).toFixed(4)), ...shift(S, i1, S.length, (t) => +(t + delta).toFixed(4))],
  characterEndTimesSeconds: [...E.slice(0, i0), ...pe.map((t) => +(t + cutA).toFixed(4)), ...shift(E, i1, E.length, (t) => +(t + delta).toFixed(4))],
});
out.alignment = mk(A.characterStartTimesSeconds, A.characterEndTimesSeconds, A.characters);
out.normalizedAlignment = null;
out.text = out.alignment.characters.join('');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'alignment.json'), JSON.stringify(out, null, 1));
// audio: base[0,cutA) + patch[0,pEnd) + base[cutB,end), 10 ms crossfades
execFileSync(ffmpeg, ['-y', '-loglevel', 'error', '-i', path.join(baseDir, 'voice.mp3'), '-i', path.join(patchDir, 'voice.mp3'), '-filter_complex',
  `[0:a]atrim=0:${cutA},asetpts=N/SR/TB,aresample=44100,aformat=channel_layouts=mono[a];` +
  `[1:a]atrim=0:${pEnd},asetpts=N/SR/TB,aresample=44100,aformat=channel_layouts=mono[p];` +
  `[0:a]atrim=start=${cutB},asetpts=N/SR/TB,aresample=44100,aformat=channel_layouts=mono[b];` +
  `[a][p]acrossfade=d=0.01:c1=tri:c2=tri[ap];[ap][b]acrossfade=d=0.01:c1=tri:c2=tri[o]`,
  '-map', '[o]', '-c:a', 'libmp3lame', '-b:a', '192k', path.join(outDir, 'voice.mp3')]);
console.log(JSON.stringify({ cutA, cutB, newEnd: +(cutA + pEnd).toFixed(4), delta: +delta.toFixed(4), points: `${cutA}:${cutA},${cutB}:${+(cutA + pEnd).toFixed(4)}` }));
