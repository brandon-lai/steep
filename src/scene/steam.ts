// Steam, on a canvas laid over the scene. A few dozen soft puffs at most: each rises,
// widens, drifts on a slow sideways wave and fades. No physics, nothing fast.

import type { Vec } from "../drag";
import type { Fit } from "./layout";

interface Puff {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  grow: number;
  age: number;
  life: number;
  phase: number;
  alpha: number;
}

export interface Emitter {
  at: Vec;
  /** Puffs per second. */
  rate: number;
  /** Starting size, scene units. */
  size: number;
  /** Peak opacity. */
  alpha: number;
}

const MAX_PUFFS = 90;

export class Steam {
  private ctx: CanvasRenderingContext2D;
  private puffs: Puff[] = [];
  private carry = new Map<string, number>();
  private sprite: HTMLCanvasElement;
  private dpr = 1;

  constructor(private canvas: HTMLCanvasElement, private reducedMotion: () => boolean) {
    this.ctx = canvas.getContext("2d")!;
    // One pre-drawn soft disc, stamped many times: much cheaper than a gradient per puff.
    this.sprite = document.createElement("canvas");
    this.sprite.width = this.sprite.height = 64;
    const s = this.sprite.getContext("2d")!;
    const g = s.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, "rgba(255,246,232,0.9)");
    g.addColorStop(0.45, "rgba(255,240,222,0.35)");
    g.addColorStop(1, "rgba(255,240,222,0)");
    s.fillStyle = g;
    s.fillRect(0, 0, 64, 64);
  }

  resize(width: number, height: number) {
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(width * this.dpr);
    this.canvas.height = Math.round(height * this.dpr);
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
  }

  clear() {
    this.puffs = [];
  }

  /** `emitters` keyed by name so fractional rates accumulate across frames. */
  update(dt: number, emitters: Record<string, Emitter | null>) {
    const calm = this.reducedMotion();
    for (const [key, e] of Object.entries(emitters)) {
      if (!e || e.rate <= 0) {
        this.carry.delete(key);
        continue;
      }
      let due = (this.carry.get(key) ?? Math.random()) + e.rate * dt * (calm ? 0.5 : 1);
      while (due >= 1 && this.puffs.length < MAX_PUFFS) {
        due -= 1;
        this.puffs.push({
          x: e.at.x + (Math.random() - 0.5) * e.size * 0.6,
          y: e.at.y,
          vx: (Math.random() - 0.5) * 6,
          vy: -(16 + Math.random() * 14) * (calm ? 0.5 : 1),
          r: e.size * (0.6 + Math.random() * 0.4),
          grow: e.size * (0.9 + Math.random() * 0.6),
          age: 0,
          life: 3.2 + Math.random() * 2.2,
          phase: Math.random() * Math.PI * 2,
          alpha: e.alpha * (0.6 + Math.random() * 0.4),
        });
      }
      this.carry.set(key, Math.min(due, 1));
    }

    for (const p of this.puffs) {
      p.age += dt;
      p.x += (p.vx + Math.sin(p.age * 0.9 + p.phase) * 7) * dt;
      p.y += p.vy * dt;
      p.vy *= Math.exp(-dt * 0.15);
      p.r += p.grow * dt * 0.45;
    }
    this.puffs = this.puffs.filter((p) => p.age < p.life);
  }

  draw(fit: Fit) {
    const { ctx, dpr } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.setTransform(dpr * fit.scale, 0, 0, dpr * fit.scale, dpr * fit.ox, dpr * fit.oy);
    for (const p of this.puffs) {
      const t = p.age / p.life;
      // Fade in over the first fifth, out over the rest.
      const a = p.alpha * (t < 0.2 ? t / 0.2 : 1 - (t - 0.2) / 0.8);
      if (a <= 0.003) continue;
      ctx.globalAlpha = a;
      ctx.drawImage(this.sprite, p.x - p.r, p.y - p.r, p.r * 2, p.r * 2);
    }
    ctx.globalAlpha = 1;
  }

  get count() {
    return this.puffs.length;
  }
}
