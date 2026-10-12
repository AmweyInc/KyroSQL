# Namespace Resolution

## Overview

Namespace resolution is the process by which a SQL source file's filesystem path is converted into a position within the generated runtime object tree and type namespace hierarchy. It is the mechanism that turns a directory structure into an API surface — no configuration is required to define namespaces. The folder hierarchy is the namespace hierarchy.

---

## Design Principle

The namespace system is derived entirely from the filesystem. A developer controls the shape of the generated API by organizing SQL files into directories. Renaming a directory changes the namespace. Moving a file changes its namespace. No additional mapping, registration, or annotation is needed.

This means the generated API is always structurally aligned with the source directory. Navigating the source tree and navigating the generated `SqlContracts` object are the same mental operation.

---

## Path-to-Namespace Conversion

The path resolver (`parsePath()`) decomposes an absolute file path into four components:

| Component | Description | Example |
|---|---|---|
| `layer` | Top-level source category | `"functions"` |
| `namespace` | Ordered array of intermediate directory names | `["user", "auth"]` |
| `name` | camelCase method name derived from the filename | `"findByToken"` |
| `fullPath` | Absolute path to the source file | `"/.../functions/user/auth/find-by-token.sql"` |

### Example Decomposition

```
Input path:
  functions/user/auth/find-by-token.sql

Resolved descriptor:
  {
    layer:     "functions",
    namespace: ["user", "auth"],
    name:      "findByToken",
    fullPath:  "/.../functions/user/auth/find-by-token.sql"
  }
```

---

## Naming Conventions

### Directory Names (Namespace Segments)

Directory names are used as-is as namespace keys. They appear in two forms depending on context:

- **Runtime (`SqlContracts`)**: Lowercase, matching the directory name exactly.  
  `SqlContracts.user.auth.findByToken`

- **Type namespace (`ISqlContracts`)**: Capitalized via `capitalize()`.  
  `ISqlContracts.User.Auth.FindByToken`

Multi-word directory names are not automatically transformed. A directory named `order-history` becomes the key `"order-history"` in the runtime tree, which is not a valid JavaScript property accessor without bracket notation. The recommended convention is lowercase single-word or camelCase directory names.

### File Names (Method Names)

File names are converted from kebab-case to camelCase before use. The algorithm:

1. Strip the `.sql` extension.
2. Split on `-`.
3. Capitalize all segments except the first.
4. Concatenate.

Examples:

| File name | Generated method name |
|---|---|
| `find-user-by-id.sql` | `findUserById` |
| `get-summary.sql` | `getSummary` |
| `create.sql` | `create` |
| `find_user.sql` | `find_user` (underscores are not converted) |

The conversion is applied consistently in both the runtime object key and the type namespace segment (the type namespace segment is additionally capitalized).

---

## Tree Structure

The generated runtime and type namespace are both tree structures where:

- **Intermediate nodes** are plain objects (namespace segments)
- **Leaf nodes** are either:
  - Async function implementations (runtime tree)
  - Interface declarations (type namespace tree)

The `isContractNode()` utility distinguishes the two by testing for the presence of the `sql` property. This distinction is used during tree traversal in both the AST builder and code generators.

### Runtime Tree Example

Given the following source layout:

```
functions/
├── user/
│   ├── find-by-id.sql
│   └── auth/
│       └── validate-token.sql
└── orders/
    └── get-by-user.sql
procedures/
└── reporting/
    └── generate-summary.sql
```

The generated `SqlContracts` object:

```typescript
export const SqlContracts = {
  user: {
    findById: async (params, pool) => { ... },
    auth: {
      validateToken: async (params, pool) => { ... }
    }
  },
  orders: {
    getByUser: async (params, pool) => { ... }
  },
  reporting: {
    generateSummary: async (params, pool) => { ... }
  }
};
```

Note that `functions` and `procedures` are **not** top-level keys in the runtime output. The layer is encoded in the generated SQL call syntax (SELECT vs CALL) but is not reflected in the object tree. Functions and procedures share a single merged namespace tree.

### Type Namespace Example

The corresponding `ISqlContracts` namespace:

```typescript
export namespace ISqlContracts {
  export namespace User {
    export namespace FindById {
      export interface IParams { userId: number; }
      export interface IResult { id: number; email: string; }
    }
    export namespace Auth {
      export namespace ValidateToken {
        export interface IParams { token: string; }
        export interface IResult { valid: boolean; userId: number; }
      }
    }
  }
  export namespace Orders {
    export namespace GetByUser {
      export interface IParams { userId: number; }
      export interface IResult { id: number; total: number; }
    }
  }
  export namespace Reporting {
    export namespace GenerateSummary {
      export interface IParams { reportId: number; }
      export interface IResult { ... }
    }
  }
}
```

---

## Collision Handling

The current implementation does not perform explicit collision detection. If two SQL files resolve to the same position in the namespace tree — for example, a function named `find-user.sql` and a procedure named `find-user.sql` in the same directory — the second write to that tree node overwrites the first. The practical mitigations are:

1. Use distinct names within a directory.
2. Do not use the same name for both a function and a procedure in the same namespace path. Since functions and procedures are merged into a single tree, this would constitute a collision.

---

## Layer Exclusion from Namespace

The `layer` value (`functions`, `procedures`, `tables`) is explicitly excluded from the namespace array before tree insertion. This is deliberate:

- The layer is a source-organization concern, not an API-design concern.
- Consumers should not need to know whether a call invokes a function or a procedure.
- Merging the two layers into one namespace tree produces a cleaner, flatter API surface.

Table contracts are also excluded from the runtime tree entirely. They are used only to populate the schema registry and emit entity type declarations. A table at `tables/users.sql` does not produce a `SqlContracts.users` property.

---

## Namespace Depth

There is no enforced limit on namespace depth. A file at `functions/a/b/c/d/find.sql` produces `SqlContracts.a.b.c.d.find(...)` in the runtime and `ISqlContracts.A.B.C.D.Find` in the type namespace. However, deeply nested structures increase the cognitive load for consumers and should be avoided in practice. The recommended maximum depth is three levels below the layer root.

---

## Impact of Structural Changes

Because namespaces are derived from the filesystem, structural changes to the SQL source directory have direct consequences for consumers of the generated package:

| Source change | Runtime impact |
|---|---|
| Rename a file | Method name changes — breaking change for consumers |
| Rename a directory | Namespace segment changes — breaking change for consumers |
| Move a file to a different directory | Namespace path changes — breaking change for consumers |
| Add a new file | New method added — non-breaking |
| Delete a file | Method removed — breaking change for consumers |

When distributing the generated package as a versioned npm artifact, these structural changes should be communicated through appropriate semantic versioning. Renaming or moving SQL files is equivalent to a breaking API change.
