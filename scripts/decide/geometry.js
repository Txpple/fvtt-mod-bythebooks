// @ts-check
/**
 * By the Books — DECISION (ARCHITECTURE.md §2): area and token geometry over document-SHAPED objects,
 * no Foundry; an area is a REGION. The edge is ../geometry.js. ⚠ Depend downward only.
 */

/**
 * The Region shape a dnd5e template type is placed as (`TemplatePlacement#createShapeData`), or null.
 * @param {string|null|undefined} templateType
 * @returns {"circle"|"cone"|"rectangle"|"line"|"emanation"|"ring"|null}
 */
export function regionShapeTypeFor(templateType) {
  switch ( templateType ) {
    case "circle": return "circle";
    case "cone": return "cone";
    case "rect":
    case "rectangle": return "rectangle";
    case "ray":
    case "line": return "line";
    case "emanation":
    case "radius": return "emanation";
    case "ring": return "ring";
    default: return null;
  }
}

/**
 * An emanation around a token byte for byte as dnd5e's `TemplatePlacement` writes it: a `token`
 * base and the radius in PIXELS from the base's edge.
 * @param {{x:number, y:number, width:number, height:number, shape?:number|null}} tok
 * @param {number} radiusPx
 * @param {{ shape?: number }} [defaults]   when the token names none (RECTANGLE_1 is 0)
 */
export function emanationShapeData(tok, radiusPx, { shape = 0 } = {}) {
  return {
    type: "emanation",
    x: 0, y: 0, rotation: 0,
    base: {
      type: "token", x: tok.x, y: tok.y, rotation: 0,
      width: tok.width, height: tok.height,
      shape: (tok.shape === null || tok.shape === undefined) ? shape : tok.shape
    },
    radius: radiusPx
  };
}

/**
 * The length-unit KEY for `scene.grid.units` (a free string dnd5e never maps), or null: blank is not feet.
 * ⚠ Never compare a scene-unit distance with a feet literal: 3 m is not "within 5 feet".
 * @param {string|null|undefined} units
 * @returns {"ft"|"m"|"mi"|"km"|null}
 */
export function lengthUnitKey(units) {
  const u = String(units ?? "").trim().toLowerCase().replace(/\.$/, "");
  if ( ["ft", "feet", "foot", "'"].includes(u) ) return "ft";
  if ( ["m", "meter", "meters", "metre", "metres"].includes(u) ) return "m";
  if ( ["mi", "mile", "miles"].includes(u) ) return "mi";
  if ( ["km", "kilometer", "kilometers", "kilometre", "kilometres"].includes(u) ) return "km";
  return null;
}

export function tokenCenter(tok) {
  if ( tok.object ) return tok.object.center;
  const grid = tok.parent?.grid?.size;
  if ( !grid ) return null;
  return { x: tok.x + (tok.width * grid) / 2, y: tok.y + (tok.height * grid) / 2 };
}

/** Do two rectangles ({x, y, w, h}) share any area? Touching edges do not count. */
export function rectsOverlap(a, b) {
  if ( !a || !b ) return false;
  return (a.x < b.x + b.w) && (b.x < a.x + a.w) && (a.y < b.y + b.h) && (b.y < a.y + a.h);
}

/**
 * Points moved onto the grid: each to the center `snap` names for it (the edge hands it the grid's
 * `getCenterPoint`), duplicates dropped, so a measure between two footprints counts whole spaces.
 * @param {{x: number, y: number}[]} points
 * @param {(p: {x: number, y: number}) => {x: number, y: number}} snap
 */
export function snappedPoints(points, snap) {
  const out = [];
  const seen = new Set();
  for ( const p of points ) {
    const c = snap(p);
    const key = `${c.x},${c.y}`;
    if ( seen.has(key) ) continue;
    seen.add(key);
    out.push({ x: c.x, y: c.y });
  }
  return out;
}

/** One sample per occupied square: a large token counts when ANY square is in the area. */
export function tokenSamplePoints(tok) {
  const grid = tok.parent?.grid?.size;
  if ( !grid ) return [];
  const w = Math.round(tok.width ?? 1), h = Math.round(tok.height ?? 1);
  if ( (w < 1) || (h < 1) || ((w === 1) && (h === 1)) ) {
    const c = tokenCenter(tok);
    return c ? [c] : [];
  }
  const points = [];
  for ( let i = 0; i < w; i++ ) {
    for ( let j = 0; j < h; j++ ) points.push({ x: tok.x + ((i + 0.5) * grid), y: tok.y + ((j + 0.5) * grid) });
  }
  return points;
}
