// Split legR/legL (master_cut) into thigh + shin pieces that overlap at the knee, so each binds to ONE bone
// (black pants hide the seam; avoids heavy auto-weighted meshes). usage: node split-legs.js <cutDir>
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'D:/NUBU/node_modules/playwright');
const fs = require('fs'), path = require('path');
const dir = process.argv[2]; const rig = JSON.parse(fs.readFileSync(path.join(dir, 'rig.json')));
const OVER = 70; // px of overlap each side of the knee line (master px)
(async () => {
  const br = await chromium.launch(); const pg = await br.newPage();
  for (const side of ['R', 'L']) {
    const P = rig.pieces['leg' + side], hip = rig.joints['hip' + side], knee = rig.joints['knee' + side];
    const r = await pg.evaluate(async ({ b64, P, hip, knee, OVER }) => {
      const i = new Image(); i.src = 'data:image/png;base64,' + b64; await i.decode();
      const W = i.width, H = i.height; const c = new OffscreenCanvas(W, H), x = c.getContext('2d'); x.drawImage(i, 0, 0); const d = x.getImageData(0, 0, W, H).data;
      const dx = knee[0] - hip[0], dy = knee[1] - hip[1], L = Math.hypot(dx, dy);
      const along = (px, py) => ((px + P.x - knee[0]) * dx + (py + P.y - knee[1]) * dy) / L; // >0 below the knee line
      const mk = async keep => { let x0 = W, y0 = H, x1 = -1, y1 = -1; for (let y = 0; y < H; y++) for (let xx = 0; xx < W; xx++) if (d[(y * W + xx) * 4 + 3] && keep(along(xx, y))) { if (xx < x0) x0 = xx; if (xx > x1) x1 = xx; if (y < y0) y0 = y; if (y > y1) y1 = y; }
        const w = x1 - x0 + 1, h = y1 - y0 + 1; const oc = new OffscreenCanvas(w, h), ox = oc.getContext('2d'); const id = ox.createImageData(w, h);
        for (let y = y0; y <= y1; y++) for (let xx = x0; xx <= x1; xx++) { const s = (y * W + xx) * 4; if (!d[s + 3] || !keep(along(xx, y))) continue; const o = ((y - y0) * w + xx - x0) * 4; for (let k = 0; k < 4; k++) id.data[o + k] = d[s + k]; }
        ox.putImageData(id, 0, 0); const bl = await oc.convertToBlob({ type: 'image/png' }); const u = new Uint8Array(await bl.arrayBuffer()); let s = ''; for (let q = 0; q < u.length; q += 8192) s += String.fromCharCode.apply(null, u.subarray(q, q + 8192));
        return { x: P.x + x0, y: P.y + y0, w, h, png: btoa(s) }; };
      return { thigh: await mk(a => a < OVER), shin: await mk(a => a > -OVER) };
    }, { b64: fs.readFileSync(path.join(dir, P.file)).toString('base64'), P, hip, knee, OVER });
    for (const part of ['thigh', 'shin']) { const n = part + side, v = r[part]; fs.writeFileSync(path.join(dir, n + '.png'), Buffer.from(v.png, 'base64')); rig.pieces[n] = { file: n + '.png', x: v.x, y: v.y, w: v.w, h: v.h }; console.log(n, v.x, v.y, v.w + 'x' + v.h); }
  }
  // shin draws above thigh so the knee crease of the shin covers the thigh's bottom edge
  rig.drawOrder = ['thighR', 'shinR', 'thighL', 'shinL', 'shoeR', 'shoeL', 'pelvis', 'armL', 'handL', 'torso', 'head', 'armR', 'handR'];
  rig.legNote = 'legR/legL kept for reference; rig uses thigh*/shin* (each bound 100% to one bone, overlap ' + OVER + 'px at the knee)';
  fs.writeFileSync(path.join(dir, 'rig.json'), JSON.stringify(rig, null, 1)); await br.close();
})();
