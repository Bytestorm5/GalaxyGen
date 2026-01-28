export interface CelestialBody {
  name: string;
  type: string;
  distance_au: number;
  angle_deg: number;
  radius_km: number;
  color?: [number, number, number];
}

export interface TimelineEvent {
  year: number;
  type: string;
  data?: Record<string, unknown>;
}

export interface Timeline {
  events: TimelineEvent[];
}

export interface Star {
  x: number;
  y: number;
  name: string;
  description: string;
  star_type: string;
  admin_levels: (number | null)[];
  bodies: CelestialBody[];
  timeline: Timeline;
}

export interface Hyperlane {
  a: number;
  b: number;
}

export interface ResourceRegion {
  id: number;
  systems: number[];
}

export interface ResourceDefinition {
  name: string;
  color: [number, number, number];
  rarity: number;
  centricity: number;
}

export interface ClusterDefinition {
  name: string;
  color: [number, number, number];
}

export interface ProvinceDefinition {
  name: string;
  color: [number, number, number];
  clusters: ClusterDefinition[];
}

export interface SectorDefinition {
  name: string;
  color: [number, number, number];
  provinces: ProvinceDefinition[];
}

export interface CountryDefinition {
  name: string;
  color: [number, number, number];
  sectors: SectorDefinition[];
  timeline: Timeline;
}

export interface Galaxy {
  width: number;
  height: number;
  stars: Star[];
  hyperlanes: Hyperlane[];
  resources: ResourceRegion[];
  countries: CountryDefinition[];
}

export type ViewMode = "galaxy" | "system";

export type EditMode = "view" | "geography" | "political";

export type Selection =
  | { type: "star"; id: number }
  | { type: "lane"; id: number }
  | { type: "body"; starId: number; bodyIdx: number };
