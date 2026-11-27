# Files kept out of git: back these up to another cloud

The GitHub repo is public, and these either aren't ours to publish or are too big for GitHub (100 MB per file).

| Path | Why not in git |
|---|---|
| `assets/stock/cine/ep02_shotB.mp4` (108 MB) | Over GitHub's 100 MB file limit |
| `_bts-ref/jungkook/ref_real_tattoo/` (2 photos) | Real photos found online, used only as reference |
| `assets/licensed-media/**/_candidates/` | Not licensed yet |
| `assets/audio/music/*.mp3`, `assets/audio/sfx/*.mp3` | Pixabay licence forbids redistribution (existing rule) |
| `.env`, `.env.local` | Secrets |
| `episodes/`, `exports/` | Rendered outputs (existing rule) |
| `_bts-ref/jungkook/runtime-test/rec/fr/`, `rec/*.webm`, `frames*/`, `node_modules/`, `_tmpcut/` | Regenerable: `npm i`, `node drive.js`, `node record.js` |

The Rive source itself lives in the Rive cloud (file "BTS"). Full offline copies with embedded images are in
`_bts-ref/jungkook/backup_rev/*.rev` (in git).
