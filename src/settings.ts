// Settings, remembered on the device. Nothing else is stored.

import type { TempUnit } from "./teas";

export interface Settings {
  sound: boolean;
  rain: boolean;
  /** Show the steep countdown (and the kettle's temperature) as numbers. */
  numbers: boolean;
  breathing: boolean;
  unit: TempUnit;
}

export const SETTINGS_KEY = "steep.settings.v1";

/** Fahrenheit for the places that use it, Celsius everywhere else. */
export function defaultUnit(locale: string | undefined): TempUnit {
  const region = (locale ?? "").split(/[-_]/)[1]?.toUpperCase();
  return region && ["US", "LR", "BS", "BZ", "KY", "PW", "FM", "MH"].includes(region) ? "F" : "C";
}

export function defaultSettings(locale?: string): Settings {
  return { sound: true, rain: false, numbers: false, breathing: false, unit: defaultUnit(locale) };
}

type Store = Pick<Storage, "getItem" | "setItem">;

/** Reads what was saved, falling back field by field so a bad or old value never breaks the page. */
export function loadSettings(store: Store | undefined, locale?: string): Settings {
  const base = defaultSettings(locale);
  let raw: unknown;
  try {
    const text = store?.getItem(SETTINGS_KEY);
    raw = text ? JSON.parse(text) : undefined;
  } catch {
    return base;
  }
  if (!raw || typeof raw !== "object") return base;
  const r = raw as Record<string, unknown>;
  const bool = (k: keyof Settings) => (typeof r[k] === "boolean" ? (r[k] as boolean) : (base[k] as boolean));
  return {
    sound: bool("sound"),
    rain: bool("rain"),
    numbers: bool("numbers"),
    breathing: bool("breathing"),
    unit: r.unit === "C" || r.unit === "F" ? r.unit : base.unit,
  };
}

export function saveSettings(store: Store | undefined, s: Settings): void {
  try {
    store?.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    // Private mode or storage full: the setting still applies for this visit.
  }
}
