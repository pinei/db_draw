# @dbml/parse - Real Test Examples from GitHub Repository

This document contains actual, working examples extracted from the holistics/dbml GitHub repository test suite.

---

## Example 1: Basic Single-File Parsing

**Source: `packages/dbml-parse/__tests__/examples/compiler/multifile.test.ts`**

```typescript
import { Compiler } from '@dbml/parse';
import { Filepath } from '@dbml/parse';
import { MemoryProjectLayout } from '@dbml/parse';

// Setup
const layout = new MemoryProjectLayout();
const fileA = Filepath.from('/project/a.dbml');

// Add source
layout.setSource(fileA, 'Table users { id int }');

// Create compiler
const compiler = new Compiler(layout);

// Parse and get result
expect(compiler.layout.getSource(fileA)).toBe('Table users { id int }');
```

---

## Example 2: Basic Parsing & Error Handling

**Source: `packages/dbml-parse/__tests__/utils/compiler.ts`**

```typescript
import Compiler from '@dbml/parse';
import { MemoryProjectLayout } from '@dbml/parse';
import { DEFAULT_ENTRY } from '@dbml/parse';
import type Report from '@dbml/parse';

function validate(source: string) {
  const layout = new MemoryProjectLayout();
  layout.setSource(DEFAULT_ENTRY, source);
  const compiler = new Compiler(layout);

  const astResult = compiler.parseFile(DEFAULT_ENTRY);
  const ast = astResult.getValue().ast;
  const validateResult = compiler.validateNode(ast);

  return Report.create(
    {
      ast: astResult,
      compiler,
    },
    [...astResult.getErrors(), ...validateResult.getErrors()],
    [...astResult.getWarnings(), ...validateResult.getWarnings()],
  );
}

// Usage
const report = validate('Table users { id int }');
if (report.getErrors().length > 0) {
  console.error('Errors:', report.getErrors());
}
const { ast, compiler } = report.getValue();
```

---

## Example 3: Full Parse, Bind, Interpret Pipeline

**Source: `packages/dbml-parse/__tests__/utils/compiler.ts`**

```typescript
import Compiler from '@dbml/parse';
import { MemoryProjectLayout } from '@dbml/parse';
import { DEFAULT_ENTRY } from '@dbml/parse';
import { UNHANDLED } from '@dbml/parse';
import type { Database } from '@dbml/parse';
import type Report from '@dbml/parse';

/**
 * Complete workflow: parse → bind → interpret → get database
 */
export function interpret(source: string): Report<Readonly<Database> | undefined> {
  // 1. Setup layout with DBML source
  const layout = new MemoryProjectLayout();
  layout.setSource(DEFAULT_ENTRY, source);
  
  // 2. Create compiler
  const compiler = new Compiler(layout);

  // 3. Parse the file
  const parseResult = compiler.parseFile(DEFAULT_ENTRY);
  const ast = parseResult.getValue().ast;

  // 4. Bind the AST (resolve references)
  const bindResult = compiler.bindNode(ast);

  // 5. Get the symbol
  const symbol = compiler.nodeSymbol(ast).getFiltered(UNHANDLED);
  
  // 6. Interpret the symbol to get the database
  const interpretResult = symbol 
    ? compiler.interpretSymbol(symbol, DEFAULT_ENTRY) 
    : Report.create(UNHANDLED);
  
  const db = interpretResult.getFiltered(UNHANDLED);

  // 7. Create combined report with all errors/warnings/infos
  return new Report(
    db ? (db as Database) : undefined,
    [...parseResult.getErrors(), ...bindResult.getErrors(), ...interpretResult.getErrors()],
    [...parseResult.getWarnings(), ...bindResult.getWarnings(), ...interpretResult.getWarnings()],
    [...parseResult.getInfos(), ...bindResult.getInfos(), ...interpretResult.getInfos()],
  );
}

// Usage
const dbmlCode = `
  Table users {
    id int [pk]
    email varchar
  }
`;
const result = interpret(dbmlCode);
const database = result.getValue();
if (database) {
  console.log('Tables:', database.tables?.map(t => t.name));
}
if (result.getErrors().length > 0) {
  console.error('Errors:', result.getErrors());
}
```

---

## Example 4: Multi-File Project Parsing

**Source: `packages/dbml-parse/__tests__/examples/interpreter/multifile/utils.ts`**

```typescript
import Compiler from '@dbml/parse';
import { Database, Filepath } from '@dbml/parse';
import { UNHANDLED } from '@dbml/parse';
import { MemoryProjectLayout } from '@dbml/parse';

/**
 * Parse a multi-file DBML project
 */
function setupCompiler(files: Record<string, string>): {
  compiler: Compiler;
  sources: Map<Filepath, string>;
} {
  const layout = new MemoryProjectLayout();
  const sources = new Map<Filepath, string>();

  // Add all files to the layout
  for (const [path, src] of Object.entries(files)) {
    const filepath = Filepath.from(path);
    layout.setSource(filepath, src);
    sources.set(filepath, src);
  }

  // Create compiler
  const compiler = new Compiler(layout);
  return { compiler, sources };
}

/**
 * Get the database for a specific file
 */
function getDatabase(compiler: Compiler, path: string): Database {
  const filepath = Filepath.from(path);
  const result = compiler.interpretFile(filepath);
  
  if (result.getErrors().length > 0) {
    throw new Error(`Failed to interpret ${path}: ${result.getErrors()[0].message}`);
  }
  
  return result.getValue() as Database;
}

// Usage
const { compiler, sources } = setupCompiler({
  '/base.dbml': 'Table users { id int [pk] }',
  '/main.dbml': `
    use { table users } from './base.dbml'
    Table orders { 
      id int [pk]
      user_id int [ref: > users.id] 
    }
  `,
});

const db = getDatabase(compiler, '/main.dbml');
console.log('Tables in /main.dbml:', db.tables?.map(t => t.name));
```

---

## Example 5: Lexer & Parser Separate

**Source: `packages/dbml-parse/__tests__/utils/compiler.ts`**

```typescript
import Lexer from '@dbml/parse';
import Parser from '@dbml/parse';
import { SyntaxNodeIdGenerator } from '@dbml/parse';
import { DEFAULT_ENTRY } from '@dbml/parse';
import type { ProgramNode } from '@dbml/parse';
import type Report from '@dbml/parse';

/**
 * Parse DBML into AST (without full interpretation)
 */
function parse(source: string): Report<{
  ast: ProgramNode;
  tokens: SyntaxToken[];
}> {
  return new Lexer(source, DEFAULT_ENTRY)
    .lex()
    .chain((tokens) =>
      new Parser(source, tokens, new SyntaxNodeIdGenerator(), DEFAULT_ENTRY).parse()
    );
}

// Usage
const dbmlCode = `
  Table users {
    id int [pk]
  }
`;

const parseResult = parse(dbmlCode);
const { ast, tokens } = parseResult.getValue();

console.log('Tokens:', tokens.length);
console.log('AST root kind:', ast.kind);

if (parseResult.getErrors().length > 0) {
  console.error('Parse errors:', parseResult.getErrors());
}
```

---

## Example 6: Error Handling with CompileError

**Source: `packages/dbml-parse/__tests__/examples/services/metadata/inline.test.ts`**

```typescript
import { interpret } from '@tests/utils';
import { CompileErrorCode } from '@dbml/parse';

/**
 * Check for specific compile errors
 */
function testErrorCode(source: string, expectedCode: CompileErrorCode) {
  const result = interpret(source);
  const codes = result.getErrors().map((e) => e.code);
  
  if (codes.includes(expectedCode)) {
    console.log(`✓ Expected error found: ${expectedCode}`);
  } else {
    console.error(`✗ Expected ${expectedCode} but got: ${codes}`);
  }
}

// Usage
testErrorCode(
  `
    Table users { id int }
    Table users { id int }
  `,
  CompileErrorCode.DUPLICATE_TABLE_SETTING
);
```

---

## Example 7: Get AST without Full Interpretation

**Source: `packages/dbml-parse/__tests__/examples/compiler/note.test.ts`**

```typescript
import { MemoryProjectLayout } from '@dbml/parse';
import Compiler from '@dbml/parse';
import { DEFAULT_ENTRY } from '@dbml/parse';

function parse(dbml: string) {
  const layout = new MemoryProjectLayout();
  layout.setSource(DEFAULT_ENTRY, dbml);
  const compiler = new Compiler(layout);
  
  // Get the AST
  const parseResult = compiler.parseFile(DEFAULT_ENTRY);
  const ast = parseResult.getValue().ast;
  
  return { compiler, ast, dbml };
}

// Usage
const { compiler, ast, dbml } = parse(`
  Table users {
    id int
  }
`);

console.log('AST type:', ast.kind);
console.log('Declarations:', ast.declarations.length);

// You can now walk the AST or perform other operations
ast.declarations.forEach((decl) => {
  console.log('Declaration type:', decl.kind);
});
```

---

## Example 8: Get Raw Parser Results

**Source: `packages/dbml-parse/__tests__/snapshots/parser/parser.test.ts`**

```typescript
import Compiler from '@dbml/parse';
import { MemoryProjectLayout } from '@dbml/parse';
import { DEFAULT_ENTRY } from '@dbml/parse';

function getParseResult(source: string) {
  const layout = new MemoryProjectLayout();
  layout.setSource(DEFAULT_ENTRY, source);
  const compiler = new Compiler(layout);
  
  // This returns the raw parse result with tokens and AST
  return compiler.parseFile(DEFAULT_ENTRY);
}

// Usage
const parseResult = getParseResult('Table users { id int }');

// Get tokens
const { tokens } = parseResult.getValue();
console.log('Token count:', tokens.length);

// Get AST
const { ast } = parseResult.getValue();
console.log('AST:', ast);

// Get errors
if (parseResult.getErrors().length > 0) {
  console.error('Parse errors:', parseResult.getErrors());
}
```

---

## Example 9: Handle Incomplete/Error DBML

**Source: `packages/dbml-parse/__tests__/examples/services/suggestions/general.test.ts`**

```typescript
import Compiler from '@dbml/parse';
import { MemoryProjectLayout } from '@dbml/parse';
import { DEFAULT_ENTRY } from '@dbml/parse';

/**
 * Parse DBML with intentional errors (parser recovers gracefully)
 */
function parseIncompleteDBML(source: string) {
  const layout = new MemoryProjectLayout();
  layout.setSource(DEFAULT_ENTRY, source);
  const compiler = new Compiler(layout);
  
  const result = compiler.parseFile(DEFAULT_ENTRY);
  
  return {
    ast: result.getValue().ast,
    errors: result.getErrors(),
    warnings: result.getWarnings(),
  };
}

// Usage - incomplete syntax still parses
const { ast, errors, warnings } = parseIncompleteDBML(`
  Table users {
    id int pk
    email varchar
    // incomplete column
    status
  }
`);

console.log('AST parsed despite errors:', ast ? 'yes' : 'no');
console.log('Error count:', errors.length);
console.log('Warnings:', warnings.length);

// The parser uses error recovery, so you may still get useful AST
errors.forEach(err => {
  console.error(`- ${err.message}`);
});
```

---

## Example 10: Full Workflow with Type Safety

**Source: Combining multiple patterns**

```typescript
import Compiler from '@dbml/parse';
import { MemoryProjectLayout } from '@dbml/parse';
import { Filepath } from '@dbml/parse';
import type { Database, Table, Column, Ref } from '@dbml/parse';

/**
 * Complete, type-safe workflow
 */
interface ParseResult {
  success: boolean;
  database?: Database;
  tables?: Table[];
  relationships?: Ref[];
  errors: string[];
}

function parseDBML(dbmlSource: string): ParseResult {
  try {
    // Setup
    const layout = new MemoryProjectLayout();
    layout.setSource(Filepath.from('/schema.dbml'), dbmlSource);
    const compiler = new Compiler(layout);

    // Parse
    const filepath = Filepath.from('/schema.dbml');
    const parseResult = compiler.parseFile(filepath);
    
    if (parseResult.getErrors().length > 0) {
      return {
        success: false,
        errors: parseResult.getErrors().map(e => e.message),
      };
    }

    // Interpret
    const interpretResult = compiler.interpretFile(filepath);
    
    if (interpretResult.getErrors().length > 0) {
      return {
        success: false,
        errors: interpretResult.getErrors().map(e => e.message),
      };
    }

    const database = interpretResult.getValue();
    
    return {
      success: true,
      database: database || undefined,
      tables: database?.tables,
      relationships: database?.refs,
      errors: [],
    };
  } catch (error) {
    return {
      success: false,
      errors: [String(error)],
    };
  }
}

// Usage
const result = parseDBML(`
  Table users {
    id int [pk]
    email varchar [unique]
    created_at timestamp
  }
  
  Table posts {
    id int [pk]
    user_id int [ref: > users.id]
    title varchar
  }
  
  Ref: posts.user_id > users.id
`);

if (result.success && result.database) {
  console.log('✓ Parsing successful');
  
  result.tables?.forEach(table => {
    console.log(`Table: ${table.name}`);
    table.columns?.forEach(col => {
      console.log(`  - ${col.name}: ${col.type?.name}`);
    });
  });
  
  result.relationships?.forEach(ref => {
    console.log(`Relationship: ${ref.name}`);
  });
} else {
  console.error('✗ Parsing failed');
  result.errors.forEach(err => console.error(`  ${err}`));
}
```

---

## Key Patterns from Test Suite

### Pattern 1: Always chain operations through Report
```typescript
compiler
  .parseFile(filepath)
  .chain(() => compiler.validateFile(filepath))
  .chain(() => compiler.interpretFile(filepath));
```

### Pattern 2: Collect all diagnostics
```typescript
const parseResult = compiler.parseFile(filepath);
const bindResult = compiler.bindFile(filepath);

const allErrors = [
  ...parseResult.getErrors(),
  ...bindResult.getErrors(),
];
const allWarnings = [
  ...parseResult.getWarnings(),
  ...bindResult.getWarnings(),
];
```

### Pattern 3: Check for errors before using value
```typescript
const result = compiler.interpretFile(filepath);
if (result.getErrors().length > 0) {
  // Handle errors
  return;
}
const db = result.getValue();
// Safe to use db
```

### Pattern 4: Access deeply nested structures safely
```typescript
const database = result.getValue();
database?.tables?.forEach(table => {
  table.columns?.forEach(col => {
    console.log(col.name, col.type?.name);
  });
});
```

---

## Common CompileErrorCode Values

```typescript
enum CompileErrorCode {
  DUPLICATE_TABLE_SETTING = 'DUPLICATE_TABLE_SETTING',
  DUPLICATE_ENUM_ELEMENT_SETTING = 'DUPLICATE_ENUM_ELEMENT_SETTING',
  DUPLICATE_INDEX_SETTING = 'DUPLICATE_INDEX_SETTING',
  DUPLICATE_REF_SETTING = 'DUPLICATE_REF_SETTING',
  BINDING_ERROR = 'BINDING_ERROR',
  TYPE_ERROR = 'TYPE_ERROR',
  INVALID_CARDINALITY = 'INVALID_CARDINALITY',
  // ... and many more
}
```

