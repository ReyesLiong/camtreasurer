// The eight access points on the Cam, downstream to upstream. km measured from Jesus Lock.
// Lat and lng are approximate; the demo draws a schematic river, not a map.

export interface Point {
  id: string;
  name: string;
  kmUpstream: number;
  lat: number;
  lng: number;
}

export const POINTS: Point[] = [
  { id: "jesus-lock", name: "Jesus Lock", kmUpstream: 0.0, lat: 52.2115, lng: 0.1185 },
  { id: "mill-pond", name: "Mill Pond", kmUpstream: 1.2, lat: 52.201, lng: 0.115 },
  { id: "sheeps-green", name: "Sheep's Green", kmUpstream: 1.8, lat: 52.1975, lng: 0.113 },
  { id: "newnham", name: "Newnham", kmUpstream: 2.4, lat: 52.1935, lng: 0.11 },
  { id: "grantchester-meadows", name: "Grantchester Meadows", kmUpstream: 3.6, lat: 52.186, lng: 0.103 },
  { id: "byrons-pool", name: "Byron's Pool", kmUpstream: 4.8, lat: 52.178, lng: 0.096 },
  { id: "grantchester-outfall", name: "Grantchester outfall", kmUpstream: 5.4, lat: 52.175, lng: 0.092 },
  { id: "haslingfield", name: "Haslingfield", kmUpstream: 7.5, lat: 52.16, lng: 0.075 },
];

export const POINT_BY_ID: Record<string, Point> = Object.fromEntries(POINTS.map((p) => [p.id, p]));

/** Index in POINTS (0 = Jesus Lock, most downstream). */
export function pointIndex(id: string): number {
  return POINTS.findIndex((p) => p.id === id);
}

export function pointName(id: string): string {
  return POINT_BY_ID[id]?.name ?? id;
}

/** The demo phone is hard-coded to stand at Sheep's Green. */
export const YOU_ARE_HERE = "sheeps-green";

export function distanceKm(a: string, b: string): number {
  const pa = POINT_BY_ID[a];
  const pb = POINT_BY_ID[b];
  if (!pa || !pb) return 0;
  return Math.abs(pa.kmUpstream - pb.kmUpstream);
}

/** Search intervals: interval i lies between POINTS[i] and POINTS[i + 1]. */
export const INTERVAL_COUNT = POINTS.length - 1;

export function intervalLabel(i: number): string {
  const a = POINTS[i];
  const b = POINTS[i + 1];
  if (!a || !b) return "unknown reach";
  return `${a.name} to ${b.name}`;
}
