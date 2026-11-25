const sharp = require('sharp');
const fs = require('fs');
const L = 'D:/NUBU/character/layers/';
const SP = 'D:/NUBU/character/layers/face/';
const man = JSON.parse(fs.readFileSync(L + 'face/manifest.json', 'utf8'));
const EXPR = [
  ['neutral','open','neutral'],['happy','open','happy'],['swoon','swoon','swoon'],['shock','shock','shock'],['sad','sad','sad'],
  ['pout','pout','pout'],['sleepy','sleepy','sleepy'],['laugh','laugh','laugh'],['m_closed','open','m_closed'],['a_small','open','a_small'],
  ['a_wide','open','a_wide'],['o_round','open','o_round'],['u_pursed','open','u_pursed'],['e_smile','open','e_smile'],['tongue','open','tongue'],['f_teeth','open','f_teeth'],['tongue_up','open','tongue_up'],['s_teeth','open','s_teeth'],['a_mid','open','a_mid'],
];
async function build(bg, eyes, mouth) {
  const stack = ['body_base','arm_L','arm_R','headphones'].map(n => ({ input: L + 'front/' + n + '.png' }));
  for (const s of ['L','R']) { const k = `eye_${eyes}_${s}`, m = man.eyes[k]; stack.push({ input: L + 'face/eyes/' + k + '.png', left: m.x, top: m.y }); }
  const mk = `mouth_${mouth}`, mm = man.mouths[mk]; stack.push({ input: L + 'face/mouths/' + mk + '.png', left: mm.x, top: mm.y });
  stack.push({ input: L + 'front/antenna_L.png' }, { input: L + 'front/antenna_R.png' });
  return sharp({ create: { width: 1080, height: 1269, channels: 3, background: bg } }).composite(stack).png().toBuffer();
}
(async () => {
  const cw = 360, ch = 423, cols = 5, comps = [], fcomps = [];
  const fw = 480, fh = 200, fcols = 3;
  for (let i = 0; i < EXPR.length; i++) {
    const [name, eyes, mouth] = EXPR[i];
    const full = await build({ r: 60, g: 200, b: 170 }, eyes, mouth);
    const small = await sharp(full).resize(cw, ch).png().toBuffer();
    const label = Buffer.from(`<svg width="${cw}" height="30" xmlns="http://www.w3.org/2000/svg"><rect width="170" height="28" fill="#000"/><text x="6" y="21" font-size="20" fill="#fff" font-family="Arial">${name}</text></svg>`);
    comps.push({ input: small, left: (i % cols) * cw, top: Math.floor(i / cols) * ch }, { input: label, left: (i % cols) * cw, top: Math.floor(i / cols) * ch });
    const face = await sharp(full).extract({ left: 270, top: 470, width: 540, height: 225 }).resize(fw, fh).png().toBuffer();
    fcomps.push({ input: face, left: (i % fcols) * fw, top: Math.floor(i / fcols) * fh }, { input: label, left: (i % fcols) * fw, top: Math.floor(i / fcols) * fh });
  }
  await sharp({ create: { width: cw * cols, height: ch * 4, channels: 3, background: '#999' } }).composite(comps).png().toFile(SP + 'faces_full.png');
  await sharp({ create: { width: fw * fcols, height: fh * 7, channels: 3, background: '#999' } }).composite(fcomps).png().toFile(SP + 'faces_zoom.png');
  console.log('ok');
})();
