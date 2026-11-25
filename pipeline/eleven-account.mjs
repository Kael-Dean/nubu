// Show plan tier and remaining credits (read-only). usage: node --env-file=.env.local pipeline/eleven-account.mjs
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
const client = new ElevenLabsClient();
const s = await client.user.subscription.get();
console.log(JSON.stringify({ tier: s.tier, status: s.status, used: s.characterCount, limit: s.characterLimit, nextReset: s.nextCharacterCountResetUnix ? new Date(s.nextCharacterCountResetUnix * 1000).toISOString() : null }, null, 0));
