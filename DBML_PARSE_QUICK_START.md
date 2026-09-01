# @dbml/parse - Quick Start Guide

Fast reference for the most common tasks.

---

## Installation

```bash
npm install @dbml/parse
```

---

## 30-Second Example

```typescript
import Compiler from '@dbml/parse';
import { MemoryProjectLayout } from '@dbml/parse';
import { DEFAULT_ENTRY } from '@dbml/parse';

const dbml = `
  Table users {
    id int [pk]
    name varchar
  }
`;

const layout = new MemoryProjectLayout();
layout.setSource(DEFAULT_ENTRY, dbml);
const compiler = new Compiler(layout);
const result = compiler.interpretFile(DEFAULT_ENTRY);

if (result.getErrors().length === 0) {
  const database = result.getValue();
  console.log('Tables:', database?.tables?.map(t => t.name));
} else {
  console.error('Errors:', result.getErrors());
}
```

---

## Most Common Tasks

### Task 1: Parse DBML and Get Tables

```typescript
import Compiler, { MemoryProjectLayout, DEFAULT_ENTRY } from '@dbml/parse';

const dbml = `Table users { id int [pk] }`;
const layout = new MemoryProjectLayout();
layout.setSource(DEFAULT_ENTRY, dbml);
const compiler = new Compiler(layout);
const db = compiler.interpretFile(DEFAULT_ENTRY).getValue();

console.log(db?.tables?.map(t => t.name)); // ['users']
```

### Task 2: Handle Parsing Errors

```typescript
const result = compiler.interpretFile(DEFAULT_ENTRY);

if (result.getErrors().length > 0) {
  result.getErrors().forEach(err => {
    console.error(`${err.code}: ${err.message}`);
  });
} else {
  const db = result.getValue();
  // Use db
}
```

### Task 3: Parse Multiple Files

```typescript
const layout = new MemoryProjectLayout();
layout.setSource(Filepath.from('/main.dbml'), 'Table users { id int }');
layout.setSource(Filepath.from('/orders.dbml'), 'Table orders { id int }');

const compiler = new Compiler(layout);

for (const path of ['/main.dbml', '/orders.dbml']) {
  const db = compiler.interpretFile(Filepath.from(path)).getValue();
  console.log('Tables:', db?.tables?.map(t => t.name));
}
```

### Task 4: Access Table Details

```typescript
const db = result.getValue();

db?.tables?.forEach(table => {
  console.log(`Table: ${table.name}`);
  
  table.columns?.forEach(col => {
    const type = col.type?.name || 'unknown';
    const pk = col.pk ? ' [pk]' : '';
    console.log(`  ${col.name}: ${type}${pk}`);
  });
});
```

### Task 5: Access Relationships

```typescript
const db = result.getValue();

db?.refs?.forEach(ref => {
  console.log(
    `${ref.startTableName}.${ref.startFieldName} > ${ref.endTableName}.${ref.endFieldName}`
  );
});
```

---

## API Cheat Sheet

### Setup

```typescript
import Compiler from '@dbml/parse';
import { MemoryProjectLayout, DEFAULT_ENTRY, Filepath } from '@dbml/parse';

const layout = new MemoryProjectLayout();
layout.setSource(DEFAULT_ENTRY, dbmlCode);
const compiler = new Compiler(layout);
```

### Parse/Interpret

```typescript
// Full workflow (parse + bind + interpret)
const result = compiler.interpretFile(DEFAULT_ENTRY);

// Or step by step
const parseResult = compiler.parseFile(DEFAULT_ENTRY);
const bindResult = compiler.bindFile(DEFAULT_ENTRY);
const interpretResult = compiler.interpretFile(DEFAULT_ENTRY);
```

### Get Results

```typescript
const result = compiler.interpretFile(filepath);

// Get value
const database = result.getValue();

// Get errors
const errors = result.getErrors();

// Get warnings
const warnings = result.getWarnings();

// Get infos
const infos = result.getInfos();
```

### Check Errors

```typescript
if (result.getErrors().length > 0) {
  result.getErrors().forEach(err => {
    console.error(`[${err.code}] ${err.message}`);
  });
}
```

---

## File Operations

### Add a File

```typescript
const filepath = Filepath.from('/path/to/schema.dbml');
layout.setSource(filepath, dbmlContent);
```

### Get File Content

```typescript
const content = layout.getSource(filepath);
```

### Delete a File

```typescript
layout.deleteSource(filepath);
```

### List All Files

```typescript
const entrypoints = layout.getEntrypoints();
entrypoints.forEach(fp => console.log(fp.absolute));
```

### Clear All Files

```typescript
layout.clearSource();
```

---

## Data Structure Access

### Database Object

```typescript
const db = result.getValue();

db.tables        // Table[]
db.refs          // Ref[] (relationships)
db.enums         // Enum[]
db.tableGroups   // TableGroup[]
db.notes         // Note[]
db.diagramViews  // DiagramView[]
db.project       // Project
db.metadata      // Metadata[]
db.schemas       // Schema[]
```

### Table Object

```typescript
const table = db?.tables?.[0];

table.name       // string
table.columns    // Column[]
table.alias      // string
table.schema     // string
table.note       // string
table.pk         // string[] (primary key column names)
```

### Column Object

```typescript
const col = table?.columns?.[0];

col.name         // string
col.type?.name   // string (e.g., 'int', 'varchar')
col.pk           // boolean
col.notNull      // boolean
col.unique       // boolean
col.default      // string
col.note         // string
```

### Ref Object

```typescript
const ref = db?.refs?.[0];

ref.name                    // string
ref.startTableName          // string
ref.startFieldName          // string
ref.endTableName            // string
ref.endFieldName            // string
ref.type                    // '1:1' | '1:*' | '*:1' | '*:*'
```

---

## Error Codes (Common)

```typescript
CompileErrorCode.DUPLICATE_TABLE_SETTING      // Table setting repeated
CompileErrorCode.DUPLICATE_COLUMN               // Column name repeated
CompileErrorCode.BINDING_ERROR                  // Referenced table not found
CompileErrorCode.UNDEFINED_TABLE                // Table doesn't exist
CompileErrorCode.UNDEFINED_COLUMN               // Column doesn't exist
CompileErrorCode.INVALID_TYPE                   // Unknown data type
CompileErrorCode.INVALID_CARDINALITY            // Bad relationship cardinality
CompileErrorCode.DUPLICATE_ENUM_ELEMENT_SETTING // Enum setting repeated
CompileErrorCode.SYNTAX_ERROR                   // Parsing failed
```

---

## Complete Minimal Example

```typescript
import Compiler, { MemoryProjectLayout, DEFAULT_ENTRY } from '@dbml/parse';

async function main() {
  const dbml = `
    Table users {
      id int [pk]
      email varchar [unique]
    }
    
    Table orders {
      id int [pk]
      user_id int [ref: > users.id]
    }
  `;

  try {
    // Parse
    const layout = new MemoryProjectLayout();
    layout.setSource(DEFAULT_ENTRY, dbml);
    const compiler = new Compiler(layout);
    const result = compiler.interpretFile(DEFAULT_ENTRY);

    // Check errors
    if (result.getErrors().length > 0) {
      console.error('Parse failed:', result.getErrors());
      return;
    }

    // Use result
    const db = result.getValue();
    console.log('✓ Parsed successfully');
    console.log(`  Tables: ${db?.tables?.length || 0}`);
    console.log(`  Refs: ${db?.refs?.length || 0}`);
    
    // Iterate tables
    db?.tables?.forEach(t => {
      console.log(`  - ${t.name}: ${t.columns?.length || 0} columns`);
    });
  } catch (error) {
    console.error('Error:', error);
  }
}

main();
```

---

## Troubleshooting

### Issue: "Cannot find module '@dbml/parse'"
**Solution:** Install the package: `npm install @dbml/parse`

### Issue: "getValue() returns undefined"
**Solution:** Always check errors first:
```typescript
if (result.getErrors().length > 0) {
  console.error(result.getErrors());
  return;
}
const value = result.getValue();
```

### Issue: "Tables is empty"
**Solution:** Make sure your DBML is valid:
```typescript
const dbml = 'Table users { id int }'; // Valid
```

### Issue: "Reference errors (BINDING_ERROR)"
**Solution:** Make sure referenced tables/columns exist:
```typescript
// This works:
const dbml = `
  Table users { id int }
  Table orders { user_id int [ref: > users.id] }
`;

// This fails:
const dbml = `
  Table orders { user_id int [ref: > nonexistent.id] }
`;
```

---

## Import Patterns

### CommonJS
```typescript
const Compiler = require('@dbml/parse').default;
const { MemoryProjectLayout, DEFAULT_ENTRY, Filepath } = require('@dbml/parse');
```

### ES Modules
```typescript
import Compiler from '@dbml/parse';
import { MemoryProjectLayout, DEFAULT_ENTRY, Filepath } from '@dbml/parse';
```

### TypeScript
```typescript
import Compiler from '@dbml/parse';
import { MemoryProjectLayout, DEFAULT_ENTRY, Filepath } from '@dbml/parse';
import type { Database, Table, Column, Ref } from '@dbml/parse';
```

---

## Links

- **GitHub:** https://github.com/holistics/dbml
- **Package:** https://www.npmjs.com/package/@dbml/parse
- **DBML Docs:** https://www.dbml.org/docs/

---

## Quick Reference Table

| Task | Code |
|------|------|
| Create compiler | `new Compiler(new MemoryProjectLayout())` |
| Add DBML code | `layout.setSource(DEFAULT_ENTRY, dbml)` |
| Parse file | `compiler.parseFile(filepath)` |
| Get database | `compiler.interpretFile(filepath).getValue()` |
| Check errors | `result.getErrors()` |
| Get tables | `database?.tables` |
| Get columns | `table?.columns` |
| Get relationships | `database?.refs` |
| Iterate tables | `database?.tables?.forEach(t => ...)` |
| Iterate columns | `table?.columns?.forEach(c => ...)` |
| Get error code | `error.code` |
| Get error message | `error.message` |

