# scripts

Image tooling for the Nubu character (Node + `sharp`).

Setup once: `npm install sharp` (in this folder or a parent).

- `cutout.js <in> <out.png>` — remove the flat gray background from a Nubu render (flood fill + chroma matting, glow halo trimmed). Tuned on the v1 renders (bg ~ rgb 193).
- `split-front.js debug|build` — split the front cutout into registered full-canvas layers in `character/layers/front/`. Paths are hard-coded (edit SP/SRC/OUT at the top). `debug` draws mask outlines for calibration.

Layers are full canvas (same size/origin), so they stack 1:1 and import into Rive at the same coordinates.
- `split-front-v2.js debug|build` — v2: uses the AI bare-body plate (`character/source/nubu_front_barebody_v1.webp` → `layers/nubu_barebody_cutout.png`) as `body_base`, then lifts `arm_L`, `arm_R`, `headphones` from the v1 filled body (`front/_v1_body_filled.png`). Run `split-front.js build` first (v1), then this.
- `extract-faces.js` — extracts registered eye / mouth / tear layers from `character/source/expressions/*.webp` into `character/layers/face/{eyes,mouths}` + `manifest.json` (crop offsets in body-layer canvas coords). Registration = align eye midpoint/spacing to the front master; closed-eye images use identity. Dark (<150 lum) + pink (r-g>60, mouth only) + bluish tears, hole-fill, 0.8px soft alpha.
- `compose-faces.js` — stacks body_base + arms + headphones + face + antennae for all 15 expression combos → `character/layers/face/preview_*.png` (check sheet).
- 3/4 pipeline (run in order, paths hard-coded at top): `cutout.js` on `nubu_3q-left_v1.webp` + `angle34/nubu_34L_barebody_v1.webp` → `canvas-34.js` (place on 1080×1269 canvas, canvas = src − (57,19)) → `split-34.js debug|build` (parts + `body_base` = bare plate + head_fill) → `extract-34.js` (eyes far/near + mouths, similarity registration from the two eye centres) → `compose-34.js` (preview) → `mirror-34.js` (3/4 right = flop, antenna_L/R names swap, manifest x mirrored).
- `arms-soft.js` — rebuilds front `arm_L/arm_R` with a soft inner edge (feather where the arm used to overlap the body) so raised arms don't show a hard elliptical cut. `hand-poses.js` — renders the arm poses (rotate/scale/translate about shoulder pivots + drop shadow) to a sheet; parameters live in `character/layers/poses.json`.
