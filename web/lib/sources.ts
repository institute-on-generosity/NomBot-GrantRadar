// Where each fact on a result came from, linked to the original public file or filing.
export type Source = { label: string; detail: string; url: string; internal?: boolean }; // internal: opens NomBot's readable viewer

const SOI_EXTRACT_YY = "24"; // matches generosity-data/etl/load_soi.py default

export function sources(o: {
  ein: string; state: string | null; revSrc: string | null; finForm: string | null;
  objectId: string | null; textYear: number | null; textForm: string | null;
}): Source[] {
  const out: Source[] = [];
  if (o.objectId) {
    out.push({
      label: `Form ${o.textForm ?? "990"}${o.textYear ? ` (${o.textYear})` : ""}`,
      detail: "Mission and programs, from the organization's IRS e-filed return",
      url: `https://projects.propublica.org/nonprofits/organizations/${o.ein}/${o.objectId}/full`,
    });
  }
  if (o.revSrc === "soi") {
    const zip = `${SOI_EXTRACT_YY}eoextract${o.finForm === "990EZ" ? "990EZ" : "990"}.zip`;
    out.push({ label: "IRS SOI extract", detail: `Revenue, expenses, assets (${zip})`, url: `https://www.irs.gov/pub/irs-soi/${zip}` });
  }
  if (o.state) {
    out.push({
      label: "IRS master file",
      detail: `Name, address, cause code${o.revSrc === "bmf" ? ", revenue" : ""} (Exempt Organizations Business Master File, ${o.state})`,
      url: `/source/bmf/${o.state.toLowerCase()}?ein=${o.ein}`,
      internal: true,
    });
  }
  return out;
}

export const propublicaOrg = (ein: string) => `https://projects.propublica.org/nonprofits/organizations/${ein.replace("-", "")}`;
