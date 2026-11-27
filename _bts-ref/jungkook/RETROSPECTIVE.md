# Jungkook Rive rig: retrospective (2026-11-26 → 27)

Status: the owner accepted it as the standard on 2026-11-27. The standard pipeline is in
`~/.claude/skills/rive-celebrity-likeness/references/recraft-rive-standard.md`.

## Recraft credits (from the session log, deduplicated)
Total tracked: **≈ 643 credits** (590 on image gens and edits, 53 on upscale, bg removal and vectorize).
Roughly **~400 of those were avoidable**. With the standard pipeline the same character costs about 115.

| Phase | Credits | Kept? | What went wrong |
|---|---|---|---|
| Likeness concepts (generate_image ×3) | 17 | partly | Fine; picking from few is OK |
| v1 kit: puppet parts sheet, face sheet, hand/parts sheets, face redraws, blank head | ≈ 130 | **no** | Every sheet came out in a slightly different drawing; parts didn't match the body ("drawn by different artists") |
| Hands from real photos as input | ≈ 40 | **no** | Real photos made the hands painterly; the clean flat style was lost |
| Forearm/hand variants (back of hand, palm, wrist entry) | ≈ 55 | **no** | Patching the forearm and hand separately could never fix the forearm rotation; the whole arm needed redrawing |
| Master redraws (A-pose, arms symmetric, tattoo, palms; n=2/n=3) | ≈ 180 | 1 master kept | Spec wasn't fixed up front (palm direction, symmetric arms, real tattoo extent), so each fix was a new regen; n=3 at 45 credits |
| Hand pose sheets | ≈ 36 | later replaced | Bent-mesh gestures with swapped hands looked wrong anatomically |
| 3/4 heads | ≈ 30 | yes | — |
| Gesture whole-arm edits (8 × n=2) | 144 | yes (8 of 16 images) | n=2 doubled the cost; one image per gesture would have been enough with the spec |
| Green-tank recolours for cutting | 27 | yes | Avoidable: generate a green-clothes version of the master once and edit from that |
| upscale / remove_background / vectorize | 53 | mixed | Many were on sheets that were thrown away |

## Mistakes and their fixes (don't repeat these)
1. **Generated separate part sheets** (body parts, face, hands, joints). They never match the master. → Cut every piece from ONE
   master; make poses as arm-only edits of that master.
2. **Bent one mesh arm for every gesture.** The forearm rotation was wrong (palm and back of hand vs forearm), and the
   elbow tore open in the flex. → Research the anatomy first; use pre-posed whole-arm drawings per gesture and swap them.
3. **Judged forearm rotation from the hand side.** → Judge it from the elbow. A peace sign with the elbow down and palm out is pronated; a wave with the elbow out is neutral.
4. **Used the A-pose (spread palms) as the standing pose.** → The natural stance is the default; the free arm in a one-arm gesture is always natural.
5. **Tattooed arm longer and bigger** (cut from a different drawing and rotated differently). → Mirror-overlay check; both arms mirror images, with the tattoo the only difference.
6. **Fed real photos to gens** → painterly output. Use photos only to write the spec.
7. **Spent n=2/n=3 by default.** → n=1, and regen only if the spec check fails.
8. **Trusted editor captures.** Editor captures don't run the state machine, so they hid two serious bugs:
   - headTurn rotation was bound in degrees while the runtime reads radians, so the head turned upside down;
   - a one-frame missing arm from two layers keying the same opacity.
   → Always test in the runtime harness and measure recorded transitions frame by frame.
9. **The .riv export only contained the first artboard** while the old v1/v2 artboards existed (`includeInExport` didn't help). → One artboard per file; delete or move old versions after a .rev backup.
10. **Cross-fading arm swaps** made the arm vanish for 2–4 frames. → Drawing swaps are instant (duration 0).
11. **White streaks in the face** were in the master art: bright skin slivers between the bangs. → Fix in code
    (`tools/fix-fringe-streaks.js`, recolour to shadowed forehead tone). Filling with hair colour looked jagged.
12. **Test video stretched** because the drawing surface wasn't resized after hiding the panel. → `resizeDrawingSurfaceToCanvas()` after any CSS size change.
13. **Rive froze** on a heavy auto-generated mesh. → Light meshes only (≤ 50 vertices), or no mesh for pre-posed art.

## What worked (keep doing these)
- One master + registration by code onto the rig body; pixel-exact master coordinates in `rig.json`.
- Edits that change only the arms (`"Edit ONLY … keep everything else pixel-identical"`) keep the body and style consistent.
- Free code fixes instead of regenerating: symmetry warp, despill and defringe, chroma-green cutting, streak fix, mirror checks.
- The runtime harness (`runtime-test/`): drive every VM field → contact sheets; record → frame-coverage measurement.
- A per-gesture anatomy spec written before generating.

## Files
- Rig data: `v3/cut/rig.json` (pieces, joints, face, faceSwaps, head34, gestureArms); pieces in `v3/cut/`.
- Research: `v3/research/ARM-HAND-REFERENCE.md`, `v3/research/GESTURE-SPEC.md`.
- Tools: `tools/` (gesture-arm-cut*.js, gesture-preview.js, fix-fringe-streaks.js, head34-fit.js, compose-check.js, register.js …).
- Runtime harness: `runtime-test/` (index.html, drive.js, sheet.js, record.js; `npm i` restores node_modules).
- Rive backups: `backup_rev/` (.rev with embedded assets). The live file is Rive cloud "BTS" (2754430).
