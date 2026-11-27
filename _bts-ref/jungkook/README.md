# Jungkook — Rive 2D model kit (hybrid)

Generated with Recraft on 2026-11-26 (about 63 credits in total). Pipeline: likeness image → full-body A-pose →
parts sheet and face sheet → crisp_upscale → remove_background → automatic split
(`~/.claude/skills/rive-celebrity-likeness/scripts/split-sheet.js`).

## Files
| Folder | What | Use in Rive |
|---|---|---|
| `jk_gpt-image2_likeness.png` | Approved likeness (half body) | Look reference |
| `sheets/master_fullbody_apose_2x_nobg.webp` | Full body, A-pose, no background | **Assembly guide**: scale and place every part over it, then hide it |
| `parts/01–18_*.png` (4096 sheet) | Body cut-out parts: head_base (blank face), hair front/back, neck, torso, hips, upper/fore arms R(tattoo)/L, hands, thighs, shins, shoes | **Raster image meshes** on bones |
| `face/01–31_*.png` | 12 eyes, 10 brows, 9 mouths (with lip ring) | Swap with solo/visibility in the state machine |
| `joints/01–17_*.png` | Chest skin underlayer, shoulder caps, long neck, elbow discs + 90° bent elbows, wrist discs, knees + 90° bent knees, pelvis/crotch, ankle hems with sock | Joint covers and pose swaps (see below) |
| `hands/01–16_*.png` | 8 poses × 2 hands: relaxed, fist, wave palm, peace, thumbs up, point, finger heart, half big-heart (R has ARMY knuckles) | Swap per gesture with solo groups |
| `head34/01–08_*.png` | 3/4 head turn, both directions (`faceLeft` = nose toward the viewer's left): blank head base with ear, front hair, back hair, neck | Swap with the front head for head turns |
| `face34L/01–21_*.png` | 3/4 features for the `faceLeft` head: eye pairs (far/near; open, happy, closed arc, blink, surprised; several include the brow), brows (neutral, raised, angry), mouths (smile, bunny smile, laugh, talk A, talk O) | Face set for `head34/faceLeft_*` |
| `face34R/01–21_*.png` | The same 21 features for the `faceRight` head (near eye on the viewer's left). The lip ring stays on his right side (the near corner) | Face set for `head34/faceRight_*` |
| `sheets/face_sheet.svg` | Vector version of the face sheet | Option: import as vector shapes for crisp face features |
| `*/layout.json` | Position of each part on its source sheet | Initial placement |

R/L = the character's own side (R is on the viewer's left). His right arm carries the tattoo sleeve and the ARMY knuckles.

## Rig plan (hybrid)
1. **Assemble**: put the master image as a guide layer, scale the parts to match it (the sheet parts were drawn at a
   similar but not identical scale), then hide the guide.
2. **Draw order** (back to front): hair_back → armL_upper → armL_fore → handL → thighL/shinL/shoeL → hips →
   thighR/shinR/shoeR → torso → neck → head_base → face features → hair_front → armR_upper → armR_fore → handR.
   Switch the arm order per pose when an arm crosses the body.
3. **Bones**: root → hips → spine → chest → neck → head; shoulder → upper arm → forearm → hand (both sides);
   thigh → shin → foot (both sides); hair_front gets 2–3 sway bones and hair_back 1.
4. **Meshes**: image mesh with 6–10 vertices across each elbow, knee and shoulder joint, weighted to two bones so
   joints bend without gaps. The torso mesh is weighted to spine and chest for breathing.
5. **IK**: 2-bone IK on arms and legs, with targets for the hands and feet.
6. **Face**: eye, brow and mouth sets as solo groups. A view model `face { eyes, brows, mouth }` (enum or number)
   is driven by the state machine. Blink is a layer every 3–5 s. Talking uses the A/E/O/MBP mouths.
7. **State machine**: idle (breathing, hair sway, blink), happy (bunny smile + happy eyes), laugh, surprised,
   wink, flex (arm pose), wave, heart hands, talk. Optional head/eye look-at pointer.

## Joints: how each one is built
| Joint | Pieces | Method |
|---|---|---|
| Neck → chest | `joints/neck_long` + `joints/chest_skin` behind `parts/torso` | The chest skin fills the tank neckline and armholes. The long neck tucks under the head and into the chest so head tilts never show a gap |
| Shoulder | `parts/arm*_upper` (has a deltoid top) + `joints/shoulder*_cap` on top | The cap is centred on the shoulder bone pivot, so the seam is hidden at any rotation. Mesh-weight the torso armhole edge 50/50 to the chest and upper-arm bones |
| Elbow | `parts/arm*_upper` + `arm*_fore`, `joints/elbow*_disc` at the pivot | Small bends (≤ 45°): disc + mesh. Large bends (> 60°): swap to `joints/elbow*_bent` (bicep bulge + crease) via a solo group driven by the elbow angle |
| Wrist | `joints/wrist*_disc` under the hand | Hides the cut when hands are swapped or rotated |
| Hip | `joints/pelvis_crotch` (use instead of `parts/hips` when legs spread) | Thighs rotate under it. The pelvis covers the top of both thighs |
| Knee | `parts/thigh*` + `shin*`, `joints/knee*` on top | Straight / small bend: knee piece + mesh. Squat or sit: swap to `joints/knee*_bent` |
| Ankle | `joints/ankle*_sock` between the shin and the shoe | Covers the shin-to-shoe seam and adds the sock line |

## Known gaps
- The tattoo pattern on bent pieces (`elbowR_bent`, `shoulderR_cap`) is not pixel-identical to the straight arm,
  because each generation redraws it. At animation scale it reads as the same sleeve, but up close the swap is visible.
  Fix if needed: crossfade 2–3 frames on the swap, or regenerate a bent arm with the straight arm as input.
- `parts/hips` and `joints/pelvis_crotch` are shorts-shaped. They sit under the torso hem, so only the crotch area
  shows.
## Head turn (front ↔ 3/4)
- State machine number `headTurn` (−1 left, 0 front, +1 right). At |value| > 0.5, swap the whole head group
  (head base + hair front/back + neck + face set) from the front set to `head34/faceLeft_*` or `faceRight_*`.
  Below 0.5, slide the front face features 6–10% toward the turn side and squash the far eye, so the swap is not
  a pop. Put 2 frames of motion blur or squash on the swap frame.
- Each direction has its own face set (`face34L`, `face34R`), so the lip ring stays on his right side in every
  view. No flipping is needed.

## Known gaps (cont.)
- The sneakers came out looking like a well-known brand's model, swoosh included. Fine for fan art. For anything
  commercial, regenerate as plain sneakers.
- Parts were cleaned with `DESPILL=1 DEFRINGE=3` (no white rim). A few dark-red specks may remain on hair tips.
  They are invisible at normal scale.
