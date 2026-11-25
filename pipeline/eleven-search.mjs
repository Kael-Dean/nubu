// Search the ElevenLabs Voice Library for cute / cartoon-like voices. Read-only: no audio generated, no credits.
// usage: node --env-file=.env.local pipeline/eleven-search.mjs
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import { writeFileSync, mkdirSync } from "node:fs";

const client = new ElevenLabsClient();
const queries = [
  { label: "characters_animation + female young", req: { useCases: "characters_animation", gender: "female", age: "young", pageSize: 30 } },
  { label: "search: cartoon", req: { search: "cartoon", gender: "female", pageSize: 30 } },
  { label: "search: cute", req: { search: "cute", gender: "female", pageSize: 30 } },
  { label: "search: kid / child", req: { search: "kid", pageSize: 30 } },
  { label: "search: child", req: { search: "child", pageSize: 30 } },
  { label: "search: anime", req: { search: "anime", gender: "female", pageSize: 30 } },
  { label: "search: chibi / squeaky", req: { search: "squeaky", pageSize: 30 } },
];
const seen = new Map();
for (const q of queries) {
  try {
    const r = await client.voices.getShared(q.req);
    for (const v of r.voices || []) {
      if (!seen.has(v.voiceId)) seen.set(v.voiceId, { name: v.name, id: v.voiceId, gender: v.gender, age: v.age, accent: v.accent, language: v.language, desc: v.descriptive, useCase: v.useCase, usedBy: v.clonedByCount || 0, preview: v.previewUrl, free: v.freeUsersAllowed, description: (v.description || "").slice(0, 140), found: [q.label] });
      else seen.get(v.voiceId).found.push(q.label);
    }
  } catch (e) { console.log(`query "${q.label}" failed: ${e.message}`); }
}
const list = [...seen.values()].sort((a, b) => b.usedBy - a.usedBy);
mkdirSync("pipeline/out", { recursive: true });
writeFileSync("pipeline/out/voices_cute.json", JSON.stringify(list, null, 2));
console.log(`${list.length} unique voices`);
for (const v of list.slice(0, 45)) console.log(`${v.name.slice(0, 42).padEnd(42)} | ${v.gender}/${v.age} | ${v.language || "-"}/${v.accent || "-"} | ${v.desc || "-"} | ${v.useCase || "-"} | used ${v.usedBy} | ${v.description.replace(/\s+/g, " ").slice(0, 90)}`);
