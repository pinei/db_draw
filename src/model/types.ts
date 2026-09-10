// ─── ER Schema (logical model — layout-agnostic) ────────────────────────────

export type Cardinality = 'ONE' | 'ONE_OR_MANY' | 'ZERO_OR_ONE' | 'ZERO_OR_MANY'

// Unspecialized placeholders for logical (early-stage) modeling, when the
// optionality is not yet known. ONE doubles as the specialized exactly-one;
// a bare MANY must be specialized to ONE_OR_MANY / ZERO_OR_MANY before use.
// Kept (with their glyphs in every notation) for future use.
export type LogicalCardinality = 'ONE' | 'MANY'

export interface ErField {
  id: string
  name: string
  type: string
  isPK: boolean
  isFK: boolean
  referencedEntityId?: string
}

export interface ErEntity {
  id: string
  name: string
  fields: ErField[]
}

export interface ErRelationship {
  id: string
  fromEntityId: string
  toEntityId: string
  fromCardinality: Cardinality
  toCardinality: Cardinality
  label?: string
  refName?: string
}

export interface ErSchema {
  entities: ErEntity[]
  relationships: ErRelationship[]
}

// ─── Model metadata (per-model management) ──────────────────────────────────

export interface ModelMeta {
  id: string // folder name, ex. "default" — never edited in-app
  name: string // display name
  description: string
  tags: string[] // each: lowercase letters/digits/underscore
}

export const TAG_PATTERN = /^[a-z0-9_]+$/

// Model listing entry (server returns meta best-effort; null when missing)
export interface ModelSummary {
  id: string
  meta: ModelMeta | null
}

// ─── Diagram Layout (presentation config) ───────────────────────────────────

export type ConnectorStyle = 'curved' | 'orthogonal'
export type NotationStyle = 'crowsfoot' | 'minmax' | 'barker'
export type CodeFormat = 'dbml' | 'mermaid'
export type ThemeMode = 'light' | 'dark' | 'system'

export interface DiagramLayout {
  connectorStyle: ConnectorStyle
  notationStyle: NotationStyle
  canvasOffset: { x: number; y: number }
  canvasScale: number
  codeFormat: CodeFormat
  codePanelOpen: boolean
  theme: ThemeMode
}

// ─── Connector Point Customization ───────────────────────────────────────────

// Stores endpoint position as edge + fraction (0..1 along the edge), relative to entity
export interface CustomConnectorEndpoint {
  entityId: string
  side: EdgeSide
  fraction: number
}

export interface CustomConnectionPoints {
  from?: CustomConnectorEndpoint
  to?: CustomConnectorEndpoint
}

// Mid-route overrides, stored per connector style so Curved ↔ Orthogonal
// comparison keeps each style's manual nudge.
export interface OrthogonalRouteOverride {
  /** Signed fraction of the routing span; 0 = automatic mid channel / elbow. */
  midOffset: number
}

export interface CurvedRouteOverride {
  /** Signed fraction of chord length along the chord from the auto mid; 0 = centered. */
  along: number
  /** Signed fraction of chord length perpendicular to the chord; 0 = default bulge. */
  bulge: number
}

/** Clockwise self-loop slot around an entity card (default NE = current behavior). */
export type SelfLoopCorner = 'ne' | 'se' | 'sw' | 'nw'

/** Self-loop route (same for Curved and Orthogonal — shared geometry). */
export interface SelfLoopRouteOverride {
  /** Which corner of the entity the square loop occupies; default `ne`. */
  corner?: SelfLoopCorner
  /** Outward px for the square loop (default ~56); larger = bigger loop. */
  extent?: number
}

export interface RouteOverride {
  orthogonal?: OrthogonalRouteOverride
  curved?: CurvedRouteOverride
  selfLoop?: SelfLoopRouteOverride
}

// ─── Diagram State (presentation model) ─────────────────────────────────────

export interface EntityRect {
  x: number
  y: number
  width: number
  height: number
}

export interface DiagramState {
  meta: ModelMeta
  schema: ErSchema
  entityPositions: Record<string, EntityRect>
  layout: DiagramLayout
  connectorPoints: Record<string, CustomConnectionPoints>
  labelPositions: Record<string, LabelPosition>
  routeOverrides: Record<string, RouteOverride>
}

// ─── Persisted shapes (diagram artifact) ───────────────────────────────────

// Keys of DiagramLayout that are UI preferences, not diagram properties —
// they live in memory only and are stripped before writing data/:name/*.json.
export type UiPreferenceKey = 'codeFormat' | 'codePanelOpen' | 'theme'

export type PersistedDiagramLayout = Omit<DiagramLayout, UiPreferenceKey>

export interface PersistedDiagramState extends Omit<DiagramState, 'layout'> {
  layout: PersistedDiagramLayout
}

// ─── Connector geometry (used by utils) ─────────────────────────────────────

export interface Point {
  x: number
  y: number
}

export type EdgeSide = 'top' | 'right' | 'bottom' | 'left'

export interface ConnectionPoint {
  point: Point
  side: EdgeSide
}

// ─── Label Position ──────────────────────────────────────────────────────────

// fraction: 0..1 along source→target vector; perp: signed px offset perpendicular to the line
export interface LabelPosition {
  fraction: number
  perp: number
}

// ─── Connector Point Drag State ──────────────────────────────────────────────

export type ConnectorEndpoint = 'from' | 'to'

export interface DraggingConnectorPoint {
  relationshipId: string
  endpoint: ConnectorEndpoint
  startPoint: CustomConnectorEndpoint
}

export interface DraggingLabel {
  relationshipId: string
}

export interface DraggingRoute {
  relationshipId: string
}
