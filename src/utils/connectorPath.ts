import type { ConnectionPoint, EdgeSide, Point, SelfLoopCorner } from '../model/types'

// Control point distance for bezier curves, as a fraction of the segment length
const BEZIER_TENSION = 0.45

/** Returns the tangent direction vector for a given edge side */
function tangent(side: EdgeSide): Point {
  switch (side) {
    case 'right':  return {  x: 1,  y: 0 }
    case 'left':   return {  x: -1, y: 0 }
    case 'bottom': return {  x: 0,  y: 1 }
    case 'top':    return {  x: 0,  y: -1 }
  }
}

function dist(a: Point, b: Point): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2)
}

interface Cubic {
  p0: Point
  c1: Point
  c2: Point
  p3: Point
}

/** Unit direction along the chord p0→p3. */
function chordDir(p0: Point, p3: Point): Point {
  const dx = p3.x - p0.x
  const dy = p3.y - p0.y
  const len = Math.hypot(dx, dy) || 1
  return { x: dx / len, y: dy / len }
}

/** Unit perpendicular to the chord (rotated 90° CCW). */
function chordPerp(p0: Point, p3: Point): Point {
  const dir = chordDir(p0, p3)
  return { x: -dir.y, y: dir.x }
}

function add(a: Point, b: Point, s = 1): Point {
  return { x: a.x + b.x * s, y: a.y + b.y * s }
}

// Keep mid-route handles clear of crow's-foot / Barker glyphs (largest ~24px)
const ROUTE_MID_MARGIN = 28

/** Clamp a point so its chord projection stays between the endpoints (with marker margin). */
function clampAlongChord(p0: Point, p3: Point, point: Point): Point {
  const d = dist(p0, p3) || 1
  const dir = chordDir(p0, p3)
  const perp = chordPerp(p0, p3)
  const tRaw = (point.x - p0.x) * dir.x + (point.y - p0.y) * dir.y
  const b = (point.x - p0.x) * perp.x + (point.y - p0.y) * perp.y
  const pad = ROUTE_MID_MARGIN
  const t = d <= 2 * pad ? d / 2 : Math.max(pad, Math.min(d - pad, tRaw))
  return { x: p0.x + dir.x * t + perp.x * b, y: p0.y + dir.y * t + perp.y * b }
}

/** Default cubic (tangents only) — no mid-route nudge. */
function autoCubic(src: ConnectionPoint, tgt: ConnectionPoint): Cubic {
  const p0 = src.point
  const p3 = tgt.point
  const d = dist(p0, p3)
  const offset = Math.max(40, d * BEZIER_TENSION)
  const t1 = tangent(src.side)
  const t2 = tangent(tgt.side)
  return {
    p0,
    c1: { x: p0.x + t1.x * offset, y: p0.y + t1.y * offset },
    c2: { x: p3.x + t2.x * offset, y: p3.y + t2.y * offset },
    p3,
  }
}

/**
 * Control points for the smooth cubic bezier.
 * `along` / `bulge` shift both controls by the same delta (flexible mid);
 * end tangents may tilt — Curved connectors use side-fixed marker orients.
 */
function cubicBezier(
  src: ConnectionPoint,
  tgt: ConnectionPoint,
  along = 0,
  bulge = 0,
): Cubic {
  const auto = autoCubic(src, tgt)
  if (along === 0 && bulge === 0) return auto

  const d = dist(auto.p0, auto.p3) || 1
  const dir = chordDir(auto.p0, auto.p3)
  const perp = chordPerp(auto.p0, auto.p3)
  const autoMid = cubicAt(auto, 0.5)
  const desired = add(add(autoMid, dir, along * d), perp, bulge * d)
  const target = clampAlongChord(auto.p0, auto.p3, desired)
  const delta = { x: target.x - autoMid.x, y: target.y - autoMid.y }
  return {
    p0: auto.p0,
    c1: add(auto.c1, delta),
    c2: add(auto.c2, delta),
    p3: auto.p3,
  }
}

/** Point on a cubic bezier at parameter t (De Casteljau). */
function cubicAt(c: Cubic, t: number): Point {
  const a = add(c.p0, add(c.c1, c.p0, -1), t)
  const b = add(c.c1, add(c.c2, c.c1, -1), t)
  const d = add(c.c2, add(c.p3, c.c2, -1), t)
  const e = add(a, add(b, a, -1), t)
  const f = add(b, add(d, b, -1), t)
  return add(e, add(f, e, -1), t)
}

export interface CurvedNudge {
  along: number
  bulge: number
}

/** Smooth cubic bezier path. */
export function bezierPath(src: ConnectionPoint, tgt: ConnectionPoint, nudge: CurvedNudge | number = 0): string {
  const { along, bulge } = normalizeCurvedNudge(nudge)
  const { p0, c1, c2, p3 } = cubicBezier(src, tgt, along, bulge)
  return `M ${p0.x} ${p0.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${p3.x} ${p3.y}`
}

/** Mid-curve handle for curved route dragging. */
export function bezierHandlePoint(src: ConnectionPoint, tgt: ConnectionPoint, nudge: CurvedNudge | number = 0): Point {
  const { along, bulge } = normalizeCurvedNudge(nudge)
  return cubicAt(cubicBezier(src, tgt, along, bulge), 0.5)
}

/** Map a pointer to curved along+bulge (fractions of chord), clamped between endpoints. */
export function curvedNudgeFromPoint(src: ConnectionPoint, tgt: ConnectionPoint, mouse: Point): CurvedNudge {
  const p0 = src.point
  const p3 = tgt.point
  const d = dist(p0, p3) || 1
  const dir = chordDir(p0, p3)
  const perp = chordPerp(p0, p3)
  const autoMid = cubicAt(autoCubic(src, tgt), 0.5)
  const clamped = clampAlongChord(p0, p3, mouse)
  const dx = clamped.x - autoMid.x
  const dy = clamped.y - autoMid.y
  return {
    along: (dx * dir.x + dy * dir.y) / d,
    bulge: (dx * perp.x + dy * perp.y) / d,
  }
}

function normalizeCurvedNudge(nudge: CurvedNudge | number): CurvedNudge {
  if (typeof nudge === 'number') return { along: 0, bulge: nudge }
  return {
    along: typeof nudge.along === 'number' ? nudge.along : 0,
    bulge: typeof nudge.bulge === 'number' ? nudge.bulge : 0,
  }
}

type OrthoKind = 'hh' | 'vv' | 'hv' | 'vh'

function orthoKind(src: ConnectionPoint, tgt: ConnectionPoint): OrthoKind {
  const isH1 = src.side === 'left' || src.side === 'right'
  const isH2 = tgt.side === 'left' || tgt.side === 'right'
  if (isH1 && isH2) return 'hh'
  if (!isH1 && !isH2) return 'vv'
  return isH1 ? 'hv' : 'vh'
}

function orthoSpan(src: ConnectionPoint, tgt: ConnectionPoint, kind: OrthoKind): number {
  const p1 = src.point
  const p2 = tgt.point
  if (kind === 'hh' || kind === 'hv') return Math.max(Math.abs(p2.x - p1.x), 40)
  return Math.max(Math.abs(p2.y - p1.y), 40)
}

// Keep the mid channel clear of crow's-foot / Barker glyphs (largest ~24px)
const ORTHO_MID_MARGIN = ROUTE_MID_MARGIN

/** Clamp mid coordinate so the channel stays between the endpoints, with marker clearance. */
function clampOrthoMid(a: number, b: number, proposed: number): number {
  const lo = Math.min(a, b)
  const hi = Math.max(a, b)
  const pad = ORTHO_MID_MARGIN
  if (hi - lo <= 2 * pad) return (a + b) / 2
  return Math.max(lo + pad, Math.min(hi - pad, proposed))
}

/** Absolute mid-channel position after clamping (HH → x, VV → y). */
function clampedOrthoMidCoord(
  src: ConnectionPoint,
  tgt: ConnectionPoint,
  kind: 'hh' | 'vv',
  midOffset: number,
): number {
  const p1 = src.point
  const p2 = tgt.point
  const span = orthoSpan(src, tgt, kind)
  if (kind === 'hh') {
    return clampOrthoMid(p1.x, p2.x, (p1.x + p2.x) / 2 + midOffset * span)
  }
  return clampOrthoMid(p1.y, p2.y, (p1.y + p2.y) / 2 + midOffset * span)
}

/**
 * Orthogonal (Manhattan) path with one or two 90° bends.
 * `midOffset` only applies to HH/VV (slides the mid channel). Mixed HV/VH
 * stay as a single elbow — nudging them into two bends is not offered.
 * The mid channel is always clamped between the endpoints (with margin for markers).
 */
/** Corner points of the orthogonal (Manhattan) route (see strategy above). */
export function orthogonalCorners(src: ConnectionPoint, tgt: ConnectionPoint, midOffset = 0): Point[] {
  const p1 = src.point
  const p2 = tgt.point
  const kind = orthoKind(src, tgt)

  if (kind === 'hh') {
    const midX = clampedOrthoMidCoord(src, tgt, 'hh', midOffset)
    return [p1, { x: midX, y: p1.y }, { x: midX, y: p2.y }, p2]
  }
  if (kind === 'vv') {
    const midY = clampedOrthoMidCoord(src, tgt, 'vv', midOffset)
    return [p1, { x: p1.x, y: midY }, { x: p2.x, y: midY }, p2]
  }
  if (kind === 'hv') {
    // Source horizontal, target vertical — single elbow at (p2.x, p1.y)
    return [p1, { x: p2.x, y: p1.y }, p2]
  }
  // Source vertical, target horizontal — single elbow at (p1.x, p2.y)
  return [p1, { x: p1.x, y: p2.y }, p2]
}

/** True when Orthogonal mid-route drag applies (two-bend HH/VV with room to slide). */
export function orthogonalRouteEditable(src: ConnectionPoint, tgt: ConnectionPoint): boolean {
  const kind = orthoKind(src, tgt)
  if (kind !== 'hh' && kind !== 'vv') return false
  const p1 = src.point
  const p2 = tgt.point
  const gap = kind === 'hh' ? Math.abs(p2.x - p1.x) : Math.abs(p2.y - p1.y)
  return gap > 2 * ORTHO_MID_MARGIN
}

/** Path from an explicit corner list (same format as orthogonalPath). */
export function polylinePath(corners: Point[]): string {
  return 'M ' + corners.map((p) => `${p.x} ${p.y}`).join(' L ')
}

export function orthogonalPath(src: ConnectionPoint, tgt: ConnectionPoint, midOffset = 0): string {
  const kind = orthoKind(src, tgt)
  const effective = (kind === 'hh' || kind === 'vv') ? midOffset : 0
  return polylinePath(orthogonalCorners(src, tgt, effective))
}

/** Mid-route handle for orthogonal dragging; null when the route is a single elbow. */
export function orthogonalHandlePoint(src: ConnectionPoint, tgt: ConnectionPoint, midOffset = 0): Point | null {
  if (!orthogonalRouteEditable(src, tgt)) return null
  const corners = orthogonalCorners(src, tgt, midOffset)
  return {
    x: (corners[1].x + corners[2].x) / 2,
    y: (corners[1].y + corners[2].y) / 2,
  }
}

/** Map a pointer position to an orthogonal midOffset (HH/VV only; else 0). Clamped between endpoints. */
export function midOffsetFromPoint(src: ConnectionPoint, tgt: ConnectionPoint, mouse: Point): number {
  const p1 = src.point
  const p2 = tgt.point
  const kind = orthoKind(src, tgt)
  if (kind !== 'hh' && kind !== 'vv') return 0
  const span = orthoSpan(src, tgt, kind)
  if (kind === 'hh') {
    const midX = clampOrthoMid(p1.x, p2.x, mouse.x)
    return (midX - (p1.x + p2.x) / 2) / span
  }
  const midY = clampOrthoMid(p1.y, p2.y, mouse.y)
  return (midY - (p1.y + p2.y) / 2) / span
}

/** Default outward clearance for self-loop square path (px). */
export const SELF_LOOP_DEFAULT_EXTENT = 56
/** Min clearance — keeps room for fillets / markers outside the card. */
export const SELF_LOOP_MIN_EXTENT = 32
export const SELF_LOOP_MAX_EXTENT = 240

export function clampSelfLoopExtent(extent: number): number {
  if (!Number.isFinite(extent)) return SELF_LOOP_DEFAULT_EXTENT
  return Math.max(SELF_LOOP_MIN_EXTENT, Math.min(SELF_LOOP_MAX_EXTENT, extent))
}

/**
 * Explicit outside corners for a self-loop at a given card corner.
 * Curved style fillets these; Orthogonal keeps them sharp.
 */
export function selfLoopCorners(
  source: ConnectionPoint,
  target: ConnectionPoint,
  extent = SELF_LOOP_DEFAULT_EXTENT,
  corner: SelfLoopCorner = 'ne',
): Point[] {
  const e = clampSelfLoopExtent(extent)
  const sx = source.point.x
  const sy = source.point.y
  const tx = target.point.x
  const ty = target.point.y
  switch (corner) {
    case 'ne':
      return [
        source.point,
        { x: sx, y: sy - e },
        { x: tx + e, y: sy - e },
        { x: tx + e, y: ty },
        target.point,
      ]
    case 'se':
      return [
        source.point,
        { x: sx + e, y: sy },
        { x: sx + e, y: ty + e },
        { x: tx, y: ty + e },
        target.point,
      ]
    case 'sw':
      return [
        source.point,
        { x: sx, y: sy + e },
        { x: tx - e, y: sy + e },
        { x: tx - e, y: ty },
        target.point,
      ]
    case 'nw':
      return [
        source.point,
        { x: sx - e, y: sy },
        { x: sx - e, y: ty - e },
        { x: tx, y: ty - e },
        target.point,
      ]
  }
}

/** Outer corner handle — dragging grows/shrinks the square loop (and can change corner). */
export function selfLoopHandlePoint(
  source: ConnectionPoint,
  target: ConnectionPoint,
  extent = SELF_LOOP_DEFAULT_EXTENT,
  corner: SelfLoopCorner = 'ne',
): Point {
  const corners = selfLoopCorners(source, target, extent, corner)
  return corners[2]
}

/**
 * Map pointer → loop extent for the active corner.
 * Each corner expands along its outward diagonal from the inner L pivot.
 */
export function selfLoopExtentFromPoint(
  source: ConnectionPoint,
  target: ConnectionPoint,
  mouse: Point,
  corner: SelfLoopCorner = 'ne',
): number {
  const sx = source.point.x
  const sy = source.point.y
  const tx = target.point.x
  const ty = target.point.y
  const mx = mouse.x
  const my = mouse.y
  let raw: number
  switch (corner) {
    case 'ne':
      raw = ((mx - tx) - (my - sy)) / 2
      break
    case 'se':
      raw = ((mx - sx) + (my - ty)) / 2
      break
    case 'sw':
      raw = ((tx - mx) + (my - sy)) / 2
      break
    case 'nw':
      raw = ((sx - mx) + (ty - my)) / 2
      break
  }
  return clampSelfLoopExtent(raw)
}

// Corner radius for self-loop rendering (well below the default loop clearance,
// so the smoothed curve provably stays outside the entity rect; also clamped
// per-segment in buildRoundedPolyline when extent is smaller)
export const SELF_LOOP_CORNER_RADIUS = 24

type PathSeg =
  | { kind: 'L'; to: Point }
  | { kind: 'Q'; ctrl: Point; to: Point }

interface BuiltPath {
  start: Point
  segs: PathSeg[]
}

/** Quadratic point at parameter t (P0 → ctrl → P2). */
function quadAt(p0: Point, ctrl: Point, p2: Point, t: number): Point {
  const u = 1 - t
  return {
    x: u * u * p0.x + 2 * u * t * ctrl.x + t * t * p2.x,
    y: u * u * p0.y + 2 * u * t * ctrl.y + t * t * p2.y,
  }
}

/** Approximate quadratic arc length via uniform samples. */
function quadLength(p0: Point, ctrl: Point, p2: Point, samples = 12): number {
  let L = 0
  let prev = p0
  for (let i = 1; i <= samples; i++) {
    const p = quadAt(p0, ctrl, p2, i / samples)
    L += dist(prev, p)
    prev = p
  }
  return L
}

/** Find t∈[0,1] where arc length from p0 reaches `target` (samples + lerp). */
function quadTAtLength(p0: Point, ctrl: Point, p2: Point, target: number, samples = 12): number {
  let acc = 0
  let prev = p0
  for (let i = 1; i <= samples; i++) {
    const t = i / samples
    const p = quadAt(p0, ctrl, p2, t)
    const seg = dist(prev, p)
    if (acc + seg >= target) {
      const f = seg === 0 ? 0 : (target - acc) / seg
      return (i - 1 + f) / samples
    }
    acc += seg
    prev = p
  }
  return 1
}

/** De Casteljau split of a quadratic at t → two quadratics sharing the cut point. */
function splitQuad(p0: Point, ctrl: Point, p2: Point, t: number): {
  mid: Point
  firstCtrl: Point
  secondCtrl: Point
} {
  const a = { x: p0.x + (ctrl.x - p0.x) * t, y: p0.y + (ctrl.y - p0.y) * t }
  const b = { x: ctrl.x + (p2.x - ctrl.x) * t, y: ctrl.y + (p2.y - ctrl.y) * t }
  const midPt = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
  return { mid: midPt, firstCtrl: a, secondCtrl: b }
}

/**
 * Corner list → move + line/quadratic segments (fillets at interior corners,
 * radius clamped to half the adjacent segment lengths).
 */
function buildRoundedPolyline(corners: Point[], radius: number): BuiltPath {
  const start = corners[0]
  if (corners.length < 3) {
    return { start, segs: corners.slice(1).map((to) => ({ kind: 'L' as const, to })) }
  }
  const segs: PathSeg[] = []
  for (let i = 1; i < corners.length - 1; i++) {
    const prev = corners[i - 1]
    const curr = corners[i]
    const next = corners[i + 1]
    const inLen = dist(prev, curr)
    const outLen = dist(curr, next)
    if (inLen === 0 || outLen === 0) {
      segs.push({ kind: 'L', to: curr })
      continue
    }
    const r = Math.min(radius, inLen / 2, outLen / 2)
    const ux = (curr.x - prev.x) / inLen
    const uy = (curr.y - prev.y) / inLen
    const vx = (next.x - curr.x) / outLen
    const vy = (next.y - curr.y) / outLen
    segs.push({ kind: 'L', to: { x: curr.x - ux * r, y: curr.y - uy * r } })
    segs.push({ kind: 'Q', ctrl: curr, to: { x: curr.x + vx * r, y: curr.y + vy * r } })
  }
  segs.push({ kind: 'L', to: corners[corners.length - 1] })
  return { start, segs }
}

function pathFromBuilt(built: BuiltPath): string {
  let d = `M ${fmt(built.start)}`
  for (const s of built.segs) {
    d += s.kind === 'L' ? ` L ${fmt(s.to)}` : ` Q ${fmt(s.ctrl)} ${fmt(s.to)}`
  }
  return d
}

function fmt(p: Point): string {
  return `${p.x} ${p.y}`
}

// ─── Path splitting (Barker notation: per-half line styles) ─────────────────

export interface PathHalves {
  first: string
  second: string
}

/**
 * Renders a corner list as a smooth path with rounded corners (quadratic
 * fillets). Start/end points are exact; interior corners are cut with radius
 * clamped to half the adjacent segment lengths.
 */
export function roundedPolylinePath(corners: Point[], radius: number): string {
  return pathFromBuilt(buildRoundedPolyline(corners, radius))
}

/**
 * Splits a rounded polyline at its arc-length midpoint so Barker halves keep
 * every fillet (including the corner that lands on the solid/dotted junction).
 */
export function splitRoundedPolyline(corners: Point[], radius: number): PathHalves {
  const built = buildRoundedPolyline(corners, radius)
  if (built.segs.length === 0) {
    const d = `M ${fmt(built.start)}`
    return { first: d, second: d }
  }

  // Measure each segment
  const lengths: number[] = []
  let cursor = built.start
  let total = 0
  for (const s of built.segs) {
    const len = s.kind === 'L' ? dist(cursor, s.to) : quadLength(cursor, s.ctrl, s.to)
    lengths.push(len)
    total += len
    cursor = s.to
  }
  if (total === 0) {
    const d = `M ${fmt(built.start)}`
    return { first: d, second: d }
  }

  const half = total / 2
  const firstSegs: PathSeg[] = []
  let acc = 0
  cursor = built.start
  for (let i = 0; i < built.segs.length; i++) {
    const s = built.segs[i]
    const len = lengths[i]
    if (acc + len >= half) {
      const remain = half - acc
      if (s.kind === 'L') {
        const t = len === 0 ? 0 : remain / len
        const m = {
          x: cursor.x + (s.to.x - cursor.x) * t,
          y: cursor.y + (s.to.y - cursor.y) * t,
        }
        firstSegs.push({ kind: 'L', to: m })
        const secondSegs: PathSeg[] = [{ kind: 'L', to: s.to }, ...built.segs.slice(i + 1)]
        return {
          first: pathFromBuilt({ start: built.start, segs: firstSegs }),
          second: pathFromBuilt({ start: m, segs: secondSegs }),
        }
      }
      const t = quadTAtLength(cursor, s.ctrl, s.to, remain)
      const { mid: m, firstCtrl, secondCtrl } = splitQuad(cursor, s.ctrl, s.to, t)
      firstSegs.push({ kind: 'Q', ctrl: firstCtrl, to: m })
      const secondSegs: PathSeg[] = [
        { kind: 'Q', ctrl: secondCtrl, to: s.to },
        ...built.segs.slice(i + 1),
      ]
      return {
        first: pathFromBuilt({ start: built.start, segs: firstSegs }),
        second: pathFromBuilt({ start: m, segs: secondSegs }),
      }
    }
    firstSegs.push(s)
    acc += len
    cursor = s.to
  }

  return {
    first: pathFromBuilt(built),
    second: `M ${fmt(built.segs[built.segs.length - 1].to)}`,
  }
}

function mid(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
}

function polylineLength(pts: Point[]): number {
  let L = 0
  for (let i = 1; i < pts.length; i++) L += dist(pts[i - 1], pts[i])
  return L
}

/** Splits the cubic bezier into two halves at its midpoint (De Casteljau, t = 0.5). */
export function splitBezierPath(src: ConnectionPoint, tgt: ConnectionPoint, nudge: CurvedNudge | number = 0): PathHalves {
  const { along, bulge } = normalizeCurvedNudge(nudge)
  const { p0, c1, c2, p3 } = cubicBezier(src, tgt, along, bulge)
  const m1 = mid(p0, c1)
  const m2 = mid(c1, c2)
  const m3 = mid(c2, p3)
  const m12 = mid(m1, m2)
  const m23 = mid(m2, m3)
  const m = mid(m12, m23)
  return {
    first:  `M ${fmt(p0)} C ${fmt(m1)}, ${fmt(m12)}, ${fmt(m)}`,
    second: `M ${fmt(m)} C ${fmt(m23)}, ${fmt(m3)}, ${fmt(p3)}`,
  }
}

/** Splits an explicit corner list into two point lists at its length midpoint. */
export function splitPolylinePoints(pts: Point[]): { first: Point[]; second: Point[] } {
  const total = polylineLength(pts)
  if (total === 0) {
    return { first: [pts[0]], second: [pts[0]] }
  }
  const half = total / 2
  const first: Point[] = [pts[0]]
  let acc = 0
  for (let i = 1; i < pts.length; i++) {
    const segLen = dist(pts[i - 1], pts[i])
    if (acc + segLen >= half) {
      const t = segLen === 0 ? 0 : (half - acc) / segLen
      const m = {
        x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * t,
        y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * t,
      }
      first.push(m)
      return { first, second: [m, ...pts.slice(i)] }
    }
    acc += segLen
    first.push(pts[i])
  }
  // Unreachable fallback — whole polyline as the first half
  return { first: pts, second: [pts[pts.length - 1]] }
}

/** Splits an explicit corner list into two path halves at its length midpoint. */
export function splitPolyline(pts: Point[]): PathHalves {
  const { first, second } = splitPolylinePoints(pts)
  return { first: polylinePath(first), second: polylinePath(second) }
}

/** Splits the orthogonal polyline into two halves at its length midpoint. */
export function splitOrthogonalPath(src: ConnectionPoint, tgt: ConnectionPoint, midOffset = 0): PathHalves {
  const offset = orthogonalRouteEditable(src, tgt) ? midOffset : 0
  return splitPolyline(orthogonalCorners(src, tgt, offset))
}
