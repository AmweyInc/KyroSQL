# Execution Model

## Overview

The execution model describes the end-to-end flow from SQL source file to a query executed against a live PostgreSQL database. The model is divided into two distinct phases: **build-time** (static analysis and code generation) and **call-time** (runtime invocation). These phases are strictly separated — no schema inference or type resolution occurs at application runtime.

---

## Build-Time Phase

The build-time phase is initiated by the `buildProject()` orchestrator and completes synchronously across the following stages.

### Stage 1 — File Scanning

The file scanner traverses three source subdirectories within the configured input path:

- `functions/` — PostgreSQL function definitions
- `procedures/` — PostgreSQL procedure definitions
- `tables/` — PostgreSQL table definitions (used for schema resolution)

All `.sql` files are collected recursively. File paths are normalized to forward-slash format regardless of host operating system.

### Stage 2 — Schema Registry Construction

Prior to AST construction, all table definition files are parsed to build a `SchemaRegistry`. This registry maps table names to their column definitions and is used to resolve wildcard selections during the subsequent parsing stage.

```
tables/users.sql  →  SchemaRegistry["users"] = { columns: [{name, type}, ...] }
```

The schema registry is a prerequisite for `SELECT *` and `RETURNING *` expansion and must be fully populated before any function or procedure is analyzed.

### Stage 3 — Path Resolution

Each SQL file path is decomposed into a structured descriptor:

| Path segment | Resolved to |
|---|---|
| Root subdirectory (`functions`, `procedures`, `tables`) | `layer` |
| Intermediate directories | `namespace[]` (array of path segments) |
| File name (without extension, kebab-to-camel) | `name` |

Example:

```
functions/user/find-user-by-id.sql
→ { layer: "functions", namespace: ["user"], name: "findUserById" }
```

This descriptor governs the position of the generated method within the output object tree.

### Stage 4 — SQL Parsing

Each SQL file is parsed to extract:

- **For table files**: Column names and types. SQL types are mapped to TypeScript primitives via a deterministic type mapping table.
- **For function and procedure files**: Function name, parameter list (name, type, position), return signature, and the raw function body SQL.

The parser supports two extraction strategies:

1. **Signature-based**: Parses `CREATE FUNCTION` / `CREATE PROCEDURE` DDL to extract typed parameter declarations and `RETURNS TABLE` clauses.
2. **Body-based fallback**: If DDL parsing yields incomplete information, the function body is scanned for `:paramName` placeholder patterns. Parameters are extracted positionally in order of first appearance.

### Stage 5 — Wildcard Expansion

If a function or procedure body contains `SELECT *` or `RETURNING *`, the expander resolves the referenced table against the schema registry and substitutes an explicit column list.

```sql
-- Before expansion
SELECT * FROM users WHERE id = :userId

-- After expansion (schema registry provides column list)
SELECT id, email, created_at FROM users WHERE id = :userId
```

This expansion ensures that result type declarations are fully enumerated and do not degrade to `Record<string, unknown>`.

### Stage 6 — Contract AST Construction

All parsed descriptors are assembled into a `RootContractAst`, a nested tree structure with three top-level subtrees: `functions`, `procedures`, and `tables`. Each leaf in the tree is a `ContractNode` containing:

```typescript
type ContractNode = {
  type: "functions" | "procedures" | "tables";
  name: string;
  namespace: string[];
  filePath: string;
  sql: string;       // the call SQL, not the DDL
  params: SqlParameter[];
  result: Array<{ name: string; type: string }>;
};
```

The `sql` field at this stage contains the invocation SQL (e.g., `SELECT * FROM func($1, $2)`), not the original DDL. This is the string that will be embedded verbatim into the generated runtime.

### Stage 7 — Code Generation

The AST is consumed by two generators:

**Runtime Generator** — produces three artifacts:
- `runtime.ts`: TypeScript source with the `SqlContracts` object tree
- `runtime.js`: CommonJS bundle for direct execution
- `runtime.d.ts`: Declaration file for the runtime object

**Types Generator** — produces three artifacts:
- `types.ts`: TypeScript source with the `ISqlContracts` namespace tree
- `types.js`: Compiled namespace exports
- `types.d.ts`: Declaration file for the type namespace

**Package Generator** — produces:
- `package.json`: Distribution manifest for the output package

### Stage 8 — File Emission

All generated artifacts are written to the configured output directory. The directory is created recursively if it does not exist. Existing files are overwritten on each build without diffing.

---

## Call-Time Phase

The call-time phase begins when the consuming application invokes a method on `SqlContracts`. No toolchain components are involved at this stage.

### Invocation

```typescript
const users = await SqlContracts.user.findUserById({ userId: 42 }, pool);
```

Internally, the generated method performs:

1. Constructs a positional argument array from the `params` object in the order established at build time.
2. Calls `pool.query(sql, args)` where `sql` is the precompiled call string embedded at generation time.
3. Returns `result.rows` directly.

### Parameter Binding

Parameters are bound positionally. The order of `$1, $2, ...` in the call SQL corresponds to the order in which parameters appear in the function signature (for DDL-parsed functions) or the order of first occurrence in the function body (for fallback-parsed functions).

The params object is destructured into the positional array at call time:

```javascript
// Generated code — params: { userId, tenantId }
[params.userId, params.tenantId]
```

### Result Handling

The method returns `result.rows` without transformation. The return type is declared as `Promise<ResultType[]>` where `ResultType` is the generated row shape. No row mapping, camelCase conversion, or field filtering is applied.

---

## Error Propagation

Errors thrown by `pool.query()` propagate directly to the caller. The generated methods do not catch, wrap, or annotate database errors. Connection errors, constraint violations, and query timeouts surface as-is from the pool implementation.

---

## Watch Mode

In watch mode, the build-time phase is re-executed on every detected change to the input directory. The file watcher debounces change events by 200 milliseconds to coalesce rapid successive writes (e.g., during editor saves). Each successful rebuild overwrites the previous output in its entirety.

---

## Summary

| Phase | Trigger | Duration | Output |
|---|---|---|---|
| Build-time | `build` command or file change | Synchronous, seconds | Generated TypeScript package |
| Call-time | Application invocation | Per-query, milliseconds | `Promise<Row[]>` |

The strict separation of these phases means that the cost of SQL analysis, type resolution, and code generation is paid once at build time and amortized across all subsequent query executions.
