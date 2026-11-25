// Speed a TTS take up/down without changing pitch, and rescale its character alignment to match.
// usage: node pipeline/speed-voice.js <inDir> <outDir> <speed>
// reads <inDir>/voice.mp3 + alignment.json, writes the same names in <outDir>. speed 1.08 = 8% faster.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const ffmpeg = require('ffmpeg-static');

const [inDir, outDir, sp] = process.argv.slice(2);
const speed = +sp;
if (!inDir || !outDir || !(speed > 0)) { console.error('usage: speed-voice.js <inDir> <outDir> <speed>'); process.exit(1); }
fs.mkdirSync(outDir, { recursive: true });
execFileSync(ffmpeg, ['-y', '-loglevel', 'error', '-i', path.join(inDir, 'voice.mp3'),
  '-af', `rubberband=tempo=${speed}:transients=smooth:formant=preserved`, '-c:a', 'libmp3lame', '-b:a', '192k', path.join(outDir, 'voice.mp3')]);
const a = JSON.parse(fs.readFileSync(path.join(inDir, 'alignment.json'), 'utf8'));
for (const k of ['alignment', 'normalizedAlignment']) {
  const al = a[k]; if (!al) continue;
  for (const f of Object.keys(al)) if (/Seconds|seconds/.test(f)) al[f] = al[f].map(t => +(t / speed).toFixed(4));
}
a.speed = speed;
fs.writeFileSync(path.join(outDir, 'alignment.json'), JSON.stringify(a, null, 1));
const al = a.alignment || a.normalizedAlignment;
console.log(`speed ${speed}: ${(al.characterEndTimesSeconds || al.character_end_times_seconds).at(-1).toFixed(2)} s -> ${outDir}`);
