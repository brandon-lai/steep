// The ritual. One scene, one step at a time; each step waits for the visitor.
//
// Every frame: advance the step's own state (kettle heat, drag progress, steep clock),
// then write it all into the SVG and the steam canvas. Interaction is the same for mouse,
// touch and keyboard: a press either holds (the kettle) or drags along a fixed route
// (the scoop, the kettle, the pot), and holding Space or Enter walks the same route.

import { track } from "./analytics";
import { Sound } from "./audio";
import { approach, clamp01, dragProgress, easeInOut, lerp, span, type Vec } from "./drag";
import { CLOSING_LINES, LAST_CLOSING_KEY, STEPS, pickClosingLine, stepNumber, type Step } from "./flow";
import { freshKettle, heatFraction, stepKettle, type Kettle, type KettlePhase } from "./kettle";
import * as art from "./scene/art";
import { fitLayout, pickLayout, toScreen, type Fit, type Layout, type Pose } from "./scene/layout";
import { Steam, type Emitter } from "./scene/steam";
import { loadSettings, saveSettings, type Settings } from "./settings";
import { liquorStrength, startSteep, steepProgress, steepRemaining, type SteepClock } from "./steep";
import { TEAS, formatClock, formatSteep, formatTemp, speakSteep, speakTemp, type Tea } from "./teas";
import { Controls } from "./ui";

const SVG_NS = "http://www.w3.org/2000/svg";
const WATER: [number, number, number] = [236, 230, 216];

interface Drag {
  /** Where the object is drawn, 0 (resting) .. 1 (pouring). Eases toward `target`. */
  p: number;
  target: number;
  pointerId: number | null;
  keyHeld: boolean;
  pressAt: Vec;
  startP: number;
  /** The step's work is finished; the object is on its way home. */
  done: boolean;
  touched: boolean;
}

const freshDrag = (): Drag => ({ p: 0, target: 0, pointerId: null, keyHeld: false, pressAt: { x: 0, y: 0 }, startP: 0, done: false, touched: false });

interface Leaf {
  el: SVGGElement;
  /** Start of the fall and settled spot, pot-local. */
  sx: number;
  sy: number;
  bx: number;
  by: number;
  delay: number;
  fall: number;
  rot: number;
  spin: number;
  rise: number;
  phase: number;
}

interface Tween {
  from: number;
  to: number;
  start: number;
  ms: number;
  done?: () => void;
}

type Hit = "begin" | "kettle" | "scoop" | "pot" | `tin-${number}`;

export class App {
  private layout: Layout;
  private fit: Fit;
  private settings: Settings;
  private readonly sound = new Sound();
  private steam: Steam;
  private reduced: MediaQueryList;
  private pace: number;

  private step: Step = "arrive";
  private tea: Tea | null = null;
  private tinIndex = -1;
  private kettleState: Kettle = freshKettle();
  private kettleHeld = false;
  private scoop = freshDrag();
  private pour = freshDrag();
  private serve = freshDrag();
  private leaves: Leaf[] = [];
  private leavesDropped = false;
  private clock: SteepClock | null = null;
  private steepDone = false;
  private sitStartedAt = 0;
  private sessionStartedAt = 0;
  private begunAt = 0;
  private steepTimer = 0;
  private flow = 0;
  private agitation = 0;
  private stepIdle = 0;
  private advancing = false;
  private wakeLock: { release(): Promise<void> } | null = null;

  /** Smoothly animated values; see `animate`. */
  private v = {
    light: 0,
    tin: 0,
    tinLid: 0,
    scoopShow: 0,
    potLid: 0,
    potWater: 0,
    strength: 0,
    cupFill: 0,
    dim: 0,
    gauge: 0,
    breath: 0,
    glow: 0,
    hint: 0,
    clear: 1,
  };
  private tweens = new Map<keyof App["v"], Tween>();

  private el: {
    svg: SVGSVGElement;
    world: SVGGElement;
    line: HTMLElement;
    hint: HTMLElement;
    sr: HTMLElement;
    hits: HTMLElement;
    timer: HTMLElement;
    readout: HTMLElement;
    another: HTMLButtonElement;
    labels: HTMLElement[];
    hit: Map<Hit, HTMLButtonElement>;
  };
  private n!: Record<string, SVGElement>;
  private lastFrame = 0;
  private lineText = "";

  constructor(root: HTMLElement) {
    this.settings = loadSettings(safeStorage(), navigator.language);
    this.reduced = matchMedia("(prefers-reduced-motion: reduce)");
    this.pace = Math.max(1, Number(new URLSearchParams(location.search).get("pace")) || 1);
    this.layout = pickLayout(innerWidth, innerHeight);
    this.fit = fitLayout(this.layout, innerWidth, innerHeight);

    root.innerHTML = `
      <svg id="scene" xmlns="${SVG_NS}" aria-hidden="true" focusable="false"></svg>
      <canvas id="steam" aria-hidden="true"></canvas>
      <div id="grain" aria-hidden="true"></div>
      <div id="hits"></div>
      <div id="timer" class="numeral" aria-hidden="true"></div>
      <div id="readout" class="numeral" aria-hidden="true"></div>
      <p id="line" aria-hidden="true"></p>
      <p id="begin-hint" aria-hidden="true">Tap anywhere to begin</p>
      <button id="another" class="quiet" type="button" tabindex="-1">Make another</button>
      <div id="sr" class="visually-hidden" aria-live="polite"></div>`;

    const $ = <T extends Element>(sel: string) => root.querySelector(sel) as T;
    this.el = {
      svg: $("#scene"),
      world: document.createElementNS(SVG_NS, "g"),
      line: $("#line"),
      hint: $("#begin-hint"),
      sr: $("#sr"),
      hits: $("#hits"),
      timer: $("#timer"),
      readout: $("#readout"),
      another: $("#another"),
      labels: [],
      hit: new Map(),
    };
    this.steam = new Steam($("#steam"), () => this.reduced.matches);
    new Controls(root, this.settings, (s) => this.applySettings(s));

    this.buildScene();
    this.buildHits();
    this.resize();
    addEventListener("resize", () => this.resize());
    document.addEventListener("visibilitychange", () => this.onVisibility());
    addEventListener("pagehide", () => this.onLeave());
    this.el.another.addEventListener("click", () => this.makeAnother());
    makeGrain($("#grain"));

    this.enter("arrive");
    requestAnimationFrame((t) => this.frame(t));
  }

  // MARK: - Building

  private buildScene() {
    const l = this.layout;
    const svg = this.el.svg;
    svg.setAttribute("viewBox", `0 0 ${l.w} ${l.h}`);
    svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
    const tins = TEAS.map((t, i) => `<g id="tin-${i}">${art.tin(t, i)}</g>`).join("");
    svg.innerHTML = `${art.defs()}
      <g id="room">${art.room(l)}</g>
      <ellipse id="lamp" cx="${l.lamp.x}" cy="${l.lamp.y}" rx="${l.w * 0.75}" ry="${l.h * 0.7}" fill="url(#g-lamp)"/>
      <g id="shadows">
        <ellipse id="sh-kettle" fill="url(#g-shadow)"/>
        <ellipse id="sh-pot" fill="url(#g-shadow)"/>
        <ellipse id="sh-cup" fill="url(#g-shadow)"/>
        <ellipse id="sh-tin" fill="url(#g-shadow)"/>
        <ellipse id="sh-lid" fill="url(#g-shadow)"/>
      </g>
      <ellipse id="glow" fill="url(#g-breath)" opacity="0"/>
      <ellipse id="breath" fill="url(#g-breath)" opacity="0"/>
      <g id="gauge-pos">${art.gauge()}</g>
      <g id="tins">${tins}</g>
      <g id="cup">${art.cup()}</g>
      <g id="pot">${art.pot()}</g>
      <g id="lid">${art.potLid()}</g>
      <g id="kettle">${art.kettle()}</g>
      <g id="scoop" opacity="0">${art.scoop()}</g>
      <path id="stream" fill="none" stroke-linecap="round" opacity="0"/>
      <path id="route-hint" fill="none" stroke="#f1e3c8" stroke-width="3" stroke-dasharray="2 14" stroke-linecap="round" opacity="0"/>
      <rect id="dim" x="-4000" y="-4000" width="${l.w + 8000}" height="${l.h + 8000}" fill="#0c0603" opacity="0.5" pointer-events="none"/>`;
    const ids = [
      "lamp", "sh-kettle", "sh-pot", "sh-cup", "sh-tin", "sh-lid", "glow", "breath", "gauge", "gauge-pos", "gauge-fill",
      "gauge-target", "cup", "cup-liquor", "cup-shine", "pot", "pot-liquor", "pot-liquor-body", "pot-liquor-top",
      "pot-leaves", "pot-spout-liquor", "lid", "kettle", "scoop", "scoop-leaves", "stream", "route-hint", "dim", "rain",
    ];
    this.n = Object.fromEntries(ids.map((id) => [id, svg.getElementById(id) as SVGElement]));
    // Leaves already in the pot survive a rebuild (a resize that switches layout).
    for (const leaf of this.leaves) this.n["pot-leaves"]!.appendChild(leaf.el);
    // Refill the scoop only if its leaves haven't gone into the pot yet.
    if (this.tea && !this.leavesDropped) this.fillScoop();
    this.n.rain!.setAttribute("opacity", this.settings.rain ? "1" : "0");
  }

  private buildHits() {
    const make = (id: Hit, label: string) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "hit";
      b.id = `hit-${id}`;
      b.setAttribute("aria-label", label);
      b.hidden = true;
      this.el.hits.appendChild(b);
      this.el.hit.set(id, b);
      return b;
    };

    const begin = make("begin", "Let's make some tea. Press to begin.");
    begin.addEventListener("click", () => this.begin());

    TEAS.forEach((t, i) => {
      const b = make(`tin-${i}`, "");
      b.addEventListener("click", () => this.choose(i));
      b.addEventListener("pointerenter", () => this.hoverTin(i, true));
      b.addEventListener("pointerleave", () => this.hoverTin(i, false));
      b.addEventListener("focus", () => this.hoverTin(i, true));
      b.addEventListener("blur", () => this.hoverTin(i, false));
      const label = document.createElement("div");
      label.className = "tin-label";
      label.setAttribute("aria-hidden", "true");
      this.el.hits.appendChild(label);
      this.el.labels.push(label);
      void t;
    });
    this.refreshTinLabels();

    const holdable: [Hit, string][] = [
      ["kettle", "Kettle"],
      ["scoop", "Scoop"],
      ["pot", "Teapot"],
    ];
    for (const [id, label] of holdable) {
      const b = make(id, label);
      b.addEventListener("pointerdown", (e) => this.press(id, e));
      b.addEventListener("pointermove", (e) => this.move(id, e));
      b.addEventListener("pointerup", (e) => this.release(id, e));
      b.addEventListener("pointercancel", (e) => this.release(id, e));
      b.addEventListener("lostpointercapture", (e) => this.release(id, e));
      b.addEventListener("keydown", (e) => this.keyDown(id, e));
      b.addEventListener("keyup", (e) => this.keyUp(id, e));
      b.addEventListener("blur", () => this.keyUp(id, null));
      b.addEventListener("contextmenu", (e) => e.preventDefault());
    }

    // The begin button covers the whole screen, so a tap anywhere begins; so does Enter or Space.
    // It reacts to click, not pointerdown, so the same tap can't land on a tin that appears under it.
    addEventListener("keydown", (e) => {
      if (this.step === "arrive" && (e.key === "Enter" || e.key === " ") && !(e.target as Element).closest?.("#controls, #settings")) {
        e.preventDefault();
        this.begin();
      }
    });
  }

  private refreshTinLabels() {
    TEAS.forEach((t, i) => {
      const u = this.settings.unit;
      this.el.hit.get(`tin-${i}`)!.setAttribute(
        "aria-label",
        `${t.name} tea. Water at ${speakTemp(t.tempC, u)}, steeps for ${speakSteep(t.steepSeconds)}.`,
      );
      this.el.labels[i]!.innerHTML = `<span class="name">${t.name}</span><span class="spec">${formatTemp(t.tempC, u)}</span><span class="spec">${formatSteep(t.steepSeconds)}</span>`;
    });
  }

  // MARK: - Layout

  private resize() {
    const next = pickLayout(innerWidth, innerHeight);
    if (next !== this.layout) {
      this.layout = next;
      this.buildScene();
    }
    this.fit = fitLayout(this.layout, innerWidth, innerHeight);
    this.steam.resize(innerWidth, innerHeight);
    this.placeHits();
  }

  /** Puts each invisible button over the thing it controls, and the tin labels under the tins. */
  private placeHits() {
    const l = this.layout;
    const box = (id: Hit, pose: Pose, x0: number, y0: number, x1: number, y1: number) => {
      const a = toScreen(this.fit, { x: pose.x + x0 * pose.s, y: pose.y + y0 * pose.s });
      const b = toScreen(this.fit, { x: pose.x + x1 * pose.s, y: pose.y + y1 * pose.s });
      Object.assign(this.el.hit.get(id)!.style, {
        left: `${a.x}px`,
        top: `${a.y}px`,
        width: `${b.x - a.x}px`,
        height: `${b.y - a.y}px`,
      });
    };
    l.tins.forEach((p, i) => {
      box(`tin-${i}`, { ...p, s: l.tinScale }, -62, -165, 62, 70);
      const at = toScreen(this.fit, { x: p.x, y: p.y + 30 });
      Object.assign(this.el.labels[i]!.style, { left: `${at.x}px`, top: `${at.y}px` });
    });
    box("kettle", l.kettle, -115, -250, 180, 12);
    box("scoop", l.tinTable, -135, -230, 60, 12);
    box("pot", l.pot, -170, -200, 175, 12);

    // Each drag's route on screen, for tests that drive real pointer input.
    for (const id of ["scoop", "kettle", "pot"] as const) {
      const [from, to] = this.route(id);
      const a = toScreen(this.fit, from);
      const b = toScreen(this.fit, to);
      this.el.hit.get(id)!.dataset.route = `${Math.round(b.x - a.x)},${Math.round(b.y - a.y)}`;
    }

    const timer = toScreen(this.fit, { x: l.pot.x, y: l.pot.y + 34 * l.pot.s });
    Object.assign(this.el.timer.style, { left: `${timer.x}px`, top: `${timer.y}px` });
    const g = this.gaugePose();
    const readout = toScreen(this.fit, { x: g.x, y: g.y + 14 * g.s });
    Object.assign(this.el.readout.style, { left: `${readout.x}px`, top: `${readout.y}px` });
  }

  private gaugePose(): Pose {
    const k = this.layout.kettle;
    return { x: k.x - 150 * k.s, y: k.y - 24 * k.s, s: k.s };
  }

  // MARK: - Steps

  private enter(step: Step) {
    this.step = step;
    this.stepIdle = 0;
    this.advancing = false;
    document.body.dataset.step = step;
    const tea = this.tea;
    const u = this.settings.unit;
    const n = `Step ${stepNumber(step)} of ${STEPS.length}.`;

    for (const [id, b] of this.el.hit) b.hidden = !this.hitActive(id);
    if (tea) {
      this.el.hit.get("kettle")!.setAttribute(
        "aria-label",
        step === "heat" ? `Kettle. Hold to heat the water to ${speakTemp(tea.tempC, u)}.` : "Kettle. Hold to pour it into the teapot.",
      );
      this.el.hit.get("scoop")!.setAttribute("aria-label", `Scoop of ${tea.name.toLowerCase()} ${tea.scoopNoun}. Hold to tip it into the teapot.`);
      this.el.hit.get("pot")!.setAttribute("aria-label", "Teapot. Hold to pour a cup.");
    }

    switch (step) {
      case "arrive":
        this.say("Let's make some tea.", "Let's make some tea. Press Enter or tap anywhere to begin.");
        break;
      case "choose":
        this.say("Choose a tea.", `${n} Choose a tea. There are four tins: green, oolong, black and chamomile.`);
        break;
      case "heat":
        this.say(
          "Hold the kettle to warm the water.",
          `${n} Warm the water. Press and hold the kettle, or hold Space on it, and let go near ${speakTemp(tea!.tempC, u)}.`,
        );
        this.animate("gauge", 1, 1600);
        break;
      case "leaves":
        this.say(
          `Scoop the ${tea!.scoopNoun} into the pot.`,
          `${n} Add the ${tea!.scoopNoun}. Drag the scoop from the tin to the teapot, or hold Space on it.`,
        );
        this.animate("gauge", 0, 1600);
        this.animate("tinLid", 1, 1800);
        this.animate("potLid", 1, 2200, () => this.sound.clink(0.62, 0.7));
        break;
      case "pour":
        this.say("Tip the kettle over the pot.", `${n} Pour the water. Drag the kettle over the teapot, or hold Space on it, until the pot is full.`);
        break;
      case "steep": {
        this.clock = startSteep(Date.now(), tea!.steepSeconds, this.pace);
        this.steepDone = false;
        this.steepTimer = window.setTimeout(() => this.checkSteep(), this.clock.durationMs + 50);
        this.animate("potLid", 0, 2200, () => this.sound.clink(0.62, 0.8));
        const breathing = this.settings.breathing ? " Breathe with the glow, in as it brightens and out as it fades." : "";
        this.say(
          this.settings.breathing ? "Breathe with the glow." : "Now let it steep.",
          `${n} Steeping for ${speakSteep(tea!.steepSeconds)}. A chime will sound when it's ready.${breathing}`,
        );
        void this.keepAwake(true);
        // The line fades after a while: during the steep there is nothing to do.
        window.setTimeout(() => this.step === "steep" && this.say("", ""), 9000);
        break;
      }
      case "cup":
        this.say("It's ready. Pour yourself a cup.", `${n} It's ready. Drag the teapot over the cup, or hold Space on it, to pour.`);
        document.title = "Your tea is ready · Steep";
        break;
      case "sit": {
        const last = Number(safeStorage()?.getItem(LAST_CLOSING_KEY) ?? NaN);
        const i = pickClosingLine(Number.isInteger(last) ? last : null);
        safeStorage()?.setItem(LAST_CLOSING_KEY, String(i));
        this.say(CLOSING_LINES[i]!, `${n} ${CLOSING_LINES[i]} Make another is available whenever you want it.`);
        this.sitStartedAt = performance.now();
        this.sound.settle();
        this.animate("dim", 1, 9000);
        void this.keepAwake(false);
        document.title = "Steep";
        track("sit", { tea: this.tea!.id, minutes: Math.round((Date.now() - this.sessionStartedAt) / 60000) });
        window.setTimeout(() => {
          if (this.step !== "sit") return;
          this.el.another.classList.add("shown");
          this.el.another.tabIndex = 0;
        }, 7000);
        break;
      }
    }
    this.focusStep();
  }

  private hitActive(id: Hit): boolean {
    switch (this.step) {
      case "arrive":
        return id === "begin";
      case "choose":
        return id.startsWith("tin-");
      case "heat":
      case "pour":
        return id === "kettle";
      case "leaves":
        return id === "scoop";
      case "cup":
        return id === "pot";
      default:
        return false;
    }
  }

  /** Keyboard users land on the new step's control without hunting for it. */
  private focusStep() {
    const active = document.activeElement;
    const onStepControl = !active || active === document.body || (active as HTMLElement).classList?.contains("hit") || active === this.el.another;
    if (!onStepControl) return;
    const first = [...this.el.hit.entries()].find(([id]) => this.hitActive(id) && id !== "begin");
    if (first) first[1].focus({ preventScroll: true });
    else if (this.step === "sit") (document.activeElement as HTMLElement | null)?.blur?.();
  }

  private next() {
    if (this.advancing) return;
    this.advancing = true;
    const i = STEPS.indexOf(this.step);
    this.enter(STEPS[i + 1]!);
  }

  private begin() {
    if (this.step !== "arrive") return;
    this.sound.unlock(this.settings.sound, this.settings.rain);
    this.sessionStartedAt = Date.now();
    this.begunAt = performance.now();
    this.animate("light", 1, 3200);
    this.el.hint.classList.add("gone");
    track("begin");
    this.next();
  }

  private choose(i: number) {
    // A key or tap that began the ritual must not also pick the tin that appeared under it.
    if (this.step !== "choose" || this.tea || performance.now() - this.begunAt < 500) return;
    this.tea = TEAS[i]!;
    this.tinIndex = i;
    this.hoverTin(i, false);
    for (const [id, b] of this.el.hit) if (id.startsWith("tin-")) b.hidden = true;
    this.el.labels.forEach((l) => l.classList.remove("shown"));
    this.say("", `${this.tea.name} tea.`);
    this.fillScoop();
    track("tea", { tea: this.tea.id });
    this.animate("tin", 1, this.reduced.matches ? 1400 : 2600, () => {
      this.sound.tinTap();
      this.next();
    });
  }

  private hoverTin(i: number, on: boolean) {
    const g = this.n[`tin-${i}`] ?? (this.el.svg.getElementById(`tin-${i}`) as SVGElement);
    g?.classList.toggle("lifted", on && this.step === "choose" && !this.tea);
  }

  private makeAnother() {
    if (this.step !== "sit") return;
    track("another", { tea: this.tea!.id });
    this.el.another.classList.remove("shown");
    this.el.another.tabIndex = -1;
    this.say("", "");
    this.animate("clear", 0, 2400, () => {
      // Empty everything quietly, then put the tin back on the shelf.
      for (const leaf of this.leaves) leaf.el.remove();
      this.leaves = [];
      this.leavesDropped = false;
      this.v.potWater = 0;
      this.v.cupFill = 0;
      this.v.strength = 0;
      this.v.tinLid = 0;
      this.v.clear = 1;
      this.kettleState = freshKettle();
      this.kettleHeld = false;
      this.scoop = freshDrag();
      this.pour = freshDrag();
      this.serve = freshDrag();
      this.clock = null;
      this.animate("dim", 0, 4000);
      this.animate("tin", 0, this.reduced.matches ? 1400 : 2600, () => {
        this.sound.tinTap(0.7);
        this.tea = null;
        this.tinIndex = -1;
        this.n["scoop-leaves"]!.innerHTML = "";
        this.enter("choose");
      });
    });
  }

  // MARK: - Input

  private press(id: Hit, e: PointerEvent) {
    if (!this.hitActive(id)) return;
    e.preventDefault();
    try {
      (e.currentTarget as Element).setPointerCapture(e.pointerId);
    } catch {
      // Synthetic or already-released pointers can't be captured; the drag still works.
    }
    this.stepIdle = 0;
    this.animate("glow", 0, 800);
    if (id === "kettle" && this.step === "heat") {
      this.kettleHeld = true;
      return;
    }
    const d = this.dragFor(id);
    if (!d || d.done) return;
    d.pointerId = e.pointerId;
    d.pressAt = this.toScene(e);
    d.startP = d.p;
    d.touched = true;
  }

  private move(id: Hit, e: PointerEvent) {
    const d = this.dragFor(id);
    if (!d || d.pointerId !== e.pointerId || d.done) return;
    const [from, to] = this.route(id);
    d.target = dragProgress(d.pressAt, this.toScene(e), from, to, d.startP);
    this.stepIdle = 0;
  }

  private release(id: Hit, e: PointerEvent) {
    if (id === "kettle" && this.step === "heat") {
      this.kettleHeld = false;
      return;
    }
    const d = this.dragFor(id);
    if (!d || d.pointerId !== e.pointerId) return;
    d.pointerId = null;
    if (!d.keyHeld) d.target = 0;
  }

  private keyDown(id: Hit, e: KeyboardEvent) {
    if (e.key !== " " && e.key !== "Enter") return;
    e.preventDefault();
    if (e.repeat || !this.hitActive(id)) return;
    this.stepIdle = 0;
    this.animate("glow", 0, 800);
    if (id === "kettle" && this.step === "heat") {
      this.kettleHeld = true;
      return;
    }
    const d = this.dragFor(id);
    if (d && !d.done) {
      d.keyHeld = true;
      d.touched = true;
    }
  }

  private keyUp(id: Hit, e: KeyboardEvent | null) {
    if (e && e.key !== " " && e.key !== "Enter") return;
    if (id === "kettle" && this.step === "heat") {
      this.kettleHeld = false;
      return;
    }
    const d = this.dragFor(id);
    if (!d || !d.keyHeld) return;
    d.keyHeld = false;
    if (d.pointerId === null) d.target = 0;
  }

  private dragFor(id: Hit): Drag | null {
    if (id === "scoop" && this.step === "leaves") return this.scoop;
    if (id === "kettle" && this.step === "pour") return this.pour;
    if (id === "pot" && this.step === "cup") return this.serve;
    return null;
  }

  private toScene(e: PointerEvent): Vec {
    return { x: (e.clientX - this.fit.ox) / this.fit.scale, y: (e.clientY - this.fit.oy) / this.fit.scale };
  }

  // MARK: - Routes

  /** The resting and pouring positions of whatever `id` drags. */
  private route(id: Hit): [Vec, Vec] {
    if (id === "scoop") return [this.scoopRest().pos, this.scoopPour()];
    if (id === "kettle") return [this.layout.kettle, this.kettlePour()];
    return [this.layout.pot, this.potPour()];
  }

  private kettlePour(): Vec {
    const { pot, kettle } = this.layout;
    const over = { x: pot.x - 6 * pot.s, y: pot.y + pot.s * (art.POT.rimY - 150) };
    return art.placeSoThat(art.KETTLE.spout, over, kettle.s, art.KETTLE.pivot, art.KETTLE.pourAngle);
  }

  private potPour(): Vec {
    const { pot, cup } = this.layout;
    const over = { x: cup.x - 22 * cup.s, y: cup.y + cup.s * (art.CUP.rimY - this.layout.cupPourHeight) };
    return art.placeSoThat(art.POT.spout, over, pot.s, art.POT.pivot, art.POT.pourAngle);
  }

  private tinPose(): Pose {
    const l = this.layout;
    const home = l.tins[Math.max(0, this.tinIndex)]!;
    const t = this.travel(this.v.tin);
    const lift = Math.sin(Math.PI * t.at) * 60;
    return {
      x: lerp(home.x, l.tinTable.x, t.at),
      y: lerp(home.y, l.tinTable.y, t.at) - lift,
      s: lerp(l.tinScale, l.tinTable.s, t.at),
    };
  }

  private scoopRest(): { pos: Vec; s: number } {
    const t = this.layout.tinTable;
    return { pos: { x: t.x - 4 * t.s, y: t.y - 132 * t.s }, s: t.s };
  }

  private scoopPour(): Vec {
    const p = this.layout.pot;
    return { x: p.x - 10 * p.s, y: p.y + p.s * (art.POT.rimY - 52) };
  }

  /** Along a drag route: position eases first, the tilt comes in at the end. */
  private along(d: number, rest: Vec, end: Vec, lift: number, tilt: number, rest0 = 0) {
    const move = easeInOut(span(d, 0, 0.8));
    return {
      pos: { x: lerp(rest.x, end.x, move), y: lerp(rest.y, end.y, move) - Math.sin(Math.PI * span(d, 0, 0.8)) * lift },
      deg: lerp(rest0, tilt, easeInOut(span(d, 0.55, 1))),
    };
  }

  /**
   * Automatic moves (the tin, the lids) under reduced motion become a fade out and back in
   * at the destination instead of a glide.
   */
  private travel(t: number): { at: number; opacity: number } {
    if (!this.reduced.matches) return { at: easeInOut(t), opacity: 1 };
    return { at: t < 0.5 ? 0 : 1, opacity: Math.abs(1 - 2 * t) };
  }

  // MARK: - Leaves

  private fillScoop() {
    const tea = this.tea;
    const g = this.n["scoop-leaves"]!;
    g.innerHTML = "";
    if (!tea) return;
    let html = "";
    for (let i = 0; i < 30; i++) {
      const x = (Math.random() - 0.5) * 40;
      const y = -2 - Math.random() * 8 * (1 - Math.abs(x) / 24);
      html += `<g transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${Math.round(Math.random() * 180)})">${art.leafShape(tea.leaf, i)}</g>`;
    }
    g.innerHTML = html;
  }

  /** Tips the scoop's leaves into the pot: each falls from where it was to a spot on the bottom. */
  private dropLeaves(scoopPos: Vec, scoopS: number, deg: number) {
    const tea = this.tea!;
    const pot = this.layout.pot;
    this.leavesDropped = true;
    const src = [...this.n["scoop-leaves"]!.children] as SVGGElement[];
    const calm = this.reduced.matches;
    src.forEach((child, i) => {
      const m = /translate\(([-\d.]+) ([-\d.]+)\)/.exec(child.getAttribute("transform") ?? "");
      const local = { x: Number(m?.[1] ?? 0), y: Number(m?.[2] ?? 0) };
      const world = art.localToWorld(local, scoopPos, scoopS, { x: 0, y: 0 }, deg);
      const bx = (Math.random() - 0.5) * 108;
      const el = document.createElementNS(SVG_NS, "g");
      el.innerHTML = art.leafShape(tea.leaf, i);
      this.n["pot-leaves"]!.appendChild(el);
      this.leaves.push({
        el,
        sx: (world.x - pot.x) / pot.s,
        sy: (world.y - pot.y) / pot.s,
        bx,
        by: -6 - Math.random() * 14 * (1 - Math.abs(bx) / 60),
        delay: calm ? 0 : i * 0.035 + Math.random() * 0.1,
        fall: calm ? 1 : 0,
        rot: Math.random() * 180,
        spin: (Math.random() - 0.5) * 220,
        rise: 20 + Math.random() * 90,
        phase: Math.random() * Math.PI * 2,
      });
    });
    this.n["scoop-leaves"]!.innerHTML = "";
    this.sound.rustle(1.3);
  }

  private updateLeaves(dt: number, time: number) {
    const unfurl = this.tea && this.tea.leaf !== "twisted" ? 1 + this.v.strength * (this.tea.leaf === "rolled" ? 0.9 : 0.4) : 1;
    for (const leaf of this.leaves) {
      if (leaf.delay > 0) {
        leaf.delay -= dt;
        leaf.el.setAttribute("opacity", "0");
        continue;
      }
      leaf.fall = Math.min(1, leaf.fall + dt / 1.1);
      const f = easeInOut(leaf.fall);
      const flutter = Math.sin(leaf.fall * 7 + leaf.phase) * 7 * (1 - leaf.fall);
      const a = this.agitation;
      const x = lerp(leaf.sx, leaf.bx, f) + flutter + Math.sin(time * 0.5 + leaf.phase) * 26 * a;
      const y = lerp(leaf.sy, leaf.by, f) - leaf.rise * a;
      leaf.rot += leaf.spin * dt * (1 - leaf.fall + a * 0.4);
      leaf.el.setAttribute("opacity", String(this.v.clear));
      leaf.el.setAttribute("transform", `translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${leaf.rot.toFixed(0)}) scale(${unfurl.toFixed(2)})`);
    }
  }

  // MARK: - Frame

  private frame(now: number) {
    const dt = Math.min(0.05, (now - (this.lastFrame || now)) / 1000);
    this.lastFrame = now;
    const time = now / 1000;
    this.runTweens(now);
    this.stepIdle += dt;
    this.update(dt, time);
    this.render(time);
    this.sound.tick(dt);
    this.steam.update(dt, this.emitters(time));
    this.steam.draw(this.fit);
    requestAnimationFrame((t) => this.frame(t));
  }

  private update(dt: number, time: number) {
    const tea = this.tea;

    if (this.step === "heat" && tea) {
      const before = this.kettleState.phase;
      this.kettleState = stepKettle(this.kettleState, dt, this.kettleHeld, tea.tempC);
      const k = this.kettleState;
      this.sound.setKettle(heatFraction(k.tempC), this.kettleHeld);
      if (k.phase !== before) this.onKettlePhase(k.phase);
    }

    // Drags: the drawn position eases toward the finger, slowly on the way home.
    for (const d of [this.scoop, this.pour, this.serve]) {
      if (d.keyHeld && !d.done) d.target = Math.min(1, d.target + dt * 0.55);
      const holding = d.pointerId !== null || d.keyHeld;
      d.p = approach(d.p, d.target, dt, holding ? 7 : 2.4);
    }

    if (this.step === "leaves") {
      const d = this.scoop;
      if (!this.leavesDropped && d.p > 0.93) {
        const s = this.scoopRest();
        const at = this.along(d.p, s.pos, this.scoopPour(), 50, art.SCOOP.pourTilt, art.SCOOP.restTilt);
        this.dropLeaves(at.pos, s.s, at.deg);
        window.setTimeout(() => {
          d.done = true;
          d.target = 0;
          d.keyHeld = false;
        }, 1100);
      }
      if (d.done && d.p < 0.02 && !this.advancing) {
        this.animate("tinLid", 0, 1600, () => this.sound.tinTap(0.6));
        this.next();
      }
    }

    if (this.step === "pour") {
      const d = this.pour;
      const pouring = d.p > 0.93 && (d.pointerId !== null || d.keyHeld) && !d.done;
      this.flow = approach(this.flow, pouring ? 1 : 0, dt, 6);
      if (this.flow > 0.2) this.v.potWater = Math.min(1, this.v.potWater + (dt * this.flow) / 5);
      this.agitation = approach(this.agitation, pouring ? 1 : this.agitation * 0.98, dt, pouring ? 1.4 : 0.15);
      this.sound.setPour(this.flow, this.v.potWater);
      this.sound.setSteam(this.flow * 0.8);
      this.sound.wobble();
      if (this.v.potWater >= 1 && !d.done) {
        d.done = true;
        d.target = 0;
        d.keyHeld = false;
      }
      if (d.done && d.p < 0.02 && !this.advancing) {
        this.sound.clink(0.5, 0.5);
        this.next();
      }
    } else if (this.step !== "cup") {
      this.agitation = approach(this.agitation, 0, dt, 0.09);
    }

    if (this.step === "steep") this.checkSteep();

    if (this.step === "cup") {
      const d = this.serve;
      const pouring = d.p > 0.93 && (d.pointerId !== null || d.keyHeld) && !d.done;
      this.flow = approach(this.flow, pouring ? 1 : 0, dt, 6);
      if (this.flow > 0.2) this.v.cupFill = Math.min(1, this.v.cupFill + (dt * this.flow) / 4.5);
      this.sound.setPour(this.flow * 0.8, 0.3 + this.v.cupFill * 0.7);
      this.sound.wobble();
      if (this.v.cupFill >= 1 && !d.done) {
        d.done = true;
        d.target = 0;
        d.keyHeld = false;
      }
      if (d.done && d.p < 0.02 && !this.advancing) {
        this.sound.clink(0.5, 0.6);
        this.next();
      }
    }

    // A faint path from the object to where it goes, if the visitor seems unsure.
    const dragStep = this.step === "leaves" || this.step === "pour" || this.step === "cup";
    const active = this.step === "leaves" ? this.scoop : this.step === "pour" ? this.pour : this.serve;
    const unsure = dragStep && !active.done && active.p < 0.05 && this.stepIdle > 6;
    this.v.hint = approach(this.v.hint, unsure ? 1 : 0, dt, 1.2);
    const affordance = this.hitActiveAny() && this.stepIdle > 2.5 && !this.anyHolding() && this.step !== "arrive";
    this.v.glow = approach(this.v.glow, affordance ? 1 : 0, dt, 0.8);
    this.v.breath = approach(this.v.breath, this.step === "steep" && this.settings.breathing ? 1 : 0, dt, 0.6);
    this.updateLeaves(dt, time);
  }

  /**
   * Runs every frame, and from a timer too: frames stop while the tab is hidden, and someone
   * brewing a real cup alongside still needs the chime on time.
   */
  private checkSteep() {
    if (this.step !== "steep" || !this.clock) return;
    const now = Date.now();
    const p = steepProgress(this.clock, now);
    this.v.strength = liquorStrength(p);
    const left = steepRemaining(this.clock, now, this.pace);
    document.title = this.settings.numbers ? `${formatClock(left)} · Steep` : "Steeping · Steep";
    if (p >= 1 && !this.steepDone) {
      this.steepDone = true;
      window.clearTimeout(this.steepTimer);
      this.sound.chime();
      this.next();
    }
  }

  private hitActiveAny() {
    return ["heat", "leaves", "pour", "cup"].includes(this.step) && !this.advancing;
  }

  private anyHolding() {
    return this.kettleHeld || [this.scoop, this.pour, this.serve].some((d) => d.pointerId !== null || d.keyHeld);
  }

  private onKettlePhase(phase: KettlePhase) {
    const tea = this.tea!;
    const u = this.settings.unit;
    const temp = this.kettleState.tempC;
    if (phase === "idle" && temp > 21) this.say("A little warmer.", `${speakTemp(temp, u)}. A little warmer: hold the kettle again.`);
    if (phase === "cooling") this.say("Let it cool a moment.", `${speakTemp(temp, u)}. A little hot, so it's cooling to ${speakTemp(tea.tempC, u)}.`);
    if (phase === "ready") {
      this.sound.setKettle(heatFraction(tea.tempC), false);
      this.say("Just right.", `${speakTemp(tea.tempC, u)}. Just right.`);
      window.setTimeout(() => this.step === "heat" && this.next(), 1600);
    }
  }

  // MARK: - Render

  private render(time: number) {
    const l = this.layout;
    const n = this.n;
    const v = this.v;
    const set = (el: SVGElement | undefined, attrs: Record<string, string | number>) => {
      if (!el) return;
      for (const k in attrs) el.setAttribute(k, String(attrs[k]));
    };
    const calm = this.reduced.matches;

    // Light: dark on arrival, the lamp warms up on the first tap, and the room dims a little at the end.
    const flicker = calm ? 0 : Math.sin(time * 1.3) * 0.02 + Math.sin(time * 3.7 + 1) * 0.012 + Math.sin(time * 7.9) * 0.006;
    set(n.lamp, { opacity: (0.35 + 0.65 * v.light) * (1 - 0.25 * v.dim) + flicker });
    set(n.dim, { opacity: (1 - v.light) * 0.5 + v.dim * 0.22 });

    // Tins: the chosen one glides down to the table.
    const tin = this.tinIndex >= 0 ? this.tinPose() : null;
    l.tins.forEach((p, i) => {
      const g = this.el.svg.getElementById(`tin-${i}`) as SVGGElement | null;
      if (!g) return;
      if (i === this.tinIndex && tin) {
        const tr = this.travel(v.tin);
        g.setAttribute("transform", art.transform(tin, tin.s, { x: 0, y: 0 }, 0));
        g.setAttribute("opacity", String(tr.opacity));
      } else {
        g.setAttribute("transform", art.transform(p, l.tinScale, { x: 0, y: 0 }, 0));
        g.setAttribute("opacity", "1");
      }
    });
    if (this.tinIndex >= 0) {
      const lid = this.el.svg.getElementById(`tin-${this.tinIndex}-lid`) as SVGGElement | null;
      const t = this.travel(v.tinLid);
      lid?.setAttribute("transform", `translate(${(-96 * t.at).toFixed(1)} ${(128 * t.at - Math.sin(Math.PI * t.at) * 40).toFixed(1)})`);
      lid?.setAttribute("opacity", String(t.opacity));
    }
    const onTable = tin ? span(v.tin, 0.7, 1) : 0;
    set(n["sh-tin"], tin ? { cx: tin.x + 14 * tin.s, cy: l.tinTable.y, rx: 64 * tin.s, ry: 13 * tin.s, opacity: onTable } : { opacity: 0 });

    // Kettle.
    const k = l.kettle;
    const kd = this.step === "pour" ? this.pour : null;
    const kAt = this.along(kd?.p ?? 0, k, this.kettlePour(), 40, art.KETTLE.pourAngle);
    set(n.kettle, { transform: art.transform(kAt.pos, k.s, art.KETTLE.pivot, kAt.deg) });
    this.shadow(n["sh-kettle"], kAt.pos, k, art.KETTLE.halfWidth);

    // Gauge.
    const g = this.gaugePose();
    const heat = heatFraction(this.kettleState.tempC);
    set(n["gauge-pos"], { transform: `translate(${g.x} ${g.y}) scale(${g.s})` });
    set(n.gauge, { opacity: v.gauge * v.light });
    set(n["gauge-fill"], { y: -3 - 164 * heat, height: 164 * heat });
    if (this.tea) set(n["gauge-target"], { transform: `translate(0 ${(-3 - 164 * heatFraction(this.tea.tempC)).toFixed(1)})` });

    // Pot, its lid, and what's in it.
    const p = l.pot;
    const pAt = this.along(this.step === "cup" ? this.serve.p : 0, p, this.potPour(), 30, art.POT.pourAngle);
    set(n.pot, { transform: art.transform(pAt.pos, p.s, art.POT.pivot, pAt.deg) });
    this.shadow(n["sh-pot"], pAt.pos, p, art.POT.halfWidth);
    const tea = this.tea;
    const remaining = v.potWater * (1 - 0.6 * v.cupFill);
    const levelY = -4 - 128 * remaining;
    const rgb = tea ? mix(WATER, tea.liquor, v.strength) : WATER;
    set(n["pot-liquor"], { opacity: remaining > 0.005 ? v.clear : 0, transform: `rotate(${(-pAt.deg).toFixed(2)} ${art.POT.pivot.x} ${art.POT.pivot.y})` });
    set(n["pot-liquor-body"], { y: levelY, fill: rgbStr(rgb), "fill-opacity": 0.22 + 0.62 * v.strength });
    set(n["pot-liquor-top"], { cy: levelY + (this.flow > 0.1 && this.step === "pour" ? Math.sin(time * 18) * 1.5 : 0) });
    set(n["pot-spout-liquor"], { opacity: this.step === "cup" ? this.flow * 0.9 : 0, fill: rgbStr(rgb) });

    const lidOn = art.localToWorld({ x: 0, y: art.POT.rimY + 4 }, pAt.pos, p.s, art.POT.pivot, pAt.deg);
    const lt = this.travel(v.potLid);
    const lr = l.lidRest;
    const lidPos = { x: lerp(lidOn.x, lr.x, lt.at), y: lerp(lidOn.y, lr.y, lt.at) - Math.sin(Math.PI * lt.at) * 70 };
    set(n.lid, { transform: art.transform(lidPos, lerp(p.s, lr.s, lt.at), { x: 0, y: 0 }, lerp(pAt.deg, 0, lt.at)), opacity: lt.opacity });
    set(n["sh-lid"], { cx: lr.x + 10 * lr.s, cy: lr.y + 2, rx: 66 * lr.s, ry: 10 * lr.s, opacity: span(v.potLid, 0.8, 1) * 0.9 });

    // Cup.
    const c = l.cup;
    set(n.cup, { transform: art.transform(c, c.s, { x: 0, y: 0 }, 0) });
    set(n["sh-cup"], { cx: c.x + 16 * c.s, cy: c.y - 4 * c.s, rx: 132 * c.s, ry: 22 * c.s, opacity: 0.8 });
    const f = v.cupFill;
    const k2 = 0.82 + 0.18 * f;
    set(n["cup-liquor"], {
      cy: art.CUP.rimY + 2 + (1 - f) * 14,
      rx: 70 * k2,
      ry: 11 * k2,
      fill: tea ? rgbStr(tea.liquor) : "none",
      opacity: Math.min(1, f * 5) * v.clear,
    });
    set(n["cup-shine"], { opacity: f * 0.22 * v.clear, cy: art.CUP.rimY + 2 + (1 - f) * 14 - 3 });

    // Scoop.
    const sr = this.scoopRest();
    const sAt = this.along(this.step === "leaves" ? this.scoop.p : 0, sr.pos, this.scoopPour(), 50, art.SCOOP.pourTilt, art.SCOOP.restTilt);
    const showScoop = this.step === "leaves" ? span(v.tinLid, 0.6, 1) : 0;
    set(n.scoop, { transform: art.transform(sAt.pos, sr.s, { x: 0, y: 0 }, sAt.deg), opacity: showScoop });

    // The pour itself.
    this.renderStream(time, kAt, pAt);

    // The faint route hint.
    const hintFor = this.step === "leaves" ? "scoop" : this.step === "pour" ? "kettle" : this.step === "cup" ? "pot" : null;
    if (hintFor && v.hint > 0.01) {
      const [a, b] = this.route(hintFor);
      const lift = hintFor === "kettle" ? 240 : 200;
      const a2 = { x: a.x, y: a.y - lift * 0.6 * this.scale(hintFor) };
      const b2 = { x: b.x, y: b.y - lift * 0.4 * this.scale(hintFor) };
      set(n["route-hint"], {
        d: `M ${a2.x} ${a2.y} Q ${(a2.x + b2.x) / 2} ${Math.min(a2.y, b2.y) - 60} ${b2.x} ${b2.y}`,
        opacity: v.hint * 0.35,
        "stroke-dashoffset": calm ? 0 : -time * 6,
      });
    } else set(n["route-hint"], { opacity: 0 });

    // A soft glow behind whatever can be touched now, for anyone who hasn't started yet.
    const glowAt = this.step === "heat" || this.step === "pour" ? { pose: k, y: -110 } : this.step === "leaves" ? { pose: l.tinTable, y: -90 } : this.step === "cup" ? { pose: p, y: -90 } : null;
    if (glowAt) {
      const pulse = calm ? 0.7 : 0.55 + 0.45 * Math.sin(time * 1.2);
      set(n.glow, { cx: glowAt.pose.x, cy: glowAt.pose.y + glowAt.y * glowAt.pose.s, rx: 190 * glowAt.pose.s, ry: 170 * glowAt.pose.s, opacity: v.glow * 0.35 * pulse });
    } else set(n.glow, { opacity: 0 });

    // The breathing cue: in for 4 seconds, out for 6.
    const cycle = (time % 10) / 10;
    const breath = cycle < 0.4 ? easeInOut(cycle / 0.4) : 1 - easeInOut((cycle - 0.4) / 0.6);
    set(n.breath, { cx: p.x, cy: p.y - 85 * p.s, rx: 260 * p.s, ry: 230 * p.s, opacity: v.breath * (0.12 + 0.55 * breath) });

    // Numbers, only when asked for.
    const showTimer = this.step === "steep" && this.settings.numbers && this.clock;
    this.el.timer.classList.toggle("shown", !!showTimer);
    if (showTimer) this.el.timer.textContent = formatClock(steepRemaining(this.clock!, Date.now(), this.pace));
    const showReadout = this.step === "heat" && this.settings.numbers;
    this.el.readout.classList.toggle("shown", showReadout);
    if (showReadout) this.el.readout.textContent = formatTemp(this.kettleState.tempC, this.settings.unit);

    // Tin labels, only while choosing.
    const choosing = this.step === "choose" && !this.tea;
    this.el.labels.forEach((lab) => lab.classList.toggle("shown", choosing));
  }

  private scale(id: Hit) {
    return id === "scoop" ? this.layout.tinTable.s : id === "kettle" ? this.layout.kettle.s : this.layout.pot.s;
  }

  private shadow(el: SVGElement | undefined, pos: Vec, rest: Pose, halfWidth: number) {
    const h = Math.max(0, rest.y - pos.y);
    el?.setAttribute("cx", String(pos.x + 18 * rest.s + h * 0.2));
    el?.setAttribute("cy", String(rest.y - 2 * rest.s));
    el?.setAttribute("rx", String(halfWidth * 1.1 * rest.s * (1 + h / 700)));
    el?.setAttribute("ry", String(16 * rest.s * (1 + h / 900)));
    el?.setAttribute("opacity", String(Math.max(0, 0.85 - h / 320)));
  }

  private renderStream(time: number, kAt: { pos: Vec; deg: number }, pAt: { pos: Vec; deg: number }) {
    const el = this.n.stream!;
    const l = this.layout;
    let from: Vec | null = null;
    let to: Vec = { x: 0, y: 0 };
    let dir = 0;
    let colour = "rgba(238,240,242,0.7)";
    let width = 7;
    if (this.step === "pour") {
      from = art.localToWorld(art.KETTLE.spout, kAt.pos, l.kettle.s, art.KETTLE.pivot, kAt.deg);
      const levelY = -4 - 128 * this.v.potWater;
      to = { x: l.pot.x + 4, y: l.pot.y + l.pot.s * levelY };
      dir = kAt.deg - 30;
      width = 7 * l.kettle.s;
    } else if (this.step === "cup" && this.tea) {
      from = art.localToWorld(art.POT.spout, pAt.pos, l.pot.s, art.POT.pivot, pAt.deg);
      to = { x: l.cup.x - 4, y: l.cup.y + l.cup.s * (art.CUP.rimY + 4 + (1 - this.v.cupFill) * 12) };
      dir = pAt.deg - 40;
      colour = rgbStr(this.tea.liquor, 0.92);
      width = 6 * l.pot.s;
    }
    if (!from || this.flow < 0.02) {
      el.setAttribute("opacity", "0");
      return;
    }
    const r = (dir * Math.PI) / 180;
    const wob = Math.sin(time * 9) * 3;
    const c = { x: from.x + Math.cos(r) * 34 + wob, y: from.y + Math.sin(r) * 34 };
    // The stream thins as it starts and stops; it never snaps on.
    const end = { x: lerp(c.x, to.x, this.flow), y: lerp(c.y, to.y, this.flow) };
    el.setAttribute("d", `M ${from.x.toFixed(1)} ${from.y.toFixed(1)} Q ${c.x.toFixed(1)} ${c.y.toFixed(1)} ${end.x.toFixed(1)} ${end.y.toFixed(1)}`);
    el.setAttribute("stroke", colour);
    el.setAttribute("stroke-width", String(width * (0.4 + 0.6 * this.flow)));
    el.setAttribute("opacity", String(clamp01(this.flow * 1.4)));
  }

  private emitters(time: number): Record<string, Emitter | null> {
    const l = this.layout;
    const tea = this.tea;
    const heat = heatFraction(this.kettleState.tempC);
    const kettleSteps = this.step === "heat" || this.step === "leaves" || this.step === "pour";
    const kAt = this.along(this.step === "pour" ? this.pour.p : 0, l.kettle, this.kettlePour(), 40, art.KETTLE.pourAngle);
    const spout = art.localToWorld(art.KETTLE.spout, kAt.pos, l.kettle.s, art.KETTLE.pivot, kAt.deg);
    // The pot's steam rises from its lid, wherever the pot is.
    const pAt = this.along(this.step === "cup" ? this.serve.p : 0, l.pot, this.potPour(), 30, art.POT.pourAngle);
    const potTop = art.localToWorld({ x: 0, y: art.POT.rimY - 30 }, pAt.pos, l.pot.s, art.POT.pivot, pAt.deg);
    const cupTop = { x: l.cup.x, y: l.cup.y + l.cup.s * (art.CUP.rimY - 6) };
    const sitFor = this.step === "sit" ? (performance.now() - this.sitStartedAt) / 1000 : 0;
    const steeping = this.step === "steep" && this.clock ? steepProgress(this.clock, Date.now()) : 0;
    void time;
    return {
      kettle: kettleSteps && heat > 0.35 ? { at: spout, rate: (heat - 0.35) * 16, size: 12 * l.kettle.s, alpha: 0.32 } : null,
      pot:
        this.step === "pour" && this.flow > 0.1
          ? { at: { x: l.pot.x, y: l.pot.y + l.pot.s * art.POT.rimY }, rate: 7 * this.flow, size: 16 * l.pot.s, alpha: 0.3 }
          : this.step === "steep" || this.step === "cup"
            ? { at: potTop, rate: 2.4 * (1 - 0.5 * steeping), size: 12 * l.pot.s, alpha: 0.22 }
            : null,
      cup:
        tea && this.v.cupFill > 0.05 && this.v.clear > 0.5
          ? { at: cupTop, rate: (this.step === "sit" ? 5.5 * Math.exp(-sitFor / 300) + 0.8 : 3) * this.v.cupFill, size: 16 * l.cup.s, alpha: 0.34 }
          : null,
    };
  }

  // MARK: - Tweens

  private animate(key: keyof App["v"], to: number, ms: number, done?: () => void) {
    this.tweens.set(key, { from: this.v[key], to, start: performance.now(), ms, done });
  }

  private runTweens(now: number) {
    for (const [key, t] of this.tweens) {
      const k = clamp01((now - t.start) / t.ms);
      // The tweened values are raw progress; easing is applied where they're drawn.
      this.v[key] = lerp(t.from, t.to, key === "tin" || key === "tinLid" || key === "potLid" ? k : easeInOut(k));
      if (k >= 1) {
        this.tweens.delete(key);
        t.done?.();
      }
    }
  }

  // MARK: - Text

  /** One line on screen; a fuller description for screen readers. */
  private say(line: string, spoken: string) {
    if (spoken) this.el.sr.textContent = spoken;
    if (line === this.lineText) return;
    this.lineText = line;
    const el = this.el.line;
    el.classList.remove("shown");
    window.setTimeout(() => {
      if (this.lineText !== line) return;
      el.textContent = line;
      if (line) el.classList.add("shown");
    }, el.textContent ? 900 : 0);
  }

  // MARK: - Settings and lifecycle

  private applySettings(s: Settings) {
    const unitChanged = s.unit !== this.settings.unit;
    this.settings = s;
    saveSettings(safeStorage(), s);
    this.sound.setEnabled(s.sound);
    this.sound.setRain(s.rain);
    this.n.rain?.setAttribute("opacity", s.rain ? "1" : "0");
    if (unitChanged) this.refreshTinLabels();
  }

  private onVisibility() {
    if (document.visibilityState === "visible" && this.step === "steep") void this.keepAwake(true);
  }

  private onLeave() {
    if (this.step === "sit") track("linger", { seconds: Math.round((performance.now() - this.sitStartedAt) / 1000) });
  }

  /** Keep a phone's screen on while it steeps, so someone brewing along can see the chime coming. */
  private async keepAwake(on: boolean) {
    try {
      if (on && !this.wakeLock && "wakeLock" in navigator) {
        const lock = await (navigator as Navigator & { wakeLock: { request(t: "screen"): Promise<{ release(): Promise<void>; addEventListener(t: string, f: () => void): void }> } }).wakeLock.request("screen");
        this.wakeLock = lock;
        lock.addEventListener("release", () => (this.wakeLock = null));
      } else if (!on && this.wakeLock) {
        await this.wakeLock.release();
        this.wakeLock = null;
      }
    } catch {
      // Not allowed (low battery, unsupported): the timer is still right, just the screen may sleep.
    }
  }
}

function mix(a: [number, number, number], b: [number, number, number], t: number): [number, number, number] {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}

function rgbStr(c: [number, number, number], alpha = 1) {
  return `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${alpha})`;
}

function safeStorage(): Storage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

/** Soft paper grain: one small tile of noise, repeated, at low opacity. */
function makeGrain(el: HTMLElement) {
  const c = document.createElement("canvas");
  c.width = c.height = 160;
  const ctx = c.getContext("2d");
  if (!ctx) return;
  const img = ctx.createImageData(160, 160);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 110 + Math.random() * 100;
    img.data[i] = v;
    img.data[i + 1] = v * 0.94;
    img.data[i + 2] = v * 0.86;
    img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  el.style.backgroundImage = `url(${c.toDataURL()})`;
}
