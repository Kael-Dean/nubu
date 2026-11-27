// From the master-cut head, make: head_blank (eyes + mouth + brows painted out with surrounding skin),
// the master's own neutral features as separate sprites, and brow patches that can move.
// usage: node blank-face.js <cutDir>
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'D:/NUBU/node_modules/playwright');
const fs = require('fs'), path = require('path');
const dir = process.argv[2];
const rig = JSON.parse(fs.readFileSync(path.join(dir, 'rig.json')));
const H0 = rig.pieces.head; // head offset in master coords
// regions in MASTER coords
const R = {
  eyeR: { e: [1334, 434, 44, 19] }, eyeL: { e: [1475, 426, 43, 18] }, mouth: { e: [1412, 567, 77, 30] },
  browR: { e: [1347, 389, 35, 13] },
};
(async () => {
  const br = await chromium.launch(); const pg = await br.newPage();
  const out = await pg.evaluate(async ({ b64, R, ox, oy }) => {
    const im = new Image(); im.src = 'data:image/png;base64,' + b64; await im.decode();
    const W = im.width, H = im.height; const c = new OffscreenCanvas(W, H), x = c.getContext('2d'); x.drawImage(im, 0, 0);
    const orig = x.getImageData(0, 0, W, H); const o = orig.data; const blank = new Uint8ClampedArray(o);
    const inside = (k, px, py) => { const g = R[k]; if (g.e) { const [cx, cy, rx, ry] = g.e; return ((px - cx) / rx) ** 2 + ((py - cy) / ry) ** 2 <= 1; } const [a, b, c2, d] = g.r; return px >= a && px <= c2 && py >= b && py <= d; };
    const mask = new Uint8Array(W * H), which = new Int8Array(W * H).fill(-1), keep = new Uint8Array(W * H); const keys = Object.keys(R);
    const lum = i => 0.299 * o[i * 4] + 0.587 * o[i * 4 + 1] + 0.114 * o[i * 4 + 2];
    for (let y = 0; y < H; y++) for (let xx = 0; xx < W; xx++) keys.forEach((k, ki) => { if (inside(k, xx + ox, y + oy)) { mask[y * W + xx] = 1; which[y * W + xx] = ki; } });
    // brows: inside each brow rect, dark components that touch the rect's top edge are hair strands → keep them;
    // other dark pixels (+2px) are the brow → paint; light skin in the rect is left as it is
    keys.forEach((k, ki) => { if (!R[k].r) return; const [a, b, c2, d] = R[k].r; const x0 = a - ox, y0 = b - oy, x1 = c2 - ox, y1 = d - oy;
      const dark = new Uint8Array(W * H); for (let y = y0; y <= y1; y++) for (let xx = x0; xx <= x1; xx++) { const i = y * W + xx; if (lum(i) < 110) dark[i] = 1; }
      const hair = new Uint8Array(W * H), st = []; for (let xx = x0; xx <= x1; xx++) { const i = y0 * W + xx; if (dark[i]) { hair[i] = 1; st.push(i); } }
      while (st.length) { const i = st.pop(); for (const j of [i - 1, i + 1, i - W, i + W]) if (dark[j] && !hair[j]) { hair[j] = 1; st.push(j); } }
      for (let y = y0; y <= y1; y++) for (let xx = x0; xx <= x1; xx++) { const i = y * W + xx; mask[i] = 0; which[i] = -1; if (hair[i]) keep[i] = 1; }
      for (let y = y0; y <= y1; y++) for (let xx = x0; xx <= x1; xx++) { const i = y * W + xx; if (!dark[i] || hair[i]) continue;
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const j = i + dy * W + dx; if (!hair[j]) { mask[j] = 1; which[j] = ki; } } } });
    // harmonic fill (Jacobi) from surrounding skin; kept hair pixels and other masked pixels are not used as sources
    const f = new Float32Array(W * H * 3); for (let i = 0; i < W * H; i++) for (let k = 0; k < 3; k++) f[i * 3 + k] = o[i * 4 + k];
    const idx = []; for (let i = 0; i < W * H; i++) if (mask[i]) idx.push(i);
    for (const i of idx) for (let k = 0; k < 3; k++) f[i * 3 + k] = 232;
    const src = i => !keep[i] && !(lum(i) < 90 && !mask[i]);
    for (let it = 0; it < 1200; it++) for (const i of idx) { let n = 0; const acc = [0, 0, 0]; for (const j of [i - 1, i + 1, i - W, i + W]) { if (!src(j)) continue; n++; for (let k = 0; k < 3; k++) acc[k] += f[j * 3 + k]; } if (n) for (let k = 0; k < 3; k++) f[i * 3 + k] = acc[k] / n; }
    for (const i of idx) { for (let k = 0; k < 3; k++) blank[i * 4 + k] = f[i * 3 + k]; blank[i * 4 + 3] = 255; }
    const toPng = async (data, w, h) => { const cc = new OffscreenCanvas(w, h); cc.getContext('2d').putImageData(new ImageData(data, w, h), 0, 0); const bl = await cc.convertToBlob({ type: 'image/png' }); const u = new Uint8Array(await bl.arrayBuffer()); let s = ''; for (let q = 0; q < u.length; q += 8192) s += String.fromCharCode.apply(null, u.subarray(q, q + 8192)); return btoa(s); };
    const res = { head_blank: { x: 0, y: 0, w: W, h: H, png: await toPng(blank, W, H) } };
    // sprites: eyes/mouth = pixels that differ from the painted skin (alpha from the difference); brows = full rect patch
    keys.forEach((k, ki) => res[k] = null);
    for (const [ki, k] of keys.entries()) {
      let x0 = W, y0 = H, x1 = -1, y1 = -1; for (let y = 0; y < H; y++) for (let xx = 0; xx < W; xx++) if (which[y * W + xx] === ki) { if (xx < x0) x0 = xx; if (xx > x1) x1 = xx; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      if (x1 < 0) continue; const w = x1 - x0 + 1, h = y1 - y0 + 1; const d = new Uint8ClampedArray(w * h * 4);
      for (let y = 0; y < h; y++) for (let xx = 0; xx < w; xx++) { const i = (y + y0) * W + xx + x0, q = (y * w + xx) * 4; if (which[i] !== ki) continue;
        for (let t = 0; t < 3; t++) d[q + t] = o[i * 4 + t];
        
        const diff = Math.abs(o[i * 4] - blank[i * 4]) + Math.abs(o[i * 4 + 1] - blank[i * 4 + 1]) + Math.abs(o[i * 4 + 2] - blank[i * 4 + 2]);
        d[q + 3] = Math.max(0, Math.min(255, (diff - 18) * 6)); }
      res[k] = { x: x0, y: y0, w, h, png: await toPng(d, w, h) };
    }
    return res;
  }, { b64: fs.readFileSync(path.join(dir, 'head.png')).toString('base64'), R, ox: H0.x, oy: H0.y });
  const faceDir = path.join(dir, 'face'); fs.mkdirSync(faceDir, { recursive: true });
  const meta = {};
  for (const [k, v] of Object.entries(out)) { if (!v) { console.log(k, 'EMPTY (kept on head_blank)'); continue; } const file = k === 'head_blank' ? 'head_blank.png' : `face/${k}_neutral.png`; fs.writeFileSync(path.join(dir, file), Buffer.from(v.png, 'base64'));
    meta[k] = { file, x: H0.x + v.x, y: H0.y + v.y, w: v.w, h: v.h }; console.log(k, meta[k].x, meta[k].y, v.w + 'x' + v.h); }
  rig.face = meta; fs.writeFileSync(path.join(dir, 'rig.json'), JSON.stringify(rig, null, 1));
  await br.close();
})();
