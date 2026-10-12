# Overview

## What This Tool Is

This is a build-time SQL-to-TypeScript compiler for PostgreSQL. It accepts a directory of SQL source files — function definitions, procedure definitions, and table schemas — and emits a fully typed, self-contained TypeScript package that can be versioned, published, and consumed by any Node.js application.

The output is not a query builder, not an ORM, and not a runtime abstraction. It is generated source code: plain TypeScript with inlined SQL strings and statically resolved types. Once generated, the output package has no dependency on the toolchain and no startup cost.

---

## Problem Statement

Teams that use PostgreSQL's native function and procedure layer as a service interface face a recurring problem: the database has strong types, but the application layer does not. Developers either write untyped `pool.query()` calls scattered across the codebase, manually maintain TypeScript interfaces that can drift from the actual schema, or adopt an ORM that trades SQL control for a leaky abstraction.

The goal of this tool is to close that gap without compromise. SQL stays in `.sql` files, written exactly as it would be for any PostgreSQL client. Type information comes from the SQL itself — from `CREATE FUNCTION` signatures, `RETURNS TABLE` clauses, and `CREATE TABLE` definitions. No annotations, no decorators, no DSL.

---

## Core Principles

**SQL is the source of truth.** The developer writes SQL. The tool reads it. Types flow from the SQL schema, not from a TypeScript layer placed on top of it.

**Generation over abstraction.** The output is code, not a runtime library. There is no middleware between the application and the database. The generated methods call `pool.query()` directly with precompiled SQL strings.

**Build-time completeness.** All type inference, wildcard resolution, and namespace construction happen at build time. The application pays no analysis cost at startup or at query time.

**Structural alignment.** The generated runtime mirrors the filesystem structure of the SQL source directory. The folder hierarchy is the namespace hierarchy. No configuration is required to define the shape of the output API.

---

## High-Level Architecture

The system is composed of five primary packages within a monorepo:

```
cli         ─── User-facing commands: init, build, watch, publish
core        ─── Orchestration: config loading, build coordination
compiler    ─── Analysis: scanning, parsing, AST construction, code generation
types       ─── Shared data model: contracts, schema types, SQL types
runtime     ─── Scaffolding for generated output (populated per-project)
```

Additionally:

```
publisher   ─── npm publishing and local linking
utils       ─── Shared utilities (capitalize, isContractNode)
```

The `compiler` package is the analytical core. The `cli` and `core` packages coordinate workflow. The `types` package defines the intermediate representation shared between compiler stages.

---

## Workflow

### Initialization

```bash
kyrosql init
```

Creates `kyrosql.config.json` and the canonical SQL directory structure:

```
sql/
├── functions/
├── procedures/
├── tables/
└── migrations/
```

### Development

```bash
kyrosql watch
```

Starts a file watcher over the input directory. Any change to a `.sql` file triggers a full rebuild, debounced by 200ms. The output package is rewritten in place.

### Build

```bash
kyrosql build
```

Single-pass compilation. Reads all SQL source files, performs full static analysis, and emits the TypeScript package to the configured output directory.

### Distribution

```bash
kyrosql publish
```

Distributes the generated package either to an npm registry (`mode: "npm"`) or as a local npm link (`mode: "link"`). Supports access control and distribution tag configuration.

---

## Generated Package

The output of a build is an independently distributable npm package. Its structure:

```
output/
├── package.json
├── runtime.ts
├── types.ts
└── dist/
    ├── index.js
    ├── index.d.ts
    ├── runtime.js
    ├── runtime.d.ts
    ├── types.js
    └── types.d.ts
```

The consuming application imports from this package:

```typescript
import { SqlContracts } from 'my-generated-package';
import type { ISqlContracts } from 'my-generated-package';

// Fully typed, no manual interface maintenance required
const user = await SqlContracts.user.findById({ userId: 1 }, pool);
//    ^─ typed as ISqlContracts.User.FindById.IResult[]
```

---

## Scope and Boundaries

This tool operates exclusively on the **application–database interface layer**. It does not manage migrations, enforce schema conventions, validate SQL correctness against a live database, or provide a query planner. Its responsibility ends at the boundary between the source SQL directory and the generated TypeScript package.

The following are explicitly out of scope:

- Runtime query validation
- Connection pool management
- Migration orchestration
- ORM-style relation loading
- Dynamic query construction

These concerns belong to the layers on either side: the database for schema enforcement, and the application for connection and data access patterns.

---

## Configuration Reference

`kyrosql.config.json` supports the following fields:

| Field | Type | Default | Description |
|---|---|---|---|
| `input` | `string` | `"./"` | Path to the SQL source directory |
| `output` | `string` | `"./generated"` | Path to write the generated package |
| `packageName` | `string` | `"generated-kyrosql"` | Name field in the generated `package.json` |
| `publish.mode` | `"npm" \| "link"` | — | Distribution mode for the `publish` command |
| `publish.access` | `"public" \| "restricted"` | — | npm publish access level |
| `publish.tag` | `string` | — | npm distribution tag (e.g., `latest`, `next`) |

All paths in the config are resolved relative to the directory containing `kyrosql.config.json`.
