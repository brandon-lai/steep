import { describe, expect, it } from "vitest";
import { dragProgress, approach } from "../src/drag";
import { AGAIN_STEP, CLOSING_LINES, STEPS, nextStep, pickClosingLine } from "../src/flow";
import { BOIL_C, ROOM_C, freshKettle, judgeRelease, stepKettle } from "../src/kettle";
import { SETTINGS_KEY, defaultUnit, loadSettings, saveSettings } from "../src/settings";
import { liquorStrength, startSteep, steepProgress, steepRemaining } from "../src/steep";
import { TEAS, formatClock, formatSteep, formatTemp, speakSteep, toUnit } from "../src/teas";

describe("teas", () => {
  it("has the four launch teas with values inside the PRD's ranges", () => {
    expect(TEAS.map((t) => t.id)).toEqual(["green", "oolong", "black", "chamomile"]);
    const ranges = {
      green: { t: [75, 80], s: [120, 180] },
      oolong: { t: [85, 95], s: [180, 300] },
      black: { t: [95, 100], s: [180, 300] },
      chamomile: { t: [100, 100], s: [300, 300] },
    } as const;
    for (const tea of TEAS) {
      const r = ranges[tea.id];
      expect(tea.tempC).toBeGreaterThanOrEqual(r.t[0]);
      expect(tea.tempC).toBeLessThanOrEqual(r.t[1]);
      expect(tea.steepSeconds).toBeGreaterThanOrEqual(r.s[0]);
      expect(tea.steepSeconds).toBeLessThanOrEqual(r.s[1]);
    }
  });

  it("formats temperatures and times the way the tins print them", () => {
    expect(formatTemp(80, "C")).toBe("80°C");
    expect(formatTemp(80, "F")).toBe("176°F");
    expect(toUnit(100, "F")).toBe(212);
    expect(formatSteep(150)).toBe("2½ min");
    expect(formatSteep(300)).toBe("5 min");
    expect(speakSteep(150)).toBe("2 and a half minutes");
    expect(formatClock(125)).toBe("2:05");
    expect(formatClock(0.2)).toBe("0:01");
    expect(formatClock(-3)).toBe("0:00");
  });
});

describe("kettle", () => {
  const run = (holdSeconds: number, target: number) => {
    let k = freshKettle();
    for (let t = 0; t < holdSeconds; t += 0.05) k = stepKettle(k, 0.05, true, target);
    return stepKettle(k, 0.05, false, target);
  };

  it("heats only while held and stops at a boil", () => {
    let k = freshKettle();
    k = stepKettle(k, 1, false, 80);
    expect(k.tempC).toBe(ROOM_C);
    for (let i = 0; i < 400; i++) k = stepKettle(k, 0.05, true, 80);
    expect(k.tempC).toBe(BOIL_C);
  });

  it("accepts a release near the target", () => {
    expect(judgeRelease(77, 80)).toBe("ready");
    expect(judgeRelease(82, 80)).toBe("ready");
    expect(run(5, 80).phase).toBe("ready"); // 20 + 60 = 80
  });

  it("lets a too-cool kettle be held again, with nothing lost", () => {
    const k = run(2, 80);
    expect(k.phase).toBe("idle");
    expect(k.tempC).toBeCloseTo(44, 0);
    const again = stepKettle(k, 0.5, true, 80);
    expect(again.tempC).toBeGreaterThan(k.tempC);
  });

  it("cools a too-hot kettle down to the target on its own", () => {
    let k = run(10, 80);
    expect(k.phase).toBe("cooling");
    let seconds = 0;
    while (k.phase === "cooling" && seconds < 30) {
      k = stepKettle(k, 0.1, false, 80);
      seconds += 0.1;
    }
    expect(k.phase).toBe("ready");
    expect(k.tempC).toBe(80);
    expect(seconds).toBeLessThan(8);
  });

  it("reaches a boil for chamomile without any precision", () => {
    expect(run(9, 100).phase).toBe("ready");
  });

  it("ignores everything once ready", () => {
    const k = { tempC: 80, phase: "ready" as const };
    expect(stepKettle(k, 5, true, 80)).toBe(k);
  });
});

describe("steep timer", () => {
  it("runs on wall-clock time, so a backgrounded tab stays accurate", () => {
    const clock = startSteep(1_000, 150);
    expect(steepProgress(clock, 1_000)).toBe(0);
    // One jump of 75 seconds, as if no frames ran while the tab was hidden.
    expect(steepProgress(clock, 76_000)).toBeCloseTo(0.5);
    expect(steepRemaining(clock, 76_000)).toBeCloseTo(75);
    expect(steepProgress(clock, 999_999)).toBe(1);
    expect(steepRemaining(clock, 999_999)).toBe(0);
  });

  it("can be sped up for development without changing what the visitor reads", () => {
    const clock = startSteep(0, 150, 30);
    expect(clock.durationMs).toBe(5_000);
    expect(steepRemaining(clock, 2_500, 30)).toBeCloseTo(75);
  });

  it("colours fast at first, then slowly, ending fully steeped", () => {
    expect(liquorStrength(0)).toBe(0);
    expect(liquorStrength(1)).toBeCloseTo(1);
    expect(liquorStrength(0.25)).toBeGreaterThan(0.25);
    expect(liquorStrength(0.5)).toBeLessThan(liquorStrength(0.75));
  });
});

describe("settings", () => {
  const memory = () => {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m };
  };

  it("defaults to sound on, everything optional off", () => {
    expect(loadSettings(memory(), "en-GB")).toEqual({ sound: true, rain: false, numbers: false, breathing: false, unit: "C" });
  });

  it("uses Fahrenheit where people expect it", () => {
    expect(defaultUnit("en-US")).toBe("F");
    expect(defaultUnit("en-CA")).toBe("C");
    expect(defaultUnit("fr")).toBe("C");
    expect(defaultUnit(undefined)).toBe("C");
  });

  it("round-trips and survives junk", () => {
    const store = memory();
    saveSettings(store, { sound: false, rain: true, numbers: true, breathing: true, unit: "F" });
    expect(loadSettings(store, "en-GB")).toEqual({ sound: false, rain: true, numbers: true, breathing: true, unit: "F" });
    store.m.set(SETTINGS_KEY, "{not json");
    expect(loadSettings(store, "en-GB").sound).toBe(true);
    store.m.set(SETTINGS_KEY, JSON.stringify({ sound: "yes", unit: "K" }));
    expect(loadSettings(store, "en-GB")).toMatchObject({ sound: true, unit: "C" });
  });

  it("keeps working when storage throws", () => {
    const broken = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("denied");
      },
    };
    expect(loadSettings(broken, "en-GB").sound).toBe(true);
    expect(() => saveSettings(broken, loadSettings(undefined))).not.toThrow();
  });
});

describe("flow", () => {
  it("runs the eight steps in order and stays at the end", () => {
    expect(STEPS).toHaveLength(8);
    let s: (typeof STEPS)[number] = STEPS[0];
    const seen: string[] = [s];
    for (let i = 0; i < 10; i++) {
      s = nextStep(s);
      if (seen.at(-1) !== s) seen.push(s);
    }
    expect(seen).toEqual([...STEPS]);
    expect(AGAIN_STEP).toBe("choose");
  });

  it("never repeats the last closing line", () => {
    for (let last = 0; last < CLOSING_LINES.length; last++) {
      for (const r of [0, 0.2, 0.5, 0.8, 0.9999]) {
        const i = pickClosingLine(last, () => r);
        expect(i).not.toBe(last);
        expect(i).toBeGreaterThanOrEqual(0);
        expect(i).toBeLessThan(CLOSING_LINES.length);
      }
    }
    expect(pickClosingLine(null, () => 0.9999)).toBe(CLOSING_LINES.length - 1);
  });
});

describe("drag", () => {
  const from = { x: 0, y: 0 };
  const to = { x: 100, y: -50 };

  it("measures progress along the route, not raw distance", () => {
    expect(dragProgress({ x: 10, y: 10 }, { x: 60, y: -15 }, from, to)).toBeCloseTo(0.5);
    // Moving perpendicular to the route does nothing.
    expect(dragProgress({ x: 0, y: 0 }, { x: 50, y: 100 }, from, to)).toBeCloseTo(0);
    // Overshoot and backtrack are clamped.
    expect(dragProgress({ x: 0, y: 0 }, { x: 500, y: -250 }, from, to)).toBe(1);
    expect(dragProgress({ x: 0, y: 0 }, { x: -500, y: 250 }, from, to)).toBe(0);
  });

  it("resumes from where a released drag was", () => {
    expect(dragProgress({ x: 0, y: 0 }, { x: 20, y: -10 }, from, to, 0.6)).toBeCloseTo(0.8);
  });

  it("eases the same at any frame rate", () => {
    let a = 0;
    for (let i = 0; i < 60; i++) a = approach(a, 1, 1 / 60, 3);
    let b = 0;
    for (let i = 0; i < 30; i++) b = approach(b, 1, 1 / 30, 3);
    expect(a).toBeCloseTo(b, 6);
  });
});
