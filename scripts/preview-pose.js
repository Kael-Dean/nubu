// Quick look at Nubu front-view poses/expressions/props WITHOUT Rive: stacks the PNG layers in a browser and
// applies the same arm transforms Rive uses (rotate + uniform scale about the shoulder pivot, then translate).
// usage: node scripts/preview-pose.js <specs.json> <out.png>
// specs.json: [ { "label": "listen", "eyes": "soft", "mouth": "neutral", "arm_L": {rot,scale,tx,ty}, "arm_R": {...},
//                 "props": [ { "src": "character/layers/props/prop_mask.png", "x": 540, "y": 660, "w": 520, "attach": "arm_R", "rot": 0 } ],
//                 "fx": [ { "src": "...", "x":, "y":, "w": } ] } ]
// Props with attach are placed in the arm's local frame (x,y relative to the shoulder pivot before the arm transform).
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const [specPath, outPath] = process.argv.slice(2);
const specs = JSON.parse(fs.readFileSync(specPath, 'utf8'));
const L = p => 'file:///' + path.join(ROOT, p).replace(/\\/g, '/');
const man = JSON.parse(fs.readFileSync(path.join(ROOT, 'character/layers/face/manifest.json'), 'utf8'));
const PIV = { arm_L: [175, 790], arm_R: [905, 790] };
const W = 1380, H = 1389, OX = 150, OY = 120; // same canvas as the Rive artboard

function img(src, x, y, w, h, extra = '') {
  return `<img src="${L(src)}" style="position:absolute;left:${x}px;top:${y}px;${w ? `width:${w}px;` : ''}${h ? `height:${h}px;` : ''}${extra}">`;
}
function eyeBox(state, side) {
  const m = man.eyes[`eye_open_${side}`];
  return img(`character/layers/face/eyes/eye_${state}_${side}.png`, m.x, m.y, m.w, m.h);
}
function arm(name, t, props) {
  t = t || { rot: 0, scale: 1, tx: 0, ty: 0 };
  const [px, py] = PIV[name];
  const att = (props || []).filter(p => p.attach === name).map(p => img(p.src, px + p.x - p.w / 2, py + p.y - p.h / 2, p.w, p.h,
    `transform:rotate(${p.rot || 0}deg);transform-origin:50% ${p.originY || 50}%;`)).join('');
  // moved arms get the soft shadow like Rive's shadow_arm layer
  const moved = t.rot || t.scale !== 1 || t.tx || t.ty;
  return `<div style="position:absolute;left:0;top:0;width:1080px;height:1269px;transform-origin:${px}px ${py}px;
    transform:translate(${t.tx}px,${t.ty}px) rotate(${t.rot}deg) scale(${t.scale});${moved ? 'filter:drop-shadow(8px 14px 9px rgba(110,70,60,.34));' : ''}">
    ${img(`character/layers/front/${name}.png`, 0, 0, 1080, 1269)}${att}</div>`;
}
function scene(s) {
  const free = (s.props || []).filter(p => !p.attach).map(p => img(p.src, p.x - p.w / 2, p.y - p.h / 2, p.w, p.h, p.rot ? `transform:rotate(${p.rot}deg)` : '')).join('');
  const fx = (s.fx || []).map(p => img(p.src, p.x - p.w / 2, p.y - p.h / 2, p.w, p.h, p.opacity != null ? `opacity:${p.opacity}` : '')).join('');
  const mm = man.mouths[`mouth_${s.mouth || 'neutral'}`];
  return `<div style="position:relative;width:${W}px;height:${H}px;background:${s.bg || '#3cc8aa'}">
   <div style="position:absolute;left:${OX}px;top:${OY}px;width:1080px;height:1269px">
    ${img('character/layers/front/body_base.png', 0, 0, 1080, 1269)}
    ${img('character/layers/front/headphones.png', 0, 0, 1080, 1269)}
    ${eyeBox(s.eyes || 'open', 'L')}${eyeBox(s.eyes || 'open', 'R')}
    ${img(`character/layers/face/mouths/mouth_${s.mouth || 'neutral'}.png`, mm.x, mm.y, mm.w, mm.h)}
    ${fx}${free}
    ${arm('arm_L', s.arm_L, s.props)}${arm('arm_R', s.arm_R, s.props)}
    ${img('character/layers/front/antenna_L.png', 0, 0, 1080, 1269)}${img('character/layers/front/antenna_R.png', 0, 0, 1080, 1269)}
   </div>
   <div style="position:absolute;left:10px;top:8px;font:bold 44px sans-serif;color:#fff;background:#0008;padding:2px 12px">${s.label}</div></div>`;
}

(async () => {
  const cols = Math.min(4, specs.length), rows = Math.ceil(specs.length / cols);
  const html = `<html><body style="margin:0;display:grid;grid-template-columns:repeat(${cols},${W}px);width:${cols * W}px">${specs.map(scene).join('')}</body></html>`;
  const tmp = path.join(path.dirname(path.resolve(outPath)), '_preview_pose.html');
  fs.writeFileSync(tmp, html);
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: cols * W, height: rows * H } });
  await page.goto('file:///' + tmp.replace(/\\/g, '/'));
  await page.waitForTimeout(300);
  await page.screenshot({ path: outPath, fullPage: true, scale: 'css' });
  await browser.close();
  fs.unlinkSync(tmp);
  console.log('wrote', outPath);
})();
