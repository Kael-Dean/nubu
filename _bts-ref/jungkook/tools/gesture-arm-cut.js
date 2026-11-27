// Cut whole-arm gesture pieces (upper arm + elbow + forearm + hand, tattoo painted on the pose) from a regenerated
// full-body gesture image and place them in master coordinates.
// 1) scale the gesture image to master size, 2) register it to the rig body (tank + pants, which the edit kept),
// 3) arm pixels = gesture pixels that are not background and either lie outside the arm-less rig body or differ from it
//    (a forearm across the tank), 4) keep the connected part that touches the chosen shoulder, 5) feather the armhole edge.
// usage: node gesture-arm-cut.js <gestureImg> <cutDir> <outName> <side R|L|RL>
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'D:/NUBU/node_modules/playwright');
const fs = require('fs'), path = require('path');
const [img, dir, outName, sides, baseImg] = process.argv.slice(2);
const rig = JSON.parse(fs.readFileSync(path.join(dir, 'rig.json')));
const ARMISH = new Set(['armR', 'armL', 'handR', 'handL', 'capR', 'capL', 'latR', 'latL']);
const body = rig.drawOrder.filter(n => !ARMISH.has(n)).map(n => ({ ...rig.pieces[n], b64: fs.readFileSync(path.join(dir, rig.pieces[n].file)).toString('base64') }));
(async () => {
  const br = await chromium.launch(); const pg = await br.newPage();
  const res = await pg.evaluate(async ({ nb, gb, body, W, H, J, sides }) => {
    const ld = async (d, t) => { const i = new Image(); i.src = `data:image/${t};base64,` + d; await i.decode(); return i; };
    // arm-less rig body
    const bc = new OffscreenCanvas(W, H), bx = bc.getContext('2d'); for (const p of body) bx.drawImage(await ld(p.b64, 'png'), p.x, p.y);
    const B = bx.getImageData(0, 0, W, H).data;
    // gesture image → transparent background by flood fill from the border (keeps white shoes/teeth/eyes)
    const G0 = await ld(gb, 'png'); const gw = G0.width, gh = G0.height;
    const gc = new OffscreenCanvas(gw, gh), gx = gc.getContext('2d'); gx.drawImage(G0, 0, 0); const gid = gx.getImageData(0, 0, gw, gh), g = gid.data;
    const white = k => g[k] > 232 && g[k + 1] > 232 && g[k + 2] > 232; const seen = new Uint8Array(gw * gh); const st = [];
    for (let x = 0; x < gw; x++) { st.push(x, (gh - 1) * gw + x); } for (let y = 0; y < gh; y++) { st.push(y * gw, y * gw + gw - 1); }
    while (st.length) { const q = st.pop(); if (seen[q]) continue; seen[q] = 1; if (!white(q * 4)) continue; g[q * 4 + 3] = 0; const x = q % gw, y = (q / gw) | 0;
      if (x > 0) st.push(q - 1); if (x < gw - 1) st.push(q + 1); if (y > 0) st.push(q - gw); if (y < gh - 1) st.push(q + gw); }
    gx.putImageData(gid, 0, 0);
    // registration on the tank + pants (x 1080-1720, y 760-2300), downsampled
    const R = [1080, 760, 1720, 2300], D = 4, sw = Math.ceil((R[2] - R[0]) / D), sh = Math.ceil((R[3] - R[1]) / D);
    const grab = (src, s, ox, oy) => { const c = new OffscreenCanvas(sw, sh), x = c.getContext('2d'); x.setTransform(s / D, 0, 0, s / D, (ox - R[0]) / D, (oy - R[1]) / D); x.drawImage(src, 0, 0); return x.getImageData(0, 0, sw, sh).data; };
    const MB = grab(bc, 1, 0, 0);
    const score = d => { let e = 0, n = 0; for (let i = 0; i < d.length; i += 4) { const a = MB[i + 3] > 128, b = d[i + 3] > 128; if (!a && !b) continue; n++; if (a !== b) { e += 250; continue; } e += Math.abs(MB[i] - d[i]) + Math.abs(MB[i + 1] - d[i + 1]) + Math.abs(MB[i + 2] - d[i + 2]); } return e / Math.max(1, n); };
    const s0 = W / gw; let best = { e: 1e9 };
    for (let s = s0 * 0.94; s <= s0 * 1.06; s += s0 * 0.01) for (let ox = -100; ox <= 100; ox += 8) for (let oy = -100; oy <= 100; oy += 8) { const e = score(grab(gc, s, ox, oy)); if (e < best.e) best = { e, s, ox, oy }; }
    const b0 = best; for (let s = b0.s * 0.992; s <= b0.s * 1.008; s += b0.s * 0.002) for (let ox = b0.ox - 8; ox <= b0.ox + 8; ox += 2) for (let oy = b0.oy - 8; oy <= b0.oy + 8; oy += 2) { const e = score(grab(gc, s, ox, oy)); if (e < best.e) best = { e, s, ox, oy }; }
    // aligned gesture at full res
    const ac = new OffscreenCanvas(W, H), ax = ac.getContext('2d'); ax.setTransform(best.s, 0, 0, best.s, best.ox, best.oy); ax.drawImage(gc, 0, 0); const A = ax.getImageData(0, 0, W, H).data;
    let N = null; if (nb) { const n0 = await ld(nb, 'png'); const nc = new OffscreenCanvas(W, H), nx = nc.getContext('2d'); nx.setTransform(best.s * gw / n0.width, 0, 0, best.s * gw / n0.width, best.ox, best.oy); nx.drawImage(n0, 0, 0); N = nx.getImageData(0, 0, W, H).data; }
    // candidate arm mask
    const lum = (d, k) => 0.299 * d[k] + 0.587 * d[k + 1] + 0.114 * d[k + 2];
    const cand = new Uint8Array(W * H);
    for (let q = 0; q < W * H; q++) { const k = q * 4; if (A[k + 3] < 100) continue;
      const tankish = lum(A, k) < 62 && (Math.max(A[k], A[k + 1], A[k + 2]) - Math.min(A[k], A[k + 1], A[k + 2])) < 16; // black fabric
      const nearWhite = A[k] > 228 && A[k + 1] > 228 && A[k + 2] > 228;
      if (B[k + 3] < 100) { if (!tankish && !nearWhite) cand[q] = 1; continue; }
      if (N) { const dn = Math.abs(A[k] - N[k]) + Math.abs(A[k + 1] - N[k + 1]) + Math.abs(A[k + 2] - N[k + 2]); if (dn > 70) cand[q] = 1; continue; }
      const diff = Math.abs(A[k] - B[k]) + Math.abs(A[k + 1] - B[k + 1]) + Math.abs(A[k + 2] - B[k + 2]);
      if (diff > 120 && !tankish) cand[q] = 1; }
    // close small holes in the candidate (tattoo ink can be dark): dilate then erode by 3
    const morph = (m, r, val) => { const o = new Uint8Array(m); for (let y = r; y < H - r; y++) for (let x = r; x < W - r; x++) { const q = y * W + x; if (m[q] === val) continue; let hit = false;
        for (let dy = -r; dy <= r && !hit; dy += r) for (let dx = -r; dx <= r; dx += r) if (m[q + dy * W + dx] === val) { hit = true; break; } if (hit) o[q] = val; } return o; };
    let m2 = morph(cand, 3, 1); m2 = morph(m2, 3, 0); m2 = morph(m2, 5, 0); m2 = morph(m2, 5, 1); // close, then open (drops 1-px outline rings)
    const out = {};
    for (const side of sides.split('')) {
      const sj = side === 'R' ? J.shoulderR : J.shoulderL;
      // seed: candidate pixels near the shoulder joint on that side
      const lab = new Uint8Array(W * H); const st2 = []; for (let y = sj[1] - 120; y < sj[1] + 200; y++) for (let x = sj[0] - 160; x < sj[0] + 160; x++) { const q = y * W + x; if (m2[q] && ((side === 'R') ? x < 1400 : x > 1400)) st2.push(q); }
      const xOK = x => side === 'R' ? x < 1450 : x > 1350;
      while (st2.length) { const q = st2.pop(); if (lab[q] || !m2[q]) continue; { const xx = q % W, yy = (q / W) | 0; if (!xOK(xx) || yy > 2650) continue; } lab[q] = 1; const x = q % W; if (x > 0) st2.push(q - 1); if (x < W - 1) st2.push(q + 1); if (q >= W) st2.push(q - W); if (q < W * (H - 1)) st2.push(q + W); }
      { // fill enclosed holes: flood the outside within the component bbox; anything not reached and not labeled is a hole
        let bx0 = W, by0 = H, bx1 = 0, by1 = 0; for (let q = 0; q < W * H; q++) if (lab[q]) { const x = q % W, y = (q / W) | 0; if (x < bx0) bx0 = x; if (x > bx1) bx1 = x; if (y < by0) by0 = y; if (y > by1) by1 = y; }
        bx0 = Math.max(0, bx0 - 1); by0 = Math.max(0, by0 - 1); bx1 = Math.min(W - 1, bx1 + 1); by1 = Math.min(H - 1, by1 + 1);
        const outside = new Uint8Array(W * H); const fs3 = []; for (let x = bx0; x <= bx1; x++) fs3.push(by0 * W + x, by1 * W + x); for (let y = by0; y <= by1; y++) fs3.push(y * W + bx0, y * W + bx1);
        while (fs3.length) { const q = fs3.pop(); if (outside[q] || lab[q]) continue; const x = q % W, y = (q / W) | 0; if (x < bx0 || x > bx1 || y < by0 || y > by1) continue; outside[q] = 1; fs3.push(q - 1, q + 1, q - W, q + W); }
        for (let y = by0; y <= by1; y++) for (let x = bx0; x <= bx1; x++) { const q = y * W + x; if (!lab[q] && !outside[q] && A[q * 4 + 3] > 100) lab[q] = 1; } }
      // keep only that component, but cut anything across the body midline (other arm / face) unless it's a hand near the face
      const o = new ImageData(W, H), d = o.data; let x0 = W, y0 = H, x1 = -1, y1 = -1;
      for (let q = 0; q < W * H; q++) { if (!lab[q]) continue; const k = q * 4; d[k] = A[k]; d[k + 1] = A[k + 1]; d[k + 2] = A[k + 2]; d[k + 3] = A[k + 3];
        const x = q % W, y = (q / W) | 0; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      // armhole: fade the edge that lies INSIDE the rig body over 26 px so it blends into the torso skin
      const inBody = q => B[q * 4 + 3] > 100;
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const q = y * W + x; if (!lab[q] || !inBody(q)) continue;
        let near = 99; for (let r = 2; r <= 26 && near === 99; r += 2) { for (const [dx, dy] of [[r, 0], [-r, 0], [0, r], [0, -r]]) { const qq = (y + dy) * W + x + dx; if (!lab[qq] && inBody(qq)) { near = r; break; } } }
        if (near < 99) d[q * 4 + 3] = Math.round(d[q * 4 + 3] * near / 26); }
      const c = new OffscreenCanvas(W, H); c.getContext('2d').putImageData(o, 0, 0); const cw = x1 - x0 + 1, ch = y1 - y0 + 1; const oc = new OffscreenCanvas(cw, ch); oc.getContext('2d').drawImage(c, -x0, -y0);
      const bl = await oc.convertToBlob({ type: 'image/png' }); const u = new Uint8Array(await bl.arrayBuffer()); let s = ''; for (let q = 0; q < u.length; q += 8192) s += String.fromCharCode.apply(null, u.subarray(q, q + 8192));
      out[side] = { png: s && btoa(s), x: x0, y: y0, w: cw, h: ch };
    }
    // preview: arm-less body + the new arm(s), quarter size on grey
    const pv = new OffscreenCanvas(W / 4, H / 4), px = pv.getContext('2d'); px.fillStyle = '#3a3a3a'; px.fillRect(0, 0, W / 4, H / 4); px.scale(0.25, 0.25); px.drawImage(bc, 0, 0);
    for (const v of Object.values(out)) px.drawImage(await ld(v.png, 'png'), v.x, v.y);
    const pb = await pv.convertToBlob(); const pu = new Uint8Array(await pb.arrayBuffer()); let ps = ''; for (let q = 0; q < pu.length; q += 8192) ps += String.fromCharCode.apply(null, pu.subarray(q, q + 8192));
    return { out, fit: best, preview: btoa(ps) };
  }, { nb: baseImg ? fs.readFileSync(baseImg).toString('base64') : null, gb: fs.readFileSync(img).toString('base64'), body, W: rig.canvas[0], H: rig.canvas[1], J: rig.joints, sides });
  rig.gestureArms = rig.gestureArms || {};
  for (const [side, v] of Object.entries(res.out)) { const n = `${outName}_${side}`; fs.writeFileSync(path.join(dir, 'gest', n + '.png'), Buffer.from(v.png, 'base64'));
    rig.gestureArms[n] = { file: 'gest/' + n + '.png', x: v.x, y: v.y, w: v.w, h: v.h, bindTo: side === 'R' ? 'clavR' : 'clavL', pivot: side === 'R' ? rig.joints.shoulderR : rig.joints.shoulderL, source: path.basename(img), fit: res.fit };
    console.log(n, v.x, v.y, v.w + 'x' + v.h); }
  fs.writeFileSync(path.join(dir, 'gest', '_preview_' + outName + '.png'), Buffer.from(res.preview, 'base64'));
  fs.writeFileSync(path.join(dir, 'rig.json'), JSON.stringify(rig, null, 1)); console.log('fit', JSON.stringify(res.fit)); await br.close();
})();
