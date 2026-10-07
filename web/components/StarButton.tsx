"use client";
import { toggleSaved, SAVED_KEY, type SavedOrg } from "@/lib/saved";
import { useStored } from "./useStored";

export function StarButton({ org, withLabel = false }: { org: Omit<SavedOrg, "at">; withLabel?: boolean }) {
  const raw = useStored(SAVED_KEY, "nombot-saved");
  const saved = raw.includes(`"ein":"${org.ein}"`);
  return (
    <button
      type="button"
      className={`star${saved ? " on" : ""}`}
      onClick={(e) => { e.preventDefault(); toggleSaved(org); }}
      aria-pressed={saved}
      aria-label={saved ? `Remove ${org.name} from saved` : `Save ${org.name}`}
      title={saved ? "Saved: click to remove" : "Save for later"}
    >
      {saved ? "★" : "☆"}{withLabel && <span>{saved ? "Saved" : "Save"}</span>}
    </button>
  );
}
