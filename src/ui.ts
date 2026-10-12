// The two quiet controls in the corner (sound, settings) and the settings panel.

import type { Settings } from "./settings";

const ICON_SOUND_ON = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5h3.2L12 5.5v13l-4.8-4H4z" fill="currentColor"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`;
const ICON_SOUND_OFF = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5h3.2L12 5.5v13l-4.8-4H4z" fill="currentColor"/><path d="M16 9.5l5 5M21 9.5l-5 5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`;
const ICON_SETTINGS = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h10M18 7h2M4 17h4M12 17h8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><circle cx="16" cy="7" r="2" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="10" cy="17" r="2" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>`;

type Toggle = "sound" | "rain" | "numbers" | "breathing";

const TOGGLES: [Toggle, string, string][] = [
  ["sound", "Sound", ""],
  ["rain", "Rain on the window", ""],
  ["numbers", "Show timer numbers", "The steep countdown and the kettle's temperature."],
  ["breathing", "Breathing cue", "A slow glow to breathe with while it steeps."],
];

export class Controls {
  private soundBtn: HTMLButtonElement;
  private settingsBtn: HTMLButtonElement;
  private panel: HTMLElement;

  constructor(root: HTMLElement, private settings: Settings, private onChange: (s: Settings) => void) {
    const bar = document.createElement("div");
    bar.id = "controls";
    bar.innerHTML = `
      <button id="btn-sound" class="icon" type="button" aria-label="Sound"></button>
      <button id="btn-settings" class="icon" type="button" aria-label="Settings" aria-expanded="false" aria-controls="settings">${ICON_SETTINGS}</button>`;
    root.appendChild(bar);

    const panel = document.createElement("div");
    panel.id = "settings";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-labelledby", "settings-title");
    panel.hidden = true;
    panel.innerHTML = `
      <h2 id="settings-title">Settings</h2>
      ${TOGGLES.map(
        ([key, label, note]) => `
        <label class="row">
          <span class="text"><span>${label}</span>${note ? `<small>${note}</small>` : ""}</span>
          <input type="checkbox" role="switch" data-key="${key}">
          <span class="switch" aria-hidden="true"></span>
        </label>`,
      ).join("")}
      <fieldset class="row unit">
        <legend>Temperature</legend>
        <span class="seg">
          <label><input type="radio" name="unit" value="C"><span>°C</span></label>
          <label><input type="radio" name="unit" value="F"><span>°F</span></label>
        </span>
      </fieldset>
      <p class="note">Steep times are real, so you can brew a cup alongside. Settings stay on this device; nothing else is kept.</p>
      <button id="settings-done" class="quiet" type="button">Done</button>`;
    root.appendChild(panel);

    this.soundBtn = bar.querySelector("#btn-sound")!;
    this.settingsBtn = bar.querySelector("#btn-settings")!;
    this.panel = panel;

    this.soundBtn.addEventListener("click", () => this.update({ sound: !this.settings.sound }));
    this.settingsBtn.addEventListener("click", () => (this.panel.hidden ? this.open() : this.close()));
    panel.querySelector("#settings-done")!.addEventListener("click", () => this.close());
    panel.addEventListener("change", (e) => {
      const input = e.target as HTMLInputElement;
      if (input.name === "unit") this.update({ unit: input.value === "F" ? "F" : "C" });
      else if (input.dataset.key) this.update({ [input.dataset.key]: input.checked } as Partial<Settings>);
    });
    addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !this.panel.hidden) this.close();
    });
    addEventListener("pointerdown", (e) => {
      if (!this.panel.hidden && !(e.target as Element).closest("#settings, #controls")) this.close();
    });
    this.sync();
  }

  private update(patch: Partial<Settings>) {
    this.settings = { ...this.settings, ...patch };
    this.onChange(this.settings);
    this.sync();
  }

  private sync() {
    const s = this.settings;
    this.soundBtn.innerHTML = s.sound ? ICON_SOUND_ON : ICON_SOUND_OFF;
    this.soundBtn.setAttribute("aria-pressed", String(s.sound));
    for (const input of this.panel.querySelectorAll<HTMLInputElement>("input[data-key]")) {
      input.checked = s[input.dataset.key as Toggle];
    }
    for (const input of this.panel.querySelectorAll<HTMLInputElement>("input[name=unit]")) {
      input.checked = input.value === s.unit;
    }
  }

  private open() {
    this.panel.hidden = false;
    this.settingsBtn.setAttribute("aria-expanded", "true");
    requestAnimationFrame(() => this.panel.classList.add("open"));
    this.panel.querySelector<HTMLInputElement>("input")?.focus();
  }

  private close() {
    this.panel.classList.remove("open");
    this.settingsBtn.setAttribute("aria-expanded", "false");
    const panel = this.panel;
    window.setTimeout(() => {
      if (!panel.classList.contains("open")) panel.hidden = true;
    }, 400);
    if (panel.contains(document.activeElement)) this.settingsBtn.focus();
  }
}
