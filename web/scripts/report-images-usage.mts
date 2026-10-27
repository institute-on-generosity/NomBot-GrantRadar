// Writes which findings use each report image into lib/reportImages.json ("findings"), and lists the ones that fall
// back to the pattern. Run after new findings appear: npx tsx scripts/report-images-usage.mts
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
try { process.loadEnvFile(join(import.meta.dirname, "..", ".env.local")); } catch { /* no .env.local */ }
const { listInsights } = await import("../lib/insights");
const { reportImage } = await import("../lib/reportImages");
const file = join(import.meta.dirname, "..", "lib", "reportImages.json");
const man = JSON.parse(readFileSync(file, "utf8")) as Record<string, { file: string; findings?: string[] }>;
for (const v of Object.values(man)) v.findings = [];
const none: string[] = [];
const { insights } = await listInsights();
for (const i of insights) {
  const img = reportImage(i);
  const key = img && Object.keys(man).find((k) => man[k].file === img.file);
  if (key) man[key].findings!.push(i.slug); else none.push(i.slug);
}
writeFileSync(file, JSON.stringify(man, null, 1) + "\n");
console.log(Object.entries(man).map(([k, v]) => `${k}: ${v.findings!.length}`).join(", "));
console.log(`pattern (no image): ${none.join(", ") || "none"}`);
process.exit(0);
