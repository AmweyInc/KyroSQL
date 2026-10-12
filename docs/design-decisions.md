# Design Decisions

## Overview

This document records the significant architectural choices made during the design of this system, the alternatives that were considered, and the rationale for each decision. It is intended for contributors and maintainers who need to understand the constraints and trade-offs embedded in the current design before proposing changes.

---

## 1. SQL as the Source of Truth

**Decision**: SQL files are the primary source of schema and type information. No TypeScript annotations, configuration files, or database introspection are used to derive type declarations.

**Alternatives considered**:
- **TypeScript-first**: Define function signatures in TypeScript; generate SQL from those definitions.
- **Database introspection**: Connect to a live database at build time and query `information_schema` or `pg_catalog` for type information.
- **Hybrid annotation**: Augment SQL files with comment-based annotations to supply types not inferrable from SQL alone.

**Rationale**: SQL is the language of the database. Writing SQL in TypeScript (via a query builder DSL) or maintaining parallel TypeScript definitions creates two sources of truth that can drift. Database introspection requires a live connection at build time, coupling the build process to a running database instance and making local and CI builds more fragile. Comment-based annotations add a custom DSL on top of SQL and create a non-standard dependency.

Accepting SQL as the single source of truth means the build never needs network access, works offline, and produces output that is verifiably derived from the SQL source without hidden external state.

---

## 2. Code Generation Over Runtime Abstraction

**Decision**: The compiler emits TypeScript source code. There is no runtime library that the generated code depends on. Each generated method is a complete, self-contained function.

**Alternatives considered**:
- **Runtime library with reflection**: Ship a runtime package that inspects a contract manifest at startup and generates query executors dynamically.
- **Thin runtime with contract registry**: Generate a data structure (JSON manifest) at build time and ship a small runtime library that executes queries by looking up contracts in the manifest.

**Rationale**: Both alternatives introduce a runtime dependency and a startup cost (manifest parsing, executor construction). They also make the generated API harder to inspect, because the actual function implementations are inside the runtime library rather than in the generated files.

Code generation produces output that is auditable — a developer can open `runtime.ts` and read exactly what will execute. There is no "magic" at runtime. The generated code can be linted, formatted, and reviewed like any handwritten TypeScript. Debugging is straightforward because stack traces point to generated code, not to an opaque runtime framework.

The cost of this decision is that build output is more verbose. This is accepted as worthwhile.

---

## 3. Pool Passed Per-Call, Not Captured at Initialization

**Decision**: Every generated method accepts a `pool` argument at the call site rather than capturing a pool at construction time (e.g., via a factory function or class constructor).

**Alternatives considered**:
- **Factory pattern**: `createSqlContracts(pool)` returns a bound contracts object.
- **Singleton module-level pool**: The generated module exports a `setPool()` function that stores a global pool reference.
- **Class-based contracts**: Generated methods live on a class that stores the pool as an instance field.

**Rationale**: Passing the pool per-call gives the consumer complete control over connection scope. The primary consequence is that consumers can pass a `PoolClient` checked out from a transaction, enabling multiple generated methods to participate in a single database transaction without any transaction-aware logic in the generated code.

A factory or singleton approach would make transaction support awkward — either the consumer must replace the global pool reference for the duration of a transaction (not thread-safe in any async context) or the factory must be re-invoked with a transactional client (producing a second contracts object with an awkward lifecycle).

The per-call pattern is more verbose at the call site but is completely composable with any connection management strategy the application chooses.

---

## 4. Filesystem Structure as the Namespace Hierarchy

**Decision**: The directory structure of the SQL source files directly and automatically defines the namespace structure of the generated API. No namespace configuration is needed or supported.

**Alternatives considered**:
- **Explicit namespace configuration**: A config file maps source directories to runtime namespace paths.
- **SQL-based naming**: Use the PostgreSQL function name (from `CREATE FUNCTION`) as the basis for the namespace, ignoring the file path.
- **Flat namespace**: All functions in a single top-level object, with no nesting.

**Rationale**: Using the filesystem as the namespace means that the API structure is self-documenting from the source tree. Developers can navigate the source directory and the runtime object with the same mental model. No configuration needs to be maintained or updated when new SQL files are added — the namespace is always in sync with the source.

SQL-based naming would require all functions to have unique, globally scoped names within the PostgreSQL schema. This is often not the case (e.g., `users.find` and `orders.find` as separate schemas). The filesystem path is unambiguous.

A flat namespace was rejected because it does not scale. A project with dozens of SQL functions produces a flat object that is difficult to navigate and exposes name collision risks.

---

## 5. Functions and Procedures Merged into a Single Runtime Tree

**Decision**: The `functions/` and `procedures/` source directories feed into a single merged namespace tree in the generated runtime. The distinction between function and procedure is not surfaced at the API level.

**Alternatives considered**:
- **Separate trees**: `SqlContracts.functions.user.findById` and `SqlContracts.procedures.reporting.generate`.
- **Explicit type annotation in output**: Each method carries metadata indicating whether it is a function or procedure.

**Rationale**: From the consumer's perspective, calling a PostgreSQL function and calling a procedure are operationally identical — both take parameters and return rows. The difference is in how the database implements them, which is a database-layer concern.

Separating the trees by layer type forces consumers to know whether a given operation is implemented as a function or procedure. This knowledge has no value at the call site and creates unnecessary coupling between the application code and the database implementation choice. If a function is later refactored to a procedure (or vice versa), a separate-tree design would require changes in every call site.

The call SQL (`SELECT * FROM` vs. `CALL`) correctly handles the database-level distinction without exposing it to the consumer.

---

## 6. Synchronous Pipeline with Full Rebuild

**Decision**: The build pipeline runs synchronously and performs a full rebuild on every invocation. There is no incremental compilation, dependency tracking, or partial update.

**Alternatives considered**:
- **Incremental compilation**: Track file modification timestamps or content hashes and reprocess only changed files.
- **Dependency graph**: Build a dependency graph between tables and functions so that changes to a table trigger recompilation of functions that reference it.

**Rationale**: For the typical scale of a SQL function library (tens to low hundreds of files), full rebuild time is measured in milliseconds. The complexity overhead of incremental compilation — tracking invalidation, handling deletions, managing cache coherence — is not justified at this scale.

Full rebuild is also simpler to reason about. Every build produces a deterministic output from the current state of all source files. There are no stale artifacts, no cache-poisoning scenarios, and no edge cases around first-run vs. cached-run behavior.

If project size grows to the point where full rebuild becomes perceptible, incremental compilation should be reconsidered. The pipeline's stage-based design makes it amenable to incremental processing at the file-scan and AST-construction stages.

---

## 7. Two-Strategy Parameter Extraction with Silent Fallback

**Decision**: Parameter extraction uses DDL parsing as the primary strategy and `:paramName` token scanning as a fallback. When the fallback is used, parameter types are `any`. No error or warning is emitted.

**Alternatives considered**:
- **Hard failure**: If a function does not have a `CREATE FUNCTION` DDL header, the build fails with an error.
- **Warning emission**: Log a warning when the fallback is activated, but continue building.
- **No fallback**: Only process files that contain full DDL; skip all others.

**Rationale**: Strict failure would prevent the tool from processing legacy SQL files or raw query files that are valid use cases (e.g., complex analytics queries that are not wrapped in a function). Requiring DDL headers for all files would impose a structural requirement on all SQL content, reducing the tool's utility.

Silent fallback to `any` types is the least surprising behavior for someone who writes a raw SQL file without DDL. The output is less typed but still functional. The developer can inspect the generated `types.ts` to see where `any` appears and add DDL headers to improve type coverage incrementally.

A warning mechanism would be the ideal middle ground and is a candidate for a future enhancement.

---

## 8. Wildcard Expansion Before Type Resolution

**Decision**: `SELECT *` and `RETURNING *` are expanded to explicit column lists before result type resolution occurs. Both steps happen at build time using the schema registry.

**Alternatives considered**:
- **Lazy expansion**: Leave wildcards in the SQL and resolve types separately using only the registry.
- **No wildcard support**: Require developers to write explicit column lists.

**Rationale**: Expanding wildcards before type resolution simplifies the result column analysis code significantly. After expansion, the SELECT parser only needs to handle named columns, not the special-case logic of wildcard resolution interleaved with type lookup.

The expanded column list is also embedded in the generated SQL call string. This is intentional — it prevents the generated query from being affected by future DDL changes that add or remove columns from the referenced table. A `SELECT *` in the database would pick up new columns automatically; the expanded form does not. This makes the generated code's behavior more predictable and prevents silent schema changes from altering query output.

Requiring explicit column lists was rejected because `SELECT *` is a common and legitimate pattern for returning complete row objects, especially for table-valued functions.

---

## 9. Output Package is an Independent npm Artifact

**Decision**: The generated output is structured as an independently distributable npm package with its own `package.json`, version field, and `dist/` build directory.

**Alternatives considered**:
- **Inline output**: Generate TypeScript files directly into the consuming application's `src/` directory.
- **Single shared module**: Generate a module that is always referenced by path rather than package name.

**Rationale**: Packaging the output as a versioned npm artifact allows it to be:

1. **Shared across multiple consuming applications** — a database interface layer can be published once and imported by several services.
2. **Versioned independently** — the generated package version can track the SQL schema version, providing a clear audit trail of API changes.
3. **Distributed without toolchain** — consuming applications only need the generated package, not the compiler.

Inline output into `src/` would couple the generated files to the consuming application's repository structure and make it harder to share the interface across multiple services or detect when the generated code is out of sync with the SQL source.
