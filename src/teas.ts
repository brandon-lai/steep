// The four teas. Values sit inside the PRD's ranges and agree with common brewing
// guidance (see README, "Tea values"): cooler water and shorter steeps for green,
// a full boil and a long steep for chamomile.

export type TeaId = "green" | "oolong" | "black" | "chamomile";

export interface Tea {
  id: TeaId;
  name: string;
  /** Target water temperature, °C. */
  tempC: number;
  /** Steep time, seconds. */
  steepSeconds: number;
  /** Fully steeped liquor, RGB. */
  liquor: [number, number, number];
  /** What goes into the scoop. */
  leaf: "slender" | "rolled" | "twisted" | "flower";
  /** Tin body colour. */
  tin: string;
  /** Tin label colour. */
  label: string;
  /** What the visitor scoops: leaves, or flowers for chamomile. */
  scoopNoun: "leaves" | "flowers";
}

export const TEAS: readonly Tea[] = [
  {
    id: "green",
    name: "Green",
    tempC: 80,
    steepSeconds: 150,
    liquor: [199, 186, 96],
    leaf: "slender",
    tin: "#7f8c62",
    label: "#efe6cf",
    scoopNoun: "leaves",
  },
  {
    id: "oolong",
    name: "Oolong",
    tempC: 90,
    steepSeconds: 240,
    liquor: [204, 140, 52],
    leaf: "rolled",
    tin: "#a8603f",
    label: "#f1e3c8",
    scoopNoun: "leaves",
  },
  {
    id: "black",
    name: "Black",
    tempC: 95,
    steepSeconds: 240,
    liquor: [128, 52, 22],
    leaf: "twisted",
    tin: "#5e2f27",
    label: "#ead7b6",
    scoopNoun: "leaves",
  },
  {
    id: "chamomile",
    name: "Chamomile",
    tempC: 100,
    steepSeconds: 300,
    liquor: [222, 172, 58],
    leaf: "flower",
    tin: "#d9bd7c",
    label: "#3d2a1c",
    scoopNoun: "flowers",
  },
];

export function teaById(id: string | null | undefined): Tea | undefined {
  return TEAS.find((t) => t.id === id);
}

export type TempUnit = "C" | "F";

export function toUnit(celsius: number, unit: TempUnit): number {
  return unit === "C" ? Math.round(celsius) : Math.round((celsius * 9) / 5 + 32);
}

export function formatTemp(celsius: number, unit: TempUnit): string {
  return `${toUnit(celsius, unit)}°${unit}`;
}

/** "2½ min", "4 min". */
export function formatSteep(seconds: number): string {
  const whole = Math.floor(seconds / 60);
  const half = seconds % 60 >= 30;
  return `${whole}${half ? "½" : ""} min`;
}

/** Spoken form for screen readers: "2 and a half minutes". */
export function speakSteep(seconds: number): string {
  const whole = Math.floor(seconds / 60);
  const half = seconds % 60 >= 30;
  const unit = whole === 1 && !half ? "minute" : "minutes";
  return half ? `${whole} and a half ${unit}` : `${whole} ${unit}`;
}

export function speakTemp(celsius: number, unit: TempUnit): string {
  return `${toUnit(celsius, unit)} degrees ${unit === "C" ? "Celsius" : "Fahrenheit"}`;
}

/** "2:05". */
export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
