// Cut rig pieces straight from the approved master image so every piece keeps the original shape,
// proportion and tattoo. Pieces overlap at joints; a composite in draw order reproduces the master exactly.
// usage: node cut-master.js <master_nobg.webp> <outDir>
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'D:/NUBU/node_modules/playwright');
const fs = require('fs'), path = require('path');

// ---- joint map in master pixel coords (2759 x 4096). R/L = character side (R is on the viewer's left)
const J = {
  headPivot: [1400, 640], neckBase: [1400, 760],
  shoulderR: [995, 950], elbowR: [870, 1440], wristR: [726, 1890],
  shoulderL: [1805, 950], elbowL: [1945, 1440], wristL: [2082, 1893],
  hipR: [1235, 1950], kneeR: [1155, 2950], ankleR: [1070, 3540],
  hipL: [1590, 1950], kneeL: [1672, 2950], ankleL: [1715, 3540],
  pelvis: [1400, 1880], chest: [1400, 1150], spine: [1400, 1600],
};
const CROTCH_X = 1414;
const jaw = [[1262, 560], [1290, 610], [1340, 638], [1400, 648], [1460, 638], [1515, 610], [1545, 555]];
const bR = [[1135, 770], [1080, 950], [1063, 1140], [1058, 1400], [1050, 1700], [1050, 2420]];   // arm R | torso
const bL = [[1665, 770], [1720, 950], [1737, 1140], [1745, 1400], [1755, 1700], [1760, 2420]];   // torso | arm L

(async () => {
  const [inp, out] = process.argv.slice(2); fs.mkdirSync(out, { recursive: true });
  const br = await chromium.launch(); const pg = await br.newPage();
  const res = await pg.evaluate(async ({ b64, J, jaw, bR, bL, CROTCH_X }) => {
    const img = new Image(); img.src = 'data:image/webp;base64,' + b64; await img.decode();
    const W = img.width, H = img.height;
    const cv = new OffscreenCanvas(W, H), cx = cv.getContext('2d'); cx.drawImage(img, 0, 0);
    const src = cx.getImageData(0, 0, W, H).data;
    const interp = (pts, v, axis) => { // piecewise-linear: pts sorted by the other axis
      const a = axis === 'x' ? 0 : 1, b = 1 - a;
      if (v <= pts[0][a]) return pts[0][b]; if (v >= pts[pts.length - 1][a]) return pts[pts.length - 1][b];
      for (let i = 1; i < pts.length; i++) if (v <= pts[i][a]) { const [p, q] = [pts[i - 1], pts[i]]; const t = (v - p[a]) / ((q[a] - p[a]) || 1); return p[b] + t * (q[b] - p[b]); }
    };
    const jawY = x => (x < jaw[0][0] || x > jaw[jaw.length - 1][0]) ? 560 : interp(jaw, x, 'x');
    const armRx = y => interp(bR, y, 'y'), armLx = y => interp(bL, y, 'y');
    const lum = p => 0.299 * src[p] + 0.587 * src[p + 1] + 0.114 * src[p + 2];
    const along = (x, y, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy); return ((x - b[0]) * dx + (y - b[1]) * dy) / L; }; // >0 = past b
    const names = ['head', 'torso', 'armR', 'armL', 'handR', 'handL', 'pelvis', 'legR', 'legL', 'shoeR', 'shoeL'];
    const masks = {}; for (const n of names) masks[n] = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x, p = i * 4; if (src[p + 3] < 8) continue;
      const L = lum(p);
      // head: above jaw, or dark hair strands down to y 700 near the head
      if (y < jawY(x) || (y < 705 && L < 95 && x > 1150 && x < 1650)) { masks.head[i] = 1; continue; }
      // arm | torso seam: pixels within SEAM px of the cut line go to BOTH pieces, so downscaled edges never open a line
      const SEAM = 12;
      const dR = armRx(y) - x, dL = x - armLx(y); let onArm = false;
      if (y < 2420 && dR > -SEAM && (y < 1700 || x < 920)) { // right arm side (keep pants out)
        const h = along(x, y, J.elbowR, J.wristR);
        if (h > -35 && dR > 0) masks.handR[i] = 1; if ((h < -10 || Math.hypot(x - J.wristR[0], y - J.wristR[1]) < 52) && (dR > 0 || L > 110)) masks.armR[i] = 1; onArm = dR > SEAM || (dR > 0 && h > -35); }
      if (y < 2420 && dL > -SEAM && (y < 1700 || x > 1900)) {
        const h = along(x, y, J.elbowL, J.wristL);
        if (h > -35 && dL > 0) masks.handL[i] = 1; if ((h < -10 || Math.hypot(x - J.wristL[0], y - J.wristL[1]) < 52) && (dL > 0 || L > 110)) masks.armL[i] = 1; onArm = onArm || dL > SEAM || (dL > 0 && h > -35); }
      if (onArm) continue;
      if (y < 1830) masks.torso[i] = 1;
      if (y >= 1700 && y < 2085) masks.pelvis[i] = 1;
      if (y >= 1950) {
        const right = x < CROTCH_X;
        if (y > 3490 && L > 135) { masks[right ? 'shoeR' : 'shoeL'][i] = 1; if (y > 3600) continue; }
        if (!(y > 3490 && L > 135)) masks[right ? 'legR' : 'legL'][i] = 1;
      }
    }
    // neck extension: smear the neck skin upward behind the head so a head tilt never opens a gap
    const neckFill = []; // [x,y,color]
    for (let x = 1293; x <= 1520; x++) { const sy = Math.max(Math.round(jawY(x)) + 14, 600); const sp = (sy * W + x) * 4;
      for (let y = 540; y < Math.round(jawY(x)) + 2; y++) neckFill.push([x, y, sp]); }
    const outs = {};
    for (const n of names) {
      const m = masks[n]; let x0 = W, y0 = H, x1 = -1, y1 = -1;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (m[y * W + x]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      if (n === 'torso') { y0 = Math.min(y0, 540); }
      const w = x1 - x0 + 1, h = y1 - y0 + 1; const oc = new OffscreenCanvas(w, h), ox = oc.getContext('2d'); const id = ox.createImageData(w, h);
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const i = y * W + x; if (!m[i]) continue; const o = ((y - y0) * w + (x - x0)) * 4; for (let k = 0; k < 4; k++) id.data[o + k] = src[i * 4 + k]; }
      if (n === 'torso') for (const [x, y, sp] of neckFill) { const o = ((y - y0) * w + (x - x0)) * 4; if (id.data[o + 3]) continue; for (let k = 0; k < 3; k++) id.data[o + k] = src[sp + k]; id.data[o + 3] = 255; }
      ox.putImageData(id, 0, 0);
      const bl = await oc.convertToBlob({ type: 'image/png' }); const u = new Uint8Array(await bl.arrayBuffer()); let s = ''; for (let k = 0; k < u.length; k += 8192) s += String.fromCharCode.apply(null, u.subarray(k, k + 8192));
      outs[n] = { x: x0, y: y0, w, h, png: btoa(s) };
    }
    return { W, H, outs };
  }, { b64: fs.readFileSync(inp).toString('base64'), J, jaw, bR, bL, CROTCH_X });
  // draw order back → front
  const order = ['legR', 'legL', 'shoeR', 'shoeL', 'pelvis', 'armL', 'handL', 'torso', 'head', 'armR', 'handR'];
  const meta = { source: path.basename(inp), canvas: [res.W, res.H], joints: J, drawOrder: order, pieces: {} };
  for (const n of Object.keys(res.outs)) { const o = res.outs[n]; fs.writeFileSync(path.join(out, n + '.png'), Buffer.from(o.png, 'base64')); meta.pieces[n] = { file: n + '.png', x: o.x, y: o.y, w: o.w, h: o.h }; console.log(n, o.x, o.y, o.w + 'x' + o.h); }
  fs.writeFileSync(path.join(out, 'rig.json'), JSON.stringify(meta, null, 1));
  await br.close();
})();
