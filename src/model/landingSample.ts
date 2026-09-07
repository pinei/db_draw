import type { ErSchema, EntityRect, CustomConnectionPoints } from './types'

/** Compact 4-table schema for the landing demo — not the full biblioteca sample. */
export const landingSchema: ErSchema = {
  entities: [
    {
      id: 'author',
      name: 'Author',
      fields: [
        { id: 'author_id', name: 'id', type: 'INTEGER', isPK: true, isFK: false },
        { id: 'author_name', name: 'name', type: 'VARCHAR(150)', isPK: false, isFK: false },
      ],
    },
    {
      id: 'publisher',
      name: 'Publisher',
      fields: [
        { id: 'pub_id', name: 'id', type: 'INTEGER', isPK: true, isFK: false },
        { id: 'pub_name', name: 'name', type: 'VARCHAR(150)', isPK: false, isFK: false },
      ],
    },
    {
      id: 'book',
      name: 'Book',
      fields: [
        { id: 'book_id', name: 'id', type: 'INTEGER', isPK: true, isFK: false },
        { id: 'book_title', name: 'title', type: 'VARCHAR(200)', isPK: false, isFK: false },
        {
          id: 'book_publisher_id',
          name: 'publisher_id',
          type: 'INTEGER',
          isPK: false, isFK: true,
          referencedEntityId: 'publisher',
        },
        {
          id: 'book_category_id',
          name: 'category_id',
          type: 'INTEGER',
          isPK: false, isFK: true,
          referencedEntityId: 'category',
        },
      ],
    },
    {
      id: 'category',
      name: 'Category',
      fields: [
        { id: 'cat_id', name: 'id', type: 'INTEGER', isPK: true, isFK: false },
        { id: 'cat_name', name: 'name', type: 'VARCHAR(100)', isPK: false, isFK: false },
      ],
    },
  ],
  relationships: [
    {
      id: 'rel_author_book',
      fromEntityId: 'author',
      toEntityId: 'book',
      fromCardinality: 'ONE_OR_MANY',
      toCardinality: 'ONE_OR_MANY',
      label: 'writes',
    },
    {
      id: 'rel_publisher_book',
      fromEntityId: 'publisher',
      toEntityId: 'book',
      fromCardinality: 'ONE',
      toCardinality: 'ZERO_OR_MANY',
      label: 'publishes',
    },
    {
      id: 'rel_category_book',
      fromEntityId: 'category',
      toEntityId: 'book',
      fromCardinality: 'ZERO_OR_ONE',
      toCardinality: 'ZERO_OR_MANY',
      label: 'classifies',
    },
  ],
}

export const landingPositions: Record<string, EntityRect> = {
  author:    { x: 35,  y: 56,  width: 220, height: 100 },
  publisher: { x: 637, y: 56,  width: 220, height: 100 },
  book:      { x: 333, y: 236, width: 220, height: 160 },
  category:  { x: 705, y: 275, width: 220, height: 100 },
}

// Author exits right, Publisher exits left; both land on Book's top, split apart.
export const landingConnectorPoints: Record<string, CustomConnectionPoints> = {
  rel_author_book: {
    from: { entityId: 'author',    side: 'right', fraction: 0.55 },
    to:   { entityId: 'book',      side: 'top',   fraction: 0.28 },
  },
  rel_publisher_book: {
    from: { entityId: 'publisher', side: 'left',  fraction: 0.55 },
    to:   { entityId: 'book',      side: 'top',   fraction: 0.72 },
  },
  rel_category_book: {
    from: { entityId: 'category',  side: 'left',  fraction: 0.5 },
    to:   { entityId: 'book',      side: 'right', fraction: 0.55 },
  },
}

export const LANDING_VIEWBOX = { width: 960, height: 540 }
