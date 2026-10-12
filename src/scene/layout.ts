// Where everything sits. Two arrangements of the same table: a wide one for desktops and
// landscape tablets, a tall one for phones. Coordinates are scene units; the scene is fitted
// into the screen whole ("meet"), and the wall and table are drawn far past the edges so
// whatever space is left over is still room, never a letterbox.

import type { Vec } from "../drag";

export interface Pose {
  x: number;
  y: number;
  /** Scale of the object's artwork. */
  s: number;
}

export interface Layout {
  kind: "landscape" | "portrait";
  w: number;
  h: number;
  tableY: number;
  window: { x: number; y: number; w: number; h: number };
  shelf: { x: number; y: number; w: number };
  tins: Vec[];
  tinScale: number;
  tinTable: Pose;
  lidRest: Pose;
  kettle: Pose;
  pot: Pose;
  cup: Pose;
  /** How high above the cup's rim the teapot's spout pours from. */
  cupPourHeight: number;
  /** Where the light comes from. */
  lamp: Vec;
}

const LANDSCAPE: Layout = {
  kind: "landscape",
  w: 1600,
  h: 900,
  tableY: 560,
  window: { x: 1190, y: 96, w: 250, h: 310 },
  shelf: { x: 560, y: 330, w: 560 },
  tins: [640, 775, 910, 1045].map((x) => ({ x, y: 330 })),
  tinScale: 1,
  tinTable: { x: 585, y: 760, s: 1 },
  lidRest: { x: 1045, y: 800, s: 1 },
  kettle: { x: 330, y: 790, s: 1 },
  pot: { x: 845, y: 790, s: 1 },
  cup: { x: 1260, y: 805, s: 1 },
  cupPourHeight: 130,
  lamp: { x: 140, y: 60 },
};

const PORTRAIT: Layout = {
  kind: "portrait",
  w: 900,
  h: 1850,
  tableY: 1000,
  window: { x: 500, y: 250, w: 280, h: 330 },
  shelf: { x: 60, y: 800, w: 780 },
  tins: [165, 355, 545, 735].map((x) => ({ x, y: 800 })),
  tinScale: 1.25,
  // A diagonal, so each pour moves up and to the right toward the next vessel.
  tinTable: { x: 165, y: 1700, s: 1.1 },
  lidRest: { x: 420, y: 1745, s: 1.05 },
  kettle: { x: 200, y: 1235, s: 1.05 },
  pot: { x: 430, y: 1440, s: 1.05 },
  cup: { x: 715, y: 1690, s: 1.15 },
  cupPourHeight: 200,
  lamp: { x: 60, y: 120 },
};

export function pickLayout(width: number, height: number): Layout {
  return width / height < 0.8 ? PORTRAIT : LANDSCAPE;
}

/** Scene → screen mapping for a "meet" fit. */
export interface Fit {
  scale: number;
  ox: number;
  oy: number;
}

export function fitLayout(layout: Layout, width: number, height: number): Fit {
  const scale = Math.min(width / layout.w, height / layout.h);
  return { scale, ox: (width - layout.w * scale) / 2, oy: (height - layout.h * scale) / 2 };
}

export const toScreen = (f: Fit, p: Vec): Vec => ({ x: f.ox + p.x * f.scale, y: f.oy + p.y * f.scale });
