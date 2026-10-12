# Runtime Overview

## Purpose

The runtime layer is the deployment artifact produced by the build pipeline. It represents a fully generated, strongly typed TypeScript package that encapsulates every SQL function and procedure defined in the source directory. Once generated, the runtime package operates without any dependency on the toolchain that produced it — it is a self-contained, standalone module that can be versioned, published, and consumed by any Node.js application with access to a PostgreSQL connection pool.

---

## Architectural Position

The runtime sits at the boundary between the build pipeline and the consuming application. The compiler processes SQL source files and emits the runtime as output; the consuming application imports the runtime and executes queries through it. There is no reflection, no introspection, and no schema parsing at application startup — all structural analysis is performed at build time.

```
SQL Source Files
      │
      ▼
  Build Pipeline
      │
      ▼
  Runtime Package  ──────────►  Consuming Application
  (generated)                   (imports & executes)
```

The generated package exposes a single primary export, `SqlContracts`, which is a hierarchical object tree that mirrors the directory structure of the source SQL files.

---

## Package Structure

Each runtime emission produces the following file layout:

```
output/
├── package.json          # Distributable package manifest
├── runtime.ts            # TypeScript source for the contract tree
├── types.ts              # TypeScript source for type declarations
└── dist/
    ├── index.js          # CommonJS entry point
    ├── index.d.ts        # Aggregate declaration file
    ├── runtime.js        # Compiled contract implementations
    ├── runtime.d.ts      # Contract type declarations
    ├── types.js          # Compiled type exports
    └── types.d.ts        # Namespace type declarations
```

The `dist/` subtree is produced by esbuild and is ready for direct consumption. The `.ts` source files are co-located in the package root for auditability and secondary toolchain compatibility.

---

## SqlContracts Object

`SqlContracts` is the primary runtime export. It is a plain object tree where each leaf is an `async` function with the following invariant signature:

```typescript
(params: ParamsType, pool: PoolLike) => Promise<ResultType[]>
```

The object hierarchy is derived from the filesystem path of the originating SQL file:

| SQL file path | Runtime accessor |
|---|---|
| `functions/user/find-by-id.sql` | `SqlContracts.user.findById(params, pool)` |
| `procedures/reporting/generate-summary.sql` | `SqlContracts.reporting.generateSummary(params, pool)` |

Functions and procedures are merged into a single namespace tree in the runtime output. The distinction between function and procedure is reflected in the emitted SQL call syntax (`SELECT * FROM` vs. `CALL`) but is transparent to the caller.

---

## Emitted Call Patterns

### PostgreSQL Functions

Functions returning a result set are called using a set-returning wrapper:

```javascript
const result = await pool.query(
  `SELECT * FROM find_user_by_id($1, $2)`,
  [params.userId, params.tenantId]
);
return result.rows;
```

### PostgreSQL Procedures

Procedures are invoked via the `CALL` statement:

```javascript
const result = await pool.query(
  `CALL generate_summary($1)`,
  [params.reportId]
);
return result.rows;
```

In both cases, parameters are positionally bound using the PostgreSQL `$N` placeholder format. There is no string interpolation of user-supplied values at any point in the call chain.

---

## Type System Integration

The runtime package exports a `ISqlContracts` namespace that provides full static type coverage for all generated methods. Consuming applications can reference these types for function-level typing, parameter construction, or result handling:

```typescript
import type { ISqlContracts } from 'generated-package';

type FindUserParams = ISqlContracts.User.FindById.IParams;
type FindUserResult = ISqlContracts.User.FindById.IResult;
```

Table entity types are also exported, derived from the schema definitions in the `tables/` source directory. Entity type names are singularized from the table name (`users` → `User`).

---

## Zero-Overhead Design

The runtime introduces no middleware, no query builder, and no ORM abstraction. Each generated method is a thin wrapper that:

1. Receives a params object and a pool reference
2. Invokes `pool.query()` with the precompiled SQL string and a positional argument array
3. Returns `result.rows` directly

There are no interceptors, no connection management, and no retry logic embedded in the runtime. These concerns are delegated entirely to the pool implementation provided by the consumer.

---

## Versioning and Distribution

The generated package includes its own `package.json` with a configurable `name` and `version` field. Distribution is handled through two supported modes:

- **`npm`**: Publishes the package to an npm-compatible registry. Supports `access` (`public` | `restricted`) and `tag` (e.g., `latest`, `next`) parameters.
- **`link`**: Executes `npm link` in the output directory, making the package available for local consumption without a registry.

The runtime package is treated as an independently versioned artifact. It is recommended to align runtime package versions with the SQL schema version in the originating database.
