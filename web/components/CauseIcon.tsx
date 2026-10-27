// Our own cause icons (Oct 27, replacing the UN SDG artwork): one line-icon family in the style of components/Icons
// (24 px grid, 1.8 stroke, round caps), each in a soft tinted circle. The tint is the goal's hue at one fixed
// saturation and lightness for all of them, so the 17 read as one calm family. Decorative: the name is always visible.
const P: Record<string, React.ReactNode> = {
  "1": <><path d="M4 11.5 12 4.5l8 7" /><path d="M6 10v9.5h12V10" /><circle cx="12" cy="15" r="2" /></>,
  "2": <><path d="M4 11.5h16a8 8 0 0 1-16 0Z" /><path d="M9.5 8.5c0-1.2 1.2-1.6 1.2-3M13.5 8.5c0-1.2 1.2-1.6 1.2-3" /></>,
  "3": <><path d="M12 20s-7.5-4.6-7.5-10.2A4.2 4.2 0 0 1 12 7.2a4.2 4.2 0 0 1 7.5 2.6C19.5 15.4 12 20 12 20Z" /><path d="M7.5 12.5h2.6l1.4-2.5 2 4.2 1.4-1.7h1.6" /></>,
  "4": <><path d="M3.5 5.8c2.8-1.1 5.8-.9 8.5 1 2.7-1.9 5.7-2.1 8.5-1v13c-2.8-1.1-5.8-.9-8.5 1-2.7-1.9-5.7-2.1-8.5-1Z" /><path d="M12 6.8v13" /></>,
  "5": <><circle cx="12" cy="12" r="8.5" /><path d="M8.3 10h7.4M8.3 14h7.4" /></>,
  "6": <path d="M12 3.5s6.2 6.6 6.2 11.2a6.2 6.2 0 0 1-12.4 0C5.8 10.1 12 3.5 12 3.5Z" />,
  "7": <path d="M13.2 3 6 13.5h5.3L10.5 21l7.3-10.5h-5.3Z" />,
  "8": <><rect x="3.5" y="7.5" width="17" height="12" rx="2" /><path d="M9 7.5V6a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 6v1.5M3.5 12.5h17" /></>,
  "9": <><circle cx="12" cy="12" r="3.2" /><path d="M12 3.5v2.6M12 17.9v2.6M3.5 12h2.6M17.9 12h2.6M6 6l1.8 1.8M16.2 16.2 18 18M6 18l1.8-1.8M16.2 7.8 18 6" /></>,
  "10": <><path d="M12 4v15.5M7.5 19.5h9M5 7.5h14" /><path d="M5 7.5 2.8 13h4.4ZM19 7.5 16.8 13h4.4Z" /></>,
  "11": <><path d="M3.5 20h17M5 20V9.5l5-3V20M10 20V4.5h7V20M17 20v-7.5h2.5V20" /><path d="M12.5 8h2M12.5 11h2M12.5 14h2" /></>,
  "12": <path d="M8 9a3 3 0 1 0 0 6c3.2 0 4.8-6 8-6a3 3 0 1 1 0 6c-3.2 0-4.8-6-8-6Z" />,
  "13": <><path d="M10 14.3V5.2a2 2 0 0 1 4 0v9.1a4 4 0 1 1-4 0Z" /><path d="M12 9v7.2" /></>,
  "14": <path d="M3 8.5c3 0 3-2 6-2s3 2 6 2 3-2 6-2M3 13.5c3 0 3-2 6-2s3 2 6 2 3-2 6-2M3 18.5c3 0 3-2 6-2s3 2 6 2 3-2 6-2" />,
  "15": <><path d="M12 21v-6.5" /><path d="M12 3.5a6 6 0 0 1 6 6 5 5 0 0 1-5 5h-2a5 5 0 0 1-5-5 6 6 0 0 1 6-6Z" /></>,
  "16": <><path d="m13.5 4.5 6 6M10.5 7.5l6 6M12 6 8 10l6 6 4-4M10.5 12.5l-6.5 6.5" /><path d="M3 21h8" /></>,
  "17": <><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></>,
  environment: <><path d="M5 19c0-8.2 5.2-13.3 14-14 0 8.8-5.2 14-13.5 14Z" /><path d="M5 19l8-8" /></>,
  foundations: <><path d="M3.5 9.5h17L12 4.5Z" /><path d="M5 20h14M6.5 10.5v7.5M10 10.5v7.5M14 10.5v7.5M17.5 10.5v7.5" /></>,
  underfunded: <><path d="m3.5 7 6 6 4-4 7 7" /><path d="M20.5 11v5h-5" /></>,
  finances: <path d="M3 12h4l2.2-5.5 4.2 11 2.3-5.5H21" />,
  household: <><path d="M4 11 12 4.5l8 6.5v9H4Z" /><path d="M12 17.2s-3.2-1.9-3.2-3.8a1.7 1.7 0 0 1 3.2-.9 1.7 1.7 0 0 1 3.2.9c0 1.9-3.2 3.8-3.2 3.8Z" /></>,
};
// The groups across causes, by their label in lib/examples.ts
const CROSS: Record<string, string> = { Foundations: "foundations", "Under-funded orgs": "underfunded", "Financial health": "finances", "Household giving": "household" };

// Hue of a hex colour (the SDG colour), so every tint shares one saturation and lightness.
function hue(hex: string) {
  const n = parseInt(hex.replace("#", ""), 16), r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  if (!d) return 140;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return Math.round((h * 60 + 360) % 360);
}

export function CauseIcon({ n, label, color, size = 32 }: { n?: number; label?: string; color?: string; size?: number }) {
  const key = n ? String(n) : label ? CROSS[label] ?? (label === "Environment" ? "environment" : "foundations") : "foundations";
  const h = color ? hue(color) : 140;
  return (
    <span className="cause-ico" style={{ "--h": h, "--s": `${size}px` } as React.CSSProperties} aria-hidden>
      <svg width={Math.round(size * 0.56)} height={Math.round(size * 0.56)} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{P[key]}</svg>
    </span>
  );
}
