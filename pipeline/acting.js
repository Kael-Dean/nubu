// Add acting cues (expression / pose / view changes) to a render timeline, anchored to phrases in the voice alignment.
// usage: node pipeline/acting.js <timeline.json> <alignment.json> <cues.json>
// cues.json: [ { "at": "phrase in the script", "offset": -0.1, "set": { "expression": 3, "pose": 5 } }, ... ]
//   ids — expression: 0 neutral · 1 happy · 2 swoon · 3 shock · 4 sad · 5 pout · 6 sleepy · 7 laugh
//         pose (front view only): 0 rest · 1 wave · 2 cheer · 3 hold_cheeks · 4 point · 5 gasp
//         view: 0 front · 1 three-quarter
// Phrases are found in order (each search starts after the previous match), so repeated words resolve to the next occurrence.
// Writes the timeline back in place.
const fs = require('fs');
const [tlPath, alPath, cuesPath] = process.argv.slice(2);
const tl = JSON.parse(fs.readFileSync(tlPath, 'utf8'));
const a = JSON.parse(fs.readFileSync(alPath, 'utf8'));
const al = a.alignment;
const chars = al.characters, starts = al.characterStartTimesSeconds || al.character_start_times_seconds;
const text = chars.join('');
const cues = JSON.parse(fs.readFileSync(cuesPath, 'utf8'));

let from = 0, added = 0;
for (const c of cues) {
  const i = text.indexOf(c.at, from);
  if (i < 0) { console.error('phrase not found (after previous cue):', c.at); process.exit(1); }
  from = i + 1;
  const t = Math.max(0, +(starts[i] + (c.offset || 0)).toFixed(3));
  tl.events.push({ t, set: c.set });
  added++;
  console.log(t.toFixed(2).padStart(7), c.at, JSON.stringify(c.set));
}
tl.events.sort((x, y) => x.t - y.t);
fs.writeFileSync(tlPath, JSON.stringify(tl, null, 1));
console.log(`added ${added} acting cues`);
