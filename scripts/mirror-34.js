const sharp = require('sharp');
const fs = require('fs');
const A = 'D:/NUBU/character/layers/angle34/', B = 'D:/NUBU/character/layers/angle34R/';
const SP = 'D:/NUBU/character/layers/angle34/';
(async () => {
  fs.mkdirSync(B + 'face/eyes', { recursive: true }); fs.mkdirSync(B + 'face/mouths', { recursive: true });
  // full-canvas layers: flop; antenna_L <-> antenna_R swap names (L/R = viewer's left/right)
  const map = { cup_far: 'cup_far', body_base: 'body_base', arm_far: 'arm_far', arm_near: 'arm_near', headphones: 'headphones', antenna_L: 'antenna_R', antenna_R: 'antenna_L' };
  for (const [src, dst] of Object.entries(map)) await sharp(A + src + '.png').flop().png().toFile(B + dst + '.png');
  const man = JSON.parse(fs.readFileSync(A + 'face/manifest.json', 'utf8')), out = { canvas: man.canvas, eyes: {}, mouths: {} };
  for (const grp of ['eyes', 'mouths']) for (const [name, m] of Object.entries(man[grp])) {
    await sharp(A + 'face/' + grp + '/' + name + '.png').flop().png().toFile(B + 'face/' + grp + '/' + name + '.png');
    out[grp][name] = { x: man.canvas.w - m.x - m.w, y: m.y, w: m.w, h: m.h };
  }
  fs.writeFileSync(B + 'face/manifest.json', JSON.stringify(out, null, 2));
  // preview: a_wide + open eyes, mirrored
  const stack = ['cup_far', 'body_base', 'arm_far', 'arm_near', 'headphones'].map(n => ({ input: B + n + '.png' }));
  for (const s of ['far', 'near']) { const k = 'eye_open_' + s; stack.push({ input: B + 'face/eyes/' + k + '.png', left: out.eyes[k].x, top: out.eyes[k].y }); }
  stack.push({ input: B + 'face/mouths/mouth_a_wide.png', left: out.mouths.mouth_a_wide.x, top: out.mouths.mouth_a_wide.y }, { input: B + 'antenna_L.png' }, { input: B + 'antenna_R.png' });
  await sharp({ create: { width: 1080, height: 1269, channels: 3, background: { r: 60, g: 200, b: 170 } } }).composite(stack).png().toFile(B + 'face/preview_right_a_wide.png');
  fs.copyFileSync(B + 'face/preview_right_a_wide.png', SP + 'right_preview.png');
  console.log('mirrored', Object.keys(map).length, 'layers +', Object.keys(out.eyes).length, 'eyes +', Object.keys(out.mouths).length, 'mouths');
})();
