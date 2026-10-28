// The memos as editable Word files (docx 9.10.0, pinned), so an advisor can add their own name, logo and voice.
// Same content as the print page (lib/brief), plain styles, US Letter, half-inch margins.
import { AlignmentType, BorderStyle, Document, Packer, Paragraph, Table, TableCell, TableRow, TextRun, WidthType } from "docx";
import { MEMO_FOOTER, type OptionsMemo, type OrgBrief } from "./brief";
import { becauseText } from "./vetting";

const GRAY = "6C6C71", GREEN = "1E7D36";
const p = (text: string, o: { size?: number; bold?: boolean; color?: string; after?: number; before?: number } = {}) =>
  new Paragraph({ spacing: { after: o.after ?? 60, before: o.before ?? 0 }, children: [new TextRun({ text, size: o.size ?? 20, bold: o.bold, color: o.color })] });
const h = (text: string, year?: string | null) => new Paragraph({ spacing: { before: 160, after: 60 }, children: [new TextRun({ text, bold: true, size: 20 }), ...(year ? [new TextRun({ text: `  ${year}`, size: 16, color: GRAY })] : [])] });
const item = (text: string, sub?: string, n?: number) => new Paragraph({ spacing: { after: 40 }, indent: { left: 240, hanging: 240 }, children: [
  new TextRun({ text: `${n != null ? `${n}.` : "•"} ${text}`, size: 20 }), ...(sub ? [new TextRun({ text: sub, size: 16, color: GRAY, break: 1 })] : [])] });
const none = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const line = { style: BorderStyle.SINGLE, size: 4, color: "E5E5E0" };
const cell = (text: string, o: { bold?: boolean; sub?: string; width?: number } = {}) => new TableCell({
  width: o.width ? { size: o.width, type: WidthType.PERCENTAGE } : undefined,
  borders: { top: none, left: none, right: none, bottom: line },
  children: [new Paragraph({ children: [new TextRun({ text, bold: o.bold, size: 18 }), ...(o.sub ? [new TextRun({ text: o.sub, size: 14, color: GRAY, break: 1 })] : [])] })] });
const page = { size: { width: 12240, height: 15840 }, margin: { top: 720, bottom: 720, left: 864, right: 864 } }; // Letter, twips
const foot = (sources: string, by: string | null) => [
  p(`Sources. ${sources} Returns reach the IRS 1 to 2 years after the tax year.`, { size: 15, color: GRAY, before: 200 }),
  ...(by ? [p(`Prepared by ${by}`, { size: 16, bold: true })] : [p("Prepared by: ", { size: 16, color: GRAY })]),
  p(MEMO_FOOTER, { size: 15, color: GRAY }),
];
const today = () => new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

export async function orgBriefDocx(b: OrgBrief, by: string | null): Promise<Buffer> {
  const nums = new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [new TableRow({ children: b.numbers.map((n) => new TableCell({
    width: { size: Math.floor(100 / b.numbers.length), type: WidthType.PERCENTAGE }, borders: { top: none, left: none, right: none, bottom: none },
    children: [p(n.label, { size: 16, color: GRAY, after: 0 }), p(n.value, { size: 26, bold: true, after: 0 }), p(n.year, { size: 14, color: GRAY })] })) })] });
  const doc = new Document({ creator: by ?? "NomBot", title: `${b.name}: organization brief`, styles: { default: { document: { run: { font: "Calibri" } } } }, sections: [{ properties: { page }, children: [
    p(`ORGANIZATION BRIEF · ${today()}`, { size: 15, color: GRAY, after: 20 }),
    p(b.name, { size: 34, bold: true, after: 20 }),
    p([b.place, b.type, `EIN ${b.ein}`].filter(Boolean).join(" · "), { size: 18, color: "45454A", after: 20 }),
    p(b.track, { size: 18, color: GREEN, after: 120 }),
    ...(b.mission ? [p(b.mission, { after: 140 })] : []),
    nums,
    h("Top foundation funders", b.fundersYears), ...(b.funders.length ? b.funders.map((f, i) => item(`${f.name}  ${f.usd}`, undefined, i + 1)) : [p("None found in Form 990-PF grants", { color: GRAY })]),
    h("Leadership", b.leadersYear ? String(b.leadersYear) : null), ...(b.leaders.length ? b.leaders.map((l, i) => item(`${l.name}${l.pay ? `  Pay ${l.pay}` : "  Unpaid"}`, l.title || undefined, i + 1)) : [p("No officers listed", { color: GRAY })]),
    h("Signals", b.signalsYear ? `Form ${b.signalsForm}, ${b.signalsYear}` : null), ...b.signals.map((s) => item(s)),
    h("Questions to ask"), ...b.questions.map((q, i) => item(q.q, becauseText(q), i + 1)),
    ...foot(`${b.sources.join(". ")}.`, by),
  ] }] });
  return Packer.toBuffer(doc);
}

export async function optionsMemoDocx(m: OptionsMemo, by: string | null): Promise<Buffer> {
  const w = Math.floor(78 / m.orgs.length);
  const table = new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [
    new TableRow({ tableHeader: true, children: [cell("", { width: 22 }), ...m.orgs.map((o) => cell(o.name, { bold: true, sub: o.year, width: w }))] }),
    ...m.rows.map((r) => new TableRow({ children: [cell(r.label, { width: 22 }), ...r.cells.map((c) => cell(c, { width: w }))] })),
  ] });
  const doc = new Document({ creator: by ?? "NomBot", title: "Options memo", styles: { default: { document: { run: { font: "Calibri" } } } }, sections: [{ properties: { page }, children: [
    p(`OPTIONS MEMO · ${today()}`, { size: 15, color: GRAY, after: 20 }),
    p(`${m.orgs.length} organizations side by side`, { size: 34, bold: true, after: 20 }),
    p("Each column uses its own newest full filing year, named under it.", { size: 18, color: "45454A", after: 120 }),
    h("Takeaways"), ...m.takeaways.map((t) => item(t)),
    new Paragraph({ spacing: { after: 120 }, alignment: AlignmentType.LEFT, children: [] }),
    table,
    ...foot(`Form 990 and 990-EZ figures from each organization's newest full return, foundation grants from Form 990-PF filings, ${m.grantYears}.`, by),
  ] }] });
  return Packer.toBuffer(doc);
}
