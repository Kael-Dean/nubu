# Expression & mouth prompts (แก้จากภาพตัวเปล่า)

หลักการ: ให้ AI **แก้ภาพตัวเปล่า** `character/source/nubu_front_barebody_v1.webp` ทีละภาพ โดยเติมแค่หน้า (ตา+ปาก) แล้วผมดึงตา/ปากออกด้วยการเทียบกับตัวเปล่า ได้ตำแหน่งตรงเป๊ะ
ตั้งชื่อไฟล์ `nubu_exp_<ชื่อ>_v1` / `nubu_mouth_<ชื่อ>_v1` วางที่ `character/source/expressions/`

## Prompt โครง (ใช้กับทุกภาพ เปลี่ยนเฉพาะบรรทัด FACE)
Edit the reference image (a bare fluffy cream plush blob, blank face). Add ONLY a face. Do not change anything else: same body, same position, same size, same fur, same pink blush cheeks, same plain flat light-gray background, same canvas, no new objects, no clothing, no antennae, no headphones, no arms. Face style: round glossy black bead eyes with small white highlights (same size as a pea-sized button eye), a small brown cat-like "w" mouth line, cute kawaii plush look, symmetrical, front view. FACE: [ใส่ข้อความด้านล่าง]

## สีหน้า (8)
- neutral: eyes open, small closed gentle smile
- happy: eyes open, wide open smile showing pink tongue (like the original reference)
- swoon: eyes turned into sparkling star-shaped highlights, big happy smile, cheeks extra pink
- shock: eyes wider than normal with tiny pupils, small round "o" mouth
- sad: eyes glossy with a big highlight and a tiny tear, small downturned mouth
- pout: eyes slightly narrowed, small wavy pouting mouth, cheeks puffed
- sleepy: half-closed eyes as flat arcs, tiny open mouth yawn
- laugh: both eyes closed as upward arcs (^ ^), big open laughing mouth

## รูปปาก (7) — ตาเปิดปกติ (neutral eyes) ทุกภาพ
- m_closed: mouth closed, tiny flat line (for M B P)
- a_small: mouth slightly open
- a_wide: mouth wide open, tongue visible (for อา แอ)
- o_round: mouth small round "o"
- u_pursed: mouth pursed forward small (for อู)
- e_smile: wide smile showing teeth line (for อี เอ)
- tongue: smile with tongue sticking out
