// Preview every gesture: arm-less rig body + gesture arm(s) + the other side's natural arm. usage: node gesture-preview.js <cutDir> <out.png>
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'D:/NUBU/node_modules/playwright');
const fs = require('fs'), path = require('path'); const [dir, out] = process.argv.slice(2);
const rig = JSON.parse(fs.readFileSync(path.join(dir, 'rig.json')));
const ARMISH = new Set(['armR', 'armL', 'handR', 'handL', 'capR', 'capL', 'latR', 'latL']);
const body = rig.drawOrder.filter(n => !ARMISH.has(n)).map(n => ({ ...rig.pieces[n], b64: fs.readFileSync(path.join(dir, rig.pieces[n].file)).toString('base64') }));
const GA = rig.gestureArms; const arm = n => GA[n] && ({ ...GA[n], b64: fs.readFileSync(path.join(dir, GA[n].file)).toString('base64') });
const G = ['natural', 'wave', 'peace', 'point', 'thumbsup', 'mic', 'flex', 'fingerheart'].map(g => ({ g, R: arm(g + '_R') || arm('natural_R'), L: arm(g + '_L') || arm('natural_L') }));
(async () => { const br = await chromium.launch(); const pg = await br.newPage();
  const r = await pg.evaluate(async ({ body, G, W, H }) => { const ld = async d => { const i = new Image(); i.src = 'data:image/png;base64,' + d; await i.decode(); return i; };
    const bi = []; for (const p of body) bi.push([await ld(p.b64), p.x, p.y]);
    const cw = 700, ch = 1100, s = cw / 1700; const c = new OffscreenCanvas(cw * 4, (ch + 30) * 2), x = c.getContext('2d'); x.fillStyle = '#2b2b2b'; x.fillRect(0, 0, c.width, c.height); x.font = '26px sans-serif';
    for (let k = 0; k < G.length; k++) { const X = (k % 4) * cw, Y = Math.floor(k / 4) * (ch + 30); x.fillStyle = '#fff'; x.fillText(G[k].g, X + 8, Y + 24);
      x.save(); x.beginPath(); x.rect(X, Y + 30, cw, ch); x.clip(); x.translate(X - 550 * s, Y + 30 - 120 * s); x.scale(s, s);
      const L = G[k].L, R = G[k].R; const order = [L, ...bi.map(b => ({ img: b })), R];
      // body pieces first, then arms (the crossing arm is in front of the tank)
      for (const b of bi) x.drawImage(b[0], b[1], b[2]); for (const a of [L, R]) x.drawImage(await ld(a.b64), a.x, a.y); x.restore(); }
    const bl = await c.convertToBlob(); const u = new Uint8Array(await bl.arrayBuffer()); let z = ''; for (let q = 0; q < u.length; q += 8192) z += String.fromCharCode.apply(null, u.subarray(q, q + 8192)); return btoa(z); },
    { body, G, W: rig.canvas[0], H: rig.canvas[1] });
  fs.writeFileSync(out, Buffer.from(r, 'base64')); await br.close(); })();
