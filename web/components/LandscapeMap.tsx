import { CountyMap } from "./CountyMap";

// Where the landscape's organizations are, by county, zoomed to the states in play.
export function LandscapeMap({ counts, appalachia, states }: { counts: Record<string, number>; appalachia: string[]; states: string[] }) {
  return <CountyMap counts={counts} appalachia={appalachia} focusStates={states.length ? states : undefined} label="organizations" />;
}
