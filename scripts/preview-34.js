// Compose the 3/4 outfit preview from layers. usage: node scripts/preview-34.js <band> <out.png> [x y w h scale]
const sharp = require('sharp');
const [band, out, X, Y, Wc, Hc, S] = process.argv.slice(2);
const R = 'D:/NUBU/character/layers/', A = R + `costume/${band}/angle34/`, L = R + 'angle34/';
(async () => {
  const M = require(L + 'face/manifest.json'); const f = (k, d) => ({ input: L + 'face/' + d + '/' + k + '.png', left: M[d][k].x, top: M[d][k].y });
  const s = [...(process.env.FULLHEAD ? [] : [L + 'cup_far.png', A + 'fit_cup_far.png']), A + 'body_outfit.png', ...(process.env.FULLHEAD ? [] : [A + 'cup_far_edge.png']), A + 'fit_scarf_wrap.png', L + 'arm_far.png', L + 'arm_near.png', f('eye_open_far', 'eyes'), f('eye_open_near', 'eyes'), f('mouth_a_wide', 'mouths'), L + 'glow_antenna_L.png', L + 'glow_antenna_R.png', L + 'antenna_L.png', L + 'antenna_R.png', A + 'band_over.png'];
  const b = await sharp({ create: { width: 1080, height: 1269, channels: 4, background: '#ece6f5' } }).composite(s.map(x => typeof x === 'string' ? { input: x } : x)).png().toBuffer();
  let img = sharp(b); if (X !== undefined) { const c = await sharp(b).extract({ left: +X, top: +Y, width: +Wc, height: +Hc }).png().toBuffer(); img = sharp(c).resize(Math.round(+Wc * (+S || 1))); }
  await img.png().toFile(out);
})();
