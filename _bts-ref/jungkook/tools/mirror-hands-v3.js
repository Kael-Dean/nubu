// Left hands = right hands mirrored about the body centre, moved onto the left wrist, tattoo ink removed.
// Ink = small non-skin blobs that don't touch the outline (letters, heart, coffin); big dark parts (mic, outlines) stay.
// usage: node mirror-hands-v3.js <cutDir> <pose,pose,...>
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'D:/NUBU/node_modules/playwright');
const fs = require('fs'), path = require('path');
const [dir, list] = process.argv.slice(2); const rig = JSON.parse(fs.readFileSync(path.join(dir, 'rig.json'))); const J = rig.joints; const MX = 1400;
const poses = list.split(',');
(async () => {
  const br = await chromium.launch(); const pg = await br.newPage();
  for (const p of poses) {
    const hp = rig.handPoses['handR_' + p];
    const r = await pg.evaluate(async ({ b64, hp, J, MX, CUT_AT }) => {
      const im = new Image(); im.src = 'data:image/png;base64,' + b64; await im.decode();
      const w = hp.w, h = hp.h; const c = new OffscreenCanvas(w, h), x = c.getContext('2d'); x.translate(w, 0); x.scale(-1, 1); x.drawImage(im, 0, 0); const id = x.getImageData(0, 0, w, h); const d = id.data;
      // mirrored placement: new left edge = 2*MX - (hp.x + w), then shift so the mirrored right wrist lands on the left wrist
      const mwr = [2 * MX - J.wristR[0], J.wristR[1]]; const dx = J.wristL[0] - mwr[0], dy = J.wristL[1] - mwr[1];
      const ox = 2 * MX - (hp.x + w) + dx, oy = hp.y + dy;
      // cut the forearm strip: keep only past the left hand line
      const e = J.elbowL, wr = J.wristL, ex = wr[0] - e[0], ey = wr[1] - e[1], L = Math.hypot(ex, ey);
      for (let y = 0; y < h; y++) for (let xx = 0; xx < w; xx++) { const a = ((xx + ox - wr[0]) * ex + (y + oy - wr[1]) * ey) / L; if (a <= +(CUT_AT)) d[(y * w + xx) * 4 + 3] = 0; }
      // skin reference: median of light pixels
      const sk = [[], [], []]; for (let i = 0; i < w * h * 4; i += 4) if (d[i + 3] > 250 && (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) > 160) for (let k = 0; k < 3; k++) sk[k].push(d[i + k]);
      const skin = sk.map(a => { a.sort((p, q) => p - q); return a[a.length >> 1] || 230; });
      const non = new Uint8Array(w * h); for (let i = 0; i < w * h; i++) { if (d[i * 4 + 3] < 200) continue; if (Math.hypot(d[i * 4] - skin[0], d[i * 4 + 1] - skin[1], d[i * 4 + 2] - skin[2]) > 50) non[i] = 1; }
      const lab = new Int32Array(w * h); let n = 0; const kill = new Uint8Array(w * h);
      for (let s = 0; s < w * h; s++) if (non[s] && !lab[s]) { n++; const st = [s], comp = []; lab[s] = n; let edge = false;
        while (st.length) { const q = st.pop(); comp.push(q); const qx = q % w, qy = (q / w) | 0;
          for (const [nx, ny] of [[qx - 1, qy], [qx + 1, qy], [qx, qy - 1], [qx, qy + 1]]) { if (nx < 0 || ny < 0 || nx >= w || ny >= h) { edge = true; continue; } const j = ny * w + nx; if (d[j * 4 + 3] < 120) edge = true; if (non[j] && !lab[j]) { lab[j] = n; st.push(j); } } }
        if (!edge && comp.length < 2500) for (const q of comp) kill[q] = 1; }
      // dilate kill by 1px into antialiased edges, then harmonic fill from surrounding skin
      const k2 = new Uint8Array(kill); for (let i = 0; i < w * h; i++) if (kill[i]) for (const j of [i - 1, i + 1, i - w, i + w]) if (j >= 0 && j < w * h && d[j * 4 + 3] > 200) k2[j] = 1;
      const idx = []; for (let i = 0; i < w * h; i++) if (k2[i]) idx.push(i); const pos = new Map(idx.map((v, k) => [v, k])); const f = new Float32Array(idx.length * 3); for (let k = 0; k < idx.length; k++) for (let c2 = 0; c2 < 3; c2++) f[k * 3 + c2] = skin[c2];
      for (let it = 0; it < 250; it++) for (let k = 0; k < idx.length; k++) { const i = idx[k]; let m = 0; const acc = [0, 0, 0]; for (const j of [i - 1, i + 1, i - w, i + w]) { if (j < 0 || j >= w * h || d[j * 4 + 3] < 200) continue; const kj = pos.get(j); m++; for (let c2 = 0; c2 < 3; c2++) acc[c2] += kj === undefined ? d[j * 4 + c2] : f[kj * 3 + c2]; } if (m) for (let c2 = 0; c2 < 3; c2++) f[k * 3 + c2] = acc[c2] / m; }
      for (let k = 0; k < idx.length; k++) for (let c2 = 0; c2 < 3; c2++) d[idx[k] * 4 + c2] = f[k * 3 + c2];
      x.setTransform(1, 0, 0, 1, 0, 0); x.putImageData(id, 0, 0);
      // trim
      let x0 = w, y0 = h, x1 = -1, y1 = -1; for (let y = 0; y < h; y++) for (let xx = 0; xx < w; xx++) if (d[(y * w + xx) * 4 + 3] > 8) { if (xx < x0) x0 = xx; if (xx > x1) x1 = xx; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      const o = new OffscreenCanvas(x1 - x0 + 1, y1 - y0 + 1); o.getContext('2d').drawImage(c, -x0, -y0);
      const bl = await o.convertToBlob({ type: 'image/png' }); const u = new Uint8Array(await bl.arrayBuffer()); let s = ''; for (let q = 0; q < u.length; q += 8192) s += String.fromCharCode.apply(null, u.subarray(q, q + 8192));
      return { png: btoa(s), x: ox + x0, y: oy + y0, w: x1 - x0 + 1, h: y1 - y0 + 1, removed: idx.length };
    }, { b64: fs.readFileSync(path.join(dir, hp.file)).toString("base64"), hp, J, MX, CUT_AT: +(process.env.CUT_AT || -35) });
    const file = `hands/handL_${p}.png`; fs.writeFileSync(path.join(dir, file), Buffer.from(r.png, 'base64'));
    rig.handPoses['handL_' + p] = { file, x: r.x, y: r.y, w: r.w, h: r.h, bindTo: 'handL', note: `mirror of handR_${p}, ink removed` };
    console.log('handL_' + p, r.x, r.y, r.w + 'x' + r.h, 'ink px removed', r.removed);
  }
  fs.writeFileSync(path.join(dir, 'rig.json'), JSON.stringify(rig, null, 1)); await br.close();
})();
