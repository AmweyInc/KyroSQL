# Type Inference Engine

## Overview

The type inference engine is the subsystem responsible for converting PostgreSQL schema information and SQL query analysis into TypeScript type declarations. It operates entirely at build time and produces two categories of output: **parameter types** (the shape of values passed into a SQL call) and **result types** (the shape of rows returned from a SQL call). All inference is static — no live database connection is required.

---

## Inference Sources

Type information enters the engine from three distinct sources, applied in priority order:

| Source | Applies to | Completeness |
|---|---|---|
| `CREATE FUNCTION` / `CREATE PROCEDURE` DDL | Parameters and return columns | High — types declared explicitly in SQL |
| `CREATE TABLE` DDL (schema registry) | Result columns via SELECT resolution | Medium — depends on wildcard expansion success |
| `:paramName` token scanning (body fallback) | Parameters only | Low — names recovered, types unknown (`any`) |

The engine applies the highest-fidelity source available for each piece of information and falls back gracefully when information is absent.

---

## SQL-to-TypeScript Type Mapping

All PostgreSQL type strings encountered in DDL are passed through a deterministic mapping function (`mapSqlType()`) before being stored. This mapping is applied at schema-registry construction time for table columns and at function-parse time for function parameter types.

### Mapping Table

| PostgreSQL type group | Matched patterns | TypeScript type |
|---|---|---|
| Integer numerics | `INT`, `INTEGER`, `BIGINT`, `SMALLINT`, `SERIAL`, `BIGSERIAL` | `number` |
| Floating-point numerics | `FLOAT`, `FLOAT4`, `FLOAT8`, `DOUBLE PRECISION`, `REAL` | `number` |
| Arbitrary precision | `NUMERIC`, `DECIMAL` | `number` |
| Text | `TEXT`, `VARCHAR`, `CHARACTER VARYING`, `CHAR`, `NAME` | `string` |
| Identifier | `UUID` | `string` |
| Boolean | `BOOLEAN`, `BOOL` | `boolean` |
| Date and time | `TIMESTAMP`, `TIMESTAMPTZ`, `DATE`, `TIME`, `TIMETZ` | `Date` |
| Document types | `JSON`, `JSONB` | `any` |
| All other types | — | `any` |

### Normalization

Before matching, all type strings are converted to uppercase and stripped of modifiers. This ensures that `VARCHAR(255)`, `varchar(255)`, and `CHARACTER VARYING(100)` all resolve to `string`, and that `NUMERIC(10, 2)` resolves to `number`.

---

## Parameter Type Inference

### DDL-Based (Primary Path)

When a function file contains a valid `CREATE FUNCTION` statement, parameters are extracted from the formal parameter list. Each parameter has a declared name and SQL type:

```sql
CREATE FUNCTION find_user(p_user_id INT, p_tenant UUID)
RETURNS TABLE (id INT, email TEXT)
```

The engine extracts:
```
params: [
  { name: "pUserId", type: "number", position: 1 },
  { name: "pTenant", type: "string",  position: 2 }
]
```

The resulting `IParams` interface:
```typescript
interface IParams {
  pUserId: number;
  pTenant: string;
}
```

### Token-Based (Fallback Path)

When DDL parsing does not yield a parameter list — for example, when a file contains only a raw SQL query without a `CREATE FUNCTION` wrapper — the engine scans the body for `:paramName` tokens:

```sql
SELECT id, email FROM users WHERE id = :userId AND tenant_id = :tenantId
```

Parameters are extracted in order of first appearance:
```
params: [
  { name: "userId",   position: 1 },
  { name: "tenantId", position: 2 }
]
```

No type information is available from this path. The resulting `IParams` interface uses `any` for all fields:
```typescript
interface IParams {
  userId: any;
  tenantId: any;
}
```

### Empty Parameter Case

When a function has no parameters, the interface falls back to a sentinel type:
```typescript
type IParams = Record<string, never>;
```

This is a closed empty object type. It prevents the accidental passing of properties while remaining assignable from `{}`.

---

## Result Type Inference

Result type inference is the more complex of the two inference paths. It combines SQL parsing, schema registry lookup, and column aliasing resolution.

### Step 1 — Source Identification

The engine first determines where the result shape comes from. Three cases are possible:

1. **`RETURNS TABLE(...)`** in the DDL — explicit column declarations
2. **`SELECT col1, col2 FROM table`** in the function body — analyzed via SQL parsing
3. **`RETURNING col1, col2`** in a DML statement in the function body — analyzed via SQL parsing

For tables (not functions), the result shape is the table's own column list.

### Step 2 — Wildcard Expansion

If the SELECT or RETURNING clause uses `*`, the expander substitutes the full column list from the schema registry before the result inference step runs. After expansion, all subsequent analysis operates on an explicit column list.

```sql
-- Pre-expansion
SELECT * FROM orders WHERE user_id = :userId

-- Post-expansion (registry: orders has id, user_id, total, created_at)
SELECT id, user_id, total, created_at FROM orders WHERE user_id = :userId
```

If the table is not in the registry, the wildcard is not expanded and the result type degrades to `Record<string, unknown>`.

### Step 3 — Column Extraction

`parseSelect()` parses the expanded SELECT clause and produces a `SelectResult`:

```typescript
type SelectResult = {
  columns: SelectColumn[];
  from: string;
};

type SelectColumn = {
  name: string;    // original column name (or alias target)
  table?: string;  // table prefix (e.g., "u" in u.email)
  alias?: string;  // alias (e.g., "userEmail" in email AS userEmail)
};
```

### Step 4 — Type Resolution

Each `SelectColumn` is resolved against the schema registry:

1. The `from` table name identifies the primary lookup table.
2. Table-prefixed columns (`u.email`) resolve the prefix against known table aliases, then look up the column.
3. Aliased columns take the alias as the output field name but inherit the type from the source column.
4. Columns with no registry match are typed as `any`.

The result is an array of `{ name: string; type: string }` pairs, which becomes the `IResult` interface:

```typescript
interface IResult {
  id: number;
  userEmail: string;   // alias of email
  createdAt: Date;
}
```

### Empty Result Case

When no result columns can be determined, the interface falls back to:
```typescript
type IResult = Record<string, unknown>;
```

This preserves runtime usability while signaling to developers that the result shape is unresolved.

---

## Namespace Tree Construction

The generated types are organized into a mirrored namespace hierarchy matching the runtime object tree. For each function, the types generator emits:

```typescript
export namespace ISqlContracts {
  export namespace User {               // namespace segment "user" → capitalized
    export namespace FindById {         // method "findById" → capitalized
      export interface IParams { ... }
      export interface IResult { ... }
    }
  }
}
```

Namespace segment names are capitalized by passing them through `capitalize()`. This means a file at `functions/user/auth/find-by-token.sql` produces:

```typescript
ISqlContracts.User.Auth.FindByToken.IParams
ISqlContracts.User.Auth.FindByToken.IResult
```

---

## Entity Types

In addition to function-level types, the engine emits an entity type for each table in the schema registry. Entity types represent a full row of the table and are derived directly from the `SchemaRegistry`:

```typescript
// From tables/users.sql (CREATE TABLE users ...)
export interface User {
  id: number;
  email: string;
  createdAt: Date;
}
```

Entity type names are singularized from the table name. The current singularization strategy removes a trailing `s` (e.g., `users` → `User`, `orders` → `Order`). The type name is then capitalized.

---

## Type Emission Artifacts

The type inference engine produces three emitted artifacts:

| Artifact | Format | Content |
|---|---|---|
| `types.ts` | TypeScript source | `export namespace ISqlContracts { ... }` + entity interfaces |
| `types.d.ts` | Declaration file | `declare namespace ISqlContracts { ... }` |
| `types.js` | CommonJS | Compiled namespace exports (structural, no values) |

The TypeScript source (`types.ts`) is included in the package root for auditability. The `dist/` variants are what consuming applications reference at compilation time.

---

## Inference Limitations

The following scenarios produce degraded type output rather than an error:

| Scenario | Degraded to |
|---|---|
| Token-based parameter extraction | `any` for all parameter types |
| `SELECT *` with no matching registry entry | `Record<string, unknown>` for result |
| Unresolvable column reference | `any` for that column |
| No result columns detected | `Record<string, unknown>` for result |
| No parameters detected | `Record<string, never>` for params |

These cases are silent at build time. To surface them, examine the emitted `types.ts` file — the presence of `any` or `Record<string, unknown>` in the output indicates that a function's type information was not fully resolved. Resolution typically requires either adding a `CREATE FUNCTION` DDL header with a typed parameter list or ensuring all referenced tables have corresponding entries in the `tables/` source directory.
