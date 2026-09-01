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

/**
 * Smooth cubic bezier path. Control points follow the outgoing tangent of each
 * endpoint so the path always leaves/arrives perpendicular to the entity edge.
 */
export function bezierPath(src: ConnectionPoint, tgt: ConnectionPoint): string {
  const p1 = src.point
  const p2 = tgt.point
  const d  = dist(p1, p2)
  const offset = Math.max(40, d * BEZIER_TENSION)

  const t1 = tangent(src.side)
  const t2 = tangent(tgt.side)

  const cp1 = { x: p1.x + t1.x * offset, y: p1.y + t1.y * offset }
  const cp2 = { x: p2.x + t2.x * offset, y: p2.y + t2.y * offset }

  return `M ${p1.x} ${p1.y} C ${cp1.x} ${cp1.y}, ${cp2.x} ${cp2.y}, ${p2.x} ${p2.y}`
}

/**
 * Orthogonal (Manhattan) path with exactly two 90° bends.
 * Routing strategy:
 *   - horizontal exit/entry sides (left/right): route via a vertical midpoint
 *   - vertical exit/entry sides (top/bottom): route via a horizontal midpoint
 *   - mixed sides: step to a corner then go straight
 */
export function orthogonalPath(src: ConnectionPoint, tgt: ConnectionPoint): string {
  const p1 = src.point
  const p2 = tgt.point
  const s1 = src.side
  const s2 = tgt.side

  const isH1 = s1 === 'left' || s1 === 'right'
  const isH2 = s2 === 'left' || s2 === 'right'

  let points: Point[]

  if (isH1 && isH2) {
    // Both horizontal — meet at vertical midpoint
    const midX = (p1.x + p2.x) / 2
    points = [p1, { x: midX, y: p1.y }, { x: midX, y: p2.y }, p2]
  } else if (!isH1 && !isH2) {
    // Both vertical — meet at horizontal midpoint
    const midY = (p1.y + p2.y) / 2
    points = [p1, { x: p1.x, y: midY }, { x: p2.x, y: midY }, p2]
  } else if (isH1 && !isH2) {
    // Source horizontal, target vertical — elbow at (p2.x, p1.y)
    points = [p1, { x: p2.x, y: p1.y }, p2]
  } else {
    // Source vertical, target horizontal — elbow at (p1.x, p2.y)
    points = [p1, { x: p1.x, y: p2.y }, p2]
  }

  return 'M ' + points.map((p) => `${p.x} ${p.y}`).join(' L ')
}
