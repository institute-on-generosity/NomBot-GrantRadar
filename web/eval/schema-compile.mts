// The router's and the follow-up resolver's structured-output formats must compile on the API: a schema that grows past
// the compiled-grammar limit fails every call with "The compiled grammar is too large" (follow-ups, Oct 21 and Oct 27).
// Two tiny calls (max 16 output tokens), the same model and format as in production; a 400 fails the check.
//   npm run test:schema
import { join } from "node:path";
try { process.loadEnvFile(join(import.meta.dirname, "..", ".env.local")); } catch { /* no .env.local */ }
const { claude, FAST_MODEL } = await import("../lib/llm");
const { routerFormat } = await import("../lib/answerRoute");
const { followFormat } = await import("../lib/followUp");

const client = claude("schema-compile-test");
if (!client) { console.log("No Claude key: skipped"); process.exit(0); }
let fails = 0;
for (const [name, format] of [["router", routerFormat], ["follow-up", followFormat]] as const) {
  const bytes = JSON.stringify(format.schema).length;
  try {
    await client.beta.messages.create({ model: FAST_MODEL, max_tokens: 16, output_config: { effort: "low", format: { type: "json_schema", schema: format.schema } }, messages: [{ role: "user", content: "Reply with any valid object." }] } as never);
    console.log(`ok    ${name} format compiles (${bytes} bytes of schema)`);
  } catch (e) {
    const msg = String((e as { message?: string }).message ?? e);
    // A cut-off reply is fine here: only a rejected schema fails
    if (/grammar|schema/i.test(msg) || (e as { status?: number }).status === 400) { fails++; console.log(`FAIL  ${name} format: ${msg.slice(0, 200)}`); }
    else console.log(`ok    ${name} format compiles (${bytes} bytes; call ended: ${msg.slice(0, 80)})`);
  }
}
console.log(fails ? `${fails} failed` : "all passed");
process.exit(fails ? 1 : 0);
