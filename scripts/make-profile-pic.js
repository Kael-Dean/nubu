// Profile picture variants: Nubu bust (happy) on a solid brand background, circle-safe.
const sharp = require('C:/Users/User/AppData/Local/Temp/claude/b07903fc8a0237cd/4148788e-ce7b-417a-809b-8d03b54de117/scratchpad/tools/node_modules/sharp');
const D = __dirname, OUT = 'D:/NUBU/brand/profile';
require('fs').mkdirSync(OUT, { recursive: true });
const SRC = process.argv[2] || D + '/e1/frames/f00023.png';
const S = 1080;
const variants = {
  A_lavender: { bg: '#CDBBF2', glow: '#F1EAFF', glowA: 0.85 },
  B_plum:     { bg: '#2B1745', glow: '#8E6BD6', glowA: 0.55 },
  C_butter:   { bg: '#F4E36A', glow: '#FFF7C2', glowA: 0.8 },
};
(async () => {
  // crop the source (1600x1611) to a square that keeps antennae inside the circle, cut at the belly
  const side = 1520, cx = 800, cy = 740;
  const left = cx - side / 2, top = cy - side / 2;               // top may be negative -> extend
  const src = await sharp(SRC).extend({ top: 200, bottom: 0, left: 0, right: 0, background: { r: 0, g: 0, b: 0, alpha: 0 } }).toBuffer();
  const nubu = await sharp(src).extract({ left, top: top + 200, width: side, height: side }).resize(S, S).png().toBuffer();
  for (const [name, v] of Object.entries(variants)) {
    const glow = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}">
      <defs><radialGradient id="g" cx="50%" cy="44%" r="46%"><stop offset="0" stop-color="${v.glow}" stop-opacity="${v.glowA}"/><stop offset="1" stop-color="${v.glow}" stop-opacity="0"/></radialGradient></defs>
      <rect width="100%" height="100%" fill="${v.bg}"/><rect width="100%" height="100%" fill="url(#g)"/></svg>`);
    // soft contact shadow under the body bottom edge is off-frame (bust crop), so just a faint drop shadow
    const shadow = await sharp(nubu).extractChannel(3).blur(18).toColourspace('b-w').toBuffer();
    const sh = await sharp({ create: { width: S, height: S, channels: 4, background: { r: 30, g: 10, b: 50, alpha: 0 } } })
      .joinChannel(await sharp(shadow).linear(0.22, 0).toBuffer()).png().toBuffer().catch(() => null);
    const layers = [];
    if (sh) layers.push({ input: sh, top: 14, left: 0 });
    layers.push({ input: nubu, top: 0, left: 0 });
    const file = `${OUT}/nubu_pfp_${name}.png`;
    await sharp(glow).composite(layers).png().toFile(file);
    // circle preview at real UI sizes on light + dark
    const circ = r => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${r}" height="${r}"><circle cx="${r / 2}" cy="${r / 2}" r="${r / 2}" fill="#fff"/></svg>`);
    const tiles = [];
    for (const r of [320, 150, 56]) {
      const img = await sharp(file).resize(r, r).composite([{ input: circ(r), blend: 'dest-in' }]).png().toBuffer();
      tiles.push({ r, img });
    }
    const W = 700, H = 360;
    for (const [mode, col] of [['light', '#ffffff'], ['dark', '#111111']]) {
      let x = 20; const comp = [];
      for (const t of tiles) { comp.push({ input: t.img, left: x, top: Math.round((H - t.r) / 2) }); x += t.r + 30; }
      await sharp({ create: { width: W, height: H, channels: 4, background: col } }).composite(comp).png().toFile(`${D}/prev_${name}_${mode}.png`);
    }
  }
  console.log('ok');
})().catch(e => { console.error(e); process.exit(1); });
