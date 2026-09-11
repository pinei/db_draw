export const ENTITY_WIDTH_MIN = 220
export const ENTITY_HEADER_HEIGHT = 36
export const ENTITY_FIELD_HEIGHT = 28
export const ENTITY_VERTICAL_PADDING = 8
export const ENTITY_HEIGHT_SNAP_TOLERANCE = 12

export function entityNaturalHeight(fieldCount: number): number {
  if (fieldCount <= 0) return ENTITY_HEADER_HEIGHT + ENTITY_VERTICAL_PADDING
  return ENTITY_HEADER_HEIGHT + ENTITY_VERTICAL_PADDING + fieldCount * ENTITY_FIELD_HEIGHT
}

export function entityMinimumHeight(fieldCount: number): number {
  return fieldCount > 0
    ? entityNaturalHeight(1)
    : entityNaturalHeight(0)
}
