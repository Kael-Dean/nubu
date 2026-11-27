// Rebuild the master from the cut pieces (rig.json draw order) and report how many pixels differ.
// usage: node compose-check.js <master_nobg.webp> <cutDir> <out.png> [pose.json]
// pose.json (optional): { "<piece>": { "rot": deg, "pivot": [x,y] } } — rigid rotation preview (no mesh bend)
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'D:/NUBU/node_modules/playwright');
const fs = require('fs'), path = require('path');
(async () => {
  const [master, dir, out, poseF] = process.argv.slice(2);
  const rig = JSON.parse(fs.readFileSync(path.join(dir, 'rig.json')));
  const pose = poseF ? JSON.parse(fs.readFileSync(poseF)) : {};
  const pieces = rig.drawOrder.map(n => ({ n, ...rig.pieces[n], b64: fs.readFileSync(path.join(dir, rig.pieces[n].file)).toString('base64'), pose: pose[n] }));
  const br = await chromium.launch(); const pg = await br.newPage();
  const r = await pg.evaluate(async ({ mb64, pieces, W, H, bg }) => {
    const load = async (d, t) => { const i = new Image(); i.src = `data:image/${t};base64,` + d; await i.decode(); return i; };
    const c = new OffscreenCanvas(W, H), x = c.getContext('2d');
    for (const p of pieces) { const im = await load(p.b64, 'png'); x.save();
      if (p.pose) { const [px, py] = p.pose.pivot; x.translate(px, py); x.rotate(p.pose.rot * Math.PI / 180); x.translate(-px, -py); }
      x.drawImage(im, p.x, p.y); x.restore(); }
    const a = x.getImageData(0, 0, W, H).data;
    const mc = new OffscreenCanvas(W, H), mx = mc.getContext('2d'); mx.drawImage(await load(mb64, 'webp'), 0, 0);
    const b = mx.getImageData(0, 0, W, H).data; let diff = 0;
    for (let i = 0; i < a.length; i += 4) if (Math.abs(a[i + 3] - b[i + 3]) > 10 || (b[i + 3] > 200 && (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2])) > 30)) diff++;
    const oc = new OffscreenCanvas(W / 4, H / 4), o = oc.getContext('2d'); o.fillStyle = bg; o.fillRect(0, 0, W / 4, H / 4); o.drawImage(c, 0, 0, W / 4, H / 4);
    const bl = await oc.convertToBlob({ type: 'image/png' }); const u = new Uint8Array(await bl.arrayBuffer()); let s = ''; for (let k = 0; k < u.length; k += 8192) s += String.fromCharCode.apply(null, u.subarray(k, k + 8192));
    return { diff, png: btoa(s) };
  }, { mb64: fs.readFileSync(master).toString('base64'), pieces, W: rig.canvas[0], H: rig.canvas[1], bg: '#3a3a3a' });
  fs.writeFileSync(out, Buffer.from(r.png, 'base64')); console.log('pixels differing from master:', r.diff);
  await br.close();
})();
