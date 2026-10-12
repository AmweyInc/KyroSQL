# Build Pipeline

## Overview

The build pipeline is the sequence of transformations that converts a directory of SQL source files into a distributable TypeScript package. It is invoked by `buildProject()` in the `@kyrosql/core` package and executed synchronously as a single pass. The pipeline has no persistent state between runs — each invocation is independent and complete.

---

## Pipeline Stages

```
SQL Files
    │
    ▼
┌─────────────────────────────────┐
│  Stage 1: File Scanning         │
│  scanSqlFiles()                 │
└───────────────┬─────────────────┘
                │  string[] (file paths)
                ▼
┌─────────────────────────────────┐
│  Stage 2: Schema Registry       │
│  buildSchemaRegistry()          │
└───────────────┬─────────────────┘
                │  SchemaRegistry
                ▼
┌─────────────────────────────────┐
│  Stage 3: Contract AST          │
│  buildContractAst()             │
│    ├─ parsePath()               │
│    ├─ parseTableSql()           │
│    ├─ parseFunctionSql()        │
│    ├─ expandSelect()            │
│    └─ resolveSelectResult()     │
└───────────────┬─────────────────┘
                │  RootContractAst
                ▼
┌────────────────────────────────────────────────────┐
│  Stage 4: Code Generation                          │
│    ├─ generateRuntimeFile()  → runtime.ts          │
│    ├─ generateRuntimeJs()    → runtime.js          │
│    ├─ generateRuntimeDts()   → runtime.d.ts        │
│    ├─ generateTypesFile()    → types.ts            │
│    ├─ generateTypesDts()     → types.d.ts          │
│    └─ generatePackageJson()  → package.json        │
└───────────────┬────────────────────────────────────┘
                │  GeneratedFiles
                ▼
┌─────────────────────────────────┐
│  Stage 5: File Emission         │
│  writeOutputFiles()             │
└─────────────────────────────────┘
```

---

## Stage 1 — File Scanning

**Module**: `packages/compiler/src/scanner/file-scanner.ts`  
**Entry**: `scanSqlFiles(inputDir: string)`  
**Output**: `string[]` — flat list of absolute SQL file paths

The scanner traverses three subdirectories of the configured input path:

- `functions/` — PostgreSQL function definitions
- `procedures/` — PostgreSQL stored procedure definitions
- `tables/` — PostgreSQL table DDL (schema source)

Traversal is recursive. All `.sql` files encountered at any depth are collected. File paths are normalized to forward-slash format before being returned, ensuring consistent behavior across Windows and Unix hosts.

Files outside these three directories (e.g., `migrations/`) are ignored by the scanner.

---

## Stage 2 — Schema Registry Construction

**Module**: `packages/compiler/src/schema/load-schema-from-sql.ts`  
**Module**: `packages/core/src/schema/build-schema-registry.ts`  
**Entry**: `buildSchemaRegistry(tableFiles: string[])`  
**Output**: `SchemaRegistry`

The schema registry is a prerequisite for wildcard resolution in Stage 3. It is built exclusively from the files in the `tables/` directory.

For each table file:

1. `parseTableSql()` extracts the table name and column list from the `CREATE TABLE` DDL.
2. Each column's SQL type is mapped to a TypeScript type string via `mapSqlType()`.
3. The result is stored in the registry keyed by the lowercase table name.

```
tables/users.sql
  → CREATE TABLE users (id INT, email TEXT, created_at TIMESTAMP)
  → SchemaRegistry["users"] = {
      tableName: "users",
      columns: [
        { name: "id", type: "number" },
        { name: "email", type: "string" },
        { name: "created_at", type: "Date" }
      ]
    }
```

The registry is passed through to the AST builder and is the only artifact from this stage that crosses stage boundaries.

---

## Stage 3 — Contract AST Construction

**Module**: `packages/compiler/src/parser/build-contract-ast.ts`  
**Entry**: `buildContractAst(files: string[], registry: SchemaRegistry)`  
**Output**: `RootContractAst`

This is the most complex stage. It processes every SQL file and produces a typed contract for each one. The stage is internally composed of five substeps, applied per file.

### Substep 3a — Path Parsing

**Module**: `packages/compiler/src/parser/path-parser.ts`

Each file path is decomposed into a structured descriptor:

```
functions/user/auth/find-by-token.sql
→ { layer: "functions", namespace: ["user", "auth"], name: "findByToken" }
```

- The first path segment (`functions`, `procedures`, `tables`) becomes the `layer`.
- Intermediate segments become the `namespace` array.
- The filename (sans extension) is converted from kebab-case to camelCase and becomes `name`.

### Substep 3b — SQL Parsing

**Module**: `packages/compiler/src/parser/parse-function-sql.ts`  
**Module**: `packages/compiler/src/parser/parse-table-sql.ts`

For **table files**: `parseTableSql()` extracts column names and types from the `CREATE TABLE` statement. Table contracts do not produce runtime methods — they are used only to emit entity type declarations.

For **function and procedure files**: `parseFunctionSql()` attempts DDL-based extraction first:

- Matches `CREATE FUNCTION name(params) RETURNS TABLE(columns)` via regex
- Extracts named parameters with their declared SQL types
- Extracts the return table's column list if `RETURNS TABLE(...)` is present
- Extracts the raw function body between `$$ ... $$` delimiters

If DDL extraction yields an incomplete parameter list, the fallback extractor (`extractSqlParams()`) scans the body for `:paramName` tokens and assigns sequential positions in order of first occurrence.

### Substep 3c — Wildcard Expansion

**Module**: `packages/compiler/src/parser/expand-select.ts`

If the parsed function body contains `SELECT *` or `RETURNING *`, the expander resolves the referenced table against the schema registry and substitutes an explicit column list:

```sql
-- Input
SELECT * FROM users WHERE id = :userId

-- Output (registry provides column list)
SELECT id, email, created_at FROM users WHERE id = :userId
```

If the referenced table is not in the registry, the wildcard is left unexpanded and the result type degrades to `Record<string, unknown>`.

### Substep 3d — Result Resolution

**Module**: `packages/compiler/src/parser/resolve-select-result.ts`  
**Module**: `packages/compiler/src/parser/extract-sql-result.ts`

The expanded SQL body is analyzed to extract the SELECT or RETURNING column list. `parseSelect()` identifies column names and their source tables (including aliased references like `u.id`). Each column is then matched against the schema registry to assign a TypeScript type.

Columns that cannot be resolved default to `any`.

### Substep 3e — Tree Insertion

**Module**: `packages/compiler/src/transformer/to-contract-tree.ts`

The completed `ContractNode` is inserted into the appropriate subtree of `RootContractAst` (`functions`, `procedures`, or `tables`) using the `namespace` array as a path. Intermediate objects are created on demand. This produces the nested structure that directly maps to the generated runtime object tree.

---

## Stage 4 — Code Generation

**Module**: `packages/compiler/src/generator/`

The `RootContractAst` is consumed by three independent generators. Each generator performs a tree traversal and emits source code as a string.

### Runtime Generator

**Module**: `runtime-generator.ts`

Traverses the functions and procedures subtrees of the AST (merged into a single tree in the output) and emits three artifacts:

- **`runtime.ts`**: TypeScript source — `export const SqlContracts = { ... }` with async method implementations
- **`runtime.js`**: CommonJS bundle — `exports.SqlContracts = { ... }` for direct Node.js consumption
- **`runtime.d.ts`**: Declaration file — `declare const SqlContracts: { ... }` with full type signatures

Each leaf method is emitted as:

```typescript
async (params: Namespace.MethodName.IParams, pool: PoolLike): Promise<Namespace.MethodName.IResult[]> => {
  const result = await pool.query(`CALL or SELECT SQL`, [params.p1, params.p2]);
  return result.rows;
}
```

### Types Generator

**Module**: `types-generator.ts`

Emits the `ISqlContracts` namespace tree and entity types:

- **`types.ts`**: TypeScript source — `export namespace ISqlContracts { ... }` with `IParams` and `IResult` interfaces per method
- **`types.d.ts`**: Declaration file — `declare namespace ISqlContracts { ... }`

Entity types are emitted first, singularized from table names (`users` → `User`), then the namespace tree.

### Package Generator

**Module**: `package-generator.ts`

Emits `package.json` for the generated package using the `packageName` from the project config. Sets `main` to `dist/index.js` and `types` to `dist/index.d.ts`.

---

## Stage 5 — File Emission

**Module**: `packages/compiler/src/output/write-output-files.ts`  
**Entry**: `writeOutputFiles(outputDir, files)`

All generated string artifacts are written to the output directory. The directory structure is created recursively if it does not exist. Files are written in a single pass without diffing — all output is unconditionally overwritten on each build.

The final output layout:

```
output/
├── package.json
├── runtime.ts
├── types.ts
└── dist/
    ├── index.js         ← re-exports from runtime.js and types.js
    ├── index.d.ts       ← re-exports from runtime.d.ts and types.d.ts
    ├── runtime.js
    ├── runtime.d.ts
    ├── types.js
    └── types.d.ts
```

---

## Error Handling

The pipeline does not implement partial recovery. If any stage throws, the error propagates to the `buildProject()` caller without partial output. This ensures the output directory is never left in an inconsistent state from a failed build.

In watch mode, build failures are reported to stderr and the watcher continues running. The previous successful output is preserved until a subsequent build succeeds.

---

## Performance Characteristics

The pipeline is synchronous and single-threaded. For typical project sizes (tens to low hundreds of SQL files), build time is dominated by filesystem I/O, not analysis. esbuild is not invoked during the pipeline — the generated `.ts` and `.js` files are produced by template string interpolation, not by compiling TypeScript source through a compiler toolchain.

The watch mode debounce (200ms) prevents redundant builds during rapid consecutive saves but does not implement incremental compilation. Every watched change triggers a full pipeline run from Stage 1.
