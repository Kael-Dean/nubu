# ซีนแบบหนัง (Cinematic scenes) — ใช้สกิล `lemo-opuscar`

ใช้เมื่อบางช่วงของคลิปนุบุควร "เล่าเป็นซีนเหมือนในหนัง" แทนการ์ด/แผนที่/เช็คลิสต์ปกติ
เช่น ย้อนอดีต (flashback), ช่วงพีคทางอารมณ์, เปิดตอนแบบ cold open, ฉาก what-if, ฉากปิดซึ้ง ๆ

## หลักการ
- **ไม่แทน compositor เดิม** — ซีนหนังเรนเดอร์เป็นคลิปสั้น (3–12 วิ) ด้วย Lemo-Opuscar แล้วเอามาวางเป็น
  stock video ใน `compose.json` (`pipeline/compose/`) ซับ/แท็กแหล่งข่าว/เสียงพากย์/เพลงยังมาจาก compositor เหมือนเดิม
- **คลิปละไม่เกิน 1–3 ซีนหนัง** — เป็นจุดเน้น ไม่ใช่ทั้งคลิป (คุมเวลาผลิต ≤ 1–1.5 ชม./คลิป)
- ซีนหนังไม่ต้องมีเสียงของตัวเอง (mute) — เสียงพากย์+เพลงของตอนคุมทั้งคลิป
- นโยบายภาพข่าว (`docs/MEDIA-RIGHTS.md`) ยังใช้ — ซีนหนังต้องสร้างจากโค้ด/ภาพที่มีสิทธิ์เท่านั้น ห้ามวาดหน้าคนจริงเลียนแบบ
- ไม่ใช้สไตล์ที่ติด ✦ (ต้องใช้ image generator) เว้นแต่ผู้ใช้สั่ง

## ขั้นตอน
1. ใน `episodes/<ep>/script_draft.md` ทำเครื่องหมายท่อนที่จะเป็นซีนหนัง: `[CINE: <ไอเดียช็อต>, ~<วิ>]`
2. เรียกสกิล `Skill(skill="lemo-opuscar")` — library อยู่ที่ `~/lemo-opuscar` (`LIB`)
   - โปรเจกต์ซีน: `episodes/<ep>/cine/<shot-name>/` (ตัวเล็ก/ตัวเลข/ขีด)
   - สไตล์ที่เข้ากับนุบุ (เคป็อป/ประวัติ/what-if): `dark-documentary`, `kino-montage`, `newsreel`, `double-exposure`,
     `archive-lighttable`, `neon-tubes`, `countdown`, `ink-wash`, `cel-anime-80s`, `hd-2d` — ดูทั้งหมด `ls ~/lemo-opuscar/styles`
   - **ขนาด/เฟรมเรตต้องตรงกับตอน**: `--size 1080x1920` (9:16) หรือ `1920x1080` (16:9) และ `--fps 30`
   - ความยาว = เวลาจาก alignment ของท่อนนั้น + เผื่อหัวท้าย 0.5 วิ
3. คัดลอกไฟล์ผลลัพธ์ไป `assets/stock/cine/<ep>_<shot>.mp4`
4. ใน `compose.json` ใส่เป็น scene ที่ `start/end` ตรงท่อนนั้น:
   ```json
   "stock": { "kind": "video", "file": "cine/<ep>_<shot>.mp4", "from": 0, "dur": <วิ> },
   "stockAs": "background"
   ```
   และใส่ `nubuKeys` ให้นุบุย่อเป็น `small` ตลอดซีน (หรือคงไว้ถ้าอยากให้นุบุ "ดูหนัง" อยู่มุมจอ)
5. ตรวจด้วย `--stills` ที่กลางซีนก่อนเรนเดอร์จริง

## เครื่องมือที่ต้องมี
- Node ✓ · Python ✓ · แพ็กเกจ core: `sh <skill>/scripts/setup.sh deps` (ติดตั้งแล้ว 2026-11-25)
- **ffmpeg + ffprobe ระดับเครื่อง (ยังไม่มี)** — Lemo-Opuscar เรียก `ffmpeg`/`ffprobe` จาก PATH
  (compositor ของนุบุใช้ `ffmpeg-static` ใน node_modules ซึ่งไม่มี ffprobe) → ติดตั้งเอง: `winget install Gyan.FFmpeg`
