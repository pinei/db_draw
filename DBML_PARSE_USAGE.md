# Complete Guide to Using @dbml/parse

## Overview
`@dbml/parse` is a TypeScript parser for the DBML (Database Markup Language) format. It provides a compiler-based API for parsing, validating, and interpreting DBML source code.

---

## Installation

```bash
npm install @dbml/parse
```

---

## Core Concepts

The library uses three main concepts:

1. **MemoryProjectLayout**: A project layout that holds DBML source code in memory
2. **Compiler**: The main class that orchestrates parsing, validation, and interpretation
3. **Report<T>**: A wrapper around results that also contains errors, warnings, and infos

---

## Basic Usage Example

### 1. Simple Parse & Interpret Workflow

```typescript
import Compiler from '@dbml/parse';
import { MemoryProjectLayout } from '@dbml/parse';
import { DEFAULT_ENTRY } from '@dbml/parse';

// 1. Create a project layout and add DBML source
const layout = new MemoryProjectLayout();
const dbmlSource = `
  Table users {
    id int [pk]
    email varchar [unique]
    name varchar
  }
  
  Table posts {
    id int [pk]
    user_id int [ref: > users.id]
    title varchar
    content text
  }
`;

layout.setSource(DEFAULT_ENTRY, dbmlSource);

// 2. Create a compiler instance
const compiler = new Compiler(layout);

// 3. Parse the DBML
const parseResult = compiler.parseFile(DEFAULT_ENTRY);

// 4. Check for parse errors
if (parseResult.getErrors().length > 0) {
  console.error('Parse errors:', parseResult.getErrors());
}

// 5. Interpret the parsed DBML to get the database schema
const interpretResult = compiler.interpretFile(DEFAULT_ENTRY);

// 6. Get the result or check for errors
if (interpretResult.getErrors().length > 0) {
  console.error('Interpretation errors:', interpretResult.getErrors());
}

const database = interpretResult.getValue();
if (database) {
  console.log('Parsed database:', database);
  console.log('Tables:', database.tables);
  console.log('Relationships:', database.refs);
}
```

---

## Complete Working Example with Error Handling

```typescript
import Compiler, { CompileError } from '@dbml/parse';
import { MemoryProjectLayout } from '@dbml/parse';
import { DEFAULT_ENTRY, Filepath } from '@dbml/parse';
import type { Database } from '@dbml/parse';

function parseDBMLContent(dbmlCode: string): { success: boolean; database?: Database; errors: CompileError[] } {
  try {
    // Setup project layout
    const layout = new MemoryProjectLayout();
    layout.setSource(DEFAULT_ENTRY, dbmlCode);

    // Create compiler
    const compiler = new Compiler(layout);

    // Parse the file
    const parseResult = compiler.parseFile(DEFAULT_ENTRY);
    const parseErrors = parseResult.getErrors();
    
    if (parseErrors.length > 0) {
      return {
        success: false,
        errors: parseErrors,
      };
    }

    // Bind and validate
    const bindResult = compiler.bindFile(DEFAULT_ENTRY);
    const bindErrors = bindResult.getErrors();
    
    if (bindErrors.length > 0) {
      return {
        success: false,
        errors: bindErrors,
      };
    }

    // Interpret the schema
    const interpretResult = compiler.interpretFile(DEFAULT_ENTRY);
    const interpretErrors = interpretResult.getErrors();
    
    if (interpretErrors.length > 0) {
      return {
        success: false,
        errors: interpretErrors,
      };
    }

    const database = interpretResult.getValue();
    return {
      success: true,
      database: database || undefined,
      errors: [],
    };
  } catch (error) {
    return {
      success: false,
      errors: [error as CompileError],
    };
  }
}

// Usage
const result = parseDBMLContent(`
  Table users {
    id int [pk]
    name varchar
  }
`);

if (result.success && result.database) {
  console.log('Database parsed successfully');
  console.log('Table count:', result.database.tables?.length || 0);
} else {
  console.error('Parse failed:');
  result.errors.forEach(error => {
    console.error(`  - ${error.message}`);
  });
}
```

---

## Multi-File Project Example

```typescript
import Compiler from '@dbml/parse';
import { MemoryProjectLayout } from '@dbml/parse';
import { Filepath } from '@dbml/parse';
import type { Database } from '@dbml/parse';

function parseMultiFileProject(files: Record<string, string>): { 
  compiler: Compiler; 
  databases: Map<string, Database | undefined>;
} {
  // Create project layout
  const layout = new MemoryProjectLayout();
  const databases = new Map<string, Database | undefined>();

  // Add all files to the layout
  for (const [path, content] of Object.entries(files)) {
    const filepath = Filepath.from(path);
    layout.setSource(filepath, content);
  }

  // Create compiler
  const compiler = new Compiler(layout);

  // Interpret each file
  for (const [path] of Object.entries(files)) {
    const filepath = Filepath.from(path);
    const result = compiler.interpretFile(filepath);
    
    if (result.getErrors().length > 0) {
      console.error(`Errors in ${path}:`, result.getErrors());
    }
    
    databases.set(path, result.getValue());
  }

  return { compiler, databases };
}

// Usage
const files = {
  '/main.dbml': `
    Table users {
      id int [pk]
      email varchar
    }
  `,
  '/auth.dbml': `
    use { table users } from './main.dbml'
    
    Table auth_tokens {
      id int [pk]
      user_id int [ref: > users.id]
      token varchar
    }
  `,
};

const { compiler, databases } = parseMultiFileProject(files);

for (const [path, database] of databases.entries()) {
  console.log(`${path}:`, database?.tables?.map(t => t.name) || []);
}
```

---

## API Reference

### Compiler Methods

#### Parsing
```typescript
// Parse a single file
const parseResult = compiler.parseFile(filepath);
// Returns: Report<{ ast: ProgramNode; tokens: SyntaxToken[] }>

// Parse the entire project
const parseResult = compiler.parseProject();
// Returns: Report<FileParseIndex>
```

#### Validation & Binding
```typescript
// Validate a file
const validateResult = compiler.validateFile(filepath);
// Returns: Report<void>

// Bind a file (resolve references)
const bindResult = compiler.bindFile(filepath);
// Returns: Report<void>

// Bind entire project
const bindResult = compiler.bindProject();
// Returns: Report<void>
```

#### Interpretation
```typescript
// Interpret a single file and get the database schema
const interpretResult = compiler.interpretFile(filepath);
// Returns: Report<Readonly<Database> | undefined>

// Interpret entire project
const projectResult = compiler.interpretProject();
// Returns: Report<MasterDatabase>
```

#### Error Retrieval
```typescript
// Get all errors from a file
const errors = compiler.parse.errors(filepath);
// Returns: readonly Readonly<CompileError>[]
```

---

## Report<T> Class

The `Report` class wraps computation results and diagnostic information:

```typescript
interface Report<T> {
  // Get the result value
  getValue(): T;
  
  // Get all errors
  getErrors(): CompileError[];
  
  // Get all warnings
  getWarnings(): CompileWarning[];
  
  // Get all infos
  getInfos(): CompileInfo[];
  
  // Chain operations (functional composition)
  chain<U>(fn: (value: T) => Report<U>): Report<U>;
  
  // Map over the value
  map<U>(fn: (value: T) => U): Report<U>;
}
```

### Using Report Methods

```typescript
const result = compiler.parseFile(DEFAULT_ENTRY);

// Check for errors
if (result.getErrors().length > 0) {
  result.getErrors().forEach(error => {
    console.error(`Error: ${error.message}`);
    console.error(`  Code: ${error.code}`);
    console.error(`  Location: ${error.node?.span}`);
  });
}

// Get the parsed value
const parseData = result.getValue();

// Chain multiple operations
const chainedResult = compiler
  .parseFile(DEFAULT_ENTRY)
  .chain(parseData => compiler.validateFile(DEFAULT_ENTRY))
  .chain(() => compiler.interpretFile(DEFAULT_ENTRY));

const finalDatabase = chainedResult.getValue();
```

---

## CompileError Structure

Each error contains detailed diagnostic information:

```typescript
interface CompileError {
  code: CompileErrorCode;        // Error code (enum)
  message: string;                // Human-readable message
  node?: SyntaxNode;              // The node causing the error
  token?: SyntaxToken;            // The token causing the error
  additional?: string;            // Additional context
}

// Access error details
const errors = result.getErrors();
errors.forEach(error => {
  console.log(`Code: ${error.code}`);
  console.log(`Message: ${error.message}`);
  if (error.node) {
    console.log(`Node: ${error.node.kind}`);
  }
});
```

---

## Database Result Structure

When successfully parsed, the database contains:

```typescript
interface Database {
  tables?: Table[];              // All tables
  refs?: Ref[];                  // All relationships
  enums?: Enum[];                // All enums
  tableGroups?: TableGroup[];    // All table groups
  notes?: Note[];                // All notes
  diagramViews?: DiagramView[];  // All diagram views
  project?: Project;             // Project settings
  metadata?: Metadata[];         // Metadata annotations
}

// Example usage
const database = interpretResult.getValue();
if (database) {
  // Access tables
  database.tables?.forEach(table => {
    console.log(`Table: ${table.name}`);
    table.columns?.forEach(col => {
      console.log(`  - ${col.name}: ${col.type.name}`);
    });
  });

  // Access relationships
  database.refs?.forEach(ref => {
    console.log(`Ref: ${ref.name}`);
    console.log(`  ${ref.startTableName}.${ref.startFieldName} > ${ref.endTableName}.${ref.endFieldName}`);
  });
}
```

---

## Real-World Example: Parse & Export

```typescript
import Compiler from '@dbml/parse';
import { MemoryProjectLayout } from '@dbml/parse';
import { DEFAULT_ENTRY } from '@dbml/parse';
import fs from 'fs';

async function parseAndExportDBML(filePath: string) {
  // Read DBML file
  const dbmlContent = fs.readFileSync(filePath, 'utf-8');

  // Parse DBML
  const layout = new MemoryProjectLayout();
  layout.setSource(DEFAULT_ENTRY, dbmlContent);
  const compiler = new Compiler(layout);

  const result = compiler.interpretFile(DEFAULT_ENTRY);

  if (result.getErrors().length > 0) {
    console.error('Parse errors:');
    result.getErrors().forEach(e => console.error(`  ${e.message}`));
    return;
  }

  const database = result.getValue();
  if (!database) {
    console.error('No database schema found');
    return;
  }

  // Transform to JSON
  const output = {
    tables: database.tables?.map(table => ({
      name: table.name,
      columns: table.columns?.map(col => ({
        name: col.name,
        type: col.type?.name,
        isPrimaryKey: col.pk,
      })),
    })),
    relationships: database.refs?.map(ref => ({
      name: ref.name,
      from: `${ref.startTableName}.${ref.startFieldName}`,
      to: `${ref.endTableName}.${ref.endFieldName}`,
    })),
  };

  // Write to file
  fs.writeFileSync('output.json', JSON.stringify(output, null, 2));
  console.log('Exported to output.json');
}

// Usage
parseAndExportDBML('schema.dbml');
```

---

## Key Exports from @dbml/parse

### Main Classes
- `Compiler` - Main parser class
- `MemoryProjectLayout` - In-memory project layout
- `Filepath` - File path type

### Types
- `Database` - Parsed database schema
- `Table` - Table definition
- `Column` - Column definition
- `Ref` - Relationship definition
- `CompileError` - Error type
- `Report<T>` - Result wrapper

### Constants
- `DEFAULT_ENTRY` - Default entry point filepath
- `DEFAULT_SCHEMA_NAME` - Default schema ("public")

### Error Codes
```typescript
enum CompileErrorCode {
  DUPLICATE_TABLE_SETTING = 'DUPLICATE_TABLE_SETTING',
  DUPLICATE_ENUM_ELEMENT_SETTING = 'DUPLICATE_ENUM_ELEMENT_SETTING',
  BINDING_ERROR = 'BINDING_ERROR',
  // ... many more
}
```

---

## Best Practices

1. **Always check for errors** before processing results:
   ```typescript
   const result = compiler.interpretFile(filepath);
   if (result.getErrors().length > 0) {
     // Handle errors
   }
   ```

2. **Use TypeScript types** for type safety:
   ```typescript
   import type { Database, Table, Column } from '@dbml/parse';
   ```

3. **Dispose compiler** if memory is a concern:
   ```typescript
   // Create a new compiler for each parsing task if not processing multiple files
   const compiler = new Compiler(layout);
   // Use compiler
   // It will be garbage collected when done
   ```

4. **Handle multi-file projects** properly:
   ```typescript
   const layout = new MemoryProjectLayout();
   // Add all files BEFORE creating compiler
   for (const [path, content] of Object.entries(files)) {
     layout.setSource(Filepath.from(path), content);
   }
   const compiler = new Compiler(layout);
   ```

5. **Validate schema structure** after parsing:
   ```typescript
   const database = result.getValue();
   if (!database?.tables || database.tables.length === 0) {
     console.warn('No tables found in schema');
   }
   ```

