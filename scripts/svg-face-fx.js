// Draw new Nubu face states and props as SVG and rasterise them with Playwright (transparent PNG).
// usage: node scripts/svg-face-fx.js            -> writes PNGs + preview
// Eye boxes match character/layers/face/manifest.json (184x184 crops): L centre (389,586), R centre (693,584) on the 1080x1269 canvas.
// Style reference: eye_open = glossy black sphere r~49 at (91,94) in the box, warm rim bottom-left, highlight top-right.
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const OUT_EYES = path.join(ROOT, 'character/layers/face/eyes');
const OUT_FX = path.join(ROOT, 'character/layers/face/fx');
const OUT_PROPS = path.join(ROOT, 'character/layers/props');
fs.mkdirSync(OUT_FX, { recursive: true });
fs.mkdirSync(OUT_PROPS, { recursive: true });

// ---------- shared eye parts ----------
const defs = (id) => `
<defs>
  <radialGradient id="ball${id}" cx="0.62" cy="0.32" r="0.78">
    <stop offset="0" stop-color="#3a3536"/>
    <stop offset="0.4" stop-color="#151213"/>
    <stop offset="0.85" stop-color="#0a0809"/>
    <stop offset="1" stop-color="#1c1010"/>
  </radialGradient>
  <radialGradient id="rim${id}" cx="0.3" cy="0.85" r="0.55">
    <stop offset="0" stop-color="#b04a3c" stop-opacity="0.55"/>
    <stop offset="1" stop-color="#b04a3c" stop-opacity="0"/>
  </radialGradient>
  <linearGradient id="water${id}" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#bfe3ff" stop-opacity="0"/>
    <stop offset="0.6" stop-color="#bfe3ff" stop-opacity="0.35"/>
    <stop offset="1" stop-color="#e8f6ff" stop-opacity="0.7"/>
  </linearGradient>
  <radialGradient id="drop${id}" cx="0.4" cy="0.35" r="0.7">
    <stop offset="0" stop-color="#ffffff" stop-opacity="0.95"/>
    <stop offset="0.5" stop-color="#d8eeff" stop-opacity="0.85"/>
    <stop offset="1" stop-color="#9fc8ee" stop-opacity="0.8"/>
  </radialGradient>
  <filter id="soft${id}" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="0.8"/></filter>
</defs>`;

const sphere = (id, cx, cy, r) => `
  <circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#ball${id})"/>
  <circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#rim${id})"/>`;

// mirror helper: right eye = left eye mirrored horizontally inside the 184 box (highlights keep the same top-right light though)
function eyeSvg(kind, side) {
  const id = kind + side;
  const m = side === 'R';
  let body = '';
  if (kind === 'teary') {
    // bigger, wet, wobbly: big highlight + small ones, water line on the lower half, a bead of tear at the outer corner
    const cx = 91, cy = 92, r = 53;
    body = `${sphere(id, cx, cy, r)}
      <path d="M${cx - r + 6},${cy + 10} Q${cx},${cy + r + 14} ${cx + r - 6},${cy + 10} Q${cx},${cy + r - 6} ${cx - r + 6},${cy + 10}Z" fill="url(#water${id})"/>
      <path d="M${cx - r + 12},${cy + 30} Q${cx},${cy + r + 2} ${cx + r - 12},${cy + 30}" fill="none" stroke="#f4fbff" stroke-opacity="0.85" stroke-width="3.2" stroke-linecap="round"/>
      <ellipse cx="${cx + 17}" cy="${cy - 22}" rx="17" ry="13" fill="#fff" transform="rotate(-25 ${cx + 17} ${cy - 22})"/>
      <circle cx="${cx - 20}" cy="${cy + 14}" r="7.5" fill="#fff" fill-opacity="0.95"/>
      <circle cx="${cx + 26}" cy="${cy + 6}" r="3.8" fill="#fff" fill-opacity="0.9"/>
      <g filter="url(#soft${id})"><path d="M${m ? cx + 44 : cx - 44},${cy + 40} q${m ? 9 : -9},12 0,22 q${m ? -9 : 9},-10 0,-22Z" fill="url(#drop${id})" stroke="#a8cbe8" stroke-width="1"/></g>`;
  } else if (kind === 'soft') {
    // nostalgic: same sphere, upper lid cuts it (fur shows through above), lash line along the cut, highlight low
    // lid edge is an upward arc (∩): shows the lower ~60% of the ball -> gentle, smiling, far-away look
    const cx = 91, cy = 98, r = 48;
    const lidY = cy - 4;
    body = `<clipPath id="lid${id}"><path d="M0,${lidY + 26} C40,${lidY - 30} 144,${lidY - 30} 184,${lidY + 26} L184,184 L0,184Z"/></clipPath>
      <g clip-path="url(#lid${id})">${sphere(id, cx, cy, r)}
        <ellipse cx="${cx + 16}" cy="${lidY + 6}" rx="11" ry="7" fill="#fff" fill-opacity="0.95"/>
        <circle cx="${cx - 18}" cy="${cy + 24}" r="4.5" fill="#fff" fill-opacity="0.75"/></g>
      <path d="M${cx - r - 5},${lidY + 22} C${cx - 30},${lidY - 14} ${cx + 30},${lidY - 14} ${cx + r + 5},${lidY + 22}" fill="none" stroke="#1d1414" stroke-width="6.5" stroke-linecap="round"/>`;
  } else if (kind === 'lookup') {
    // wondering: sphere nudged up/inward, two big highlights high up
    const cx = m ? 86 : 96, cy = 84, r = 50;
    body = `${sphere(id, cx, cy, r)}
      <ellipse cx="${cx + 4}" cy="${cy - 26}" rx="15" ry="11" fill="#fff"/>
      <circle cx="${cx + 24}" cy="${cy - 10}" r="5.5" fill="#fff" fill-opacity="0.95"/>
      <circle cx="${cx - 18}" cy="${cy + 22}" r="3.5" fill="#fff" fill-opacity="0.6"/>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="184" height="184" viewBox="0 0 184 184">${defs(id)}${body}</svg>`;
}

// single tear drop (fx) 40x60, glossy, used for falling tears in Rive
const tearSvg = () => `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="60" viewBox="0 0 40 60">${defs('t')}
  <path d="M20,3 C25,16 34,28 34,39 A14,14 0 0 1 6,39 C6,28 15,16 20,3Z" fill="url(#dropt)" stroke="#8fbde6" stroke-width="1.6"/>
  <ellipse cx="14" cy="36" rx="3.5" ry="6" fill="#fff" fill-opacity="0.9"/></svg>`;

// tear stream under a laughing eye: soft wet trail 60x150
const trailSvg = () => `<svg xmlns="http://www.w3.org/2000/svg" width="60" height="150" viewBox="0 0 60 150">
  <defs><linearGradient id="tr" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#a9d6ff" stop-opacity="1"/><stop offset="0.7" stop-color="#c4e4ff" stop-opacity="0.85"/><stop offset="1" stop-color="#cfe9ff" stop-opacity="0"/></linearGradient></defs>
  <path d="M28,2 C36,18 40,30 36,46 C32,60 44,72 42,92 C40,108 48,120 44,136 C40,148 20,148 18,136 C15,122 22,108 18,92 C14,74 24,62 22,46 C20,30 22,16 28,2Z" fill="url(#tr)" fill-opacity="0.78" stroke="#7fb3e3" stroke-opacity="0.7" stroke-width="1.6"/>
  <path d="M25,16 C24,34 26,44 25,58 M24,74 C22,86 24,96 23,108" stroke="#fff" stroke-opacity="0.9" stroke-width="3.2" fill="none" stroke-linecap="round"/>
  <ellipse cx="31" cy="134" rx="9" ry="10" fill="#e6f4ff" fill-opacity="0.9"/><circle cx="28" cy="131" r="3" fill="#fff"/></svg>`;

// surgical mask (canvas-space prop, 520x300), loops reach toward the headphone cups
const maskSvg = () => `<svg xmlns="http://www.w3.org/2000/svg" width="520" height="300" viewBox="0 0 520 300">
<defs>
  <linearGradient id="mk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f4fbff"/><stop offset="0.55" stop-color="#dcecf7"/><stop offset="1" stop-color="#b9d3e6"/></linearGradient>
  <radialGradient id="mkhi" cx="0.45" cy="0.3" r="0.6"><stop offset="0" stop-color="#fff" stop-opacity="0.8"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
  <filter id="mksh" x="-10%" y="-10%" width="120%" height="140%"><feDropShadow dx="0" dy="10" stdDeviation="9" flood-color="#6e463c" flood-opacity="0.32"/></filter>
</defs>
<path d="M115,80 C70,70 40,60 18,40" fill="none" stroke="#e6eef5" stroke-width="7" stroke-linecap="round"/>
<path d="M115,170 C70,178 40,160 22,128" fill="none" stroke="#e6eef5" stroke-width="7" stroke-linecap="round"/>
<path d="M405,80 C450,70 480,60 502,40" fill="none" stroke="#e6eef5" stroke-width="7" stroke-linecap="round"/>
<path d="M405,170 C450,178 480,160 498,128" fill="none" stroke="#e6eef5" stroke-width="7" stroke-linecap="round"/>
<g filter="url(#mksh)">
  <path d="M110,70 Q260,40 410,70 L420,190 Q260,250 100,190Z" fill="url(#mk)" stroke="#a9c3d6" stroke-width="2.5" stroke-linejoin="round"/>
  <path d="M110,70 Q260,40 410,70 L420,190 Q260,250 100,190Z" fill="url(#mkhi)"/>
  <path d="M108,108 Q260,86 412,108" fill="none" stroke="#a7c1d4" stroke-width="3"/>
  <path d="M104,140 Q260,124 416,140" fill="none" stroke="#a7c1d4" stroke-width="3"/>
  <path d="M102,170 Q260,165 418,170" fill="none" stroke="#a7c1d4" stroke-width="2.5" stroke-opacity="0.8"/>
  <path d="M150,62 Q260,46 370,62" fill="none" stroke="#c9d6df" stroke-width="5" stroke-linecap="round"/>
</g></svg>`;

// generic purple glow stick (NOT a lightstick design): 120x360, glow baked in, held at the bottom
const glowSvg = () => `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="360" viewBox="0 0 120 360">
<defs>
  <filter id="gl" x="-60%" y="-20%" width="220%" height="140%"><feGaussianBlur stdDeviation="14"/></filter>
  <linearGradient id="tube" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#b56cff"/><stop offset="0.35" stop-color="#f3e2ff"/><stop offset="0.55" stop-color="#d7a6ff"/><stop offset="1" stop-color="#8f3fe8"/></linearGradient>
  <linearGradient id="grip" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#3a2a4e"/><stop offset="0.4" stop-color="#6c5a82"/><stop offset="1" stop-color="#2a1d38"/></linearGradient>
</defs>
<rect x="34" y="20" width="52" height="250" rx="26" fill="#a64dff" opacity="0.75" filter="url(#gl)"/>
<rect x="42" y="28" width="36" height="234" rx="18" fill="url(#tube)"/>
<rect x="50" y="40" width="7" height="200" rx="3.5" fill="#fff" opacity="0.75"/>
<rect x="38" y="258" width="44" height="86" rx="12" fill="url(#grip)"/>
<rect x="38" y="270" width="44" height="6" fill="#8e7aa6" opacity="0.7"/>
</svg>`;

(async () => {
  const jobs = [];
  for (const k of ['teary', 'soft', 'lookup']) for (const s of ['L', 'R']) jobs.push([path.join(OUT_EYES, `eye_${k}_${s}.png`), eyeSvg(k, s), 184, 184]);
  jobs.push([path.join(OUT_FX, 'fx_tear.png'), tearSvg(), 40, 60]);
  jobs.push([path.join(OUT_FX, 'fx_tear_trail.png'), trailSvg(), 60, 150]);
  jobs.push([path.join(OUT_PROPS, 'prop_mask.png'), maskSvg(), 520, 300]);
  jobs.push([path.join(OUT_PROPS, 'prop_glowstick.png'), glowSvg(), 120, 360]);
  const browser = await chromium.launch();
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  for (const [file, svg, w, h] of jobs) {
    await page.setViewportSize({ width: w, height: h });
    await page.setContent(`<html><body style="margin:0;background:transparent">${svg}</body></html>`);
    await page.screenshot({ path: file, omitBackground: true, clip: { x: 0, y: 0, width: w, height: h } });
    fs.writeFileSync(file.replace(/\.png$/, '.svg'), svg);
    console.log('wrote', path.relative(ROOT, file));
  }
  await browser.close();
})();
