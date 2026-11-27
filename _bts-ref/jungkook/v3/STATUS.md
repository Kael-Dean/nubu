# Jungkook Rive rig — status (paused 2026-11-26)

The owner paused the work. Resume only when told to.

## Where things are
- Rive file **BTS** (fileId 2754430, https://editor.rive.app/file/bts/2754430). Do not touch the "Sara" file.
  - `Jungkook_v1_old` (1-2): first build from mismatched generated sheets. Rejected.
  - `Jungkook_v2_old` (1-6758): master-cut v2, real tattoo warped on. Rejected: the arms/hands looked drawn by
    different artists, the tattoo broke at the shoulder, and hands faced the wrong way. Its VM was renamed `JungkookVM_v2_old`.
  - `Jungkook` (2-2055): **v3 build, only just started when paused.** It has the root and pelvis bones plus 11 hand
    images at the artboard root (handR_natural_side/fist/wave/peace/thumbsup/point/fingerheart/mic,
    handL_natural_side/fist/fingerheart). Body pieces, face, the other bones, meshes, VM and state machine are NOT built yet.
    Check whether a new `JungkookVM` exists before creating one.
- **v3 kit (approved direction, ready to build):** `D:\NUBU\_bts-ref\jungkook\v3\cut\` → `rig.json` has every piece,
  joint, draw order, face sprite, face swap and hand pose with master-px coordinates.
  - Source master: `v3\master3b_nobg.webp`. It has symmetric arms, palm-forward rest hands, and the real tattoo
    sleeve continuous from the right shoulder/chest to the wrist.
  - Verified composites: `_composite_rest.png`, `_composite_raise.png` (lats + caps), `_composite_stand.png`
    (natural stance), `_hands_preview.png` (all 10 hand poses × 2 sides).
- The full build brief for the rig agent is the last SendMessage in the session. The same content is below.

## Build brief (v3)
- Placement s=0.46, ax=(mx−1380)·s+540, ay=(my−2000)·s+960. Uniform scale only. Uploads ~0.7× master (hands/face full size).
- drawOrder: latR, latL, thighR, shinR, thighL, shinL, shoeR, shoeL, pelvis, armL, handL, torso, capL,
  head_blank(+face), armR, handR, capR.
- Light meshes only (≤50 vertices, subdivisions ≤1; heavy generateMesh froze Rive once).
- Bind the torso to pelvis/spine/chest/neck only, NOT clav.
- Each arm is one image mesh. Thigh and shin are separate pieces, each bound 100% to one bone. Caps are bound 100% to clav.
- The clav follows the arm about 5° in raised gestures.
- lats: opacity 0 at rest; they fade in when an upper arm rises >30°.
- VM `JungkookVM`: expression (neutral/happy/laugh/surprised/wink/sad), gesture (none/wave/fingerHeart/peace/
  thumbsUp/flex/point/holdMic), talking, headTurn, stance (aPose/natural).
- Hand poses:
  - aPose uses the master palm hands.
  - natural uses the arms rotated about 17° toward the body + *_natural_side hands.
  - Raised gestures use the right hand's back-of-hand tattoo assets.
- Captures go to `captures_v3\`.

## Owner requirements (learned the hard way)
- The rig must look EXACTLY like the source. No eyeballed placement. Never stretch pieces from different sheets.
- Both sides must be the same drawing; the only difference is the tattoo (right arm, right chest inside the neckline, back of the right hand).
- At rest, the palms face forward. Back-of-hand tattoos show only in gestures. A natural standing pose must be supported.
- The shoulder/chest tattoo continues into the sleeve, with no break when the arms rise.
- Hands must match the clean flat style of the first hand sheet (not painterly). Don't feed real photos into hand gens.
- No seam lines at the armholes and no dark marks under the armpits; lats appear when the arms rise.

## Known gaps
- The left hand is about 9% smaller than the right because the master's left forearm is narrower.
- The chest tattoo inside the neckline is greyer than the shoulder colours.
- 3/4 head turn is not redone for v3. IK must be added by hand in the Rive editor.
- Recraft credits left: ~385. Total used: ~480.

## Tools (D:\NUBU\_bts-ref\jungkook\tools\)
cut-master-v3.js, blank-face-v3.js, split-legs.js, shoulder-caps-v3.js, lat-underlay-v3.js, scale-face-swaps-v3.js,
transfer-sleeve.js, hand-fit.js (FOREARM/FEATHER_CUT/MROW/WIN/POSES/FORCE_S env), mirror-hands-v3.js,
tone-match-hands.js, compose-check.js (rest/pose preview), register.js (align a regenerated image to the master).
Sheet splitter: ~/.claude/skills/rive-celebrity-likeness/scripts/split-sheet.js (DESPILL/DEFRINGE/ORIG/MINF).

## Update 2026-11-26 (after resume)
- v3 rig BUILT on `Jungkook` (2-2055): all pieces, bones, light meshes, face swaps, JungkookVM (expression, gesture
  none/wave/fingerHeart/peace/thumbsUp/flex/point/holdMic, stance aPose/natural, talking, headTurn), state machine Main
  (idle, stance, gesture, expression, talk, blink). Captures: captures_v3/ (latest *_v4).
- Fixes applied: skin-only shoulder caps (capR/capL 331px), clav follows arm 4° in natural stance, new hands
  handR_thumbsup_down (thumb along forearm) and handR_mic_flip (mic head toward face).
- Still open: small dark notch at the right armhole at 70° (torso armhole edge / armR mesh); holdMic sits at shoulder
  height (can't reach the chin without a cross-body forearm piece); thumbsUp can read like an index finger at small
  size; state machine never played in Rive; 3/4 head turn + IK not done. Credits left ~374.
- Hands scaled on the handR/handL bones (origin = wrist): scaleX 80, scaleY 90 (uniform 80% left a wrist step).
  Owner asked for 80%. Captures *_v5.
- Arms equalised: armR = mirror of armL silhouette + tattoo (warp-arm-to-mirror.js); R joints elbow [855,1440],
  wrist [718,1893]; right hands re-placed/size-matched. Torso right armhole band → mirrored plain skin; latR ink
  removed; capR skin-only with 70 px soft edge; armR armpit-corner vertices re-weighted 80/20 and 70/30.
- Accepted limitation: at an extreme 70° raise a small stretched-tattoo wedge shows beside the right strap
  (wave/flex are clean). Captures up to *_v13.

## Update 2026-11-26 — 3/4 head turn done
- Recraft image_edit on head_ref (shoulders/tank fixed, head turned ~35°) → upscale → remove bg. Fitted back by the
  unchanged tank/shoulders with tools/head34-fit.js; pieces cut/head34_faceLeft.png (x1161 y187) and
  cut/head34_faceRight.png (x1193 y198), neutral expression, neck fades out y800→880. rig.json → head34.
- Rive: both under the head bone at the head slot; new last SM layer `turn` (turn_front / turn_left34 < −0.5 /
  turn_right34 > 0.5, 80 ms cross-fades) hides head_blank + all face sprites in 3/4. −1 = faceLeft.
- Captures captures_v3/11_head34_* (diff vs composites ≈ rest-pose baseline). Not verified: live SM playback/fade.
  Leftover VM instances test_turnL / test_turnR can be deleted. 3/4 has no expressions/talk yet (~11 credits/direction).

## Update 2026-11-27 — runtime test
- .riv export only ever contained the FIRST artboard; owner approved deleting Jungkook_v1_old + Jungkook_v2_old.
  Full backup first: backup_rev/bts.rev (22 MB, assets embedded). Now only `Jungkook` (2-2055) exists.
- Harness: runtime-test/ (index.html test page with VM controls, drive.js = localhost + @rive-app/canvas 2.55.1,
  33 scenarios → frames/, sheet.js contact sheets). Run: `node drive.js` then `node sheet.js "<regex>" out.png cols [crop]`.
- Bug found + fixed: headTurn→head rotation bind used `{Input}*3` (runtime reads radians → head upside down at ±1).
  New converter jk3_headRot_rad `{Input}*0.05236` (±3°). Old converter jk3_headRot unused (delete by hand in data panel).
- Verified in runtime: all expressions, all gestures × both stances, talking, headTurn ±0.4/±1 incl. with happy/talking.
  Still open: holdMic below chin; 3/4 has no expressions/talk; extra VM instance `Instance` (harmless).

## Update 2026-11-27 — owner rejected arm anatomy → whole-arm gesture swaps (IN PROGRESS)
- Owner faults: palm/back-of-hand vs forearm mismatch; flex forearm detached at elbow; tattooed arm longer/bigger in natural stance.
- Research: v3/research/ARM-HAND-REFERENCE.md (anatomy, per-gesture table, joint construction, proportions, checklist);
  v3/research/GESTURE-SPEC.md (our per-gesture chain).
- New approach: each gesture = WHOLE-ARM drawing(s) (upper arm+elbow+forearm+hand, tattoo painted on the pose), made with
  Recraft gpt_image_2_medium from a natural-stance base (v3/gest/natural.png = edit of master3b_white_half), cut with
  tools/gesture-arm-cut.js (register to arm-less rig body, cut arm, feather armhole) and, for arms crossing the tank,
  tools/gesture-arm-cut-green.js (tank recoloured #00FF00). Pieces: v3/cut/gest/*_R|_L.png, coords in rig.json → gestureArms.
  Preview: tools/gesture-preview.js → v3/cut/gest/_gestures_all.png. Natural stance passes the mirror-overlay test.
- Next: owner approval, then Rive: swap these per gesture on clav bones (solo), A-pose keeps the mesh arms.
- Credits left ≈ 222.
- 2026-11-27 DONE in Rive: head art de-streaked (tools/fix-fringe-streaks.js, originals in v3/cut/_before_streakfix/);
  10 gesture arms placed (parented to chest bone, opacity swaps only, old bone/hand keys deleted, 100 ms fades);
  natural stance uses natural_R/L. Runtime verified: runtime-test/sheet_gest_v2.png, sheet_face_zoom_v2.png.
  Backup before this: backup_rev/pre_gestarms_20261127/bts.rev. Open: mid-fade not captured; unused old assets.
- 2026-11-27: default stance = natural (both VM instances); during any one-arm gesture the free arm is always natural_R/L
  regardless of stance; aPose only reachable with gesture=none. Verified: runtime-test/sheet_gest_v3.png, frames/zz_default_load.png.
- 2026-11-27 cleanup + motion check: 219 unused assets + 13 dead hand nodes + jk3_headRot deleted (backup
  backup_rev/pre_cleanup_20261127/bts.rev); .riv 6.26 MB → 4.72 MB. Arm swaps are instant (duration 0) and the gesture
  layer alone owns all 14 arm/hand opacities (gesture_none = natural, none_aPose = aPose). Live recording
  runtime-test/rec/jungkook_runtime_test.mp4 (record.js) measured frame by frame: 0 frames with a missing arm.
- 2026-11-27: record.js now calls resizeDrawingSurfaceToCanvas after hiding the panel (the first videos were CSS-stretched 1.48× wide; Rive itself was correct). Re-recorded rec/jungkook_runtime_test.mp4.
