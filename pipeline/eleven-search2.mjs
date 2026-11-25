// Find Kano-like voices: cute anime / Korean cute young female. Read-only.
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import { writeFileSync } from "node:fs";
const client = new ElevenLabsClient();
const qs = [
  { language: "ja", gender: "female", age: "young", search: "cute", pageSize: 30 },
  { language: "ja", gender: "female", age: "young", search: "anime", pageSize: 30 },
  { language: "ja", gender: "female", useCases: "characters_animation", pageSize: 30 },
  { language: "ko", gender: "female", age: "young", pageSize: 30 },
  { language: "ko", gender: "female", search: "cute", pageSize: 30 },
  { gender: "female", age: "young", search: "anime", pageSize: 30 },
];
const seen = new Map();
for (const q of qs) {
  const r = await client.voices.getShared(q);
  for (const v of r.voices || []) if (!seen.has(v.voiceId)) seen.set(v.voiceId, { name: v.name, id: v.voiceId, age: v.age, language: v.language, accent: v.accent, desc: v.descriptive, useCase: v.useCase, usedBy: v.clonedByCount || 0, preview: v.previewUrl, description: (v.description || "").replace(/\s+/g, " ").slice(0, 150) });
}
const list = [...seen.values()].sort((a, b) => b.usedBy - a.usedBy);
writeFileSync("pipeline/out/voices_anime_kr.json", JSON.stringify(list, null, 2));
for (const v of list.slice(0, 40)) console.log(`${v.name.slice(0, 40).padEnd(40)}|${v.language}|${v.age}|used ${v.usedBy}|${v.id}|${v.description.slice(0, 95)}`);
