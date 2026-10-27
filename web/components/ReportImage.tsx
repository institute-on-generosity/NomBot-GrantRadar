import type { ReportImage as Img } from "@/lib/reportImages";

// A report's photo with its credit line (lib/reportImages), or a soft tinted pattern when there is none.
// A report without a picked photo yet (a brand-new finding): a quiet pattern in the section's colour, no numbers
// (Hunter: thumbnails are images, never number tiles). Every listed report has a photo (lib/reportImages.json).
export function ReportImage({ img, section, size = "card", priority = false, cover }: { img: Img | null; section: string; size?: "card" | "hero"; priority?: boolean; cover?: { value: string; label?: string } | null }) {
  if (!img) return (
    <div className={`rp-img rp-${size} rp-cover`} data-section={section} role="img" aria-label={cover ? `${cover.value}${cover.label ? `, ${cover.label}` : ""}` : "Report cover"}>
      <svg className="rp-cover-bars" viewBox="0 0 120 40" preserveAspectRatio="none" aria-hidden>{[12, 22, 16, 30, 24, 36, 28].map((h, k) => <rect key={k} x={k * 17} y={40 - h} width="11" height={h} rx="2" />)}</svg>
    </div>
  );
  return (
    <figure className={`rp-fig rp-${size}`}>
      <img className="rp-img" src={size === "hero" ? img.file : img.small} srcSet={`${img.small} 800w, ${img.file} 1600w`}
        sizes={size === "hero" ? "(max-width: 900px) 100vw, 900px" : "(max-width: 640px) 100vw, 360px"} alt={img.alt}
        loading={priority ? "eager" : "lazy"} decoding="async" />
      {size === "hero" && (
        <figcaption className="rp-credit">
          Photo: {img.author}, {img.license_url ? <a href={img.license_url} target="_blank" rel="noreferrer">{img.license}</a> : img.license}, <a href={img.source} target="_blank" rel="noreferrer">via Wikimedia Commons</a>
        </figcaption>
      )}
    </figure>
  );
}
