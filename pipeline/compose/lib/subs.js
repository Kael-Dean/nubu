// Phrase-level Thai subtitles from an ElevenLabs character alignment.
// Thai has no word spaces: the script's spaces/line breaks are the phrase boundaries.
const fs = require('fs');

function tokens(alignmentPath) {
  const j = JSON.parse(fs.readFileSync(alignmentPath, 'utf8'));
  const a = j.alignment || j;
  const c = a.characters, s = a.characterStartTimesSeconds, e = a.characterEndTimesSeconds;
  const out = [];
  let cur = null;
  for (let i = 0; i < c.length; i++) {
    const ch = c[i];
    if (ch === ' ' || ch === '\n') {
      if (cur) { out.push(cur); cur = null; }
      if (ch === '\n' && out.length) out[out.length - 1].sentenceEnd = true;
      continue;
    }
    if (!cur) cur = { text: '', start: s[i], end: e[i] };
    cur.text += ch;
    cur.end = e[i];
  }
  if (cur) out.push(cur);
  if (out.length) out[out.length - 1].sentenceEnd = true;
  return out;
}

const len = (toks) => toks.reduce((n, t) => n + [...t.text].length, 0) + Math.max(0, toks.length - 1);

// Group tokens into cues. opts: maxChars (2-line budget), softChars (prefer a break after this),
// minDur (s), lead (s before speech), tail (s after last char when followed by a pause)
function buildCues(toks, opts = {}) {
  const o = Object.assign({ maxChars: 56, softChars: 30, minDur: 1.5, lead: 0.08, tail: 0.35, maxGapInside: 0.45 }, opts);
  const groups = [];
  let g = [];
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (g.length) {
      const dur = g[g.length - 1].end - g[0].start;
      const gap = t.start - g[g.length - 1].end;
      const wouldLen = len(g.concat([t]));
      const last = g[g.length - 1];
      const forced = (o.breakBefore || []).some((p) => t.text.startsWith(p));
      const glued = (gap < 0.15 && Math.min([...last.text].length, [...t.text].length) <= 5) || (o.glue || []).includes(last.text + '|' + t.text);
      const mustBreak = wouldLen > o.maxChars || last.sentenceEnd || /[!?]$/.test(last.text) || forced;
      const wantBreak = (len(g) >= o.softChars || gap > o.maxGapInside) && dur >= o.minDur;
      if (mustBreak || (wantBreak && !glued)) { groups.push(g); g = []; }
    }
    g.push(t);
  }
  if (g.length) groups.push(g);

  // merge too-short groups with a neighbour when the budget allows
  for (let i = 0; i < groups.length; i++) {
    const d = groups[i][groups[i].length - 1].end - groups[i][0].start;
    if (d >= o.minDur * 0.8) continue;
    const prev = groups[i - 1], next = groups[i + 1];
    const endsSentence = groups[i][groups[i].length - 1].sentenceEnd || (next && (o.breakBefore || []).some((p) => next[0].text.startsWith(p)));
    if (next && !endsSentence && len(groups[i].concat(next)) <= o.maxChars) {
      groups.splice(i, 2, groups[i].concat(next)); i--;
    } else if (prev && !prev[prev.length - 1].sentenceEnd && len(prev.concat(groups[i])) <= o.maxChars) {
      groups.splice(i - 1, 2, prev.concat(groups[i])); i -= 2;
    }
  }

  const cues = groups.map((gr) => ({
    tokens: gr.map((t) => t.text),
    text: gr.map((t) => t.text).join(' '),
    speechStart: gr[0].start,
    speechEnd: gr[gr.length - 1].end,
    start: Math.max(0, gr[0].start - o.lead),
  }));
  for (let i = 0; i < cues.length; i++) {
    const c = cues[i], n = cues[i + 1];
    let end = c.speechEnd + o.tail;
    if (n && n.start - c.speechEnd < 0.7) end = n.start; // continuous speech: hold until next
    end = Math.max(end, c.start + o.minDur);
    if (n) end = Math.min(end, n.start);
    c.end = end;
  }
  return cues;
}

// cues for a source window [from,to] shifted to local time (teasers)
function cuesInWindow(toks, from, to, offset, opts) {
  const inside = toks.filter((t) => t.start >= from - 0.01 && t.end <= to + 0.05);
  const cues = buildCues(inside, opts);
  return cues.map((c) => ({ ...c, start: Math.max(offset, c.start - from + offset), end: Math.min(offset + (to - from), c.end - from + offset), speechStart: c.speechStart - from + offset }));
}

module.exports = { tokens, buildCues, cuesInWindow };
