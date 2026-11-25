// List candidate voices for Nubu (cute young female). Read-only: no audio is generated, no credits used.
// usage: node --env-file=.env.local pipeline/eleven-voices.mjs
// The SDK reads ELEVENLABS_API_KEY from the environment (.env.local) — the key is never in this file.
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import { writeFileSync, mkdirSync } from "node:fs";

const client = new ElevenLabsClient();
const out = { premade: [], libraryThaiFemaleYoung: [], libraryThaiFemale: [] };

const mine = await client.voices.getAll();
for (const v of mine.voices) {
  const l = v.labels || {};
  out.premade.push({ name: v.name, id: v.voiceId, category: v.category, gender: l.gender, age: l.age, accent: l.accent, desc: l.description || l.descriptive, useCase: l.use_case || l["use case"], preview: v.previewUrl });
}

const pick = v => ({ name: v.name, id: v.voiceId, gender: v.gender, age: v.age, accent: v.accent, language: v.language, desc: v.descriptive, useCase: v.useCase, usedBy: v.clonedByCount, preview: v.previewUrl, free: v.freeUsersAllowed });
const young = await client.voices.getShared({ language: "th", gender: "female", age: "young", pageSize: 30 });
out.libraryThaiFemaleYoung = (young.voices || []).map(pick);
const anyAge = await client.voices.getShared({ language: "th", gender: "female", pageSize: 40 });
out.libraryThaiFemale = (anyAge.voices || []).map(pick);

mkdirSync("pipeline/out", { recursive: true });
writeFileSync("pipeline/out/voices.json", JSON.stringify(out, null, 2));
const fmt = v => `${v.name} | ${v.id} | ${v.gender || "-"}/${v.age || "-"} | ${v.accent || "-"} | ${v.desc || "-"} | ${v.useCase || "-"}${v.usedBy != null ? " | used " + v.usedBy : ""}`;
console.log(`PREMADE female (${out.premade.filter(v => v.gender === "female").length}):`);
out.premade.filter(v => v.gender === "female").forEach(v => console.log("  " + fmt(v)));
console.log(`\nLIBRARY th female young (${out.libraryThaiFemaleYoung.length}):`);
out.libraryThaiFemaleYoung.forEach(v => console.log("  " + fmt(v)));
console.log(`\nLIBRARY th female any age (${out.libraryThaiFemale.length}):`);
out.libraryThaiFemale.slice(0, 25).forEach(v => console.log("  " + fmt(v)));
