// Line icons in the spirit of SF Symbols: 1.8px strokes, round caps, currentColor.
// Decorative by default (aria-hidden); the text next to each icon carries the meaning.
type P = { size?: number };
const Svg = ({ size = 14, children }: P & { children: React.ReactNode }) => (
  <svg className="ico" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{children}</svg>
);

export const Pin = (p: P) => <Svg {...p}><path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11Z" /><circle cx="12" cy="10" r="2.3" /></Svg>;
export const Bank = (p: P) => <Svg {...p}><path d="M3.5 9 12 4l8.5 5" /><path d="M5.5 10v7M10 10v7M14 10v7M18.5 10v7" /><path d="M3.5 20h17" /></Svg>;
export const People = (p: P) => <Svg {...p}><circle cx="9" cy="8.5" r="3" /><path d="M3.5 19a5.5 5.5 0 0 1 11 0" /><circle cx="16.5" cy="9.5" r="2.4" /><path d="M15.5 14.2A4.6 4.6 0 0 1 20.5 19" /></Svg>;
export const Lock = (p: P) => <Svg {...p}><rect x="5" y="10.5" width="14" height="9.5" rx="2.5" /><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" /></Svg>;
export const Check = (p: P) => <Svg {...p}><circle cx="12" cy="12" r="8.5" /><path d="m8.3 12.2 2.5 2.5 4.9-5.2" /></Svg>;
export const Spark = (p: P) => <Svg {...p}><path d="M12 3.5c.6 4.4 2.9 6.9 8 8.5-5.1 1.6-7.4 4.1-8 8.5-.6-4.4-2.9-6.9-8-8.5 5.1-1.6 7.4-4.1 8-8.5Z" /></Svg>;
export const Chevron = (p: P) => <Svg {...p}><path d="m9.5 6 6 6-6 6" /></Svg>;
export const Coins = (p: P) => <Svg {...p}><ellipse cx="12" cy="7" rx="6.5" ry="2.8" /><path d="M5.5 7v5c0 1.5 2.9 2.8 6.5 2.8s6.5-1.3 6.5-2.8V7" /><path d="M5.5 12v5c0 1.5 2.9 2.8 6.5 2.8s6.5-1.3 6.5-2.8v-5" /></Svg>;
export const ListIcon = (p: P) => <Svg {...p}><path d="M9 6.5h11M9 12h11M9 17.5h11" /><circle cx="4.5" cy="6.5" r=".9" fill="currentColor" /><circle cx="4.5" cy="12" r=".9" fill="currentColor" /><circle cx="4.5" cy="17.5" r=".9" fill="currentColor" /></Svg>;
export const Calendar = (p: P) => <Svg {...p}><rect x="4" y="5.5" width="16" height="14.5" rx="2.5" /><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4" /></Svg>;
export const Doc = (p: P) => <Svg {...p}><path d="M7 3.5h7l4.5 4.5v11a1.5 1.5 0 0 1-1.5 1.5H7A1.5 1.5 0 0 1 5.5 19V5A1.5 1.5 0 0 1 7 3.5Z" /><path d="M13.5 3.5V8.5h5M9 13h6M9 16.5h4" /></Svg>;
export const Phone = (p: P) => <Svg {...p}><path d="M6.6 3.5h2.6l1.4 4-1.9 1.3a10.5 10.5 0 0 0 5.5 5.5l1.3-1.9 4 1.4v2.6a2 2 0 0 1-2.2 2A15.5 15.5 0 0 1 4.6 5.7a2 2 0 0 1 2-2.2Z" /></Svg>;
export const Info = (p: P) => <Svg {...p}><circle cx="12" cy="12" r="8.5" /><path d="M12 11v5.5M12 7.8v.2" /></Svg>;
export const Globe = (p: P) => <Svg {...p}><circle cx="12" cy="12" r="8.5" /><path d="M3.5 12h17M12 3.5c2.4 2.4 3.5 5.3 3.5 8.5s-1.1 6.1-3.5 8.5c-2.4-2.4-3.5-5.3-3.5-8.5s1.1-6.1 3.5-8.5Z" /></Svg>;
export const MapIcon = (p: P) => <Svg {...p}><path d="m3.5 6.5 5.5-2.5 6 2.5 5.5-2.5v13.5l-5.5 2.5-6-2.5-5.5 2.5Z" /><path d="M9 4v13.5M15 6.5V20" /></Svg>;
export const Receipt = (p: P) => <Svg {...p}><path d="M6 3.5h12v17l-2.5-1.5-2.5 1.5-2.5-1.5-2.5 1.5L6 20.5Z" /><path d="M9 8.5h6M9 12h6M9 15.5h3.5" /></Svg>;
