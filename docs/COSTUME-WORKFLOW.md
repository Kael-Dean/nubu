# ชุดประจำวงของ Nubu — ขั้นตอนที่ได้ผล (สรุปจากชุด BTS, 2026-11-25)

## กฎ
- ชุดต้องอยู่ในขอบตัวเดิมของ rig เสมอ · รูป AI ใช้เป็น "ผิว" เท่านั้น ไม่ใช่รูปทรง
- ตา ปาก แก้ม มาจากเลเยอร์ของ Nubu เสมอ (เปลี่ยนสีหน้า/ลิปซิงก์ได้)
- ทำทีละมุม: หน้าตรงก่อน แล้วค่อย 3/4 (3/4 ขวา = กลับด้านจากซ้าย)

## ขั้นตอน (ต่อวง)
1. **ออกแบบชุดรอบแรก** — ใช้ `nubu_front_v1.webp` เป็นอ้างอิง ได้ไอเดียหน้าตาชุด (ยังไม่ต้องตรงสัดส่วน)
2. **ทำภาพอ้างอิงจาก rig จริง** — ผมประกอบเลเยอร์ + ชุดรอบแรกให้เป็นภาพเดียว (`ref_<band>_<view>.webp`) สัดส่วนตรงกับ rig แน่นอน
3. **เจนรูปเก็บงาน 1 รูปต่อมุม** จากภาพอ้างอิงนั้น (คุณเจนเอง หรือผมใช้ Recraft `image_edit` ~11 เครดิต/รูป) ด้วย prompt ด้านล่าง
4. **ผมประกอบ** — ใช้หัวทั้งชิ้นจากรูปนั้น ตัดให้อยู่ในขอบตัว rig แล้วตรวจบนพื้นเขียวซูม 3 เท่าก่อนส่งให้ดู
5. ใส่ Rive (`outfit` = เลขวง) → เรนเดอร์

## Prompt แม่แบบ (ข้อ 3) — แนบภาพอ้างอิงจาก rig
```
Edit the reference image. This is a final cleanup pass: do NOT redesign, move, resize or re-pose anything. Keep the character, pose, position, size, face, eyes, mouth, blush, arms, antennae, the plain flat light-gray background and the canvas exactly the same. Only make the costume (<รายการชิ้นของวง>) look like one clean 3D plush render: clean smooth edges where each costume piece meets the headphones, the head and the arms; no gaps, fur strands, specks, halos, doubled edges or jagged cuts. Same soft lighting and render style. No new objects, no text, no logos.
```

## เครื่องมือ Recraft ที่ได้ผล / ไม่ได้ผล
| เครื่องมือ | ใช้กับ | ผล |
|---|---|---|
| `image_edit` (nano banana) | เก็บงานทั้งภาพจากภาพอ้างอิง rig | ดีที่สุด ภาพไม่เลื่อน ~11 เครดิต |
| `erase_region` + มาสก์ | ลบหนวด/ชิ้นที่ซ้อน | ดี 1 เครดิต |
| `inpaint_image` + มาสก์ | เติมผิวต่อเนื่อง (เช่น ก้านหูฟังให้เป็นชิ้นเดียว) | ดี 1 เครดิต |
| `inpaint_image` | รอยต่อระหว่างสองวัตถุ (ก้าน-หมวก) | ไม่ได้ผล วาดเป็นช่องว่างสีเทา |

## สคริปต์
`scripts/compose-front-outfit.js` · `scripts/compose-34-outfit.js` (FULLHEAD) · `scripts/finish-34.js` · `scripts/preview-34.js` · `scripts/cutout.js` (ระวัง: ครอปตามกรอบตัว ต้องเติมกลับเต็มผืน)
