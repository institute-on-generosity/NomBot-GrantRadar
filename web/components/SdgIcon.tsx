// The official UN SDG icon for a goal (public/sdg/, see manifest.json): used whole and unmodified (number, title,
// graphic, original colours, square), only scaled. Informational use under the UN guidelines, which every page that
// shows the icons links to (SdgNote).
export function SdgIcon({ n, name, size = 44 }: { n: number; name: string; size?: number }) {
  const nn = String(n).padStart(2, "0");
  // A quiet, uniform frame AROUND the full square icon (white, hairline, rounded); the icon itself is never cropped.
  return (
    <span className="sdg-frame" style={{ "--sdg": `${size}px` } as React.CSSProperties}>
      <img className="sdg-icon" src={`/sdg/goal-${nn}-192.png`} srcSet={`/sdg/goal-${nn}-192.png 1x, /sdg/goal-${nn}-384.png 2x`} width={size} height={size} alt={`Goal ${n}: ${name}`} loading="lazy" decoding="async" />
    </span>
  );
}

// The line the UN guidelines call for wherever the icons appear: a link to the guidelines and the disclaimer.
export function SdgNote() {
  return (
    <p className="sdg-note">
      Cause icons: <a href="https://sdgs.un.org/goals" target="_blank" rel="noreferrer">UN Sustainable Development Goals</a>, used under the <a href="/sdg/UN-SDG-Guidelines-Sep2023.pdf" target="_blank" rel="noreferrer">UN guidelines</a>. The content of this site has not been approved by the United Nations and does not reflect the views of the United Nations or its officials or Member States.
    </p>
  );
}
