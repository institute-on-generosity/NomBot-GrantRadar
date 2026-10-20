// IRS tax-exempt status for one EIN: Publication 78 eligibility (can receive tax-deductible gifts) and the
// Automatic Revocation of Exemption list (no 990 filed for 3 straight years). generosity-data migration 063
// (irs_pub78, irs_revocations, view org_tax_status). Works for EINs the BMF no longer carries: revoked orgs drop off it.
// Used by the org page (lib/org.ts), /api/v1/org/{ein}, /api/v1/orgs/{ein}/status and MCP.
import { db } from "./db";
import { BadParam } from "./apiData";

export const PUB78_URL = "https://apps.irs.gov/app/eos/";
export const IRS_EO_BULK_URL = "https://www.irs.gov/charities-non-profits/tax-exempt-organization-search-bulk-data-downloads";

// IRS Pub 78 deductibility codes in plain words (Pub 78 data key).
const CODES: Record<string, string> = {
  PC: "Public charity (50% deduction limit)",
  POF: "Private operating foundation (50% limit)",
  PF: "Private foundation (30% limit)",
  SO: "Supporting organization (50% limit)",
  SONFI: "Supporting organization, not functionally integrated Type III (50% limit)",
  SOUNK: "Supporting organization, type unknown (50% limit)",
  EO: "Other exempt organization (50% limit)",
  LODGE: "Fraternal lodge (gifts deductible only for domestic charitable uses)",
  GROUP: "Covered by a group exemption",
  FORGN: "Foreign-addressed organization",
  UNKWN: "Deductibility limit unknown",
};

export const TAX_STATUS_NOTE = "status: eligible (on Pub 78), revoked (revoked with no reinstatement, not on Pub 78 and no newer IRS ruling date), conflict (revoked with no reinstatement date but on Pub 78 or recognized again by the IRS after the revocation per the master file ruling date, usually a reinstatement the revocation file does not show: check the IRS), reinstated (revoked, then reinstated, not on Pub 78) or not_listed. pub78.eligible: the EIN is on IRS Publication 78, the IRS list of organizations eligible to receive tax-deductible contributions. Churches, small orgs under group exemptions and some others can be eligible without being listed, so false is a prompt to check, not proof. revocation: the IRS revoked the EIN's exemption for not filing a 990 for 3 straight years. revoked_now = the latest revocation has no reinstatement. grants_after_revocation counts foundation (990-PF) grants linked to this EIN in tax years after the revocation year and before any reinstatement: a diligence signal (the grant may have gone to a fiscal sponsor or a successor, or the EIN link may be wrong). file_date is the IRS file's date.";

const day = (d: Date | string | null) => (d == null ? null : (d instanceof Date ? d.toISOString() : String(d)).slice(0, 10));

// revoked: revoked with no reinstatement, not on Pub 78 and no newer BMF ruling. conflict: revoked with no
// reinstatement but on Pub 78 or with a BMF ruling date after the revocation (usually a reinstatement or new
// recognition the revocation file doesn't show). Same rule as the org_tax_status view.
export type TaxStanding = "eligible" | "revoked" | "conflict" | "reinstated" | "not_listed";

export type TaxStatus = {
  ein: string;
  name: string | null;
  status: TaxStanding;
  pub78: { eligible: boolean; codes: { code: string; label: string }[]; city: string | null; state: string | null; file_date: string | null };
  revocation: {
    revoked_now: boolean;
    revocation_date: string | null; posting_date: string | null; reinstatement_date: string | null; exemption_type: string | null;
    history: { revocation_date: string; posting_date: string | null; reinstatement_date: string | null; exemption_type: string | null }[];
    grants_after_revocation: { count: number; total: number; latest_year: number | null };
    file_date: string | null;
  } | null;
  sources: { label: string; url: string }[];
};

// Null for a malformed EIN. Every 9-digit EIN gets an answer (eligible false, revocation null when on neither list).
export async function taxStatus(einRaw: string): Promise<TaxStatus | null> {
  const ein = einRaw.replace(/\D/g, "");
  if (ein.length !== 9) return null;
  const [{ rows: [p] }, { rows: revs }, { rows: [after] }, { rows: [org] }, { rows: [files] }] = await Promise.all([
    db.query("SELECT name, city, state, deductibility_codes, file_date FROM irs_pub78 WHERE ein = $1", [ein]),
    db.query(`SELECT name, revocation_date, revocation_posting_date, reinstatement_date, exemption_type, file_date
                FROM irs_revocations WHERE ein = $1 ORDER BY revocation_date DESC`, [ein]),
    db.query(
      `SELECT count(*)::int AS n, coalesce(sum(g.amount), 0)::bigint AS total, max(g.tax_year) AS latest
         FROM grant_clean g
        WHERE g.recipient_ein = $1 AND EXISTS (
          SELECT 1 FROM irs_revocations r WHERE r.ein = g.recipient_ein
             AND g.tax_year > extract(year FROM r.revocation_date)
             AND (r.reinstatement_date IS NULL OR extract(year FROM r.reinstatement_date) > g.tax_year))`, [ein]),
    db.query("SELECT name, ruling FROM orgs WHERE ein = $1", [ein]),
    db.query("SELECT (SELECT max(file_date) FROM irs_pub78) AS pub78, (SELECT max(file_date) FROM irs_revocations) AS rev"),
  ]);
  const latest = revs[0];
  const revokedNow = Boolean(latest && latest.reinstatement_date == null);
  // A BMF ruling date after the revocation means the IRS recognized the org again (reinstated or reapplied).
  const m = /^(\d{4})(0[1-9]|1[0-2])$/.exec(org?.ruling ?? "");
  const recognizedAfter = Boolean(m && latest && `${m[1]}-${m[2]}-01` > day(latest.revocation_date)!);
  const status: TaxStanding = revokedNow ? (p || recognizedAfter ? "conflict" : "revoked") : p ? "eligible" : latest ? "reinstated" : "not_listed";
  return {
    ein,
    name: (org?.name ?? p?.name ?? latest?.name ?? null) as string | null,
    status,
    pub78: {
      eligible: Boolean(p),
      codes: ((p?.deductibility_codes ?? []) as string[]).map((c) => ({ code: c, label: CODES[c] ?? c })),
      city: p?.city ?? null, state: p?.state ?? null,
      file_date: day(p?.file_date ?? files?.pub78 ?? null),
    },
    revocation: latest
      ? {
          revoked_now: revokedNow,
          revocation_date: day(latest.revocation_date), posting_date: day(latest.revocation_posting_date),
          reinstatement_date: day(latest.reinstatement_date), exemption_type: latest.exemption_type ?? null,
          history: revs.map((r) => ({ revocation_date: day(r.revocation_date)!, posting_date: day(r.revocation_posting_date), reinstatement_date: day(r.reinstatement_date), exemption_type: r.exemption_type ?? null })),
          grants_after_revocation: { count: after.n, total: Number(after.total), latest_year: after.latest ?? null },
          file_date: day(latest.file_date),
        }
      : null,
    sources: [
      { label: "IRS Tax Exempt Organization Search (Pub 78 and revocations)", url: PUB78_URL },
      { label: "IRS bulk data downloads", url: IRS_EO_BULK_URL },
    ],
  };
}

// GET /api/v1/orgs/{ein}/status and MCP get_tax_status. 400 on a bad EIN, 404 when the EIN is on neither IRS
// list and not in the master file.
export async function apiOrgStatus(einRaw: string) {
  const e = einRaw.replace(/-/g, "");
  if (!/^\d{9}$/.test(e)) throw new BadParam("ein", "EIN must be 9 digits.");
  const s = await taxStatus(e);
  if (!s || (!s.name && !s.pub78.eligible && !s.revocation)) return null;
  return { ...s, notes: [TAX_STATUS_NOTE] };
}
