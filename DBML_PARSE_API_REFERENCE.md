# @dbml/parse - Complete API Reference

This document provides a complete reference of all exported APIs from the `@dbml/parse` package.

---

## Table of Contents

1. [Main Classes](#main-classes)
2. [Project Layout](#project-layout)
3. [Compiler Methods](#compiler-methods)
4. [Report Methods](#report-methods)
5. [Types & Interfaces](#types--interfaces)
6. [Constants](#constants)
7. [Error Handling](#error-handling)

---

## Main Classes

### Compiler

The main compiler class for parsing and interpreting DBML.

#### Constructor

```typescript
constructor(layout: DbmlProjectLayout)
```

**Parameters:**
- `layout`: A `DbmlProjectLayout` instance (usually `MemoryProjectLayout`)

#### Parsing Methods

##### parseFile(filepath: Filepath): Report<FileParseIndex>
Parse a single file and get tokens + AST.

```typescript
const result = compiler.parseFile(filepath);
const { ast, tokens } = result.getValue();
```

**Returns:**
- `Report<{ ast: ProgramNode; tokens: SyntaxToken[] }>`

---

##### parseProject(): Report<FileParseIndex>
Parse all files in the project.

```typescript
const result = compiler.parseProject();
```

---

##### parse.ast(filepath: Filepath): ProgramNode
Quick access to just the AST (no Report wrapper).

```typescript
const ast = compiler.parse.ast(DEFAULT_ENTRY);
```

---

##### parse.errors(filepath: Filepath): readonly CompileError[]
Get all parse errors for a file.

```typescript
const errors = compiler.parse.errors(filepath);
```

---

#### Validation Methods

##### validateFile(filepath: Filepath): Report<void>
Validate a single file.

```typescript
const result = compiler.validateFile(filepath);
if (result.getErrors().length > 0) {
  console.error('Validation errors:', result.getErrors());
}
```

---

##### validateNode(node: SyntaxNode): Report<void>
Validate a specific AST node.

```typescript
const validateResult = compiler.validateNode(ast);
```

---

#### Binding Methods

##### bindFile(filepath: Filepath): Report<void>
Bind a single file (resolve references).

```typescript
const result = compiler.bindFile(filepath);
if (result.getErrors().length > 0) {
  console.error('Binding errors:', result.getErrors());
}
```

---

##### bindNode(node: SyntaxNode): Report<void>
Bind a specific AST node.

```typescript
const bindResult = compiler.bindNode(ast);
```

---

##### bindProject(): Report<void>
Bind all files in the project.

```typescript
const result = compiler.bindProject();
```

---

#### Interpretation Methods

##### interpretFile(filepath: Filepath): Report<Readonly<Database> | undefined>
Parse, bind, and interpret a single file.

```typescript
const result = compiler.interpretFile(filepath);
const database = result.getValue();

if (result.getErrors().length > 0) {
  console.error('Errors:', result.getErrors());
}

if (database) {
  console.log('Tables:', database.tables?.map(t => t.name));
  console.log('References:', database.refs?.map(r => r.name));
}
```

**Returns:**
- `Report<Readonly<Database> | undefined>`
- `Database` contains: `tables`, `refs`, `enums`, `tableGroups`, `notes`, `diagramViews`, `project`, `metadata`

---

##### interpretProject(): Report<MasterDatabase>
Interpret the entire project.

```typescript
const result = compiler.interpretProject();
const masterDb = result.getValue();
```

---

##### interpretSymbol(symbol: NodeSymbol, filepath: Filepath): Report<...>
Interpret a specific symbol.

```typescript
const symbol = compiler.nodeSymbol(ast).getFiltered(UNHANDLED);
if (symbol) {
  const result = compiler.interpretSymbol(symbol, filepath);
}
```

---

#### Symbol Resolution Methods

##### nodeSymbol(node: SyntaxNode): Report<NodeSymbol>
Get the symbol for a node.

```typescript
const symbolResult = compiler.nodeSymbol(ast);
const symbol = symbolResult.getValue();
```

---

##### symbolMembers(symbol: NodeSymbol): Report<NodeSymbol[]>
Get all members of a symbol.

```typescript
const membersResult = compiler.symbolMembers(symbol);
const members = membersResult.getValue();

members?.forEach(member => {
  console.log('Member:', member.name);
});
```

---

#### Query Methods

##### parse
Query object for parse results.

```typescript
compiler.parse.ast(filepath)
compiler.parse.errors(filepath)
compiler.parse.rawDb(filepath)
```

---

##### nodeAtPosition(filepath: Filepath, offset: number): SyntaxNode | SyntaxToken | undefined
Find the node or token at a specific position.

```typescript
const node = compiler.nodeAtPosition(filepath, offset);
if (node) {
  console.log('Found:', node.kind);
}
```

---

##### containerStack(filepath: Filepath, offset: number): Container[]
Get the container stack at a position (for context).

```typescript
const stack = compiler.containerStack(filepath, offset);
stack.forEach(container => {
  console.log('Container:', container.kind);
});
```

---

#### Transformation Methods

##### renameTable(filepath: Filepath, oldName: string | TableIdentifier, newName: string | TableIdentifier): Map<string, string>
Rename a table and get the modified source.

```typescript
const changes = compiler.renameTable(filepath, 'users', 'customers');
const newSource = changes.get(filepath.absolute);
```

---

##### syncDiagramView(filepath: Filepath, operations: DiagramViewSyncOperation[], ast?: ProgramNode): { source: string; edits: TextEdit[] }
Sync diagram view operations.

```typescript
const result = compiler.syncDiagramView(filepath, operations);
console.log('New source:', result.source);
console.log('Edits:', result.edits);
```

---

##### updateElementSetting(filepath: Filepath, target: ElementIdentifier, settingName: string, value: string | null | undefined): Map<string, string>
Update an element's setting.

```typescript
const changes = compiler.updateElementSetting(
  filepath,
  { schema: 'public', name: 'users' },
  'color',
  '#FF0000'
);
```

---

#### File Management Methods

##### fileDependencies(filepath: Filepath): Filepath[]
Get all files that the specified file depends on.

```typescript
const deps = compiler.fileDependencies(filepath);
deps.forEach(dep => {
  console.log('Dependency:', dep.absolute);
});
```

---

##### reachableFiles(filepath: Filepath): Filepath[]
Get all files reachable from the specified file.

```typescript
const reachable = compiler.reachableFiles(filepath);
```

---

### MemoryProjectLayout

A project layout that holds DBML source code in memory.

#### Constructor

```typescript
constructor(files?: Map<string, string> | Record<string, string>)
```

**Parameters:**
- `files` (optional): Initial files to load

#### Methods

##### setSource(filepath: Filepath, content: string): void
Set or update the source for a file.

```typescript
const layout = new MemoryProjectLayout();
layout.setSource(Filepath.from('/schema.dbml'), dbmlContent);
```

---

##### getSource(filepath: Filepath): string | undefined
Get the source content for a file.

```typescript
const content = layout.getSource(filepath);
if (content) {
  console.log('File content:', content);
}
```

---

##### deleteSource(filepath: Filepath): void
Delete a file from the layout.

```typescript
layout.deleteSource(filepath);
```

---

##### clearSource(): void
Clear all files from the layout.

```typescript
layout.clearSource();
```

---

##### exists(filepath: Filepath): boolean
Check if a file exists.

```typescript
if (layout.exists(filepath)) {
  console.log('File exists');
}
```

---

##### isFile(filepath: Filepath): boolean
Check if a path is a file (not a directory).

```typescript
if (layout.isFile(filepath)) {
  console.log('Is file');
}
```

---

##### listDirectory(dirPath?: Filepath): Filepath[]
List files in a directory.

```typescript
const files = layout.listDirectory(Filepath.from('/'));
files.forEach(f => {
  console.log('File:', f.absolute);
});
```

---

##### getEntrypoints(): Filepath[]
Get all entry point files.

```typescript
const entrypoints = layout.getEntrypoints();
```

---

##### clone(): MemoryProjectLayout
Create a deep copy of the layout.

```typescript
const clonedLayout = layout.clone();
```

---

## Project Layout

### DbmlProjectLayout Interface

```typescript
interface DbmlProjectLayout {
  setSource(filePath: Filepath, content: string): void;
  getSource(filePath: Filepath): string | undefined;
  deleteSource(filePath: Filepath): void;
  clearSource(): void;
  exists(filePath: Filepath): boolean;
  isFile(filePath: Filepath): boolean;
  isDirectory(filePath: Filepath): boolean;
  listDirectory(dirPath?: Filepath): Filepath[];
  getEntrypoints(): Filepath[];
  clone(): DbmlProjectLayout;
}
```

---

## Report Methods

### Report<T> Class

A wrapper around computation results with error/warning handling.

#### Methods

##### getValue(): T
Get the computed value.

```typescript
const value = report.getValue();
```

**Throws:** If errors exist (depends on configuration)

---

##### getErrors(): CompileError[]
Get all errors.

```typescript
const errors = report.getErrors();
errors.forEach(err => {
  console.error(`[${err.code}] ${err.message}`);
});
```

---

##### getWarnings(): CompileWarning[]
Get all warnings.

```typescript
const warnings = report.getWarnings();
```

---

##### getInfos(): CompileInfo[]
Get all info messages.

```typescript
const infos = report.getInfos();
```

---

##### getFiltered<T>(filter: T): T | undefined
Get value cast to a specific type, with filtering.

```typescript
const symbol = report.getFiltered(UNHANDLED);
if (symbol) {
  // Use symbol
}
```

---

##### chain<U>(fn: (value: T) => Report<U>): Report<U>
Chain operations (monadic composition).

```typescript
const result = compiler
  .parseFile(filepath)
  .chain(() => compiler.validateFile(filepath))
  .chain(() => compiler.interpretFile(filepath));
```

---

##### map<U>(fn: (value: T) => U): Report<U>
Transform the value (functor).

```typescript
const result = report.map(value => value.toUpperCase());
```

---

##### isSuccess(): boolean
Check if the operation succeeded (no errors).

```typescript
if (report.isSuccess()) {
  console.log('Operation succeeded');
}
```

---

## Types & Interfaces

### Database

```typescript
interface Database {
  tables?: Table[];
  refs?: Ref[];
  enums?: Enum[];
  tableGroups?: TableGroup[];
  notes?: Note[];
  diagramViews?: DiagramView[];
  project?: Project;
  metadata?: Metadata[];
  
  // Additional properties
  schemas?: Schema[];
}
```

---

### Table

```typescript
interface Table {
  name: string;
  alias?: string;
  columns?: Column[];
  settings?: Record<string, any>;
  indexSettings?: IndexSetting[];
  pk?: string[];
  note?: string;
  schema?: string;
}
```

---

### Column

```typescript
interface Column {
  name: string;
  type?: ColumnType;
  pk?: boolean;
  notNull?: boolean;
  unique?: boolean;
  default?: string;
  note?: string;
  dbType?: string;
}

interface ColumnType {
  name: string;
  // Additional type properties
}
```

---

### Ref (Relationship)

```typescript
interface Ref {
  name?: string;
  startTableName: string;
  startFieldName: string;
  endTableName: string;
  endFieldName: string;
  type?: RefType;
  note?: string;
}

type RefType = '1:1' | '1:*' | '*:1' | '*:*';
```

---

### Enum

```typescript
interface Enum {
  name: string;
  values?: EnumValue[];
  note?: string;
  schema?: string;
}

interface EnumValue {
  name: string;
  note?: string;
}
```

---

### TableGroup

```typescript
interface TableGroup {
  name: string;
  tables?: string[];
  note?: string;
}
```

---

### Filepath

```typescript
class Filepath {
  static from(path: string): Filepath;
  static fromUri(uri: string): Filepath;
  
  readonly absolute: string;
  toUri(): string;
  intern(): FilepathId;
}
```

---

### SyntaxNode

```typescript
abstract class SyntaxNode {
  kind: SyntaxNodeKind;
  span: Span;
  parent?: SyntaxNode;
  // Various node types
}
```

---

### SyntaxToken

```typescript
class SyntaxToken {
  kind: TokenKind;
  text: string;
  span: Span;
  leadingInvalid: SyntaxToken[];
  trailingInvalid: SyntaxToken[];
}
```

---

## Constants

### DEFAULT_ENTRY

```typescript
import { DEFAULT_ENTRY } from '@dbml/parse';
// Filepath object representing the default entry point
// Typically: Filepath.from('/main.dbml')
```

---

### DEFAULT_SCHEMA_NAME

```typescript
import { DEFAULT_SCHEMA_NAME } from '@dbml/parse';
// Value: 'public'
// Used when no schema is specified
```

---

### UNHANDLED

```typescript
import { UNHANDLED } from '@dbml/parse';
// Symbol used for unhandled/undefined values
```

---

## Error Handling

### CompileError

```typescript
interface CompileError {
  code: CompileErrorCode;
  message: string;
  node?: SyntaxNode;
  token?: SyntaxToken;
  additional?: string;
}
```

---

### CompileErrorCode Enum

Key error codes:

```typescript
enum CompileErrorCode {
  // Duplication errors
  DUPLICATE_TABLE_SETTING = 'DUPLICATE_TABLE_SETTING',
  DUPLICATE_COLUMN = 'DUPLICATE_COLUMN',
  DUPLICATE_ENUM_ELEMENT_SETTING = 'DUPLICATE_ENUM_ELEMENT_SETTING',
  DUPLICATE_INDEX_SETTING = 'DUPLICATE_INDEX_SETTING',
  DUPLICATE_REF_SETTING = 'DUPLICATE_REF_SETTING',
  
  // Reference errors
  BINDING_ERROR = 'BINDING_ERROR',
  UNDEFINED_TABLE = 'UNDEFINED_TABLE',
  UNDEFINED_COLUMN = 'UNDEFINED_COLUMN',
  UNDEFINED_ENUM = 'UNDEFINED_ENUM',
  
  // Type errors
  TYPE_ERROR = 'TYPE_ERROR',
  INVALID_TYPE = 'INVALID_TYPE',
  
  // Cardinality errors
  INVALID_CARDINALITY = 'INVALID_CARDINALITY',
  
  // Syntax errors
  SYNTAX_ERROR = 'SYNTAX_ERROR',
  UNEXPECTED_TOKEN = 'UNEXPECTED_TOKEN',
  
  // Schema errors
  DUPLICATE_SCHEMA = 'DUPLICATE_SCHEMA',
  UNDEFINED_SCHEMA = 'UNDEFINED_SCHEMA',
}
```

---

### Handling Different Error Types

```typescript
import { CompileErrorCode, CompileError } from '@dbml/parse';

function handleError(error: CompileError) {
  switch (error.code) {
    case CompileErrorCode.DUPLICATE_TABLE_SETTING:
      console.error('Duplicate table setting:', error.message);
      break;
    case CompileErrorCode.BINDING_ERROR:
      console.error('Reference not found:', error.message);
      break;
    case CompileErrorCode.TYPE_ERROR:
      console.error('Type mismatch:', error.message);
      break;
    default:
      console.error('Unknown error:', error.code, error.message);
  }
}
```

---

## Usage Patterns Summary

### Pattern 1: Simple Parse & Interpret
```typescript
const layout = new MemoryProjectLayout();
layout.setSource(DEFAULT_ENTRY, dbmlSource);
const compiler = new Compiler(layout);
const result = compiler.interpretFile(DEFAULT_ENTRY);
const db = result.getValue();
```

### Pattern 2: Error-First Approach
```typescript
const result = compiler.parseFile(filepath);
if (result.getErrors().length > 0) {
  throw new Error(result.getErrors()[0].message);
}
const ast = result.getValue().ast;
```

### Pattern 3: Chained Operations
```typescript
compiler
  .parseFile(filepath)
  .chain(() => compiler.validateFile(filepath))
  .chain(() => compiler.bindFile(filepath))
  .chain(() => compiler.interpretFile(filepath));
```

### Pattern 4: Collect All Diagnostics
```typescript
const parseResult = compiler.parseFile(filepath);
const diagnostics = {
  errors: parseResult.getErrors(),
  warnings: parseResult.getWarnings(),
  infos: parseResult.getInfos(),
};
```

### Pattern 5: Multi-File Setup
```typescript
const layout = new MemoryProjectLayout();
for (const [path, content] of Object.entries(files)) {
  layout.setSource(Filepath.from(path), content);
}
const compiler = new Compiler(layout);
for (const path of Object.keys(files)) {
  const result = compiler.interpretFile(Filepath.from(path));
  // Process result
}
```

