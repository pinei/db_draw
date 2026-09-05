// ─── ER Schema (logical model — layout-agnostic) ────────────────────────────

export type Cardinality = 'ONE' | 'ONE_AND_ONLY_ONE' | 'MANY' | 'ONE_OR_MANY' | 'ZERO_OR_ONE' | 'ZERO_OR_MANY'

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
}

export interface ErSchema {
  entities: ErEntity[]
  relationships: ErRelationship[]
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

// ─── Diagram State (presentation model) ─────────────────────────────────────

export interface EntityRect {
  x: number
  y: number
  width: number
  height: number
}

export interface DiagramState {
  schema: ErSchema
  entityPositions: Record<string, EntityRect>
  layout: DiagramLayout
  connectorPoints: Record<string, CustomConnectionPoints>
  labelPositions: Record<string, LabelPosition>
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
