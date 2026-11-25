const sharp = require('sharp');
const SP = 'D:/NUBU/character/layers/angle34/';
const L = 'D:/NUBU/character/layers/angle34/';
const CANVAS_OFF = [57, 19];
async function toCanvas(file, off) {
  const full = await sharp({ create: { width: 1199, height: 1312, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: file, left: off[0], top: off[1] }]).png().toBuffer();
  return sharp(full).extract({ left: CANVAS_OFF[0], top: CANVAS_OFF[1], width: 1080, height: 1269 }).png().toBuffer();
}
(async () => {
  const ref = await toCanvas(L + 'ref_cutout.png', [83, 0]);
  const bare = await toCanvas(L + 'bare_cutout.png', [154, 257]);
  require('fs').writeFileSync(L + 'ref_canvas.png', ref);
  require('fs').writeFileSync(L + 'bare_canvas.png', bare);
  // grid overlay
  let svg = '<svg width="1080" height="1269" xmlns="http://www.w3.org/2000/svg">';
  for (let x = 0; x <= 1080; x += 100) svg += `<line x1="${x}" y1="0" x2="${x}" y2="1269" stroke="#ff2d55" stroke-width="1" opacity="0.7"/><text x="${x + 3}" y="14" font-size="14" fill="#c00" font-family="Arial">${x}</text>`;
  for (let y = 0; y <= 1269; y += 100) svg += `<line x1="0" y1="${y}" x2="1080" y2="${y}" stroke="#ff2d55" stroke-width="1" opacity="0.7"/><text x="3" y="${y - 3}" font-size="14" fill="#c00" font-family="Arial">${y}</text>`;
  svg += '</svg>';
  await sharp({ create: { width: 1080, height: 1269, channels: 3, background: { r: 60, g: 200, b: 170 } } }).composite([{ input: ref }, { input: Buffer.from(svg) }]).png().toFile(SP + 'ref34_grid.png');
  console.log('ok');
})();
