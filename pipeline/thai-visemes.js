// Thai character timings (ElevenLabs alignment) -> Nubu viseme timeline for pipeline/render.js
// usage: node pipeline/thai-visemes.js <alignment.json> <timeline.json> [--expression 1] [--wave-first 1.6] [--tail 0.6]
//
// Viseme ids (Rive view model `viseme`): 0 m_closed · 1 a_small · 2 a_wide · 3 o_round · 4 u_pursed · 5 e_smile · 6 tongue · -1 = expression's own mouth
// Thai is written with leading vowels (เ แ โ ใ ไ) BEFORE the consonant, and ElevenLabs gives timings in written order,
// so a leading vowel's shape simply starts a little early — this reads as natural anticipation on a small cartoon mouth.
const fs = require('fs');

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const src = JSON.parse(fs.readFileSync(args[0], 'utf8'));
const al = src.alignment || src.normalizedAlignment;
const chars = al.characters, st = al.characterStartTimesSeconds, en = al.characterEndTimesSeconds;
const expression = +opt('expression', 1);
const waveFirst = +opt('wave-first', 0);      // seconds of waving at the start (0 = no wave)
const tail = +opt('tail', 0.6);

// v2 (2026-11-24): new front mouths 7 f_teeth · 8 tongue_up · 9 s_teeth · 10 a_mid (3/4 view maps them to its 5 mouths inside Rive)
const V = { closed: 0, small: 1, wide: 2, round: 3, pursed: 4, smile: 5, fTeeth: 7, tongueUp: 8, sTeeth: 9, mid: 10 };
const LABIAL = new Set([...'มบปพภผ']);
const F_TEETH = new Set([...'ฟฝ']);
const TONGUE_UP = new Set([...'ลนทดตถธรฐฑฒณฎฏฬ']);
const S_TEETH = new Set([...'สซศษชฉจฌ']);
const W_ROUND = new Set([...'ว']);              // ว rounds the lips
const WIDE = new Set([...'าะัแใไำ']);     // ำ also closes at the end (am)
const SMILE = new Set([...'ิีึืเ']);
const PURSED = new Set([...'ุู']);
const ROUND = new Set([...'โ']);
const SILENT = new Set([...'่้๊๋์็ํ']);  // tone marks etc: no shape of their own
const THAI_CONS = /[ก-ฮ]/;
const isVowelMark = c => WIDE.has(c) || SMILE.has(c) || PURSED.has(c) || ROUND.has(c);

const ev = [];
const push = (t, v) => ev.push({ t: Math.max(0, +t.toFixed(3)), v });
// v3 (2026-11-24): a vowel written AFTER its consonant (ดี, มา, ทุก) really starts during that consonant,
// so its mouth shape is pulled forward into the consonant by PULL of the consonant's duration.
const PULL = +opt('pull', 0.5);
const LEADING = new Set([...'เแโใไ']);
const SPECIAL_CONS = c => 'มบปพภผฟฝลนทดตถธรฐฑฒณฎฏฬสซศษชฉจฌว'.includes(c);
const vt = i => {
  const c = chars[i], p = chars[i - 1];
  if (LEADING.has(c) || !p || !THAI_CONS.test(p)) return st[i];
  const pulled = st[i] - PULL * (st[i] - st[i - 1]);
  // a consonant with its own mouth shape (m/b/p, f, s, l/n/t, w) must stay visible for >= 2 frames first
  return SPECIAL_CONS(p) ? Math.max(pulled, Math.min(st[i], st[i - 1] + 0.067)) : pulled;
};

for (let i = 0; i < chars.length; i++) {
  const c = chars[i], t0 = st[i], t1 = en[i];
  const prev = chars[i - 1] || ' ', next = chars[i + 1] || ' ';
  if (c === ' ' || /[!?.,~\-…"']/.test(c)) {
    const gap = (st[i + 1] ?? t1 + 1) - t0;
    if (gap > 0.12 || i === chars.length - 1) push(t0, V.closed);
    continue;
  }
  if (c === 'ๆ') { // repeat: reopen with the previous syllable's vowel shape
    const last = [...ev].reverse().find(e => e.v !== V.closed);
    push(t0, V.closed); push(t0 + (t1 - t0) * 0.35, last ? last.v : V.small);
    continue;
  }
  if (SILENT.has(c)) continue;
  if (c === 'อ') {
    // อ after a consonant with no other vowel = vowel "aw/o" (ขอ, ป็อป); otherwise a silent initial consonant
    if (THAI_CONS.test(prev) && prev !== 'อ' && !isVowelMark(next)) push(vt(i), V.round);
    continue;
  }
  if (c === 'ำ') { push(vt(i), V.wide); push(t0 + (t1 - t0) * 0.7, V.closed); continue; }
  if (WIDE.has(c)) { push(vt(i), V.wide); continue; }
  if (SMILE.has(c)) { push(vt(i), V.smile); continue; }
  if (PURSED.has(c)) { push(vt(i), V.pursed); continue; }
  if (ROUND.has(c)) { push(vt(i), V.round); continue; }
  if (LABIAL.has(c)) { push(t0, V.closed); continue; }      // lips close for m/b/p/ph, at onset or as a final
  if (F_TEETH.has(c)) { push(t0, V.fTeeth); continue; }
  if (S_TEETH.has(c)) { push(t0, V.sTeeth); continue; }
  if (TONGUE_UP.has(c)) { push(t0, V.tongueUp); continue; }
  if (W_ROUND.has(c)) { push(t0, V.pursed); continue; }
  if (THAI_CONS.test(c) || /[A-Za-z]/.test(c)) {
    // other consonants: keep the mouth moving a little unless a vowel shape is about to come right away
    const lastT = ev.length ? ev[ev.length - 1].t : -1;
    if (t0 - lastT > 0.1) push(t0, V.small);
  }
}

// clean up: sort, merge repeats, enforce a minimum hold so the mouth does not flicker
ev.sort((a, b) => a.t - b.t);
const MIN_HOLD = 0.06;
const clean = [];
for (const e of ev) {
  const last = clean[clean.length - 1];
  if (last && last.v === e.v) continue;
  if (last && e.t - last.t < MIN_HOLD) { last.v = e.v; continue; }   // too short: replace instead of flicker
  clean.push({ ...e });
}
// smoothing v3: any jump of 2+ "openness levels" passes through an in-between for ~STEP seconds
// (opening: in-between at the start of the new shape; closing: in-between at the end of the old shape),
// so the mouth opens/closes instead of snapping. Only where both segments are long enough to spare it.
const LEVEL = { [V.closed]: 0, [V.fTeeth]: 0, [V.sTeeth]: 0, [V.pursed]: 1, [V.small]: 1, [V.tongueUp]: 1, [V.smile]: 1, [V.round]: 2, [V.mid]: 2, 6: 2, [V.wide]: 3 };
const BY_LEVEL = { 1: V.small, 2: V.mid };
const STEP = +opt('mid-step', 0.05);
const smooth = [];
for (let i = 0; i < clean.length; i++) {
  const e = clean[i], prev = smooth[smooth.length - 1], next = clean[i + 1];
  const segEnd = next ? next.t : e.t + 1;
  const lp = prev ? LEVEL[prev.v] : 0, le = LEVEL[e.v];
  if (prev && le - lp >= 2 && segEnd - e.t > STEP + MIN_HOLD) {          // opening jump
    smooth.push({ t: e.t, v: BY_LEVEL[Math.round((lp + le) / 2)] }); smooth.push({ t: +(e.t + STEP).toFixed(3), v: e.v });
  } else smooth.push({ ...e });
  if (next && le - LEVEL[next.v] >= 2) {                                    // closing jump
    const startThis = smooth[smooth.length - 1].t;
    const mid = BY_LEVEL[Math.round((le + LEVEL[next.v]) / 2)];
    if (mid !== e.v && next.t - STEP - startThis > MIN_HOLD) smooth.push({ t: +(next.t - STEP).toFixed(3), v: mid });
  }
}
// drop consecutive duplicates the in-betweens may have created
for (let i = smooth.length - 1; i > 0; i--) if (smooth[i].v === smooth[i - 1].v) smooth.splice(i, 1);
const midCount = smooth.length - clean.length;
// lead: show each shape slightly BEFORE its sound (standard animation practice; the eye reads lips later than the ear hears)
const LEAD = +opt('lead', 0.067);
for (const e of smooth) e.t = Math.max(0, +(e.t - LEAD).toFixed(3));

const end = en[en.length - 1];
const events = [{ t: 0, set: { expression, viseme: 0, pose: waveFirst > 0 ? 1 : 0, view: 0 } }];
for (const e of smooth) events.push({ t: e.t, set: { viseme: e.v } });
events.push({ t: +(end + 0.05 - LEAD).toFixed(3), set: { viseme: 0 } });
events.push({ t: +(end + 0.25).toFixed(3), set: { viseme: -1 } });
if (waveFirst > 0) events.push({ t: waveFirst, set: { pose: 0 } });
fs.writeFileSync(args[1], JSON.stringify({ duration: +(end + tail).toFixed(2), events }, null, 1));
const used = {}; for (const e of smooth) used[e.v] = (used[e.v] || 0) + 1;
console.log(`visemes: ${smooth.length} changes (${midCount} in-betweens, lead ${LEAD}s, vowel pull ${PULL}) over ${end.toFixed(2)}s (${(smooth.length / end).toFixed(1)}/s) · by id ${JSON.stringify(used)} -> ${args[1]}`);
