// Thai script -> speech + per-character timing (for Nubu's mouth shapes).
// usage: node --env-file=.env.local pipeline/tts.mjs --voice <voiceId> --text "..." | --text-file script.txt --out <dir> [--model eleven_v4] [--lang th]
// Writes <out>/voice.mp3 and <out>/alignment.json. The SDK reads ELEVENLABS_API_KEY from the environment.
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import { writeFileSync, readFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf("--" + k); return i >= 0 ? args[i + 1] : d; };
const voiceId = opt("voice");
const text = opt("text") ?? readFileSync(opt("text-file"), "utf8").trim();
const outDir = opt("out", "pipeline/out/tts");
const modelId = opt("model", "eleven_v4");
const languageCode = opt("lang", "th");
if (!voiceId || !text) { console.error("need --voice and --text/--text-file"); process.exit(1); }

const client = new ElevenLabsClient();
// --prev "<text spoken right before>" helps the model match intonation when re-recording only part of a script
const previousText = opt("prev");
const nextText = opt("next");   // text spoken right after (helps the model end the phrase naturally)
// --speed 0.7–1.2: ElevenLabs native delivery speed (natural, unlike time-stretching afterwards)
const speed = opt("speed") ? +opt("speed") : null;
const res = await client.textToSpeech.convertWithTimestamps(voiceId, { text, modelId, languageCode, outputFormat: "mp3_44100_128", ...(previousText ? { previousText } : {}), ...(nextText ? { nextText } : {}), ...(speed ? { voiceSettings: { speed } } : {}) });
mkdirSync(outDir, { recursive: true });
writeFileSync(path.join(outDir, "voice.mp3"), Buffer.from(res.audioBase64, "base64"));
const a = res.alignment || res.normalizedAlignment || null;
writeFileSync(path.join(outDir, "alignment.json"), JSON.stringify({ voiceId, modelId, languageCode, speed, text, alignment: res.alignment ?? null, normalizedAlignment: res.normalizedAlignment ?? null }, null, 1));
console.log(JSON.stringify({ out: outDir, chars: text.length, hasAlignment: !!a, alignedChars: a ? a.characters.length : 0, durationSec: a ? a.characterEndTimesSeconds.at(-1) : null }));
