// Scale the generated expression sprites (face/) to the master's feature size and record where each one goes.
// usage: node scale-face-swaps.js <cutDir>
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'D:/NUBU/node_modules/playwright');
const fs = require('fs'), path = require('path');
const dir = process.argv[2]; const rig = JSON.parse(fs.readFileSync(path.join(dir, 'rig.json')));
const SRC = 'face'; // generated front-face sprites (31)
// master feature centres (master px) and scale factors measured against the master's own features
const C = { eyeR: [1334, 434], eyeL: [1475, 426], browR: [1347, 389], browL: [1478, 382], mouth: [1411, 566] };
const S = { eye: 0.373, brow: 0.317, mouth: 0.271 };
const files = fs.readdirSync(SRC).filter(f => f.endsWith('.png'));
(async () => {
  const br = await chromium.launch(); const pg = await br.newPage(); const swaps = {};
  for (const f of files) {
    const name = f.replace(/^\d+_/, '').replace('.png', ''); // e.g. eyeR_happy, mouth_laugh
    const kind = name.startsWith('eye') ? 'eye' : name.startsWith('brow') ? 'brow' : 'mouth';
    const slot = kind === 'mouth' ? 'mouth' : name.slice(0, kind === 'eye' ? 4 : 5); // eyeR / browL ...
    const { png, w, h } = await pg.evaluate(async ({ b64, s }) => { const i = new Image(); i.src = 'data:image/png;base64,' + b64; await i.decode();
      const w = Math.max(1, Math.round(i.width * s)), h = Math.max(1, Math.round(i.height * s)); const c = new OffscreenCanvas(w, h), x = c.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(i, 0, 0, w, h);
      const bl = await c.convertToBlob({ type: 'image/png' }); const u = new Uint8Array(await bl.arrayBuffer()); let st = ''; for (let q = 0; q < u.length; q += 8192) st += String.fromCharCode.apply(null, u.subarray(q, q + 8192)); return { png: btoa(st), w, h }; },
      { b64: fs.readFileSync(path.join(SRC, f)).toString('base64'), s: S[kind] });
    const out = `face/swap_${name}.png`; fs.writeFileSync(path.join(dir, out), Buffer.from(png, 'base64'));
    const [cx, cy] = C[slot]; swaps[name] = { file: out, slot, centerX: cx, centerY: cy, x: Math.round(cx - w / 2), y: Math.round(cy - h / 2), w, h };
  }
  rig.faceSwaps = swaps; rig.faceSlots = C; fs.writeFileSync(path.join(dir, 'rig.json'), JSON.stringify(rig, null, 1));
  console.log(Object.keys(swaps).length, 'swaps written'); await br.close();
})();
