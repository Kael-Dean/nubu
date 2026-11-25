# Nubu scene compositor (`pipeline/compose`)

Turns an episode config into a finished video: drawn scene pages (HTML, deterministic `seek(t)`) captured
with Playwright at 30 fps, Nubu's transparent talk render (`nubu_talk.webm`, VP9 alpha) overlaid with ffmpeg,
phrase-level Thai subtitles from the ElevenLabs alignment, source tags, and the voice track (loudnorm −14 LUFS).

```
node pipeline/compose/compose.js episodes/<ep>/compose.json            # render (main job; teaser too if configured)
node pipeline/compose/compose.js episodes/<ep>/compose.json --draft    # faster, lower quality encode
node pipeline/compose/compose.js episodes/<ep>/compose.json --stills 4.6,15,29.3   # scene backgrounds only, quick look
node pipeline/compose/compose.js episodes/<ep>/compose.json --contact  # contact sheet from the finished video
```
Outputs go where `outputs` in the config says (EP01: `exports/ep01_9x16.mp4` + `exports/ep01_contact.png`).
Intermediates (scene clips, subtitle PNGs, stock frames, ffmpeg graph, `main_cues.json`) live in
`episodes/<ep>/render/compose_cache/` and can be deleted at any time.

## New episode checklist
1. Voice + alignment (`voice/voice.mp3`, `voice/alignment.json`) and Nubu render (`pipeline/render.js` → `nubu_talk.webm`).
2. Copy `episodes/ep01_bts_rajamangala/compose.json` and edit:
   - `scenes[]`: `id`, `type`, `start`/`end` (seconds, from the alignment — first character of each scene's
     first phrase). **Put a scene cut exactly on every `view` change in `render/timeline.json`** (front↔3/4 is a hard switch).
   - `nubuKeys[]`: `{t, mode, dur}`; modes are defined per layout (`big` / `mid` / `small`). Moves are eased
     (0.6 s, arc: size leads when growing, sideways leads when shrinking). Never jump: always give `dur`.
   - `tags[]`: source line shown top-left (`{from,to,text}`), copy the wording from the script.
   - `subs`: `breakBefore` = phrases that must start a new subtitle; cue lengths `maxChars`/`softChars`.
   - Stock: per scene `"stock": {kind:"video"|"image", file, from, dur, at, crop, blur, speed, credit}`; files are read
     from `assets/stock/`. Missing file → the scene's drawn fallback is used automatically. `stockAs:"background"`
     = full-bleed behind the scene; in `map` scenes the stock plays inside `inset` (`full:true` = whole stage).
3. Run `--stills` on a few times, look, then render. The run prints a layout check (subtitle boxes vs Nubu's
   body at every frame, tag vs subtitle) — fix any `!` lines before delivering.

## Scene types (`scenes/*.html`)
| type | what it does | key config |
|---|---|---|
| `title` | opener / hook / end card: big lines pop in, purple hearts float | `variant: opener|hook`, `lines[]`, `box` |
| `card` | headline card flips in, date chips one by one, topic list; optional real photo (graded, push-in, credit) or drawn stadium fallback | `title`, `chips[]`, `topics[]`, `stock` (image), `photoUntil`, `cardPos` |
| `map` | stylised drawn transit map: camera keys, lines draw themselves (masked, dashed OK), icon rides along the line, stations blink, notes shake once, mode icons pop, cards stack | `map` geometry, `camera9x16`, `events[]`, `cards[]`, `inset` |
| `checklist` | white panel, items slide in and get ticked | `title`, `items[]` (`tickAt`, `note`) |
| `warning` | red alert box, one jolt on the key line, optional tips and taxi/price-tag art | `lines[]`, `jitterAt`, `tips[]`, `art` |
| `iconrow` | icon tiles with ✓/✗ badges, footer note | `tiles[]` (`mark`, `markAt`), `foot` |
| `sides` | info cards in a column (or both sides of a centred Nubu), fast-spinning clock card, tail-light fallback | `left[]`, `right[]` |
| `meetup` | dots stream out of the venue and gather at a meeting pin | `venue`, `pin`, `outAt`, `gatherAt`, `cards[]` |
| `closing` | glow, rising hearts, CTA buttons, messages | `buttons[]`, `messages[]` |

Every page uses `scenes/_runtime.js`: `window.setup(payload)` builds the DOM, `window.seek(t)` draws frame t
(source time). All motion is a pure function of t (seeded RNG, no timers, no CSS animations), so any frame can
be re-rendered exactly. Ambient life comes from the runtime: 2–3 % push-in per scene, drifting sparkles, a soft
floor shadow under Nubu (same track as the ffmpeg overlay, `lib/track.js`).

Cards that leave (`until`) free their slot; the next card takes it (`NB.layoutStack`).

## Rules baked in
- Look (v2, "fan zine"): flat band colour + riso grain, hand-cut paper stickers (`NB.sticker`, drawn after fonts load
  in `afterFonts`), ink line icons with one spot fill (`NB.icon`), one highlighter colour (`NB.hl` / `NB.swipe`),
  marker ticks/crosses that draw themselves (`NB.draw`). Motion: stickers are placed (short exponential ease-out from
  slightly lifted/turned), never bounced. No emoji, no glow, no sparkles. v1 pages are archived in `_v1_scenes/`.
- Theme tokens: every colour is a CSS custom property in `scenes/_base.css` (OKLCH). `compose.json` → `"theme"`
  overrides them per band (keys without `--`; keys starting with `_` are notes). Next band = change hue + accent.
- Fonts: self-hosted Google Fonts in `fonts/` (SIL OFL, licence texts beside the files, `fonts/fonts.css`).
  Display = Playpen Sans Thai 800 (hooks, headlines), body/subtitles = IBM Plex Sans Thai Looped. Switch pairing with
  theme keys `font-display`, `font-body`, `display-weight` (e.g. `"\"Chonburi\""` + `"400"`). Specimen of the three
  shortlisted pairings: `node pipeline/compose/specimen/specimen.js` → `exports/type_specimen.png`.
  Line-height ≥ 1.4 on Thai text so tone marks and lower vowels never clip. Nothing is fetched at render time.
- Map labels: station 40 px, venue 48 px, road 34 px, note 38 px. A label that would touch a visible card or the
  subtitle band (`labelFloor`, default y 1180) fades out instead of overlapping; `labelSides` overrides sides per scene,
  `hideNotes` hides map notes in a scene. Camera keys keep the active route below the card stack.
- 9:16 safe zones: text between y 220 and y 1540, x ≤ 940. Subtitles 64 px (one ink strip per line), max 2 lines, centred on x 490,
  bottom edge rides just above Nubu's head (the subtitle layer moves with Nubu's size).
- No idol photos, logos, or lightsticks. Real photos are graded toward the purple theme; brand banners covered.
- On-screen facts must be copied from the script/storyboard, never invented.

## Layouts
`layouts` in the config defines `W/H`, Nubu modes, subtitle and tag placement. EP01 renders `9x16`
(`"layout": "9x16"`); a `16x9` block is kept so a landscape cut only needs landscape positions in the scene
configs (`cardsBox`, `camera16x9`, panel/box positions) and `"layout": "16x9"`. An optional `teaser` job
(segments of source time, `silent` end cards, ping-pong Nubu idle) is supported by `compose.js` but not used in EP01.
