import type { EntityRect, ConnectionPoint, EdgeSide, Point, CustomConnectionPoints, CustomConnectorEndpoint, LabelPosition } from '../model/types'

// Pulls connection points away from entity edge so markers don't get occluded by the card
const MARKER_CLEARANCE = 12

// Returns the center point of each edge, offset outward by MARKER_CLEARANCE
function edgeCenters(r: EntityRect): Record<EdgeSide, Point> {
  const c = MARKER_CLEARANCE
  return {
    top:    { x: r.x + r.width / 2, y: r.y - c },
    bottom: { x: r.x + r.width / 2, y: r.y + r.height + c },
    left:   { x: r.x - c,           y: r.y + r.height / 2 },
    right:  { x: r.x + r.width + c, y: r.y + r.height / 2 },
  }
}

function distance(a: Point, b: Point): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2)
}

/**
 * Picks the closest pair of edge-center points between two entity rects,
 * one from each rect. Returns source and target ConnectionPoints.
 */
export function getBestConnectionPoints(
  from: EntityRect,
  to: EntityRect,
): { source: ConnectionPoint; target: ConnectionPoint } {
  const fromEdges = edgeCenters(from)
  const toEdges = edgeCenters(to)

  let best = Infinity
  let source: ConnectionPoint = { point: fromEdges.right, side: 'right' }
  let target: ConnectionPoint = { point: toEdges.left,  side: 'left'  }

  const sides: EdgeSide[] = ['top', 'right', 'bottom', 'left']

  for (const fromSide of sides) {
    for (const toSide of sides) {
      const d = distance(fromEdges[fromSide], toEdges[toSide])
      if (d < best) {
        best = d
        source = { point: fromEdges[fromSide], side: fromSide }
        target = { point: toEdges[toSide],     side: toSide   }
      }
    }
  }

  return { source, target }
}

/** Resolves a CustomConnectorEndpoint to an absolute ConnectionPoint using the current entity rect. */
export function resolveEndpoint(ep: CustomConnectorEndpoint, entity: EntityRect): ConnectionPoint {
  const c = MARKER_CLEARANCE
  const f = Math.max(0, Math.min(1, ep.fraction))
  let point: Point
  switch (ep.side) {
    case 'left':   point = { x: entity.x - c,                      y: entity.y + f * entity.height }; break
    case 'right':  point = { x: entity.x + entity.width + c,        y: entity.y + f * entity.height }; break
    case 'top':    point = { x: entity.x + f * entity.width,         y: entity.y - c }; break
    case 'bottom': point = { x: entity.x + f * entity.width,         y: entity.y + entity.height + c }; break
  }
  return { point, side: ep.side }
}

/** Finds the closest edge of an entity to a given point and returns {side, fraction}. */
export function snapToEntityEdge(pt: Point, entity: EntityRect): { side: EdgeSide; fraction: number } {
  const distLeft   = Math.abs(pt.x - entity.x)
  const distRight  = Math.abs(pt.x - (entity.x + entity.width))
  const distTop    = Math.abs(pt.y - entity.y)
  const distBottom = Math.abs(pt.y - (entity.y + entity.height))
  const min = Math.min(distLeft, distRight, distTop, distBottom)

  if (min === distLeft)   return { side: 'left',   fraction: Math.max(0, Math.min(1, (pt.y - entity.y) / entity.height)) }
  if (min === distRight)  return { side: 'right',  fraction: Math.max(0, Math.min(1, (pt.y - entity.y) / entity.height)) }
  if (min === distTop)    return { side: 'top',    fraction: Math.max(0, Math.min(1, (pt.x - entity.x) / entity.width))  }
  return                         { side: 'bottom', fraction: Math.max(0, Math.min(1, (pt.x - entity.x) / entity.width))  }
}

/** Get connection points using custom overrides if available, otherwise auto-calculate. */
export function getConnectionPoints(
  from: EntityRect,
  to: EntityRect,
  customPoints?: CustomConnectionPoints,
): { source: ConnectionPoint; target: ConnectionPoint } {
  const auto = getBestConnectionPoints(from, to)
  return {
    source: customPoints?.from ? resolveEndpoint(customPoints.from, from) : auto.source,
    target: customPoints?.to   ? resolveEndpoint(customPoints.to,   to)   : auto.target,
  }
}

/** Converts a stored {fraction, perp} label position back to an absolute SVG point. */
export function resolveLabelPosition(pos: LabelPosition, source: Point, target: Point): Point {
  const dx = target.x - source.x
  const dy = target.y - source.y
  const L = Math.sqrt(dx * dx + dy * dy)
  if (L === 0) return { x: source.x, y: source.y }
  // unit normal (perpendicular, 90° counter-clockwise from tangent)
  const nx = -dy / L
  const ny =  dx / L
  return {
    x: source.x + pos.fraction * dx + pos.perp * nx,
    y: source.y + pos.fraction * dy + pos.perp * ny,
  }
}

/** Projects an absolute point onto a connector line, returning {fraction, perp} relative coords. */
export function snapToConnector(pt: Point, source: Point, target: Point): LabelPosition {
  const dx = target.x - source.x
  const dy = target.y - source.y
  const L = Math.sqrt(dx * dx + dy * dy)
  if (L === 0) return { fraction: 0.5, perp: 0 }
  const tx = dx / L
  const ty = dy / L
  const nx = -ty
  const ny =  tx
  const relX = pt.x - source.x
  const relY = pt.y - source.y
  return {
    fraction: Math.max(0, Math.min(1, (relX * tx + relY * ty) / L)),
    perp: relX * nx + relY * ny,
  }
}
