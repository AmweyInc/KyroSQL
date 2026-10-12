# KyroSQL

SQL-first TypeScript code generator for PostgreSQL. Write plain SQL functions and procedures — KyroSQL generates a fully-typed TypeScript package ready to import into your project.

## How it works

1. You write SQL files with `CREATE FUNCTION` / `CREATE PROCEDURE`
2. Run `kyrosql build`
3. Get a generated package with type-safe methods and TypeScript declarations
4. Import and use it — no raw SQL in your application code

## Installation

```bash
npm install -D kyrosql
```

## SQL project structure

KyroSQL scans three directories inside your SQL root:

```
sql/
├── tables/          # table schemas — used to resolve SELECT * and RETURNING *
│   └── users.sql
├── functions/       # CREATE FUNCTION files
│   └── user/
│       ├── find-user-by-id.sql
│       └── find-all-users.sql
└── procedures/      # CREATE PROCEDURE files
    └── user/
        └── create-user.sql
```

The folder name inside `functions/` or `procedures/` becomes the namespace in the generated API (`user` → `User`).

## SQL file format

### Function

```sql
CREATE OR REPLACE FUNCTION find_user_by_id(p_user_id UUID)
RETURNS TABLE (
    id UUID,
    name TEXT,
    email TEXT,
    created_at TIMESTAMP
)
LANGUAGE plpgsql AS $$
BEGIN
    RETURN QUERY
    SELECT id, name, email, created_at
    FROM users
    WHERE id = p_user_id;
END;
$$;
```

### Procedure

```sql
CREATE OR REPLACE PROCEDURE create_user(
    p_id UUID,
    p_name TEXT,
    p_email TEXT
)
LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO users (id, name, email)
    VALUES (p_id, p_name, p_email)
    RETURNING *;
END;
$$;
```

### Table schema (for `SELECT *` resolution)

```sql
CREATE TABLE users (
    id UUID PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);
```

## Configuration

Run `kyrosql init` to create `kyrosql.config.json` with defaults, or create it manually:

```json
{
  "input": "./sql",
  "output": "./generated",
  "packageName": "@myapp/db",
  "publish": {
    "mode": "npm",
    "access": "public",
    "tag": "latest"
  }
}
```

| Field | Default | Description |
|---|---|---|
| `input` | `./sql` | Path to your SQL files directory |
| `output` | `./generated` | Where to write the generated package |
| `packageName` | `generated-kyrosql` | Name for the generated package |
| `publish.mode` | `"npm"` | `"npm"` — publish to registry, `"link"` — local `npm link` |
| `publish.access` | `"restricted"` | npm access level: `"public"` or `"restricted"` |
| `publish.tag` | `"latest"` | npm dist-tag (e.g. `"latest"`, `"beta"`) |

## Commands

```bash
# Create kyrosql.config.json in the current directory
kyrosql init

# Generate the package once
kyrosql build

# Watch for SQL file changes and rebuild automatically
kyrosql watch

# Publish or link the generated package (see publish config)
kyrosql publish
```

## Using the generated package

After `kyrosql build`, publish or link the generated package with `kyrosql publish`.

**Publish to npm** — set `publish.mode` to `"npm"` in your config:

```json
"publish": { "mode": "npm", "access": "public", "tag": "latest" }
```

```bash
kyrosql build
kyrosql publish
# → runs: npm publish --access public --tag latest
```

**Link locally for development** — set `publish.mode` to `"link"`:

```json
"publish": { "mode": "link" }
```

```bash
kyrosql build
kyrosql publish
# → runs: npm link  (inside the output directory)

# Then in your application:
npm link @myapp/db
```

### Querying

The generated `SqlContracts` object mirrors your folder structure. Pass a `pg` pool (or any compatible pool):

```typescript
import { SqlContracts } from '@myapp/db';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Function call — SELECT * FROM find_user_by_id($1)
const users = await SqlContracts.User.findUserById({ userId: '123' }, pool);

// Procedure call — CALL create_user($1, $2, $3)
await SqlContracts.User.createUser({ id: '456', name: 'Alice', email: 'alice@example.com' }, pool);
```

The pool only needs to implement:

```typescript
type PoolLike = {
  query(sql: string, values?: any[]): Promise<{ rows: any[] }>
}
```

This is compatible with `pg.Pool`, `pg.Client`, and most PostgreSQL clients.

### TypeScript types

The generated `ISqlContracts` namespace gives you named types for params and return values:

```typescript
import { ISqlContracts } from '@myapp/db';

// Entity type (from tables/users.sql)
type User = ISqlContracts.User;

// Return type of a specific function
type UserRow = ISqlContracts.User.findUserById;

// Params type
type FindUserParams = ISqlContracts.User.findUserById.params;
// → { userId: string }

// Use in your own service
async function getUser(params: ISqlContracts.User.findUserById.params) {
  return SqlContracts.User.findUserById(params, pool);
}
```

### IDE support

When you call a method, your IDE shows the parameter shape inline — no need to navigate to type definitions:

```
SqlContracts.User.findUserById(
                               ^ params: { userId: string }
```

## Generated package structure

```
generated/
├── dist/
│   ├── index.js       ← main entry point
│   ├── index.d.ts
│   ├── runtime.js     ← SqlContracts object
│   ├── runtime.d.ts
│   ├── types.js       ← empty (types only exist at compile time)
│   └── types.d.ts     ← ISqlContracts namespace
├── runtime.ts         ← source for reference
├── types.ts           ← source for reference
└── package.json
```

## Supported PostgreSQL types

| PostgreSQL | TypeScript |
|---|---|
| `UUID`, `TEXT`, `VARCHAR`, `CHAR` | `string` |
| `INT`, `INTEGER`, `BIGINT`, `SERIAL` | `number` |
| `NUMERIC`, `DECIMAL`, `FLOAT` | `number` |
| `BOOLEAN` | `boolean` |
| `TIMESTAMP`, `DATE`, `TIME` | `Date` |
| `JSON`, `JSONB` | `any` |
