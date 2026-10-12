# Changelog

All notable changes to KyroSQL are documented in this file.

## Unreleased

Ported forward from `quero-pg-sql-client-gen` (a fork that started as a copy of KyroSQL and pulled ahead in features). Below are the functional changes, independent of the qerosql→kyrosql naming translation applied during the port.

### Added

- **Auto date mapping (`*_at` epoch convention).** A `BIGINT`/`INT8` table column or function parameter whose name ends in `_at` is now treated as an epoch-milliseconds timestamp: it's surfaced as `Date` in generated TypeScript types and runtime code, exactly like a native `TIMESTAMP` column, instead of a plain `number`. Generated runtime converts `Date → epoch-ms` on write and `epoch-ms → Date` on read, so the database keeps storing a plain bigint while application code works with real `Date` objects. Genuine SQL `DATE`/`TIMESTAMP` columns are unaffected — they continue to pass through `pg`'s native Date handling untouched.
- **Auto array mapping.** Array-typed SQL columns and parameters (`TEXT[]`, `INT[]`, `UUID[][]`, enum arrays, etc.) are now mapped to real JS arrays in both directions:
  - Codegen: array types are mapped by recursing into the element type and re-appending `[]`, so `TEXT[]` becomes `string[]`, `my_enum[]` becomes `(MyEnum)[]`, etc.
  - Runtime (read): `pg` returns arrays of custom/enum types as a raw `"{a,b}"` string rather than a parsed array — generated code now parses these back into a real array automatically. `NUMERIC`/`DECIMAL` array elements (and scalar `NUMERIC`/`DECIMAL` columns) are additionally coerced from string to `number` to avoid float-precision string leakage. `JSON`/`JSONB` array columns are left untouched, since naively splitting on `,` would corrupt nested structures.
- **SQL comment → JSDoc support.** `COMMENT ON TABLE`, `COMMENT ON COLUMN`, and `COMMENT ON FUNCTION`/`PROCEDURE` statements are now parsed and carried through as JSDoc comments on the corresponding generated types and functions.
- **Enum support.** `CREATE TYPE ... AS ENUM (...)` is now parsed and generates a proper TypeScript union/enum type, referenced by any column or parameter typed with it (including as an array, e.g. `my_enum[]`).
- **GitLab publish mode.** `kyrosql init` now offers a GitLab-registry publish target alongside npm/local-link, generating a CI file (`ci-generator`) and a `package.json` wired to the project's GitLab package registry when selected.
- Nullable parameters are now tracked (`SqlParameter.nullable`) and reflected in generated parameter types (`T | null`).

### Fixed

- **`CREATE TABLE` parsing.** The table parser now correctly handles nested parentheses in column definitions (e.g. `NUMERIC(10, 2)`), `IF NOT EXISTS`, quoted identifiers, and table-level constraints (`CONSTRAINT`, `PRIMARY KEY`, `FOREIGN KEY`, `UNIQUE`, `CHECK`, `EXCLUDE`, `LIKE`) — these are no longer misparsed as columns.
- **CJS/ESM interop.** The generated package's `index.js` re-export of runtime/types (and now comments) uses the `tslib` `__exportStar` pattern instead of a dynamic `Object.keys(...)` loop. `cjs-module-lexer` (used by ESM consumers to statically analyze CommonJS output) can detect `__exportStar(require(...), exports)` but not a dynamic loop, so named exports (e.g. `SqlContracts`) were previously invisible to `import { ... }` from ESM consumers.
- **Function signature parsing.** The parameter/return-type regex in the function parser now also matches a trailing array suffix (`[]` or `[][]`) after the base type, so array-typed function parameters and return columns are recognized correctly instead of falling back to a plain scalar type.
