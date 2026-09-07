import type { ConnectionPoint, EdgeSide, Point } from '../model/types'

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

/** Control points for the smooth cubic bezier: they follow the outgoing tangent
 *  of each endpoint so the path always leaves/arrives perpendicular to the entity edge. */
function cubicBezier(src: ConnectionPoint, tgt: ConnectionPoint): Cubic {
  const p0 = src.point
  const p3 = tgt.point
  const d  = dist(p0, p3)
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

/** Smooth cubic bezier path. */
export function bezierPath(src: ConnectionPoint, tgt: ConnectionPoint): string {
  const { p0, c1, c2, p3 } = cubicBezier(src, tgt)
  return `M ${p0.x} ${p0.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${p3.x} ${p3.y}`
}

/**
 * Orthogonal (Manhattan) path with exactly two 90° bends.
 * Routing strategy:
 *   - horizontal exit/entry sides (left/right): route via a vertical midpoint
 *   - vertical exit/entry sides (top/bottom): route via a horizontal midpoint
 *   - mixed sides: step to a corner then go straight
 */
/** Corner points of the orthogonal (Manhattan) route (see strategy below). */
function orthogonalCorners(src: ConnectionPoint, tgt: ConnectionPoint): Point[] {
  const p1 = src.point
  const p2 = tgt.point
  const s1 = src.side
  const s2 = tgt.side

  const isH1 = s1 === 'left' || s1 === 'right'
  const isH2 = s2 === 'left' || s2 === 'right'

  if (isH1 && isH2) {
    // Both horizontal — meet at vertical midpoint
    const midX = (p1.x + p2.x) / 2
    return [p1, { x: midX, y: p1.y }, { x: midX, y: p2.y }, p2]
  } else if (!isH1 && !isH2) {
    // Both vertical — meet at horizontal midpoint
    const midY = (p1.y + p2.y) / 2
    return [p1, { x: p1.x, y: midY }, { x: p2.x, y: midY }, p2]
  } else if (isH1 && !isH2) {
    // Source horizontal, target vertical — elbow at (p2.x, p1.y)
    return [p1, { x: p2.x, y: p1.y }, p2]
  } else {
    // Source vertical, target horizontal — elbow at (p1.x, p2.y)
    return [p1, { x: p1.x, y: p2.y }, p2]
  }
}

/** Path from an explicit corner list (same format as orthogonalPath). */
export function polylinePath(corners: Point[]): string {
  return 'M ' + corners.map((p) => `${p.x} ${p.y}`).join(' L ')
}

export function orthogonalPath(src: ConnectionPoint, tgt: ConnectionPoint): string {
  return polylinePath(orthogonalCorners(src, tgt))
}

/**
 * Explicit outside corners for a self-loop. The route goes up from the
 * top-edge exit, right past the card, down, and back left into the
 * right-edge entry — every segment stays outside the entity rect.
 * Curved style fillets these corners; Orthogonal keeps them sharp.
 */
export function selfLoopCorners(source: ConnectionPoint, target: ConnectionPoint, loop = 56): Point[] {
  const top = source.point.y - loop
  const right = target.point.x + loop
  return [
    source.point,
    { x: source.point.x, y: top },
    { x: right, y: top },
    { x: right, y: target.point.y },
    target.point,
  ]
}

// Corner radius for self-loop rendering (well below the 56px loop clearance,
// so the smoothed curve provably stays outside the entity rect)
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
export function splitBezierPath(src: ConnectionPoint, tgt: ConnectionPoint): PathHalves {
  const { p0, c1, c2, p3 } = cubicBezier(src, tgt)
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
export function splitOrthogonalPath(src: ConnectionPoint, tgt: ConnectionPoint): PathHalves {
  return splitPolyline(orthogonalCorners(src, tgt))
}
