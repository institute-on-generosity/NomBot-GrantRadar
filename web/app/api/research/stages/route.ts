// Loading steps for a research thread (Oct 27): GET ?q=first&f=follow1…&corr=1&since=2021 → NDJSON, one line per stage
// as it really happens: {"stage":"routed"} when the latest question's spec is known, {"stage":"queried"} when its
// answer is computed, then {"stage":"done"}. The page renders the same thread at the same time; both share the
// cached, in-flight work (lib/memo), so this costs no extra router or SQL calls.
import { connection } from "next/server";
import { MAX_FOLLOW_UPS, resolveThread, type Stage } from "@/lib/thread";

export async function GET(request: Request) {
  await connection();
  const p = new URL(request.url).searchParams;
  const q = (p.get("q") ?? "").trim().slice(0, 300);
  const fs = p.getAll("f").map((f) => f.trim().slice(0, 300)).filter(Boolean).slice(0, MAX_FOLLOW_UPS);
  const sinceY = Number(p.get("since"));
  const mods = { corr: p.get("corr") === "1", since: Number.isInteger(sinceY) && sinceY > 2000 && sinceY < 2100 ? sinceY : undefined };
  if (!q) return Response.json({ error: "q is required" }, { status: 400 });
  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(c) {
      const send = (stage: Stage | "done" | "search") => { try { c.enqueue(enc.encode(JSON.stringify({ stage }) + "\n")); } catch { /* client gone */ } };
      const turns = await resolveThread(q, fs, mods, send).catch(() => null);
      send(turns ? "done" : "search");
      c.close();
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" } });
}
