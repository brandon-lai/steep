// Every sound is synthesised in the browser with Web Audio: no files to license or load.
// Layers: room tone (always), optional rain, kettle rumble and bubbles, pour, steam hiss,
// leaf rustle, ceramic and tin clinks, and the chime at the end of steeping.
//
// Everything is quiet and low-passed. Volumes ramp; nothing starts or stops abruptly.

type Layer = { gain: GainNode; filter?: BiquadFilterNode };

const RAMP = 0.35;

export class Sound {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private noise!: { white: AudioBuffer; brown: AudioBuffer; pink: AudioBuffer };
  private room!: Layer;
  private rain!: Layer;
  private kettle!: Layer;
  private pour!: Layer;
  private steam!: Layer;
  private enabled = true;
  private rainOn = false;
  private kettleHeat = 0;
  private bubbleTimer = 0;
  private dropTimer = 0;
  private pourLevel = 0;

  get started() {
    return this.ctx !== null;
  }

  /** Must run inside a user gesture: browsers keep audio locked until one. */
  unlock(enabled: boolean, rain: boolean) {
    this.enabled = enabled;
    this.rainOn = rain;
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    this.ctx = ctx;
    this.noise = { white: makeNoise(ctx, "white"), brown: makeNoise(ctx, "brown"), pink: makeNoise(ctx, "pink") };

    this.master = ctx.createGain();
    this.master.gain.value = 0;
    // A gentle compressor keeps overlapping layers from ever getting loud.
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -24;
    comp.ratio.value = 3;
    this.master.connect(comp).connect(ctx.destination);

    this.room = this.loop("brown", "lowpass", 380, 0.7);
    this.rain = this.loop("pink", "bandpass", 1800, 0.5);
    this.kettle = this.loop("brown", "lowpass", 160, 0.8);
    this.pour = this.loop("white", "bandpass", 700, 2.5);
    this.steam = this.loop("white", "highpass", 4200, 0.7);

    this.set(this.room, 0.22, 3);
    this.set(this.rain, rain ? 0.05 : 0, 3);
    this.master.gain.setTargetAtTime(enabled ? 0.9 : 0, ctx.currentTime, 0.8);
    void ctx.resume();
  }

  setEnabled(on: boolean) {
    this.enabled = on;
    if (!this.ctx) return;
    this.master.gain.setTargetAtTime(on ? 0.9 : 0, this.ctx.currentTime, 0.3);
  }

  setRain(on: boolean) {
    this.rainOn = on;
    if (this.ctx) this.set(this.rain, on ? 0.05 : 0, 1.5);
  }

  /** Called every frame. Drives the kettle's bubbles and the rain's droplets. */
  tick(dt: number) {
    const ctx = this.ctx;
    if (!ctx || !this.enabled) return;
    if (this.kettleHeat > 0.55) {
      this.bubbleTimer -= dt;
      if (this.bubbleTimer <= 0) {
        this.bubble(this.kettleHeat);
        // More often as it nears a boil.
        this.bubbleTimer = 0.04 + Math.random() * (0.5 - 0.42 * this.kettleHeat);
      }
    }
    if (this.rainOn) {
      this.dropTimer -= dt;
      if (this.dropTimer <= 0) {
        this.drop();
        this.dropTimer = 0.05 + Math.random() * 0.35;
      }
    }
  }

  /** 0..1, how hot the kettle is right now; 0 for silent. */
  setKettle(heat: number, active: boolean) {
    if (!this.ctx) return;
    this.kettleHeat = active ? heat : 0;
    const t = this.ctx.currentTime;
    this.kettle.filter!.frequency.setTargetAtTime(140 + heat * 520, t, 0.4);
    this.set(this.kettle, active ? 0.08 + heat * 0.5 : heat * 0.06, active ? 0.5 : 1.8);
  }

  /** 0..1 flow, and how full the vessel being poured into is (the pitch rises as it fills). */
  setPour(flow: number, fill: number) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.pourLevel = flow;
    this.pour.filter!.frequency.setTargetAtTime(520 + fill * 900 + Math.random() * 120, t, 0.08);
    this.set(this.pour, flow * 0.32, flow > 0 ? 0.12 : 0.4);
  }

  /** Steam hiss, 0..1. */
  setSteam(level: number) {
    if (this.ctx) this.set(this.steam, level * 0.035, 1.2);
  }

  /** Fade every working layer, leaving the room (and rain, if on). */
  settle() {
    if (!this.ctx) return;
    this.kettleHeat = 0;
    this.set(this.kettle, 0, 2);
    this.set(this.pour, 0, 1);
    this.set(this.steam, 0.15 * 0.035, 4);
    this.set(this.room, 0.2, 6);
  }

  /** A ceramic clink. `pitch` 1 is a cup; lower is heavier. */
  clink(pitch = 1, level = 1) {
    this.partials(880 * pitch, [1, 2.32, 4.25, 6.63], [1, 0.5, 0.28, 0.14], 0.9, 0.05 * level);
  }

  /** A tin set down: dull and short. */
  tinTap(level = 1) {
    this.partials(310, [1, 2.7, 5.1], [1, 0.35, 0.12], 0.25, 0.07 * level);
    this.burst(900, 1.2, 0.05, 0.05 * level);
  }

  /** Leaves leaving the scoop. */
  rustle(seconds = 1.2) {
    const ctx = this.ctx;
    if (!ctx) return;
    const n = Math.round(seconds * 22);
    for (let i = 0; i < n; i++) {
      const at = ctx.currentTime + Math.random() * seconds;
      this.burst(2500 + Math.random() * 3500, 1.4, 0.025 + Math.random() * 0.04, 0.03 * Math.random() + 0.008, at);
    }
  }

  /** The end of steeping: a soft two-note bell. */
  chime() {
    this.partials(659.25, [1, 2.0, 2.76, 5.4], [1, 0.25, 0.3, 0.06], 4.5, 0.05);
    this.partials(987.77, [1, 2.0, 2.76, 5.4], [1, 0.22, 0.25, 0.05], 4, 0.035, 0.45);
  }

  // MARK: - Building blocks

  private loop(kind: "white" | "brown" | "pink", type: BiquadFilterType, freq: number, q: number): Layer {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise[kind];
    src.loop = true;
    // The buffer's first 50 ms are already crossfaded with what precedes them; stop short of them at the end.
    src.loopEnd = src.buffer.duration - 0.05;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    filter.Q.value = q;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    src.connect(filter).connect(gain).connect(this.master);
    // A random offset so layers built from the same buffer don't phase against each other.
    src.start(0, Math.random() * 3);
    return { gain, filter };
  }

  private set(layer: Layer, value: number, seconds = RAMP) {
    const ctx = this.ctx!;
    layer.gain.gain.cancelScheduledValues(ctx.currentTime);
    layer.gain.gain.setTargetAtTime(value, ctx.currentTime, seconds / 3);
  }

  private partials(f0: number, ratios: number[], amps: number[], decay: number, level: number, delay = 0) {
    const ctx = this.ctx;
    if (!ctx || !this.enabled) return;
    const t = ctx.currentTime + delay;
    ratios.forEach((r, i) => {
      const osc = ctx.createOscillator();
      osc.frequency.value = f0 * r;
      const g = ctx.createGain();
      const a = level * (amps[i] ?? 0.1);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(a, t + 0.004);
      // Higher partials die away first, as they do on real ceramic.
      g.gain.exponentialRampToValueAtTime(0.0001, t + decay / (1 + i * 0.6));
      osc.connect(g).connect(this.master);
      osc.start(t);
      osc.stop(t + decay + 0.1);
    });
  }

  private burst(freq: number, q: number, length: number, level: number, at?: number) {
    const ctx = this.ctx;
    if (!ctx || !this.enabled) return;
    const t = at ?? ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise.white;
    const f = ctx.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(level, t + length * 0.2);
    g.gain.exponentialRampToValueAtTime(0.0001, t + length);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random() * 2, length + 0.05);
  }

  /** One bubble: a short sine that drops in pitch. */
  private bubble(heat: number) {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const f = 280 + Math.random() * 500 * heat;
    osc.frequency.setValueAtTime(f, t);
    osc.frequency.exponentialRampToValueAtTime(f * 0.6, t + 0.06);
    const g = ctx.createGain();
    const level = 0.012 + 0.03 * heat * Math.random();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(level, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 1400;
    osc.connect(lp).connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + 0.1);
  }

  /** One raindrop on the window. */
  private drop() {
    this.burst(2200 + Math.random() * 4000, 6, 0.02 + Math.random() * 0.02, 0.006 + Math.random() * 0.01);
  }

  /** For the pour layer's gurgle: wobble the band a little each frame while pouring. */
  wobble() {
    if (!this.ctx || this.pourLevel <= 0) return;
    const f = this.pour.filter!.frequency;
    f.setTargetAtTime(f.value * (0.92 + Math.random() * 0.16), this.ctx.currentTime, 0.03);
  }
}

function makeNoise(ctx: AudioContext, kind: "white" | "brown" | "pink"): AudioBuffer {
  const seconds = 4;
  const buf = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < d.length; i++) {
    const w = Math.random() * 2 - 1;
    if (kind === "white") d[i] = w * 0.5;
    else if (kind === "brown") {
      last = (last + 0.02 * w) / 1.02;
      d[i] = last * 3.5;
    } else {
      // Paul Kellet's pink-noise filter.
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856;
      b4 = 0.55 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.016898;
      d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
      b6 = w * 0.115926;
    }
  }
  // Blend the last 50 ms into the first 50 ms. Loops end at length - 50 ms, so playback runs
  // straight from the sample before the tail into a start that begins as that tail: no click.
  const fade = Math.floor(ctx.sampleRate * 0.05);
  for (let i = 0; i < fade; i++) {
    const t = i / fade;
    d[i] = d[i]! * t + d[d.length - fade + i]! * (1 - t);
  }
  return buf;
}
