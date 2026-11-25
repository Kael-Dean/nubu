# Pipeline เสียง → รูปปาก → วิดีโอ (วิธี 3: ตามตัวอักษรในสคริปต์)

ตัดสินใจ 2026-11-24: ใช้เสียง AI (ElevenLabs) + เวลาของตัวอักษรที่ TTS ส่งกลับ แปลงสระไทยเป็นรูปปาก แล้วป้อนค่า `viseme` ใน Rive

## ขั้นตอน
1. **สคริปต์ไทย** `episodes/<ep>/script.txt`
2. **TTS + เวลาตัวอักษร**: ElevenLabs endpoint `text-to-speech/{voice_id}/with-timestamps` → `voice.mp3` + `alignment.json` (ตัวอักษร + เวลาเริ่ม/จบ) — ต้องใช้โมเดลที่รองรับภาษาไทย (ตรวจตอนทดลอง)
3. **แปลงเป็นรูปปาก** `scripts/thai-visemes.js` → `visemes.json` [{t, viseme}]
   - ปิด m_closed (0): ม บ ป + ช่วงเงียบ/เว้นวรรค
   - อ้าเล็ก a_small (1): ค่าเริ่มต้นของเสียงอื่น
   - อ้ากว้าง a_wide (2): า ะ ั แ
   - กลม o_round (3): โ อ (สระออ) เาะ
   - จู๋ u_pursed (4): ู ุ ือ
   - ยิ้ม e_smile (5): ี ิ เ (เดี่ยว)
   - ต้องจัดการสระหน้า (เ แ โ ใ ไ) ที่เขียนก่อนพยัญชนะแต่ออกเสียงทีหลัง และสระประสม (เอา เอือ เอีย)
   - ทำให้เนียน: ค้างรูปปากอย่างน้อย ~60ms, ปิดปากเมื่อเงียบ > 120ms
4. **Export .riv** จาก Rive (ไฟล์ NUBU, artboard Nubu_Front)
5. **Render**: หน้าเว็บ Rive runtime (@rive-app/canvas) เดินเวลาทีละเฟรม (30fps) ตั้ง `viseme` ตามไทม์ไลน์ → Playwright จับภาพทีละเฟรม → ffmpeg รวมเสียง
6. **ผลลัพธ์**: `nubu_talk.webm` (พื้นโปร่งใส สำหรับซ้อนบนภาพข่าว) + `nubu_talk.mp4` (พื้นสี ไว้ดูตัวอย่าง)

## ทดลอง render แล้ว (2026-11-24) ✅
- export: `character/rive/export/nubu.riv` (4.0 MB, ภาพฝังครบ) ด้วย MCP `export_file`
- `pipeline/render.html` + `pipeline/render.js`: Rive runtime ในเว็บ + **นาฬิกาปลอม** (หลอก requestAnimationFrame ให้เดินทีละ 1/FPS) → ผลทุกเฟรมแน่นอน · ตั้งค่า view model ผ่าน `window.__set(name, value)` / `__fire('blink')`
- ใช้: `node pipeline/render.js <timeline.json> <outDir> [--audio voice.mp3] [--w 690 --h 635] [--fps 30]` · timeline = `{duration, events:[{t, set:{viseme,expression,pose,view}}, {t, fire:'blink'}]}`
- ทดสอบ: `episodes/test01/timeline_mock.json` (รูปปากจำลอง + โบกมือ + หันหัว 3/4) → `episodes/test01/out/nubu_talk.webm` (โปร่งใส VP9 alpha, 745 KB / 5 วิ ที่ 690×635) + `nubu_talk_preview.mp4` (พื้นมิ้นต์) · 150 เฟรม ปาก/ท่า/หันหัว/กะพริบอัตโนมัติ ทำงานถูก
- **บั๊กที่เจอ:** ตั้ง `viseme` = −1 หลังพูดจบ ปากยังค้างเป็น m_closed แทนที่จะกลับเป็นปากของ expression (happy) → ต้องแก้ transition ใน layer Mouth ของ state machine

## ✅ Nubu พูดด้วยเสียงจริงครั้งแรก (2026-11-24)
- `pipeline/thai-visemes.js <alignment.json> <timeline.json> [--expression 1] [--wave-first 1.6] [--tail 0.6]` แปลงเวลาตัวอักษรไทย → รูปปาก: า ะ ั แ ใ ไ ำ = อ้ากว้าง · ิ ี ึ ื เ = ยิ้ม · ุ ู = จู๋ · โ และ อ (เป็นสระ) = กลม · ม บ ป พ ภ ผ ฟ ฝ = ปิด · พยัญชนะอื่น = อ้าเล็ก · เว้นวรรค/เครื่องหมาย > 0.12 วิ = ปิด · ๆ = ปิดแล้วเปิดซ้ำ · ถือรูปปากขั้นต่ำ 0.06 วิ กันกะพริบ
- ประโยค Sakuya 7.28 วิ → 40 ครั้ง (5.5 ครั้ง/วิ) · render `episodes/test01/out_sakuya/` (nubu_talk.webm โปร่งใส alpha_mode 1 + nubu_talk_preview.mp4) ยาว 7.87 วิ
- ตรวจเฟรมสุ่ม 10 จุด: ปากตรงกับที่ตั้งทุกจุด · ท้ายคลิป viseme −1 กลับเป็นปาก happy ได้ (บั๊กที่เห็นในรอบจำลองไม่เกิดรอบนี้ — อาจเกิดเฉพาะหลังหันหัว ยังไม่ได้ตรวจ)
- render.js แก้: เติมเสียงเงียบด้วย `apad=whole_dur` + `-t` (เดิม `apad` + `-shortest` ใน MP4 ไม่หยุด) · ครอปให้ความกว้าง/สูงเป็นเลขคู่สำหรับ x264

## รอบปรับความสมจริง (2026-11-24)
- ปากใหม่ 4 แบบ (front): `mouth_f_teeth` (viseme 7: ฟ ฝ) · `mouth_tongue_up` (8: ล น ท ด ต ถ ธ ร ...) · `mouth_s_teeth` (9: ส ซ ศ ษ ช ฉ จ) · `mouth_a_mid` (10: คั่น) — ภาพต้นฉบับ `character/source/expressions/nubu_mouth_{f_teeth,tongue_up,s_teeth,a_mid}_v1.webp`, ดึงด้วย `scripts/extract-faces.js` (19 ปาก) · ว → จู๋ (4)
- `thai-visemes.js` v2: ใช้ปากใหม่ + ใส่ a_mid คั่น ~0.05 วิ เมื่อกระโดดระหว่างปากเกือบปิด (0/7/9) กับอ้ากว้าง (2) · ประโยค Sakuya: 49 ครั้ง (6.7/วิ), a_mid 3 ครั้ง
- `talk-motion.js <timeline> <voice.mp3>`: เพิ่ม `bob` (0..1 จาก RMS ต่อเฟรม attack เร็ว release ช้า) และ `tilt` (−1..1 เปลี่ยนข้างทุกต้นวลีหลังเงียบ ≥ 0.25 วิ, กลับ 0 เมื่อเงียบ > 0.6 วิ, seed คงที่) ทุกเฟรม · Rive (รอบ 4) ผูก TalkMotion: scaleY +3%×bob, scaleX −1.5%×bob, rotation 2.5°×tilt
- `render.js --riv <path>` เลือกไฟล์ .riv ได้
- Rive รอบ 4 → `character/rive/export/round4/nubu.riv` (4.18 MB) · converter: scaleY `1.0+0.03*{Input}`, scaleX `1.0-0.015*{Input}`, rotation เรเดียน `{Input}*2.5*π/180` (ตัวแปลงเก่า `tilt_to_rotation` ค้างในแผง Data ไม่ได้ใช้ ลบเองใน editor ได้)
- ✅ render ทดสอบ `episodes/test01/out_sakuya_v2/` (เล่น state machine จริง): ปาก viseme 7–10 ขึ้นตรงเวลาครบ · tilt ขยับตัวจริง (centroid x สัมพันธ์ tilt 1.00) · bob ทำให้ตัวแคบลงตามทิศถูก (สัมพันธ์ −0.47 ปนกับการเอียง)
- ✅ **แก้แล้ว (Rive รอบ 5):** artboard `Nubu_Front` = **1380 × 1389** (+120 ด้านบน), `Root` ย้ายลง +120 → จุดเท้า (690, 1371) · **ไฟล์ปัจจุบัน `character/rive/export/round5/nubu.riv`** (4.18 MB) · render ค่าเริ่ม 690×695 · ทดสอบ `episodes/test01/out_sakuya_v3/`: 0/236 เฟรมแตะขอบบน (แถวบนสุด 33 จาก 695) · ขอบล่างเหลือแค่ 4 px (ครึ่งสเกล) — ถ้าเพิ่ม tilt/ท่าที่เท้าขยับ ควรเพิ่มพื้นที่ล่าง · ตัวละครเหมือนรอบก่อน (ต่างสูงสุด 3/255) · MCP `resizeArtboard` ไม่ติด ต้องตั้ง property `h` (key 8) ตรง
- (ประวัติ) ⚠️ **แสงหนวดถูกตัดที่ขอบบน artboard** (158/186 เฟรม alpha แตะ y=0) — แสงเรืองล้นขอบ artboard และ bob ยืดตัวสูงขึ้นอีก 3% → ต้องขยาย artboard ด้านบน (~120 px) แล้วเลื่อน Root ลง

## แก้ปากช้า/ไม่นุ่ม (2026-11-24, ผู้ใช้บอกว่าปากช้ากว่าเสียงเล็กน้อย)
- `pipeline/sync-check.js <timeline> <voice.mp3> <framesDir>` วัด 3 ขั้น · ผล: **render ตรงกับ timeline 0 เฟรม (r 0.95)** → ปัญหาไม่ได้อยู่ที่ Rive/render · เวลาตัวอักษร ElevenLabs ตรงกับจุดเริ่มเสียงจริง ±0.05 วิ (ยกเว้นตัวแรกที่ 0.00 ขณะเสียงเริ่ม ~0.13) · การเทียบความกว้างปากกับความดังเสียงตรงๆ ใช้วัดไม่ได้ (r ~0.1)
- ต้นเหตุ: (1) ปากเปลี่ยนตอนถึงตัวสระ ซึ่งช้ากว่าเสียงสระจริงในพยางค์ พยัญชนะ+สระ (2) ไม่มีการให้ปากนำเสียง
- `thai-visemes.js` v3: **`--pull 0.5`** ดึงสระที่เขียนหลังพยัญชนะให้เริ่มกลางพยัญชนะ (พยัญชนะที่มีรูปปากเฉพาะยังเห็นอย่างน้อย 2 เฟรม) · **`--lead 0.067`** ปากนำเสียง 2 เฟรม · คั่นทุกการกระโดด ≥ 2 ระดับความกว้าง (ไม่ใช่แค่ปิด↔อ้ากว้าง) ด้วย a_small/a_mid ~0.05 วิ · ลบรูปซ้ำติดกัน
- ✅ **ผู้ใช้ยืนยัน (2026-11-24): จังหวะปากเข้ากับเสียงแล้ว** → ใช้ค่า v3 เป็นค่ามาตรฐาน (`--pull 0.5 --lead 0.067 --mid-step 0.05`)
- ผล v3 (`episodes/test01/out_sakuya_v4/`): ปากเปลี่ยนเร็วขึ้น median 67 ms (สูงสุด ~190 ms ที่สระ) · 51 ครั้ง (7/วิ) · ถ้ายังไม่นุ่มพอ ขั้นต่อไป = crossfade ปาก 2 เฟรมใน Rive หรือปากเด้งเล็กน้อยตอนเปลี่ยน

## สิ่งที่ต้องมี
- [x] Playwright 1.65.1 ใน `D:\NUBU` (ผู้ใช้อนุญาต 2026-11-24) · ทดสอบเปิด Chromium จากสคริปต์ได้ (ใช้ browser ที่มีในเครื่องอยู่แล้ว)
- [x] ffmpeg 6.1.1 ผ่าน `ffmpeg-static` → `D:\NUBU\node_modules\ffmpeg-static\ffmpeg.exe` (อนุมัติ install script แล้ว 2026-11-24)
- [x] `@rive-app/canvas` 2.55.1 ใน `D:\NUBU\node_modules`
- `D:\NUBU\package.json` + `.gitignore` (node_modules/, .env)

## ElevenLabs (เช็ก 2026-11-24 — ราคาเปลี่ยนบ่อย ต้องดูหน้าราคาจริงก่อนจ่าย)
- Free $0 / 10,000 เครดิต · Starter $6 / 30,000 · Creator $22 / ~121,000 · Pro $99 / 500k–600k (หน้าทางการ 2 หน้าตัวเลขไม่ตรงกัน)
- **ภาษาไทยรองรับใน Eleven v3** (ตามเอกสาร) · Flash v2.5 ไม่แน่ใจว่ารองรับไทย
- **ยังไม่ยืนยัน** ว่า Eleven v3 ส่งเวลาตัวอักษร (with-timestamps) กลับมา → ถ้าไม่ได้ ทางสำรองคือส่งเสียง+สคริปต์ไปหาเวลาตัวอักษรภายหลัง (ต้องตรวจว่า ElevenLabs มี API แบบนี้ที่รองรับไทยไหม)
- ประมาณการ (ยังไม่ได้วัด): ถ้าเสียงไทย ~1,000 ตัวอักษร/นาที และทำ ~20 คลิป × 3 นาที/เดือน ≈ 60,000 เครดิต/เดือน → แผน Creator พอ, Starter ไม่พอ · วัดจริงจากคลิปแรก
- ต้องเช็กเงื่อนไขการใช้เชิงพาณิชย์ของแผนฟรีก่อนลงคลิปจริง
- [x] ElevenLabs เชื่อมต่อด้วย `npx @elevenlabs/cli onboard` (OAuth ในเบราว์เซอร์, 2026-11-24) → คีย์อยู่ใน **`D:\NUBU\.env.local`** (ไม่ใช่ `.env`) gitignored แล้ว · ห้ามเปิด/พิมพ์ไฟล์นี้ ใช้ `npx @elevenlabs/cli@latest onboard check --env-path .env.local` ตรวจ · สิทธิ์ที่ได้รวม `text_to_speech` และ **`forced_alignment`** (ทางสำรองหาเวลาตัวอักษรจากเสียง+สคริปต์)
  - SDK `@elevenlabs/elevenlabs-js` 2.79.0 ติดตั้งแล้ว · โหลดคีย์ด้วย `node --env-file=.env.local ...` · `onboard check` ผ่าน (key ok, SDK declared+imported) · คู่มือ ElevenLabs อยู่ใน temp (`%TEMP%\elevenlabs-skills-PD4Qg4`) ไม่ได้อยู่ในโปรเจกต์
  - **แผนฟรีใช้เสียงจาก Voice Library ผ่าน API ไม่ได้ (402 paid_plan_required)** ใช้ได้แค่เสียง premade
  - รุ่นโมเดลปัจจุบัน (ตามคู่มือ): `eleven_v4` ค่าเริ่ม 90+ ภาษา · `eleven_v3` 70+ · flash_v2_5 32 ภาษา
  - `pipeline/eleven-voices.mjs` ค้นเสียง (อ่านอย่างเดียว ไม่ใช้เครดิต) → `pipeline/out/voices.json` · ไม่มีเสียงไทยที่ติดป้าย "เด็ก" ในคลัง (มีแต่ young/middle_aged)
  - ตัวเลือกเสียงไทยสาว (ต้องแผนจ่ายเงิน): Beam `UjBxWv1V7fV0cO58n675` (social media, casual), Tatar `tBiVUbaPjPf0J5lIPaQq` (sweet cheerful), Mind `gbZNaSxK771GgOTJIKRB`, Mali `7XW5JhaNn90bnFojQ5DA` (ใช้มากสุด, calm), Thrisha `X7TtRynXWwJOYbYkfL7B`, Emily `u14IW5Q2cGXcEj6L2joU` · premade ฟรี: Jessica `cgSgspJ2msm6clMCkdW9` (cute, สำเนียงอเมริกัน)
  - ผู้ใช้อยากได้เสียงเล็กแบบการ์ตูน → `pipeline/eleven-search.mjs` ค้นทั้งคลัง (162 เสียง) → `pipeline/out/voices_cute.json` · ไม่มีเสียงการ์ตูนภาษาไทย · ตัวเด่น (ภาษาอื่น): Candy `Nggzl2QAXh3OijoXD116` (en, high pitched sweet, ใช้ 121k), Minnie `eppqEXVumQ3CfdndcIBd` (en, cartoon), Chutki `Jr72SE8p9OcJmr8hyX0D` (en kids cartoon), Piku `EeQEodFZVtBkjtgK3HBc` (en kid), Kano `OSwaPSNdfituxkWcjlkR` (ja anime), Daisy Sweetwood `DVP0tUPMxAGcT3nZxz0b` (en)
  - 3 ทาง: (A) เสียงการ์ตูนต่างชาติพูดไทย — เสี่ยงสำเนียง (B) เสียงไทย (Beam/Tatar) + ปรับเสียงสูงขึ้น 2–4 คีย์ด้วย ffmpeg โดยรักษาความยาว → เวลาปากยังตรง ไม่เสียเครดิตเพิ่ม (C) Voice Design สร้างเสียงเด็กการ์ตูนไทยเฉพาะ Nubu — ใช้เครดิต
  - **ผู้ใช้เลือก: เสียงไทย Mali (`7XW5JhaNn90bnFojQ5DA`) + ปรับสูง** (2026-11-24) · ทดลองจากไฟล์ตัวอย่าง (10.45 วิ) → `pipeline/out/voice-tests/` 6 แบบ: `mali_natural_plus2/3/4` (rubberband `formant=preserved` = คนเดิมเสียงเล็กลง) และ `mali_cartoon_plus2/3/4` (`formant=shifted` = ชิปมังก์การ์ตูน) · ความยาวเท่าเดิม (±0.08 วิ) · วัด f0 จริง: เดิม 242 Hz → +2 271 / +3 291 / +4 308 Hz ตรงตามคีย์ · ffmpeg: `rubberband=pitch=2^(n/12):formant=preserved|shifted:transients=smooth`
  - Mali เป็นเสียงจากคลัง → ใช้ผ่าน API ต้องแผนจ่ายเงิน (Starter ขึ้นไป)
  - บัญชีผู้ใช้ = **แผนฟรี** (10,000 เครดิต, รีเซ็ต 2026-12-25) — `pipeline/eleven-account.mjs` เช็กได้ไม่ใช้เครดิต
  - ทดลองให้ Kano (`OSwaPSNdfituxkWcjlkR`) พูดไทยผ่าน `pipeline/tts.mjs` → **402 paid_plan_required** "Free users cannot use library voices via the API" (ป้าย freeUsersAllowed ในคลังไม่ได้แปลว่าใช้ผ่าน API ได้) · ไม่เสียเครดิต
  - ประมาณเครดิตจากสคริปต์ตัวอย่าง EP01 (`episodes/ep01_bts_rajamangala/script_draft.md`, 2:40 นาที): ≈ 1,500 ตัวอักษร/คลิป (≈ 9.5 ตัว/วินาที) · 5 คลิป/สัปดาห์ ≈ 33k เครดิต/เดือน (รวมสร้างซ้ำ ×1.5 ≈ 49k) · 7 คลิป/สัปดาห์ ≈ 46k (≈ 69k) → Starter 30k ไม่พอสำหรับผลิตจริง · Creator ~121k พอ (สมมติ 1 ตัวอักษร = 1 เครดิต สำหรับ v3/v4 — ยังไม่ได้ยืนยัน)
  - ✅ ผู้ใช้สมัคร **Creator** แล้ว (2026-11-24): 131,000 เครดิต/เดือน รีเซ็ต 2026-12-24
  - ✅ **ทดสอบจริงแล้ว: ภาษาไทยได้เวลาตัวอักษรครบ** — `eleven_v4` + `languageCode th` + with-timestamps · ประโยค 73 ตัวอักษร: Kano 6.4 วิ, Mali 7.2 วิ · ทุกตัว (รวมสระบน/ล่าง วรรณยุกต์ ๆ) มีเวลาของตัวเอง ไม่มีตัวเวลา 0 · เวลาเรียงตามลำดับการเขียน (สระหน้า เ แ โ ใ ไ ได้เวลาก่อนพยัญชนะ) → ตัวแปลงรูปปากต้องจัดกลุ่มเป็นพยางค์
  - เครดิตที่ใช้จริง: 2 ครั้ง รวม 146 ตัวอักษร → ตัวนับขึ้น 32 เครดิต (ถูกกว่า 1 ตัว = 1 เครดิตที่ประมาณไว้ — อาจเพราะ v4 คิดต่างหรือตัวนับยังไม่อัปเดต ต้องดูหลังใช้มากขึ้น)
  - ไฟล์ฟังเทียบ: `episodes/test01/listen/` 1_kano, 2_mali, 3_mali_cartoon_plus3, 4_mali_natural_plus3
  - รอบ 2 (เสียงแนว Kano): `pipeline/eleven-search2.mjs` → `pipeline/out/voices_anime_kr.json` (111 เสียง) · สร้างประโยคไทยเดียวกัน 7 เสียง → `episodes/test01/listen2/` ได้เวลาตัวอักษรครบทุกเสียง
    | เสียง | id | ระดับเสียงกลาง | ยาว |
    |---|---|---|---|
    | Hina (kawaii idol, ja) | lhTvHflPVOqgSWyuWQry | 356 Hz | 6.64s |
    | Irohauta (high-pitched cartoon, ja) | uYwU1hsbnP5viqq9qhob | 333 Hz | 7.04s |
    | Romaco (cheerful anime, ja) | KgETZ36CCLD1Cob4xpkv | 327 Hz | 6.32s |
    | Sakuya (cute anime, ja) | 8kgj5469z1URcH4MB2G4 | 302 Hz | 7.28s |
    | Kano (อ้างอิง) | OSwaPSNdfituxkWcjlkR | 291 Hz | 6.40s |
    | Yuna (cute, ja) | GSFvrPXzdN7bQvY4mEAd | 276 Hz | 6.72s |
    | Yui (bright cute, ja) | fUjY9K2nAIwlALOwSiwc | 267 Hz | 6.40s |
    | Annie (soft lovely, ko) | Lb7qkOn5hF8p7qfCDH8q | 254 Hz | 6.88s |
    | Mali (ไทย, อ้างอิง) | 7XW5JhaNn90bnFojQ5DA | 254 Hz | 7.20s |
  - ✅ **ผู้ใช้เลือกเสียง Nubu = Sakuya (`8kgj5469z1URcH4MB2G4`)** (2026-11-24) · eleven_v4, languageCode th, ไม่ปรับระดับเสียง
  - เครดิตใช้สะสม 256 หลัง 9 ครั้ง (657 ตัวอักษร) ≈ 0.4 เครดิต/ตัวอักษรกับ eleven_v4
  - `pipeline/tts.mjs`: `--voice --text|--text-file --out [--model eleven_v4] [--lang th]` → `voice.mp3` + `alignment.json` (convertWithTimestamps) · ยังไม่เคยรันสำเร็จ → ยังไม่รู้ว่าไทยได้เวลาตัวอักษรไหม
  - CLI กำหนด: ห้ามเขียนโค้ด ElevenLabs จนกว่า `next` = `write_code`/`load_key` · ห้ามสร้างเสียงทดลองจนกว่าผู้ใช้ตอบตกลง · เขียนโค้ดเสร็จต้องรัน `onboard check`
- [ ] voice id เสียงไทยที่เลือก
- [ ] Python ไม่มีในเครื่อง → skill `elevenlabs-tts` (Python) ใช้ไม่ได้ ใช้สคริปต์ Node แทน
