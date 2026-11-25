# มุม 3/4 — แผนและ prompt

## แนวทาง (ลดงานครึ่งหนึ่ง)
- ทำ **3/4 ซ้าย** ให้ครบก่อน แล้ว **กลับด้านเป็น 3/4 ขวา** (ตัวสมมาตร แสงจะกลับข้างเล็กน้อย ถ้าไม่พอใจค่อยทำขวาจริงทีหลัง)
- ชุดหน้า 3/4 ใช้เท่าที่ต้อง: ตาเปิด + ปากลิปซิงก์ 5 แบบ + กะพริบ = **6 ภาพ** (สีหน้าพิเศษ swoon/shock/sad/pout อยู่หน้าตรงอย่างเดียวไปก่อน)
- ใน Rive: หันหน้า = สลับทั้งชุด (body + แขน + หูฟัง + หนวด + หน้า) หน้าตรง ↔ 3/4 พร้อมเอฟเฟกต์ squash สั้นๆ

## รวม 7 ภาพ (3/4 ซ้าย)
1. ตัวเปล่า (แก้จาก `nubu_3q-left_v1.webp`)
2–7. หน้า 6 แบบ (แก้จาก `nubu_3q-left_v1.webp` เหมือนกัน — ภาพเต็มที่มีหูฟัง/หนวด)

ตั้งชื่อ: `nubu_34L_barebody_v1`, `nubu_34L_m_closed_v1`, `nubu_34L_a_small_v1`, `nubu_34L_a_wide_v1`, `nubu_34L_o_round_v1`, `nubu_34L_e_smile_v1`, `nubu_34L_blink_v1`
วางที่ `character/source/angle34/`

## Prompt 1 — ตัวเปล่า (nubu_34L_barebody_v1)
Edit the reference image (a fluffy cream plush blob creature seen in three-quarter view turned toward the viewer's left, with headphones, butterfly antennae, arms and a smiling face). Keep the body exactly as it is: same three-quarter angle, same position, same size, same proportions, same fur texture, same pink blush cheeks, same lighting, same plain flat light-gray background and same canvas. Remove only these parts: both arms, the headphones (headband and both ear cups), both butterfly antennae, both eyes and the mouth. Fill every area where those parts were with continuous cream fluffy fur, so the result is a clean smooth egg-shaped body with two stubby feet, pink blush cheeks and a completely blank face. The body outline where the arms and headphones were must be a natural continuation of the round body shape. No clothing, no accessories, no ground shadow, nothing else added.

## โครงหน้า (Prompt 2–7) เปลี่ยนเฉพาะบรรทัด FACE
Edit the reference image (the full Nubu plush character in three-quarter view turned toward the viewer's left, with headphones and butterfly antennae). Change ONLY the face: keep the body, headphones, antennae, arms, angle, position, size, blush cheeks, lighting and plain flat light-gray background exactly the same. Keep the eyes and mouth in correct three-quarter perspective (the far eye slightly narrower, the mouth shifted toward the turned side). FACE: ...

- m_closed: eyes open and round (neutral), mouth closed as a tiny flat short line.
- a_small: eyes open and round (neutral), mouth slightly open, small gap.
- a_wide: eyes open and round (neutral), mouth wide open with the pink tongue visible.
- o_round: eyes open and round (neutral), mouth a small round "o".
- e_smile: eyes open and round (neutral), wide smile with a thin line of upper teeth.
- blink: both eyes closed as gentle downward-curved arcs shaped like a U-curve (like a sleeping smile), mouth closed as a tiny flat short line.
