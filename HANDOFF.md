# HANDOFF — NUBU (อ่านไฟล์นี้ก่อนเสมอเมื่อเริ่มเซสชันใหม่)

**อัปเดตล่าสุด:** 2026-11-24

## โปรเจกต์คืออะไร
ช่อง YouTube/TikTok/IG ภาษาไทย — Nubu ก้อนขนฟูหนวดผีเสื้อ เล่าข่าวเคป็อป/ประวัติ/what if แบบเพื่อนเม้ามอย
รายละเอียดเต็ม: `docs/CHANNEL-BRIEF.md` · การตัดสินใจ: `docs/DECISIONS.md`

## 🎬 ซีนแบบหนัง
ท่อนที่ควรเล่าเป็น "ซีนเหมือนในหนัง" (flashback / ช่วงพีค / cold open / what-if) → ใช้สกิล `lemo-opuscar`
เรนเดอร์เป็นคลิปสั้นแล้ววางเป็น stock ใน compose — ทำตาม `docs/CINEMATIC-SCENES.md` · library: `~/lemo-opuscar`

## ตอนนี้อยู่ขั้นไหน
- [x] Channel brief ฉบับร่าง
- [x] ตัดสินใจสไตล์ตัวละคร → 2.5D ใน Rive
- [x] จุดต่าง: เปลี่ยนชุด+ธีมสีตามวง, ผีเสื้อเหลือแค่หนวด (ดู DECISIONS.md)
- [x] ตัวฐานเปลือย 3 มุมใน `character/source/`: `nubu_front_v1.webp` (master), `nubu_3q-left_v1.webp`, `nubu_3q-right_v1.webp` (+ `nubu_original-reference.png`) พื้นเทา ~1200px
- [x] ตัดพื้นหลังภาพหน้าตรงแล้ว → `character/layers/nubu_front_cutout.png` (1080×1269, alpha, ตรวจบนพื้นมิ้นต์/เข้มแล้ว)
- [x] แยกเลเยอร์หน้าตรงรอบแรก (full-canvas ซ้อนกัน 1:1) → `character/layers/front/`: `body_base`, `antenna_L`, `antenna_R`, `eye_L`, `eye_R`, `mouth` (ประกอบกลับแล้วเหมือนต้นฉบับ)
- [x] ได้ภาพตัวเปล่าจาก AI (`character/source/nubu_front_barebody_v1.webp`) ตำแหน่งตรงภาพหลัก (คลาดไม่เกิน ~5px, สเกลต่าง ~1%) → ใช้เป็น `body_base` ใหม่ (แก้มอยู่ในตัวฐาน)
- [x] แยกเลเยอร์ v2 ครบ 9 ชิ้นใน `character/layers/front/` ลำดับซ้อนล่าง→บน: `body_base` · `arm_L` · `arm_R` · `headphones` · `eye_L` · `eye_R` · `mouth` · `antenna_L` · `antenna_R` (`_v1_body_filled.png` เป็นไฟล์ต้นทาง ไม่ใช้ใน Rive)
- [ ] จุดบกพร่องเล็กของ v2: รอยบากเล็กที่รอยต่อแถบคาด-ที่ครอบหู · แผ่นเติมใต้ก้านหนวดบนแถบคาดสีเข้มกว่าเล็กน้อย · ตัวฐานกว้างกว่าต้นฉบับ ~8px ที่ใต้แขน (เห็นเป็นมุมเล็กๆ) · ลายขนของตัวฐานต่างจากภาพหลักเล็กน้อย
- [ ] ข้อจำกัดเลเยอร์รอบแรก: (1) ใต้ก้านหนวดบนหูฟังเติมด้วยการ clone จากข้างเคียง สีอาจเข้มกว่าเล็กน้อย (2) ตาตัวฐานเป็นวงเรียบจางๆ ใช้คู่กับตา/ปากชุดใหม่จาก expression sheet (3) รัศมีเรืองแสงรอบปีกถูกตัดออก ให้สร้างเป็น glow เองใน Rive (4) ยังไม่ทำมุม 3/4 ซ้าย/ขวา
- สคริปต์: `scripts/cutout.js`, `scripts/split-front.js` (ต้อง `npm install sharp`)
- [x] ได้ภาพสีหน้า 8 + รูปปาก 7 แล้ว → `character/source/expressions/nubu_<exp|mouth>_<ชื่อ>_v1.webp` (รีวิว 2026-11-24: ตา/ก้นตรงภาพหลัก ±3px ยกเว้น neutral เลื่อนขึ้น 27px และ swoon สเกล ~0.93 — ปรับตอนดึงได้ ไม่ต้องทำใหม่)
- [x] ทำใหม่แล้วและผ่าน: `nubu_exp_sleepy_v2` (ตา ‿), `nubu_mouth_u_pursed_v2` (วงรีแนวตั้ง), `nubu_exp_pout_v2` (งอนน่ารัก) — ใช้ v2 แทน v1 ของ 3 ตัวนี้ · ตำแหน่งตาคลาด ≤8px จากมาตรฐาน (447,588)/(750,586) ปรับตอนดึงได้
- [ ] ข้อสังเกต: 14 ภาพ (ยกเว้น neutral) ติดหูฟัง/หนวด/แขนมาด้วยทั้งที่สั่งไม่ให้ → ดึงหน้าด้วยการแยกสี ไม่ใช่เทียบกับตัวเปล่า
- [x] ดึงตา/ปาก/น้ำตา เป็นเลเยอร์แล้ว → `character/layers/face/`: `eyes/eye_<state>_L|R.png` (state: open, swoon, shock, sad(+น้ำตา), pout, sleepy, laugh — รวม 14 ไฟล์) · `mouths/mouth_<ชื่อ>.png` 15 แบบ (neutral, happy, swoon, shock, sad, pout, sleepy, laugh, m_closed, a_small, a_wide, o_round, u_pursed, e_smile, tongue) · `manifest.json` เก็บตำแหน่งครอปบนแคนวาส 1080×1269 (เดียวกับเลเยอร์ตัว) · พรีวิว `preview_all_expressions.png`, `preview_faces_zoom.png` (ซ้อนบนตัวฐานครบ 15 แบบ ผ่าน)
- [ ] ข้อจำกัดเลเยอร์หน้า: ตาปิด (sleepy/laugh) ตำแหน่งตามภาพต้นฉบับไม่ได้จัดตามกึ่งกลางตา · แก้มพองของ pout (รอยย่นบนขน) ไม่ได้ดึงเป็นเลเยอร์ · ขอบอ่อน 0.8px อาจเห็นขอบครีมบางๆ บนพื้นสีเข้ม · ปาก/ตาแยกจากภาพที่ AI สร้างคนละครั้ง ลายขนใต้ปากอาจต่างเล็กน้อย (ไม่กระทบ เพราะเลเยอร์โปร่งใสทับตัวฐาน)
- [x] มุม 3/4 ซ้าย: ได้ภาพครบ 7 ภาพใน `character/source/angle34/` (`nubu_34L_barebody|m_closed|a_small|a_wide|o_round|e_smile|blink_v1.webp`) · อ้างอิง = `nubu_3q-left_v1.webp` · แผนอยู่ `docs/ANGLE-34-PLAN.md`
  - ผลตรวจ (2026-11-24): ผ่านทั้งชุด · ตัวเปล่าทับภาพอ้างอิงสนิท (ก้น 1270 vs 1269) · ตาเปิดห่างภาพอ้างอิง ≤19px · `o_round` (29) เลื่อนขึ้น ~30px และ `blink` (31) เลื่อนขึ้น ~36px → จัดตำแหน่งตอนดึง · `a_small` กับ `o_round` หน้าตาคล้ายกัน (วงรีเล็กทั้งคู่) ใช้ได้ทั้งคู่
  - ตัวละคร 3/4 สูงกว่าหน้าตรง ~17px ที่ก้น → เวลาวางในแคนวาสเดียวกันต้องเลื่อน -17px (canvas y = source y − 19, x − 57)
- [x] แยกเลเยอร์ 3/4 ซ้ายเสร็จ → `character/layers/angle34/` (แคนวาส 1080×1269 เดียวกับหน้าตรง, พื้นเท้าตรงกัน) ลำดับซ้อนล่าง→บน: `cup_far` (ที่ครอบหูไกล ซ่อนหลังตัว) · `body_base` (ตัวเปล่า AI + แถบขนใต้แถบคาด `head_fill`) · `arm_far` · `arm_near` · `headphones` (แถบคาด+ที่ครอบหูใกล้) · ตา (`face/eyes/eye_open|blink_far|near.png`) · ปาก (`face/mouths/mouth_m_closed|a_small|a_wide|o_round|e_smile.png`) · `antenna_L`, `antenna_R` · `face/manifest.json` ตำแหน่งครอป · พรีวิว `preview_all_expressions.png`, `face/preview_zoom.png`
- [x] 3/4 ขวา = กลับด้านชุดซ้าย → `character/layers/angle34R/` (ชื่อ antenna_L/R สลับให้ L=ซ้ายของผู้ชม, manifest x กลับด้าน) · แสงกลับข้าง (ตอนนี้แสงมาจากขวาบน) ถ้ารับไม่ได้ค่อยทำภาพขวาจริง
- [ ] ข้อจำกัด 3/4: แผ่นเติมใต้ก้านหนวดบนแถบคาดสีเข้มกว่าเล็กน้อยและขอบบนแถบมีรอยบากเล็ก · ตาไกลขอบหยักตามต้นฉบับ · ตัวฐานไม่มีสีหน้าอื่นนอกจาก open/blink + ปาก 5 แบบ (swoon/shock/sad/pout ใช้หน้าตรง) · แขน 3/4 ท่ายกใกล้หูฟัง (ต่างจากหน้าตรงที่แขนห้อย)
- [x] ท่ามือ (หน้าตรง) ทำด้วยการหมุน/ย่อขยาย/ย้ายเลเยอร์แขน (ไม่ต้องใช้ภาพ AI เพราะ Nubu ไม่มีนิ้ว): พารามิเตอร์ใน `character/layers/poses.json`, พรีวิว `character/layers/preview_hand_poses.png`, สคริปต์ `scripts/hand-poses.js` + `scripts/arms-soft.js`
  - ผ่าน 4 ท่า: **wave** (แขนขวาหมุน −95° โบกแกว่ง ±15°) · **cheer** (สองแขนชู ±115°) · **hold_cheeks** (สเกล 0.7 ย้ายไปที่แก้ม) · **point** (หมุน −35° สเกล 1.15 — ต้องมีขอบแคนวาสกว้างขึ้น ~150px ด้านข้าง)
  - cover_mouth v1 จาก AI ถูกปฏิเสธ (เก็บไว้ที่ `character/source/poses/..._REJECTED.webp`): แขนยาวโค้งจากท้องขึ้นมาปิดปาก ดูเหมือนงวงช้าง + แขนซ้ายยกขึ้น → ใช้ prompt v2 (ท้าย `docs/EXPRESSION-PROMPTS-FULL.md`)
  - **ตัดสินใจแล้ว (2026-11-24): ใช้ท่า gasp แทน cover_mouth** — ตัดท่าปิดปากทิ้ง (ภาพ AI v1/v2 เก็บไว้เป็นหลักฐานเท่านั้น)
  - วิเคราะห์ (ผู้ใช้เสนอให้ทำรอยต่อแขนกลืนลำตัว): ไม่แก้ปัญหา เพราะแขนยาวแค่ ~200px แต่ไหล่→ปาก 402px (ไหล่→แก้ม 127px ซึ่งใช้ได้) แขนต่อเนื่องเส้นเดียวจึงยาวเท่างวงเสมอ · ทางออก = ท่า **gasp** ใหม่ (สองอุ้งมือขนาบปาก ย่อ 0.7 ย้ายไปใต้แก้มด้านใน ระยะไหล่→มือ ~250px) ใน `poses.json` แทน cover_mouth
  - cover_mouth v2 (`character/source/poses/nubu_pose_cover_mouth_v2.webp`) ยังได้แขนยาวโค้งจากท้องคล้ายงวงช้าง และแขนซ้ายยกอีก → ข้อเสนอ: ตัดท่านี้ทิ้ง ผู้ใช้ยังไม่ตัดสินใจ (บอกว่า "อันนี้แหละ")
  - (เดิม) รอผู้ใช้สร้างภาพ cover_mouth จริงตาม prompt ใน `docs/EXPRESSION-PROMPTS-FULL.md` (ท้ายไฟล์) วางที่ `character/source/poses/nubu_pose_cover_mouth_v1.webp` → ผมจะดึงแขนด้วยการเทียบกับภาพหน้าตรงหลัก
  - **cover_mouth ยังอ่อน**: ก้อนแขนลอยกลางหน้าดูเป็นจมูก → ต้องใช้ภาพจริง (ให้ AI วาดอุ้งมือยกปิดปาก) หรือตัดท่านี้ทิ้ง
  - ลำดับซ้อนใหม่ของหน้าตรง: `body_base` → `headphones` → หน้า (ตา/ปาก) → **แขน** → หนวด (แขนอยู่เหนือหูฟังและหน้า) · แขนที่ย้ายเพิ่มเงานุ่ม (ชดเชย 8,14px เบลอ 9 สี rgb(110,70,60) โปร่ง 0.34)
  - `front/arm_L.png`, `arm_R.png` ถูกสร้างใหม่ให้ขอบด้านในนุ่ม (เดิมตัดเป็นวงรีแข็ง)
- [x] Rive MCP เชื่อมต่อแล้ว (2026-11-24): ไฟล์ "NUBU" (id 2749655, https://editor.rive.app/file/nubu/2749655) เปิดอยู่ ยังว่าง ไม่มี artboard
- [x] **Rive หน้าตรงเสร็จรอบแรก (2026-11-24)** — artboard `Nubu_Front` 1380×1269 (canvas +150px x) ในไฟล์ NUBU · asset 34 ภาพ · ลำดับ body_base → headphones → Face(Eyes 7 กลุ่ม, Mouth 15, EyesBlink) → Arm_L/R_pivot → Antenna_L/R_pivot · root pivot ที่เท้า (690,1251)
  - animations: `idle` (หายใจ 2% + หนวดแกว่ง ±3° มี delay), `blink`, `pose_rest/wave/cheer/hold_cheeks/point/gasp`, `eyes_*` 7, `mouth_*` 15
  - state machine `Main` ควบคุมผ่าน **view model `NubuVM`** (ไม่ใช่ inputs แบบเก่า): `expression` 0–7, `viseme` −1…6 (−1 = ปากของอารมณ์), `pose` 0–5, `blink` trigger · เปลี่ยนท่า 300ms cubic
  - ตรวจ: ภาพจาก Rive ตรงกับภาพซ้อนจาก PNG (คลาดเฉลี่ย 0.018/255) · ภาพ 15 ภาพใน `character/rive/captures/` ผมตรวจด้วยตาแล้วตรงพรีวิวทุกภาพ
- [x] **Rive รอบสอง (2026-11-24):** เงาแขน `shadow_arm_L/R` (ใน Arm pivot ใต้แขน, 0 ตอนพัก, 1 ในท่าที่แขนขยับ — wave/point เปิดเฉพาะแขนขวา) · แสงเรือง `glow_antenna_L/R` (blend screen, idle ยืดเป็น 6 วิ แสงซ้าย/ขวาสลับจังหวะ 75↔100%) · `auto_blink` 7 วิ วน (กะพริบ 1.6 วิ, สองที 3.4 วิ, 5.2 วิ; ปิดเมื่อ expression ≥ 6) · asset 38 ไฟล์ `includeInExport=true`, embedded (อ่านกลับยืนยันแล้ว) · ภาพตรวจ `character/rive/captures/round2/` ผ่าน
  - ✅ ผู้ใช้ทดสอบใน Rive แล้ว (2026-11-24): เล่น state machine `Main` ที่ expression = 7 → ตา ^^ ตลอด ไม่กะพริบ = เงื่อนไข auto_blink ถูกต้อง (ที่เห็นกะพริบก่อนหน้าเพราะ editor ใช้ค่าเก่า ต้องกด stop/play ใหม่หลังแก้ state machine) · คืนค่า expression เป็น 0 แล้ว (อ่านกลับยืนยัน)
  - วิธีตั้งค่าทดสอบผ่าน MCP: view model `NubuVM` (2-1141) มี 2 instance `Default` (2-1151) และ `Instance` (2-1142) · ค่า number ตั้งที่ key 575 (propertyvalue) + 576 (playbackvalue) · ต้องเลือก `Main` (ไม่ใช่แอนิเมชันเดี่ยว) แล้วกด play
  - ค้าง: (b) editor ค้างในโหมด animate → จำลอง state machine ไม่ได้จนกว่าจะสลับเป็นโหมด Design (c) เงาท่า wave หมุนตามแขนไปอยู่ขวาบนของอุ้งมือเล็กน้อย (d) ยังไม่มีใครดูการเคลื่อนไหวจริงด้วยตา (e) ไฟล์ .riv จะใหญ่ (PNG เต็มแคนวาส)
- [ ] ค้างจาก Rive รอบแรก (ข้อ 2–5 แก้แล้วในรอบสอง): (1) **ยังไม่มีใครกด play ดูการเคลื่อนไหวจริง** (ภาพจับเป็นท่านิ่ง) (2) เงาใต้แขน — Rive ใส่ drop shadow ให้ภาพ raster ไม่ได้ ต้องอบเป็น PNG เงาแยก (3) แสงเรืองรอบหนวด (4) กะพริบอัตโนมัติแบบสุ่ม (5) ทุก asset ขึ้น `includeInExport: false` — ต้องตั้ง Embedded ก่อน export .riv (6) ไฟล์อาจใหญ่ (ภาพเต็มแคนวาส 6 ชั้น) ควรครอปภายหลัง
- [x] **Rive รอบสาม (2026-11-24): มุม 3/4** ใน artboard เดิม · `Root` → `View_Front` / `View_34L` / `View_34R` (34R = กลุ่ม 34L พลิกกระจก scaleX −100% เพราะภาพขวาเป็นภาพกลับด้านทุกพิกเซล, ชิ้นข้างในขึ้นต้น `R_`) · asset ใหม่ 18 ไฟล์ embedded · ค่าควบคุมใหม่ `view` 0/1/2 · layer `View` 3 state ค้าง + 6 state หันหัว (7 เฟรม ≈117ms, บีบ scaleX 96% / scaleY 102% ที่เฟรม 4 แล้วสลับมุม) · หน้า 3/4: ตา open (expr 0–5) / blink (6–7), viseme 4→o_round 6→a_wide, ปากตาม expression: neutral/sad/pout→m_closed, happy/swoon/laugh→a_wide, shock→o_round, sleepy→a_small · pose ไม่มีผลใน 3/4 (แขนพัก)
  - ตรวจ: ภาพ `character/rive/captures/round3/` ตรงกับภาพซ้อนจาก PNG (ไม่เยื้อง) · หน้าตรงหลังย้ายกลุ่มต่างจากรอบสอง 0 พิกเซล · ค่า view model ของ Default คืนเป็นค่าเริ่มต้นแล้ว
  - ✅ ผู้ใช้ทดสอบการหันหัวใน Rive แล้ว (2026-11-24): เปลี่ยน view ระหว่างเล่น `Main` ได้ หันเรียบร้อย (แก้ค่าระหว่างเล่นได้จากแผง Data ซ้ายมือ หรือแท็บ Testing ด้านล่าง)
  - ค้าง: หนวดมุมขวาแกว่งกลับทิศเพราะพลิกกระจก · แสงในมุมขวากลับข้าง · ท่ามือของ 3/4 ไม่มี · instance "Instance" มี viseme 0 (ไม่ได้ใช้เป็นค่าเริ่ม)
- [x] **Pipeline เสียง → รูปปาก → วิดีโอ ใช้งานได้แล้ว (2026-11-24)** — รายละเอียดทั้งหมดใน `docs/VOICE-PIPELINE.md`
  - เสียง Nubu = ElevenLabs **Sakuya** (`8kgj5469z1URcH4MB2G4`), eleven_v4 + th + timestamps · แผน Creator · คีย์ใน `.env.local` (ห้ามเปิด)
  - ขั้นตอน: `node --env-file=.env.local pipeline/tts.mjs --voice 8kgj5469z1URcH4MB2G4 --text-file script.txt --out <dir>` → `node pipeline/thai-visemes.js <dir>/alignment.json timeline.json [--expression 1 --wave-first 1.6]` → `node pipeline/talk-motion.js timeline.json <dir>/voice.mp3` → `node pipeline/render.js timeline.json <out> --audio <dir>/voice.mp3 --riv character/rive/export/round5/nubu.riv`
  - Rive รอบ 4–5: ปากใหม่ viseme 7 f_teeth · 8 tongue_up · 9 s_teeth · 10 a_mid · TalkMotion (bob/tilt) · artboard 1380×1389 · **.riv ปัจจุบัน = `character/rive/export/round5/nubu.riv`**
  - ตัวอย่างล่าสุด: `episodes/test01/out_sakuya_v4/` (webm โปร่งใส + mp4 ตัวอย่าง) — **ผู้ใช้ยืนยันว่าปากเข้ากับเสียงแล้ว** (thai-visemes v3: สระเริ่มเร็ว, ปากนำเสียง 2 เฟรม, คั่นปากทุกการกระโดดใหญ่)
- [x] **นโยบายภาพ/ฟุตเทจ = B สมดุล** (2026-11-24) — ภาพนิ่งทางการ ≤ 3 ภาพ/คลิป, ≤ 3 วิ/ภาพ, กรอบเล็ก, เครดิตบนจอ, ไม่ใช้บนปก · ห้ามคลิปวิดีโอ/เสียงต้นฉบับ/แฟนแคม/AI หน้าไอดอล · รายละเอียด `docs/MEDIA-RIGHTS.md` · จดทุกชิ้นใน `assets/licensed-media/LOG.csv`
- [ ] ขั้นต่อไป: ลองคลิปจริง EP01 (`episodes/ep01_bts_rajamangala/script_draft.md` — ต้องเติมข้อมูล [ ] 5 จุดจากประกาศจริงก่อน) · ตัดบรรทัด "ภาพ:/ข้อความบนจอ:" อัตโนมัติก่อนส่ง TTS · ประกอบกับภาพข่าว+ซับ · ครอปภาพเต็มแคนวาสเพื่อลดขนาด .riv
- [ ] ขั้นต่อไปหลังนั้น: นำเข้า Rive (ตั้ง artboard 1080×1269, จัดลำดับเลเยอร์, rig, state machine) · ท่ามือ 5 ท่า
- [ ] ยังไม่ได้ทำ: ท่ามือ 5 ท่า, ด้านข้างซ้าย/หลัง (ไว้ทีหลัง)
- [ ] ปัญหาที่เจอในรอบแรก: แขนในมุม 3/4 ยกใกล้หูฟัง (ซ้อนทับ) · ภาพ ~1200px ต่ำกว่า 2048 · ยังมีพื้นหลังเทา ต้องตัดขอบขนฟู · Python ไม่ได้ติดตั้งในเครื่อง (ใช้เครื่องมืออื่นตัดพื้น)
- [ ] Character sheet (ท่า/มุม/สีหน้า) ด้วย image generator
- [ ] แยกเลเยอร์ → `character/layers/`
- [ ] Rig + state machine ใน Rive (idle/พูด/ดีใจ/ตกใจ/เศร้า/ฟังเพลง) → `character/rive/`
- [ ] ทดลองคลิป 60 วินาที + จับเวลา (เกณฑ์ ≤ 1–1.5 ชม./คลิป)
- [ ] ยืนยันกลุ่มแกน (หญิง 18–28) และเดือนเปิดตัวเพื่อนอีก 2 ตัว (หลังเดือนที่ 2)

## โครงโฟลเดอร์
- `docs/` brief, decisions · `character/{source,layers,rive}` · `episodes/` · `scripts/` สคริปต์ไทย
- `assets/audio`, `assets/licensed-media` (เฉพาะที่มีสิทธิ์ + จดแหล่งที่มา) · `exports/` · `comments-bank/` คอมเมนต์ดีๆ

## ข้อควรจำ
- ตอบผู้ใช้เป็นภาษาไทยเสมอ
- Rive MCP เชื่อมไม่ได้ (ECONNREFUSED) ต้องเปิด Rive desktop พร้อมไฟล์ก่อน
- กฎช่อง: ไม่สปอย, ไม่ what-if ชีวิตส่วนตัว, บอกแหล่งข่าว, บอกว่าใช้ AI
- ห้าม publish/โพสต์เอง — ส่งของพร้อมใช้ให้ผู้ใช้กดเอง

## 2026-11-25 — ชุด BTS + สีหน้าเหนื่อยใจ เสร็จ, EP01 เรนเดอร์ชุด BTS แล้ว
- Rive ปัจจุบัน: `character/rive/export/round7/nubu.riv` — VM `outfit` (0 ไม่ใส่ / 1 BTS) · expression 8 = sweat (เหนื่อยใจ, มีหยดเหงื่อไหล, ไม่กะพริบ)
- ชุด BTS: front = หูฟังเดิม + ผิวไหมพรม (`scripts/costume-fit.js`) · 3/4 = หัวทั้งชิ้นจากรูปเก็บขอบ `nubu_costume_bts_34L_cleanup_v1` ตัดในขอบตัวเดิม (`scripts/compose-34-outfit.js` FULLHEAD=730 AFFINE=79,117,1.029,554,562.5 → `scripts/finish-34.js` → ไฟล์ใน `character/layers/costume/bts/rive/`)
- กฎ: ชุดต้องอยู่ในขอบตัวเดิมของ rig, รูป AI ใช้แค่ผิว/สี (ดู memory nubu-costume-silhouette-rule)
- EP01: `episodes/ep01_bts_rajamangala/render/nubu_bts/nubu_talk.webm` (พื้นโปร่งใส) + `_preview.mp4` · cues ใน `render/cues.json` (outfit 1 ตั้งแต่ต้น, "หลังคอนเสิร์ต" = expression 8) · สคริปต์ใหม่ `pipeline/acting.js`
- ยังไม่ทำ: ระบบประกอบภาพ (ฉากหลัง/แผนที่/ซับ/แหล่งข่าว/ทีเซอร์ 9:16)

## 2026-11-25 (night) — EP02 "2,797 วัน" + Rive round 8
- **Rive round 8** (`character/rive/export/round8/nubu.riv`): expression 9 teary (ตาซึ้งสั่น) · 10 lookup (มองขึ้นสงสัย) · 11 happycry (ตา ^^ + น้ำตาไหลวน) · pose 6 hug (มือแนบอก) · 7 listen (จับหูฟัง โยกช้า) · 8 open_arms (กางแขนโยก) · 9 hold_light (ชูแท่งไฟม่วงทั่วไป โบก) · VM ใหม่ `prop` (0 ไม่มี / 1 หน้ากากอนามัย) · expression 9–11 ไม่กะพริบ (เงื่อนไข ≥6 เดิม)
  - ภาพวาดจาก SVG: `scripts/svg-face-fx.js` → `character/layers/face/eyes/eye_teary|lookup_*.png`, `face/fx/fx_tear*.png`, `layers/props/prop_mask|glowstick.png` · พรีวิวโดยไม่ใช้ Rive: `scripts/preview-pose.js specs.json out.png`
  - **บทเรียน:** ตั้งค่า x/y ผ่าน MCP ตอน editor อยู่โหมด Animate ไม่ติด (เป็นค่าชั่วคราว) → ต้องให้ผู้ใช้สลับเป็น Design ก่อน · group_editor สร้างกลุ่มพร้อม offset (−690,−1371) ต้องตั้ง 0,0 เอง
- เสียง: `pipeline/speed-voice.js <in> <out> 1.08` (rubberband คงคีย์ + สเกล alignment) · EP02 ดิบ 2:54 → 2:41
- ฉากใหม่ใน compositor: `counter` (ตัวนับ odometer + สนามวาดพร้อมแสงม่วงคลื่น), `years` (ปฏิทินพลิกปี + สติกเกอร์ไอคอน), `photos` (ภาพมีไลเซนส์ในกรอบ print + เครดิต) · ไอคอนใหม่ใน `_runtime.js` (mask, laptop, chip, music, globe, hourglass, cap, briefcase, house, family, calendar, glowstick)
  - **ระวังชื่อคีย์ชนกับคีย์ของฉาก** (`label`, `end`, `start` เป็นของ scene) → counter ใช้ `unit`, years ใช้ `finale`

## 2026-11-25 (late) — EP01 short 9:16 delivered (v7)
- Final: `exports/ep01_9x16.mp4` (1:33, voice 1.25x, music gap 4 LU / duck 5 dB = channel reference settings, template `pipeline/compose/templates/ep01_reference_compose.json`; 1.15x backup `exports/ep01_9x16_v17_speed115.mp4`, voice backups voice/v3_speed1x, v4_speed115).
- Compositor: `pipeline/compose/` (README inside) + `episodes/ep01_bts_rajamangala/compose.json`. Fonts pairing A (Playpen Sans Thai + IBM Plex Sans Thai Looped), zine theme, transit-diagram map, centred subtitles (x=540, column 120–960).
- Voice tail spliced (new share/follow CTA); old take in `voice/v2_before_tail/`. `pipeline/tts.mjs` now supports `--prev`.
- Talk motion: spring-smoothed bob/tilt (`pipeline/talk-motion.js` defaults); Rive pose 250 ms / expression 120 ms blends.
- Stock + photo licences: `assets/licensed-media/LOG.csv` (Wikimedia photo needs its credit line).
- Profile picture: **B dark plum** chosen → `brand/profile/nubu_profile_FINAL.png` (1080×1080, no outfit, no text). Background #2B1745.
