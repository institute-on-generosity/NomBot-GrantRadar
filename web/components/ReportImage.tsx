import type { ReportImage as Img } from "@/lib/reportImages";

// A report's photo with its credit line (lib/reportImages), or a soft tinted pattern when there is none.
export function ReportImage({ img, section, size = "card", priority = false }: { img: Img | null; section: string; size?: "card" | "hero"; priority?: boolean }) {
  if (!img) return <div className={`rp-img rp-${size} rp-pattern`} data-section={section} aria-hidden />;
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
