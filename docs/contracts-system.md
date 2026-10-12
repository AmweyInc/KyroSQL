# Contracts System

## Purpose

The contracts system is the structural backbone of the build pipeline. A **contract** is the intermediate representation of a single SQL source file after it has been parsed, resolved, and enriched with type information. Contracts are the unit of compilation — one SQL file produces exactly one contract, and one contract produces exactly one method in the generated runtime.

The contracts system defines the data model shared between the compiler stages: scanner, parser, AST builder, and code generator. It provides the common language through which each stage communicates.

---

## Core Data Structures

### ContractNode

`ContractNode` is the leaf type in the contract tree. It represents a single compiled SQL entity (function, procedure, or table):

```typescript
type ContractNode = {
  type: ContractLayer;       // "functions" | "procedures" | "tables"
  name: string;              // camelCase method name derived from file name
  namespace: string[];       // ordered array of namespace segments
  filePath: string;          // absolute path to the source SQL file
  sql: string;               // invocation SQL with $N positional placeholders
  params: SqlParameter[];    // ordered list of bound parameters
  result: Array<{            // resolved column list
    name: string;
    type: string;            // TypeScript type string
  }>;
};
```

### SqlParameter

Parameters are extracted from the function signature or, as a fallback, from `:paramName` occurrences in the function body:

```typescript
type SqlParameter = {
  name: string;       // parameter name as it appears in the SQL source
  position?: number;  // 1-based positional index ($1, $2, ...)
  type?: string;      // SQL type string (if declared in DDL)
};
```

Parameter order is authoritative. The generated runtime binds parameters in the exact order recorded in `SqlParameter[]`.

### ContractTree

`ContractTree` is a recursive type that represents the namespace hierarchy:

```typescript
type ContractTree = {
  [key: string]: ContractTree | ContractNode;
};
```

Intermediate nodes are plain objects (namespace segments). Leaf nodes are `ContractNode` instances. The `isContractNode()` utility distinguishes between the two by testing for the presence of the `sql` field.

### RootContractAst

The top-level AST produced by the build pipeline:

```typescript
type RootContractAst = {
  functions: ContractTree;
  procedures: ContractTree;
  tables: ContractTree;
};
```

This structure is the direct input to both the runtime generator and the types generator.

---

## Schema Types

Schema types capture the PostgreSQL table structure as parsed from DDL files. They are used exclusively during the build phase to support wildcard resolution.

### SchemaRegistry

```typescript
type SchemaRegistry = {
  [tableName: string]: TableSchema;
};
```

Keys are lowercase table names as they appear in `CREATE TABLE` statements. The registry is built from all `.sql` files in the `tables/` source directory before any function or procedure is processed.

### TableSchema

```typescript
type TableSchema = {
  tableName: string;
  columns: TableColumn[];
};
```

### TableColumn

```typescript
type TableColumn = {
  name: string;   // column name as defined in DDL
  type: string;   // TypeScript type string (post-mapping)
};
```

Column types are resolved at schema-build time, not at function-parse time. By the time a function's result columns are resolved, all types are already expressed as TypeScript primitives.

---

## SQL Type Mapping

The type mapping layer translates PostgreSQL type declarations into TypeScript type strings. This mapping is applied during table schema construction:

| PostgreSQL types | TypeScript type |
|---|---|
| `INT`, `INTEGER`, `BIGINT`, `SMALLINT`, `SERIAL`, `BIGSERIAL` | `number` |
| `FLOAT`, `FLOAT4`, `FLOAT8`, `DOUBLE PRECISION`, `NUMERIC`, `DECIMAL`, `REAL` | `number` |
| `TEXT`, `VARCHAR`, `CHARACTER VARYING`, `CHAR`, `UUID`, `NAME` | `string` |
| `BOOLEAN`, `BOOL` | `boolean` |
| `TIMESTAMP`, `TIMESTAMPTZ`, `DATE`, `TIME`, `TIMETZ` | `Date` |
| `JSON`, `JSONB` | `any` |
| All other types | `any` |

The mapping is case-insensitive. Type modifiers (e.g., `VARCHAR(255)`, `NUMERIC(10,2)`) are stripped before matching.

---

## Contract Lifecycle

### 1. File Discovery

The file scanner produces a flat list of absolute SQL file paths, organized by source layer (`functions`, `procedures`, `tables`).

### 2. Path Decomposition

Each path is parsed by the path resolver into a structured descriptor:

```
functions/reporting/financial/get-summary.sql
→ {
    layer: "functions",
    namespace: ["reporting", "financial"],
    name: "getSummary"
  }
```

Kebab-case file names are converted to camelCase. The `layer` is excluded from the `namespace` array — it is recorded separately as the `type` field on the resulting `ContractNode`.

### 3. SQL Parsing

The SQL parser extracts the function or procedure's complete signature from the DDL. The following information is captured:

- **Parameters**: Name, type, and declaration order from the `CREATE FUNCTION` parameter list.
- **Return shape**: Column names and types from the `RETURNS TABLE (...)` clause, if present.
- **Body SQL**: The raw SQL within `$$ ... $$` delimiters.

If DDL parsing fails to yield a complete parameter list (e.g., the file contains only a function body without `CREATE FUNCTION` wrapping), the fallback extractor scans the body for `:paramName` tokens and assigns them positions in order of first appearance.

### 4. Wildcard Resolution

If the body SQL contains `SELECT *` or `RETURNING *`, the expander:

1. Identifies the referenced table name from the `FROM` or `RETURNING` clause.
2. Looks up the table in the `SchemaRegistry`.
3. Substitutes the wildcard with the explicit column list from the registry.

This step is skipped if the table is not in the registry or if no wildcard is present.

### 5. Result Column Resolution

The `SelectResult` (parsed from the expanded SQL body) is resolved against the schema registry to produce a typed column list. Each selected column is matched to its table definition to determine its TypeScript type:

- Direct column references (`id`, `email`) are matched against the source table's schema.
- Aliased columns (`u.id AS user_id`) are resolved through the alias to the underlying column type.
- Unresolvable columns fall back to `any`.

The resolved column list is stored as the `result` field on `ContractNode`.

### 6. Invocation SQL Construction

The `sql` field on `ContractNode` is not the original DDL — it is the call-site SQL that will be embedded in the generated runtime. Construction follows these rules:

- **Functions**: `SELECT * FROM function_name($1, $2, ...)` — parameter count matches `params.length`.
- **Procedures**: `CALL procedure_name($1, $2, ...)` — same positional binding.
- **Tables**: No call SQL is generated. Table contracts exist only to populate the schema registry and emit entity type declarations.

### 7. Tree Insertion

Each contract is inserted into the appropriate subtree of `RootContractAst` using its `namespace` array as the path. Intermediate namespace objects are created on demand. Leaf insertion uses the contract's `name` as the final key.

---

## Contract Invariants

The following invariants hold for every `ContractNode` at the point of emission:

1. **SQL is parameterized.** No literal user-supplied values appear in the `sql` field. All variable bindings use `$N` positional notation.
2. **Parameter order is stable.** The `params` array ordering matches the `$1, $2, ...` sequence in the `sql` field. These are determined at parse time and do not change between builds unless the SQL source changes.
3. **Result columns are fully typed.** Every entry in the `result` array has a non-empty `type` field. Unknown types resolve to `any` rather than being omitted.
4. **Names are camelCase.** Both the `name` field and all namespace segments are camelCase strings derived from kebab-case file and directory names.
5. **One file, one contract.** There is a strict 1:1 relationship between source files and contract nodes. A single SQL file cannot produce multiple contracts.

---

## Usage by Downstream Stages

| Stage | Contract fields consumed |
|---|---|
| Runtime Generator | `type`, `name`, `namespace`, `sql`, `params` |
| Types Generator | `name`, `namespace`, `params`, `result` |
| Package Generator | none (operates on config, not contracts) |
| Schema Registry | `tableName`, `columns` (from `TableSchema`, not `ContractNode`) |
