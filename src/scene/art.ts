// The illustrations, as SVG. Each object is drawn in its own local coordinates with the
// origin at the middle of its base, so the app can place it with one transform:
//   translate(pose) scale(s) rotate(tilt about pivot)
// The light comes from the upper left; every gradient is shaded that way.

import type { Vec } from "../drag";
import type { Layout } from "./layout";
import type { Tea } from "../teas";

/** Geometry the app needs to know about, in each object's local units. */
export const KETTLE = { pivot: { x: 0, y: -95 }, spout: { x: 168, y: -131 }, pourAngle: 38, top: -235, halfWidth: 100 };
export const POT = { pivot: { x: 0, y: -85 }, spout: { x: 164, y: -125 }, pourAngle: 44, rimY: -168, rimRx: 54, fullY: -132, halfWidth: 118 };
export const CUP = { rimY: -112, rimRx: 74, rimRy: 13, halfWidth: 120 };
export const TIN = { height: 146, halfWidth: 48 };
/** The scoop's bowl centre sits at its origin. */
export const SCOOP = { restTilt: -18, pourTilt: 72 };

const svg = String.raw;

export function defs(): string {
  return svg`
  <defs>
    <radialGradient id="g-wall" cx="0.08" cy="0.05" r="1.15">
      <stop offset="0" stop-color="#8a5a37"/>
      <stop offset="0.35" stop-color="#5a3a26"/>
      <stop offset="0.75" stop-color="#34231a"/>
      <stop offset="1" stop-color="#241812"/>
    </radialGradient>
    <linearGradient id="g-table" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#5c3721"/>
      <stop offset="0.2" stop-color="#6e4428"/>
      <stop offset="1" stop-color="#3c2416"/>
    </linearGradient>
    <radialGradient id="g-pool" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="#ffcf8f" stop-opacity="0.22"/>
      <stop offset="1" stop-color="#ffcf8f" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="g-lamp" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="#ffd9a0" stop-opacity="0.55"/>
      <stop offset="0.4" stop-color="#ffb870" stop-opacity="0.18"/>
      <stop offset="1" stop-color="#ffb870" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="g-sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#232a45"/>
      <stop offset="0.55" stop-color="#4a3c58"/>
      <stop offset="0.85" stop-color="#8a5a5a"/>
      <stop offset="1" stop-color="#b9785e"/>
    </linearGradient>
    <linearGradient id="g-wood" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#7a4d2e"/>
      <stop offset="1" stop-color="#4b2e1b"/>
    </linearGradient>
    <linearGradient id="g-copper" x1="0" y1="0" x2="1" y2="0.35">
      <stop offset="0" stop-color="#e9a56b"/>
      <stop offset="0.35" stop-color="#c0703f"/>
      <stop offset="0.8" stop-color="#83401f"/>
      <stop offset="1" stop-color="#5e2c15"/>
    </linearGradient>
    <linearGradient id="g-copper-lid" x1="0" y1="0" x2="1" y2="0.2">
      <stop offset="0" stop-color="#dc9560"/>
      <stop offset="1" stop-color="#7a3c1d"/>
    </linearGradient>
    <linearGradient id="g-glass" x1="0" y1="0" x2="1" y2="0.3">
      <stop offset="0" stop-color="#fff4e2" stop-opacity="0.16"/>
      <stop offset="0.5" stop-color="#fff4e2" stop-opacity="0.04"/>
      <stop offset="1" stop-color="#fff4e2" stop-opacity="0.1"/>
    </linearGradient>
    <linearGradient id="g-clay" x1="0" y1="0" x2="1" y2="0.3">
      <stop offset="0" stop-color="#c47b55"/>
      <stop offset="1" stop-color="#6e3822"/>
    </linearGradient>
    <linearGradient id="g-cream" x1="0" y1="0" x2="1" y2="0.25">
      <stop offset="0" stop-color="#fbf1dc"/>
      <stop offset="0.55" stop-color="#e3cfa9"/>
      <stop offset="1" stop-color="#a98d67"/>
    </linearGradient>
    <linearGradient id="g-cup-in" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#9c805d"/>
      <stop offset="1" stop-color="#e2cfab"/>
    </linearGradient>
    <linearGradient id="g-cyl" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#fff" stop-opacity="0.28"/>
      <stop offset="0.3" stop-color="#fff" stop-opacity="0.06"/>
      <stop offset="0.7" stop-color="#000" stop-opacity="0.1"/>
      <stop offset="1" stop-color="#000" stop-opacity="0.38"/>
    </linearGradient>
    <linearGradient id="g-scoop" x1="0" y1="0" x2="1" y2="0.4">
      <stop offset="0" stop-color="#d39a62"/>
      <stop offset="1" stop-color="#8a5a32"/>
    </linearGradient>
    <radialGradient id="g-shadow" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="#140a05" stop-opacity="0.55"/>
      <stop offset="1" stop-color="#140a05" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="g-breath" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="#ffd6a0" stop-opacity="0.5"/>
      <stop offset="0.6" stop-color="#ffb870" stop-opacity="0.12"/>
      <stop offset="1" stop-color="#ffb870" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="g-gauge" x1="0" y1="1" x2="0" y2="0">
      <stop offset="0" stop-color="#f1e3c8"/>
      <stop offset="0.6" stop-color="#f0b46a"/>
      <stop offset="1" stop-color="#e07a3c"/>
    </linearGradient>
    <clipPath id="clip-pot-body"><path d="${POT_BODY}"/></clipPath>
    <clipPath id="clip-pot-leaves"><path d="${POT_BODY}"/><rect x="-80" y="-700" width="160" height="540"/></clipPath>
    <clipPath id="clip-cup-rim"><ellipse cx="0" cy="${CUP.rimY}" rx="${CUP.rimRx - 3}" ry="${CUP.rimRy - 2}"/></clipPath>
  </defs>`;
}

const POT_BODY =
  "M -70 -4 C -122 -20 -126 -128 -62 -160 C -42 -170 42 -170 62 -160 C 126 -128 122 -20 70 -4 C 40 2 -40 2 -70 -4 Z";

/** The room: wall, light, window, shelf and table. Drawn far beyond the scene's edges. */
export function room(l: Layout): string {
  const big = 4000;
  const w = l.window;
  const sh = l.shelf;
  const grain = Array.from({ length: 26 }, (_, i) => {
    const y = l.tableY + 14 + i * i * 2.6 + i * 9;
    const wobble = (i * 37) % 23;
    return `<path d="M ${-big} ${y} C ${l.w * 0.3} ${y - 6 + wobble * 0.4}, ${l.w * 0.6} ${y + 8 - wobble * 0.3}, ${big} ${y + 3}" stroke="#2a170c" stroke-opacity="${0.12 + (i % 3) * 0.04}" stroke-width="${1.2 + (i % 4) * 0.6}" fill="none"/>`;
  }).join("");
  return svg`
  <rect x="${-big}" y="${-big}" width="${big * 2 + l.w}" height="${big + l.tableY}" fill="url(#g-wall)"/>
  <g id="window">
    <rect x="${w.x - 14}" y="${w.y - 14}" width="${w.w + 28}" height="${w.h + 28}" rx="4" fill="#3b2416"/>
    <rect x="${w.x}" y="${w.y}" width="${w.w}" height="${w.h}" fill="url(#g-sky)"/>
    <svg x="${w.x}" y="${w.y}" width="${w.w}" height="${w.h}" viewBox="0 0 ${w.w} ${w.h}" overflow="hidden">
        <circle cx="${w.w * 0.72}" cy="${w.h * 0.22}" r="10" fill="#f6e3bd" opacity="0.55"/>
        <path d="M 0 ${w.h * 0.86} L ${w.w * 0.12} ${w.h * 0.86} L ${w.w * 0.12} ${w.h * 0.74} L ${w.w * 0.3} ${w.h * 0.74} L ${w.w * 0.3} ${w.h * 0.8} L ${w.w * 0.42} ${w.h * 0.8} L ${w.w * 0.42} ${w.h * 0.68} L ${w.w * 0.5} ${w.h * 0.64} L ${w.w * 0.58} ${w.h * 0.68} L ${w.w * 0.58} ${w.h * 0.82} L ${w.w * 0.78} ${w.h * 0.82} L ${w.w * 0.78} ${w.h * 0.76} L ${w.w} ${w.h * 0.76} L ${w.w} ${w.h} L 0 ${w.h} Z" fill="#1d1622" opacity="0.85"/>
        <rect x="${w.w * 0.2}" y="${w.h * 0.78}" width="7" height="9" fill="#f2c47e" opacity="0.7"/>
        <rect x="${w.w * 0.66}" y="${w.h * 0.86}" width="7" height="9" fill="#f2c47e" opacity="0.5"/>
        <g id="rain" opacity="0">${rainStreaks(w.w, w.h)}</g>
    </svg>
    <rect x="${w.x + w.w / 2 - 5}" y="${w.y}" width="10" height="${w.h}" fill="#3b2416"/>
    <rect x="${w.x}" y="${w.y + w.h * 0.48}" width="${w.w}" height="10" fill="#3b2416"/>
    <rect x="${w.x - 24}" y="${w.y + w.h + 10}" width="${w.w + 48}" height="12" rx="3" fill="#4b2e1b"/>
  </g>
  <g id="shelf">
    <rect x="${sh.x}" y="${sh.y}" width="${sh.w}" height="16" rx="3" fill="url(#g-wood)"/>
    <rect x="${sh.x}" y="${sh.y + 14}" width="${sh.w}" height="5" fill="#2a170c" opacity="0.45"/>
    <path d="M ${sh.x + 40} ${sh.y + 16} l 0 34 l 22 -34 z M ${sh.x + sh.w - 40} ${sh.y + 16} l 0 34 l -22 -34 z" fill="#3b2416"/>
    <rect x="${sh.x}" y="${sh.y + 20}" width="${sh.w}" height="26" fill="#140a05" opacity="0.18"/>
  </g>
  <rect x="${-big}" y="${l.tableY}" width="${big * 2 + l.w}" height="${big}" fill="url(#g-table)"/>
  <rect x="${-big}" y="${l.tableY}" width="${big * 2 + l.w}" height="5" fill="#8a5a37" opacity="0.6"/>
  ${grain}
  <ellipse cx="${l.w * 0.42}" cy="${l.tableY + (l.h - l.tableY) * 0.45}" rx="${l.w * 0.55}" ry="${(l.h - l.tableY) * 0.55}" fill="url(#g-pool)"/>`;
}

function rainStreaks(w: number, h: number): string {
  let out = "";
  for (let i = 0; i < 34; i++) {
    const x = ((i * 53) % w) + 4;
    const y = ((i * 97) % h) - 20;
    const len = 14 + ((i * 7) % 16);
    const delay = ((i * 0.37) % 1.4).toFixed(2);
    out += `<line class="drop" x1="${x}" y1="${y}" x2="${x - 2}" y2="${y + len}" stroke="#cfd6ea" stroke-opacity="0.35" stroke-width="1.2" style="animation-delay:-${delay}s"/>`;
  }
  return out;
}

export function kettle(): string {
  return svg`
  <g id="kettle-art">
    <ellipse cx="0" cy="-5" rx="80" ry="8" fill="#3a1b0c"/>
    <path d="M 82 -48 C 112 -60 134 -92 158 -126 L 173 -134 C 177 -128 173 -123 167 -119 C 142 -86 118 -38 88 -24 Z" fill="url(#g-copper)"/>
    <path d="M -88 -8 C -106 -50 -102 -122 -62 -150 C -40 -166 40 -166 62 -150 C 102 -122 106 -50 88 -8 C 60 0 -60 0 -88 -8 Z" fill="url(#g-copper)"/>
    <path d="M -76 -28 C -60 -18 60 -18 76 -28" stroke="#5e2c15" stroke-width="3" fill="none" opacity="0.55"/>
    <ellipse cx="-50" cy="-98" rx="13" ry="40" transform="rotate(18 -50 -98)" fill="#fff6e6" opacity="0.2"/>
    <ellipse cx="-56" cy="-112" rx="4" ry="16" transform="rotate(18 -56 -112)" fill="#fff6e6" opacity="0.35"/>
    <path d="M -46 -156 C -40 -182 40 -182 46 -156 Z" fill="url(#g-copper-lid)"/>
    <ellipse cx="0" cy="-156" rx="46" ry="6" fill="#6b3218" opacity="0.6"/>
    <rect x="-4" y="-188" width="8" height="10" fill="#5e2c15"/>
    <ellipse cx="0" cy="-190" rx="13" ry="8" fill="#3b2416"/>
    <ellipse cx="-4" cy="-193" rx="5" ry="2.5" fill="#7a5a40"/>
    <circle cx="-62" cy="-150" r="6" fill="#5e2c15"/>
    <circle cx="62" cy="-150" r="6" fill="#5e2c15"/>
    <path d="M -62 -152 C -72 -236 72 -236 62 -152" stroke="#2f1b10" stroke-width="13" stroke-linecap="round" fill="none"/>
    <path d="M -58 -168 C -60 -222 18 -232 40 -214" stroke="#6e4a32" stroke-width="3" stroke-linecap="round" fill="none" opacity="0.7"/>
  </g>`;
}

export function pot(): string {
  return svg`
  <g id="pot-art">
    <path d="M -98 -126 C -164 -126 -168 -42 -102 -40" stroke="#4b2e1b" stroke-width="13" stroke-linecap="round" fill="none"/>
    <path d="M -100 -124 C -150 -122 -156 -60 -110 -46" stroke="#8a5a32" stroke-width="3" stroke-linecap="round" fill="none" opacity="0.6"/>
    <path d="${POT_BODY}" fill="#fff4e2" fill-opacity="0.05"/>
    <g clip-path="url(#clip-pot-body)">
      <g id="pot-liquor" opacity="0">
        <rect id="pot-liquor-body" x="-170" y="0" width="340" height="260"/>
        <ellipse id="pot-liquor-top" cx="0" cy="0" rx="170" ry="7" fill="#fff" fill-opacity="0.12"/>
      </g>
    </g>
    <g clip-path="url(#clip-pot-leaves)"><g id="pot-leaves"></g></g>
    <path d="M 90 -64 C 122 -74 142 -100 160 -126 L 170 -128 C 164 -112 142 -78 104 -36 Z" fill="url(#g-glass)" stroke="#fff1db" stroke-opacity="0.4" stroke-width="2"/>
    <g id="pot-spout-liquor" opacity="0"><path d="M 96 -52 C 122 -64 140 -90 156 -114 L 160 -112 C 146 -88 128 -62 102 -42 Z"/></g>
    <path d="${POT_BODY}" fill="url(#g-glass)" stroke="#fff1db" stroke-opacity="0.45" stroke-width="2.5"/>
    <ellipse cx="0" cy="${POT.rimY}" rx="${POT.rimRx}" ry="8" fill="none" stroke="#fff1db" stroke-opacity="0.55" stroke-width="2.5"/>
    <path d="M -98 -118 C -112 -80 -106 -40 -84 -20" stroke="#fff" stroke-opacity="0.28" stroke-width="6" stroke-linecap="round" fill="none"/>
    <path d="M -76 -146 C -84 -140 -90 -134 -94 -128" stroke="#fff" stroke-opacity="0.45" stroke-width="3" stroke-linecap="round" fill="none"/>
    <path d="M 84 -120 C 96 -100 100 -78 98 -56" stroke="#fff" stroke-opacity="0.12" stroke-width="4" stroke-linecap="round" fill="none"/>
    <ellipse cx="0" cy="-3" rx="66" ry="5" fill="none" stroke="#fff1db" stroke-opacity="0.3" stroke-width="2"/>
  </g>`;
}

/** The pot's lid, origin at the middle of its bottom edge. */
export function potLid(): string {
  return svg`
  <g id="lid-art">
    <path d="M -58 0 C -54 -28 54 -28 58 0 Z" fill="url(#g-clay)"/>
    <ellipse cx="0" cy="0" rx="58" ry="7" fill="#5a2c18"/>
    <ellipse cx="-20" cy="-16" rx="14" ry="4" fill="#fff" opacity="0.14"/>
    <ellipse cx="0" cy="-26" rx="12" ry="7" fill="#8c4f34"/>
    <ellipse cx="-3" cy="-29" rx="5" ry="2" fill="#e0a07a" opacity="0.6"/>
  </g>`;
}

export function cup(): string {
  return svg`
  <g id="cup-art">
    <ellipse cx="0" cy="-8" rx="120" ry="20" fill="url(#g-cream)"/>
    <ellipse cx="0" cy="-11" rx="72" ry="11" fill="none" stroke="#b39770" stroke-opacity="0.6" stroke-width="2"/>
    <path d="M 64 -92 C 116 -98 112 -42 50 -38" stroke="#e8d6b4" stroke-width="10" stroke-linecap="round" fill="none"/>
    <path d="M 66 -92 C 106 -94 104 -52 56 -44" stroke="#a98d67" stroke-width="3" stroke-linecap="round" fill="none" opacity="0.5"/>
    <path d="M -74 ${CUP.rimY} C -72 -60 -50 -22 -36 -16 L 36 -16 C 50 -22 72 -60 74 ${CUP.rimY} Z" fill="url(#g-cream)"/>
    <path d="M -60 -96 C -58 -68 -46 -42 -34 -30" stroke="#fff" stroke-opacity="0.5" stroke-width="5" stroke-linecap="round" fill="none"/>
    <ellipse cx="0" cy="${CUP.rimY}" rx="${CUP.rimRx}" ry="${CUP.rimRy}" fill="url(#g-cup-in)" stroke="#fbf3e2" stroke-width="2.5"/>
    <g clip-path="url(#clip-cup-rim)">
      <ellipse id="cup-liquor" cx="0" cy="${CUP.rimY + 14}" rx="70" ry="11" opacity="0"/>
      <ellipse id="cup-shine" cx="-18" cy="${CUP.rimY}" rx="20" ry="3" fill="#fff" opacity="0"/>
    </g>
  </g>`;
}

/** One tin. Its lid is a separate group so it can come off. */
export function tin(t: Tea, i: number): string {
  const glyph = {
    slender: `<path d="M -12 -70 C -4 -82 8 -78 12 -66 C 2 -62 -6 -62 -12 -70 Z" fill="${t.tin}"/>`,
    rolled: `<circle cx="-6" cy="-70" r="5" fill="${t.tin}"/><circle cx="6" cy="-68" r="4" fill="${t.tin}"/>`,
    twisted: `<path d="M -14 -66 C -6 -78 4 -62 14 -74" stroke="${t.tin}" stroke-width="3.5" stroke-linecap="round" fill="none"/>`,
    flower: `<circle cx="0" cy="-70" r="9" fill="none" stroke="${t.tin}" stroke-width="3" stroke-dasharray="3 2.4"/><circle cx="0" cy="-70" r="4" fill="${t.tin}"/>`,
  }[t.leaf];
  return svg`
  <g id="tin-${i}-art">
    <path d="M -46 -128 L -46 0 A 46 9 0 0 0 46 0 L 46 -128 Z" fill="${t.tin}"/>
    <rect x="-46" y="-96" width="92" height="50" fill="${t.label}"/>
    <line x1="-46" y1="-92" x2="46" y2="-92" stroke="${t.tin}" stroke-opacity="0.5" stroke-width="1.5"/>
    <line x1="-46" y1="-50" x2="46" y2="-50" stroke="${t.tin}" stroke-opacity="0.5" stroke-width="1.5"/>
    ${glyph}
    <path d="M -46 -128 L -46 0 A 46 9 0 0 0 46 0 L 46 -128 Z" fill="url(#g-cyl)"/>
    <ellipse cx="0" cy="-128" rx="46" ry="9" fill="#1c100a" opacity="0.75"/>
    <g id="tin-${i}-lid">
      <path d="M -48 -128 L -48 -146 A 48 9 0 0 1 48 -146 L 48 -128 A 48 9 0 0 1 -48 -128 Z" fill="${t.tin}"/>
      <path d="M -48 -128 L -48 -146 A 48 9 0 0 1 48 -146 L 48 -128 A 48 9 0 0 1 -48 -128 Z" fill="url(#g-cyl)"/>
      <ellipse cx="0" cy="-146" rx="48" ry="9" fill="${t.tin}"/>
      <ellipse cx="-12" cy="-148" rx="22" ry="3" fill="#fff" opacity="0.18"/>
    </g>
  </g>`;
}

export function scoop(): string {
  return svg`
  <g id="scoop-art">
    <path d="M -22 -4 L -112 -16 C -118 -15 -118 -7 -112 -6 L -22 6 Z" fill="url(#g-scoop)"/>
    <path d="M -28 0 C -28 22 28 22 28 0 Z" fill="url(#g-scoop)"/>
    <ellipse cx="0" cy="0" rx="28" ry="7" fill="#5a3a20"/>
    <g id="scoop-leaves"></g>
  </g>`;
}

export function gauge(): string {
  return svg`
  <g id="gauge" opacity="0">
    <rect x="-9" y="-170" width="18" height="170" rx="9" fill="#140a05" fill-opacity="0.35" stroke="#f1e3c8" stroke-opacity="0.35" stroke-width="2"/>
    <clipPath id="clip-gauge"><rect x="-6" y="-167" width="12" height="164" rx="6"/></clipPath>
    <rect id="gauge-fill" x="-6" y="0" width="12" height="0" fill="url(#g-gauge)" clip-path="url(#clip-gauge)"/>
    <g id="gauge-target">
      <rect x="-15" y="-3" width="30" height="6" rx="3" fill="#ffd9a0" opacity="0.25"/>
      <line x1="-13" y1="0" x2="13" y2="0" stroke="#ffe8c4" stroke-width="2" stroke-linecap="round"/>
    </g>
  </g>`;
}

/** A leaf, flower or rolled pellet, centred on its origin. */
export function leafShape(kind: Tea["leaf"], seed: number): string {
  const tone = seed % 3;
  switch (kind) {
    case "slender":
      return `<path d="M -10 0 C -5 -4 5 -4 10 0 C 5 4 -5 4 -10 0 Z" fill="${["#7f9442", "#66783a", "#94a456"][tone]}"/><line x1="-8" y1="0" x2="8" y2="0" stroke="#4a5a22" stroke-width="0.8"/>`;
    case "rolled":
      return `<ellipse rx="4.8" ry="4" fill="${["#4f5a2a", "#6b5a2c", "#3e4a26"][tone]}"/><ellipse cx="-1.4" cy="-1.4" rx="1.6" ry="1.1" fill="#fff" opacity="0.12"/>`;
    case "twisted":
      return `<path d="M -9 0 C -4 -3 4 3 9 0" stroke="${["#2e1c12", "#3d2618", "#24160e"][tone]}" stroke-width="3.2" stroke-linecap="round" fill="none"/>`;
    case "flower":
      return `<circle r="6.5" fill="#f6f0dc" stroke="#d8ccb0" stroke-width="0.8" stroke-dasharray="1.6 1.4" opacity="0.92"/><circle r="3.2" fill="${["#e6b93a", "#d9a42c", "#efc95a"][tone]}"/>`;
  }
}

/** Rotates `p` by `deg` degrees (clockwise on screen) about `about`. */
export function rotateAbout(p: Vec, about: Vec, deg: number): Vec {
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  const dx = p.x - about.x;
  const dy = p.y - about.y;
  return { x: about.x + dx * c - dy * s, y: about.y + dx * s + dy * c };
}

/** Local → world for an object placed at `pos` with scale `s` and tilt `deg` about `pivot`. */
export function localToWorld(local: Vec, pos: Vec, s: number, pivot: Vec, deg: number): Vec {
  const r = rotateAbout(local, pivot, deg);
  return { x: pos.x + r.x * s, y: pos.y + r.y * s };
}

/** Where to place an object so that, tilted by `deg`, its `local` point lands on `world`. */
export function placeSoThat(local: Vec, world: Vec, s: number, pivot: Vec, deg: number): Vec {
  const r = rotateAbout(local, pivot, deg);
  return { x: world.x - r.x * s, y: world.y - r.y * s };
}

export function transform(pos: Vec, s: number, pivot: Vec, deg: number): string {
  return `translate(${pos.x.toFixed(2)} ${pos.y.toFixed(2)}) scale(${s}) rotate(${deg.toFixed(2)} ${pivot.x} ${pivot.y})`;
}
