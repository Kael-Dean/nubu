// Re-shape armR to the exact mirror of armL's silhouette, keeping armR's own tattoo art: for every pixel of the
// target (mirrored armL) find its bone-space position (segment, t, relative position between the two edges) and
// sample armR at the same relative position. usage: node warp-arm-to-mirror.js <cutDir>
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'D:/NUBU/node_modules/playwright');
const fs = require('fs'), path = require('path');
const dir = process.argv[2]; const rig = JSON.parse(fs.readFileSync(path.join(dir, 'rig.json'))); const P = rig.pieces, J = rig.joints; const MX = 1400;
const mir = p => [2 * MX - p[0], p[1]];
const TJ = { shoulder: mir(J.shoulderL), elbow: mir(J.elbowL), wrist: mir(J.wristL) };  // target joints (mirror of left)
const SJ = { shoulder: J.shoulderR, elbow: J.elbowR, wrist: J.wristR };                  // source joints (current right)
(async () => {
  const br = await chromium.launch(); const pg = await br.newPage();
  const res = await pg.evaluate(async ({ aR, aL, PR, PL, TJ, SJ, MX }) => {
    const W = 2759, H = 4096;
    const ld = async d => { const i = new Image(); i.src = 'data:image/png;base64,' + d; await i.decode(); return i; };
    const S = (() => 0)(); const sc = new OffscreenCanvas(W, H); sc.getContext('2d').drawImage(await ld(aR), PR.x, PR.y); const SD = sc.getContext('2d').getImageData(0, 0, W, H).data;
    const tc = new OffscreenCanvas(W, H), tx = tc.getContext('2d'); tx.translate(2 * MX, 0); tx.scale(-1, 1); tx.drawImage(await ld(aL), PL.x, PL.y); const TD = tx.getImageData(0, 0, W, H).data;
    const seg = (a, b) => { const d = [b[0] - a[0], b[1] - a[1]], L = Math.hypot(...d), u = [d[0] / L, d[1] / L]; return { a, L, u, n: [-u[1], u[0]] }; };
    const sU = seg(SJ.shoulder, SJ.elbow), sF = seg(SJ.elbow, SJ.wrist), tU = seg(TJ.shoulder, TJ.elbow), tF = seg(TJ.elbow, TJ.wrist);
    // edge profile: for t in [-0.4, 1.4], signed normal distance of the two silhouette edges
    const prof = (D, s) => { const N = 360, out = []; for (let k = 0; k <= N; k++) { const t = -0.4 + 1.8 * k / N; const c = [s.a[0] + s.u[0] * s.L * t, s.a[1] + s.u[1] * s.L * t];
        let lo = null, hi = null; for (let r = -420; r <= 420; r++) { const x = Math.round(c[0] + s.n[0] * r), y = Math.round(c[1] + s.n[1] * r); if (x < 0 || y < 0 || x >= W || y >= H) continue; if (D[(y * W + x) * 4 + 3] > 100) { if (lo === null) lo = r; hi = r; } }
        out.push(lo === null ? null : [lo, hi]); } return out; };
    const pSU = prof(SD, sU), pSF = prof(SD, sF), pTU = prof(TD, tU), pTF = prof(TD, tF);
    const at = (p, t) => { const k = Math.round((t + 0.4) / 1.8 * 360); if (k < 0 || k > 360) return null; for (let d = 0; d < 20; d++) { if (p[k - d]) return p[k - d]; if (p[k + d]) return p[k + d]; } return null; };
    const bis = (() => { const v = [tU.u[0] + tF.u[0], tU.u[1] + tF.u[1]], L = Math.hypot(...v); return [v[0] / L, v[1] / L]; })();
    const out = new ImageData(new Uint8ClampedArray(TD), W, H); const od = out.data; let filled = 0, fallback = 0;
    const samp = (x, y) => { const xi = Math.round(x), yi = Math.round(y); if (xi < 0 || yi < 0 || xi >= W || yi >= H) return null; const i = (yi * W + xi) * 4; return SD[i + 3] > 100 ? [SD[i], SD[i + 1], SD[i + 2]] : null; };
    const mapOne = (P, ts, ss, pt, ps) => { const v = [P[0] - ts.a[0], P[1] - ts.a[1]]; const t = (v[0] * ts.u[0] + v[1] * ts.u[1]) / ts.L, d = v[0] * ts.n[0] + v[1] * ts.n[1];
      const et = at(pt, t), es = at(ps, t); if (!et || !es || et[1] === et[0]) return null; const f = (d - et[0]) / (et[1] - et[0]); const ds = es[0] + f * (es[1] - es[0]);
      return [ss.a[0] + ss.u[0] * ss.L * t + ss.n[0] * ds, ss.a[1] + ss.u[1] * ss.L * t + ss.n[1] * ds]; };
    for (let y = 600; y < 2300; y++) for (let x = 300; x < 1300; x++) { const i = (y * W + x) * 4; if (od[i + 3] < 8) continue;
      const P2 = [x, y]; const side = (P2[0] - TJ.elbow[0]) * bis[0] + (P2[1] - TJ.elbow[1]) * bis[1]; const w = Math.max(0, Math.min(1, (side + 25) / 50));
      const a = mapOne(P2, tU, sU, pTU, pSU), b2 = mapOne(P2, tF, sF, pTF, pSF);
      let q = null; if (a && b2) q = [a[0] * (1 - w) + b2[0] * w, a[1] * (1 - w) + b2[1] * w]; else q = a || b2;
      const c = q && samp(q[0], q[1]); if (c) { od[i] = c[0]; od[i + 1] = c[1]; od[i + 2] = c[2]; filled++; } else fallback++; }
    // crop
    let x0 = W, y0 = H, x1 = -1, y1 = -1; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (od[(y * W + x) * 4 + 3] > 8) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    const fc = new OffscreenCanvas(W, H); fc.getContext('2d').putImageData(out, 0, 0); const o = new OffscreenCanvas(x1 - x0 + 1, y1 - y0 + 1); o.getContext('2d').drawImage(fc, -x0, -y0);
    const bl = await o.convertToBlob({ type: 'image/png' }); const u = new Uint8Array(await bl.arrayBuffer()); let st = ''; for (let q = 0; q < u.length; q += 8192) st += String.fromCharCode.apply(null, u.subarray(q, q + 8192));
    return { png: btoa(st), x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1, filled, fallback };
  }, { aR: fs.readFileSync(path.join(dir, P.armR.file)).toString('base64'), aL: fs.readFileSync(path.join(dir, P.armL.file)).toString('base64'), PR: P.armR, PL: P.armL, TJ, SJ, MX });
  const bk = path.join(dir, '_before_armwidth'); fs.mkdirSync(bk, { recursive: true }); fs.copyFileSync(path.join(dir, 'armR.png'), path.join(bk, 'armR.png'));
  fs.writeFileSync(path.join(dir, 'armR.png'), Buffer.from(res.png, 'base64'));
  rig.pieces.armR = { file: 'armR.png', x: res.x, y: res.y, w: res.w, h: res.h, note: 'silhouette = mirror of armL, tattoo from the previous armR' };
  rig.jointsBeforeArmWidth = { shoulderR: J.shoulderR, elbowR: J.elbowR, wristR: J.wristR };
  rig.joints.shoulderR = TJ.shoulder; rig.joints.elbowR = TJ.elbow; rig.joints.wristR = TJ.wrist;
  fs.writeFileSync(path.join(dir, 'rig.json'), JSON.stringify(rig, null, 1));
  console.log('armR', res.x, res.y, res.w + 'x' + res.h, 'filled', res.filled, 'fallback', res.fallback, 'new joints', JSON.stringify(TJ));
  await br.close();
})();
