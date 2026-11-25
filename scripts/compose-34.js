const sharp = require('sharp');
const fs = require('fs');
const L = 'D:/NUBU/character/layers/angle34/';
const SP = 'D:/NUBU/character/layers/angle34/';
const man = JSON.parse(fs.readFileSync(L + 'face/manifest.json', 'utf8'));
const EXPR = [['open+m_closed','open','m_closed'],['open+a_small','open','a_small'],['open+a_wide','open','a_wide'],['open+o_round','open','o_round'],['open+e_smile','open','e_smile'],['blink+m_closed','blink','m_closed']];
async function build(bg, eyes, mouth) {
  const stack = ['cup_far','body_base','arm_far','arm_near','headphones'].map(n => ({ input: L + n + '.png' }));
  for (const s of ['far','near']) { const k = `eye_${eyes}_${s}`, m = man.eyes[k]; stack.push({ input: L + 'face/eyes/' + k + '.png', left: m.x, top: m.y }); }
  const mk = `mouth_${mouth}`, mm = man.mouths[mk]; stack.push({ input: L + 'face/mouths/' + mk + '.png', left: mm.x, top: mm.y });
  stack.push({ input: L + 'antenna_L.png' }, { input: L + 'antenna_R.png' });
  return sharp({ create: { width: 1080, height: 1269, channels: 3, background: bg } }).composite(stack).png().toBuffer();
}
(async () => {
  const cw = 360, ch = 423, comps = [], fw = 540, fh = 270, fcomps = [];
  for (let i = 0; i < EXPR.length; i++) {
    const [name, eyes, mouth] = EXPR[i];
    const full = await build({ r: 60, g: 200, b: 170 }, eyes, mouth);
    const label = Buffer.from(`<svg width="${cw}" height="30" xmlns="http://www.w3.org/2000/svg"><rect width="190" height="28" fill="#000"/><text x="6" y="21" font-size="19" fill="#fff" font-family="Arial">${name}</text></svg>`);
    comps.push({ input: await sharp(full).resize(cw, ch).png().toBuffer(), left: (i % 3) * cw, top: Math.floor(i / 3) * ch }, { input: label, left: (i % 3) * cw, top: Math.floor(i / 3) * ch });
    fcomps.push({ input: await sharp(full).extract({ left: 180, top: 440, width: 540, height: 270 }).resize(fw, fh).png().toBuffer(), left: (i % 2) * fw, top: Math.floor(i / 2) * fh }, { input: label, left: (i % 2) * fw, top: Math.floor(i / 2) * fh });
  }
  await sharp({ create: { width: cw * 3, height: ch * 2, channels: 3, background: '#999' } }).composite(comps).png().toFile(SP + 'faces34_full.png');
  await sharp({ create: { width: fw * 2, height: fh * 3, channels: 3, background: '#999' } }).composite(fcomps).png().toFile(SP + 'faces34_zoom.png');
  fs.copyFileSync(SP + 'faces34_full.png', L + 'face/preview_all.png'); fs.copyFileSync(SP + 'faces34_zoom.png', L + 'face/preview_zoom.png');
  console.log('ok');
})();
