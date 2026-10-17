// "Export slide": one 16:9 conference slide for a finding or a search, the first slide of a talk.
// A big headline (the claim), 1-3 key numbers, the one chart, 1-2 short bullets, a source line and a
// small NomBot mark. Always light, whatever the app theme. Laid out once on a 960×540 grid (1 unit =
// 1 pt on a 13.33×7.5 in slide) and drawn two ways: PNG on a canvas at 2x (1920×1080), or PPTX with
// real text boxes (pptxgenjs, loaded only on click) and the chart as an image.
// Browser only: load it with `await import("@/lib/slide")` from a click handler.
import { LIGHT, vegaConfig, vegaEmbed } from "../components/InsightChart";
import { download } from "./insightMeta";

export type SlideData = {
  kicker: string; // small line above the headline: what this is about
  headline: string;
  numbers: { value: string; label: string }[]; // first is the hero number
  chart: { spec: Record<string, unknown>; caption?: string; sub?: string } | null;
  bullets: string[]; // plain text; **bold** and [n] citations are stripped
  link: string; // full URL of the page; shortened for the source line
  file: string; // download name without extension
};

const W = 960, H = 540, M = 64, SCALE = 2;
const C = { ink: "#1d1d1f", ink2: "#424245", mute: "#6e6e73", faint: "#86868b", line: "#e5e5ea", green: "#248a3d" };
const FONT = `-apple-system, BlinkMacSystemFont, "Helvetica Neue", Helvetica, Arial, sans-serif`;
const PPT_FONT = "Helvetica Neue";
const MAX_WORDS = 30; // headline + bullets, besides numbers

type Text = { kind: "text"; x: number; y: number; w: number; lines: string[]; size: number; lh: number; weight: 400 | 600 | 700; color: string; caps?: boolean; bullet?: boolean; align?: "left" | "right" };
type Img = { kind: "img"; x: number; y: number; w: number; h: number; url: string };
type Rule = { kind: "rule"; x: number; y: number; w: number };
type Mark = { kind: "mark"; x: number; y: number; size: number };
type El = Text | Img | Rule | Mark;

const plain = (s: string) => s.replace(/\*\*(.+?)\*\*/g, "$1").replace(/\s*\[\d+(?:,\s*\d+)*\]/g, "").replace(/\s+/g, " ").trim();
const words = (s: string) => s.split(/\s+/).filter(Boolean).length;
const font = (size: number, weight: number) => `${weight} ${size}px ${FONT}`;

let measurer: CanvasRenderingContext2D | null = null;
function wrap(text: string, size: number, weight: number, width: number, max: number): string[] {
  const ctx = (measurer ??= document.createElement("canvas").getContext("2d")!);
  ctx.font = font(size, weight);
  const out: string[] = [];
  let line = "";
  for (const w of text.split(/\s+/)) {
    const next = line ? `${line} ${w}` : w;
    if (line && ctx.measureText(next).width > width) { out.push(line); line = w; } else line = next;
  }
  if (line) out.push(line);
  if (out.length <= max) return out;
  const kept = out.slice(0, max);
  let last = kept[max - 1];
  while (last && ctx.measureText(`${last}…`).width > width) last = last.replace(/\s*\S+$/, "");
  kept[max - 1] = `${last}…`;
  return kept;
}

// The source line's link: PUBLIC_BASE_URL's host (else the page's) + path, plus only the search
// question, without the protocol and at most 70 characters. null on a local origin (localhost,
// 127.0.0.1, *.local…): a slide never prints a link nobody else can open.
const LOCAL = /^(localhost|127\.\d+\.\d+\.\d+|0\.0\.0\.0|\[::1\]|.+\.localhost|.+\.local|.+\.test|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+)(:\d+)?$/i;
function shortLink(link: string): string | null {
  try {
    const u = new URL(link);
    const base = new URL(process.env.PUBLIC_BASE_URL || u.origin);
    if (LOCAL.test(base.host)) return null;
    const q = u.searchParams.get("question");
    const path = `${base.pathname.replace(/\/$/, "")}${u.pathname === "/" ? "" : u.pathname}`;
    const s = `${base.host}${path}${q ? `/?question=${encodeURIComponent(q.trim().toLowerCase()).replace(/%20/g, "+")}` : ""}`;
    return s.length > 70 ? `${s.slice(0, 69)}…` : s;
  } catch { return null; }
}

// The chart as a light PNG (2x), drawn by Vega off screen at the size it will have on the slide.
async function chartImage(spec: Record<string, unknown>, w: number, h: number): Promise<{ url: string; w: number; h: number } | null> {
  const { default: embed } = await vegaEmbed();
  const el = document.createElement("div");
  el.style.cssText = `position:fixed;left:-20000px;top:0;width:${w}px;height:${h}px;`;
  document.body.appendChild(el);
  try {
    const { $schema: _s, ...rest } = spec; // eslint-disable-line @typescript-eslint/no-unused-vars
    // Maps: legend on the right and a width that suits a US map, so the map fills the height
    // instead of floating small above a bottom legend.
    const geo = JSON.stringify(rest).includes("geoshape");
    const s = geo
      ? { ...sideLegend(rest, Math.round(h * 0.55)), width: Math.min(w - 170, Math.round(h * 1.6)), height: h, autosize: { type: "pad" }, background: "#ffffff" }
      : { ...rest, width: w, height: h, autosize: { type: "fit", contains: "padding" }, background: "#ffffff" };
    const res = await embed(el, s as never, { actions: false, renderer: "canvas", config: slideConfig() as never });
    await res.view.runAsync();
    const url = await res.view.toImageURL("png", SCALE);
    res.finalize();
    const img = await load(url);
    return { url, w: img.naturalWidth / SCALE, h: img.naturalHeight / SCALE };
  } catch (e) {
    console.error("slide chart failed", e);
    return null;
  } finally { el.remove(); }
}

// Light theme at slide size, with fewer axis ticks so short charts don't crowd their labels.
function slideConfig() {
  const c = vegaConfig({ ...LIGHT, font: FONT }, false, 13);
  return { ...c, background: "#ffffff", axis: { ...c.axis, tickCount: 4 } };
}

// Every legend in the spec moved to the right, stacked vertically, its title wrapped to a narrow column.
function sideLegend<T>(x: T, len = 120): T {
  if (Array.isArray(x)) return x.map((v) => sideLegend(v, len)) as T;
  if (!x || typeof x !== "object") return x;
  const o = x as Record<string, unknown>;
  const narrow = (t: unknown) => {
    if (typeof t !== "string") return t;
    const lines: string[] = [];
    for (const w of t.split(" ")) { const l = lines.at(-1); if (l && (l + " " + w).length <= 20) lines[lines.length - 1] = `${l} ${w}`; else lines.push(w); }
    return lines;
  };
  return Object.fromEntries(Object.entries(o).map(([k, v]) => {
    if (k === "legend" && v && typeof v === "object") return [k, { ...v, orient: "right", direction: "vertical", gradientLength: len, titleLimit: 0, title: narrow((v as { title?: unknown }).title) }];
    if (k === "title" && o.legend && typeof o.legend === "object") return [k, narrow(v)];
    return [k, sideLegend(v, len)];
  })) as T;
}

const load = (src: string) => new Promise<HTMLImageElement>((ok, fail) => { const i = new Image(); i.onload = () => ok(i); i.onerror = fail; i.src = src; });

async function layout(d: SlideData): Promise<El[]> {
  const els: El[] = [];
  const inner = W - 2 * M;
  // Kicker and headline (shrinks to fit two lines)
  els.push({ kind: "text", x: M, y: 50, w: inner, lines: [plain(d.kicker).toUpperCase()], size: 12, lh: 16, weight: 600, color: C.green, caps: true });
  const head = plain(d.headline);
  let hs = 36, lines = wrap(head, hs, 700, inner, 9);
  while (lines.length > 2 && hs > 26) { hs -= 2; lines = wrap(head, hs, 700, inner, 9); }
  lines = wrap(head, hs, 700, inner, 2);
  const hlh = Math.round(hs * 1.16);
  els.push({ kind: "text", x: M, y: 74, w: inner, lines, size: hs, lh: hlh, weight: 700, color: C.ink });
  const top = 74 + lines.length * hlh + 34;

  // Footer: hairline, source, mark
  const footY = H - 44;
  els.push({ kind: "rule", x: M, y: footY - 14, w: inner });
  const date = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  els.push({ kind: "text", x: M, y: footY, w: inner - 110, lines: wrap(`Source: IRS 990 and 990-PF filings via NomBot, Institute on Generosity, ${date}${shortLink(d.link) ? `, ${shortLink(d.link)}` : ""}`, 10.5, 400, inner - 110, 1), size: 10.5, lh: 14, weight: 400, color: C.faint });
  els.push({ kind: "mark", x: W - M - 72, y: footY - 1, size: 15 });
  els.push({ kind: "text", x: W - M - 52, y: footY, w: 52, lines: ["NomBot"], size: 11.5, lh: 14, weight: 600, color: C.ink2 });

  // Bullets along the bottom, within the word budget (always at least one when there is room)
  let budget = MAX_WORDS - words(head);
  const bullets = d.bullets.map(plain).filter(Boolean).filter((b, k) => { const ok = k < 2 && (words(b) <= budget || (k === 0 && words(b) <= 18 && budget > 0)); if (ok) budget -= words(b); return ok; });
  const bLines = bullets.map((b) => wrap(b, 16, 400, inner - 20, 2));
  const bH = bLines.reduce((a, l) => a + l.length * 22 + 8, 0);
  const bTop = footY - 30 - bH;
  let by = bTop;
  for (const l of bLines) { els.push({ kind: "text", x: M, y: by, w: inner, lines: l, size: 16, lh: 22, weight: 400, color: C.ink2, bullet: true }); by += l.length * 22 + 8; }
  const bottom = (bullets.length ? bTop - 22 : footY - 34);

  // Body: numbers on the left, the chart on the right (numbers across the slide when there is no chart)
  const nums = d.numbers.slice(0, d.chart ? 3 : 4);
  if (d.chart) {
    const colW = nums.length ? 250 : 0, gap = nums.length ? 44 : 0;
    const cx = M + colW + gap, cw = W - M - cx;
    let cy = top;
    if (d.chart.caption) {
      els.push({ kind: "text", x: cx, y: cy, w: cw, lines: [d.chart.sub ? `${d.chart.caption}  ·  ${d.chart.sub}` : d.chart.caption], size: 13, lh: 16, weight: 600, color: C.mute });
      cy += 26;
    }
    const ch = Math.max(120, bottom - cy);
    const img = await chartImage(d.chart.spec, cw, ch);
    if (img) {
      const k = Math.min(cw / img.w, ch / img.h, 1.4);
      els.push({ kind: "img", x: cx, y: cy, w: img.w * k, h: img.h * k, url: img.url });
    }
    // Numbers stacked, spread over the body height
    const avail = bottom - top;
    const blocks = nums.map((n, k) => ({ n, size: k === 0 ? 50 : 34, label: wrap(plain(n.label), 14, 400, colW, 2) }));
    const used = blocks.reduce((a, b) => a + b.size * 1.05 + 6 + b.label.length * 18, 0);
    const spacing = blocks.length > 1 ? Math.min(30, Math.max(14, (avail - used) / (blocks.length - 1))) : 0;
    let ny = top;
    for (const [k, b] of blocks.entries()) {
      els.push({ kind: "text", x: M, y: ny, w: colW, lines: [b.n.value], size: b.size, lh: Math.round(b.size * 1.05), weight: 700, color: k === 0 ? C.green : C.ink });
      ny += Math.round(b.size * 1.05) + 6;
      els.push({ kind: "text", x: M, y: ny, w: colW, lines: b.label, size: 14, lh: 18, weight: 400, color: C.mute });
      ny += b.label.length * 18 + spacing;
    }
  } else if (nums.length) {
    const colW = (inner - (nums.length - 1) * 32) / nums.length;
    nums.forEach((n, k) => {
      const x = M + k * (colW + 32);
      els.push({ kind: "text", x, y: top + 10, w: colW, lines: [n.value], size: k === 0 ? 72 : 56, lh: k === 0 ? 76 : 76, weight: 700, color: k === 0 ? C.green : C.ink });
      els.push({ kind: "text", x, y: top + 96, w: colW, lines: wrap(plain(n.label), 16, 400, colW, 3), size: 16, lh: 21, weight: 400, color: C.mute });
    });
  }
  return els;
}

// NomBot mark: white N on the brand green (app/icon.svg), on a 32-unit grid.
const N_PATH = "M9.5 23V9h3.2l6.9 9.4V9h2.9v14h-3.1l-7-9.5V23z";
function drawMark(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / 32, size / 32);
  ctx.fillStyle = C.green;
  ctx.beginPath(); ctx.roundRect(0, 0, 32, 32, 8); ctx.fill();
  ctx.fillStyle = "#fff"; ctx.fill(new Path2D(N_PATH));
  ctx.restore();
}

async function toPng(els: El[]): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = W * SCALE; canvas.height = H * SCALE;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(SCALE, SCALE);
  ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, W, H);
  ctx.textBaseline = "alphabetic";
  for (const e of els) {
    if (e.kind === "rule") { ctx.fillStyle = C.line; ctx.fillRect(e.x, e.y, e.w, 1); }
    else if (e.kind === "mark") drawMark(ctx, e.x, e.y, e.size);
    else if (e.kind === "img") ctx.drawImage(await load(e.url), e.x, e.y, e.w, e.h);
    else {
      ctx.font = font(e.size, e.weight);
      ctx.fillStyle = e.color;
      ctx.letterSpacing = e.caps ? "1.2px" : e.size >= 30 ? `${-0.02 * e.size}px` : "0px";
      e.lines.forEach((l, k) => {
        const base = e.y + k * e.lh + e.size * 0.9 + (e.lh - e.size * 1.16) / 2;
        if (e.bullet && k === 0) { ctx.save(); ctx.fillStyle = C.green; ctx.beginPath(); ctx.arc(e.x + 4, base - e.size * 0.33, 3.5, 0, 2 * Math.PI); ctx.fill(); ctx.restore(); }
        ctx.fillText(l, e.x + (e.bullet ? 20 : 0), base);
      });
    }
  }
  ctx.letterSpacing = "0px";
  return new Promise((ok, fail) => canvas.toBlob((b) => (b ? ok(b) : fail(new Error("PNG failed"))), "image/png"));
}

function markPng(): string {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  drawMark(c.getContext("2d")!, 0, 0, 64);
  return c.toDataURL("image/png");
}

async function toPptx(els: El[], d: SlideData): Promise<Blob> {
  const { default: PptxGenJS } = await import("pptxgenjs");
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE"; // 13.33 × 7.5 in = 960 × 540 pt
  pptx.title = plain(d.headline);
  pptx.company = "Institute on Generosity";
  pptx.author = "NomBot";
  const slide = pptx.addSlide();
  slide.background = { color: "FFFFFF" };
  const inch = (u: number) => u / 72;
  const hex = (c: string) => c.replace("#", "").toUpperCase();
  for (const e of els) {
    if (e.kind === "rule") slide.addShape(pptx.ShapeType.line, { x: inch(e.x), y: inch(e.y), w: inch(e.w), h: 0, line: { color: hex(C.line), width: 0.75 } });
    else if (e.kind === "mark") slide.addImage({ data: markPng(), x: inch(e.x), y: inch(e.y), w: inch(e.size), h: inch(e.size) });
    else if (e.kind === "img") slide.addImage({ data: e.url, x: inch(e.x), y: inch(e.y), w: inch(e.w), h: inch(e.h), altText: d.chart?.caption ?? plain(d.headline) });
    else {
      // One text box per element; lines joined so the text stays editable (PowerPoint rewraps it).
      const text = e.lines.join(" ").replace(/…$/, "…");
      const h = e.lines.length * e.lh + 4;
      slide.addText(text, {
        x: inch(e.x + (e.bullet ? 20 : 0)), y: inch(e.y), w: inch(e.w + (e.bullet ? -20 : 6)), h: inch(h), margin: 0, valign: "top", align: e.align ?? "left",
        fontFace: PPT_FONT, fontSize: e.size, bold: e.weight >= 600, color: hex(e.color), lineSpacing: e.lh, fit: "none", wrap: true,
        charSpacing: e.caps ? 1.2 : undefined,
        bullet: e.bullet ? { indent: 16 } : undefined,
      });
    }
  }
  slide.addNotes(`${plain(d.headline)}\n\n${d.bullets.map(plain).join("\n")}${shortLink(d.link) ? `\n\n${shortLink(d.link)}` : ""}`);
  return (await pptx.write({ outputType: "blob" })) as Blob;
}

export async function exportSlide(d: SlideData, kind: "png" | "pptx") {
  const els = await layout(d);
  if (kind === "png") download(`${d.file}.png`, await toPng(els));
  else download(`${d.file}.pptx`, await toPptx(els, d));
}

// For tests in the browser console: the PNG as a data URL.
export async function slidePngUrl(d: SlideData) {
  const blob = await toPng(await layout(d));
  return new Promise<string>((ok) => { const r = new FileReader(); r.onload = () => ok(r.result as string); r.readAsDataURL(blob); });
}
