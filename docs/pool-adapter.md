# Pool Adapter

## Overview

The pool adapter is the integration boundary between the generated runtime and the application's database connectivity layer. It defines the minimal interface that a connection pool must satisfy in order to execute the generated SQL methods. Rather than embedding a specific PostgreSQL client as a dependency, the runtime accepts any object that conforms to this interface — a design that preserves compatibility across multiple `pg`-compatible pool implementations.

---

## PoolLike Interface

Every generated runtime method accepts a `pool` argument typed as `PoolLike`. This interface is intentionally narrow:

```typescript
interface PoolLike {
  query(sql: string, params?: unknown[]): Promise<{ rows: unknown[] }>;
}
```

This is the only contract the runtime imposes on the pool. Any object that exposes a `query` method matching this signature is a valid pool.

---

## Compatible Implementations

The `PoolLike` interface is structurally compatible with the following commonly used PostgreSQL client packages without modification:

### node-postgres (`pg`)

```typescript
import { Pool } from 'pg';

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'mydb',
  user: 'postgres',
  password: 'secret',
});

const result = await SqlContracts.user.findById({ userId: 1 }, pool);
```

`pg.Pool` and `pg.Client` both expose a `query(text, values)` method returning `{ rows }`, satisfying `PoolLike` directly.

### pgBouncer via node-postgres

Connection strings routed through pgBouncer are transparent to the runtime. The pool object itself is still a `pg.Pool` instance; the adapter does not interact with the connection broker layer.

### Serverless / Lambda-compatible pools

Lightweight wrappers such as `@neondatabase/serverless` and `serverless-postgres` expose the same `query` interface and are compatible without modification.

### Custom or wrapped pools

Any wrapper that delegates to an underlying `pg`-compatible client and forwards the `query(sql, params)` return value satisfies the interface. Middleware pools that add logging, metrics, or retry logic are compatible provided they preserve the `{ rows }` response shape.

---

## Usage Pattern

The pool is passed per-call rather than being captured at initialization time. This is a deliberate architectural choice:

```typescript
// Pool is passed at the call site, not stored in a closure
const users = await SqlContracts.user.findAllActive({}, pool);
const orders = await SqlContracts.orders.getByUser({ userId: 1 }, pool);
```

This means the caller retains full control over:

- **Pool selection**: Different pools (e.g., read replica vs. primary) can be passed to different calls.
- **Transaction scope**: A `pg.PoolClient` checked out from a pool — which also satisfies `PoolLike` — can be passed to bundle multiple calls within a single transaction.
- **Connection lifecycle**: Acquisition, release, and idle timeouts are the sole responsibility of the application layer.

---

## Transaction Support

Because the runtime accepts any `PoolLike`, a checked-out `pg.PoolClient` operating within a transaction can be passed directly:

```typescript
const client = await pool.connect();
try {
  await client.query('BEGIN');

  await SqlContracts.orders.insert({ userId: 1, amount: 99.99 }, client);
  await SqlContracts.inventory.decrement({ productId: 42, qty: 1 }, client);

  await client.query('COMMIT');
} catch (err) {
  await client.query('ROLLBACK');
  throw err;
} finally {
  client.release();
}
```

`pg.PoolClient` satisfies `PoolLike` because its `query` method has the same signature. The runtime is unaware that a transaction is in progress — it simply calls `pool.query()` on whatever object is provided.

---

## What the Runtime Does Not Own

The runtime makes no assumptions about and takes no responsibility for:

| Concern | Responsibility |
|---|---|
| Connection pool sizing | Application / infrastructure |
| Connection string management | Application configuration |
| SSL/TLS configuration | Pool instance setup |
| Retry on connection failure | Pool implementation or application |
| Query timeouts | Pool or `pg` client configuration |
| Row mapping or transformation | Application layer |
| Connection release | Application layer (for `PoolClient`) |

The generated methods call `pool.query()` once per invocation and return `result.rows`. Everything outside that boundary is out of scope.

---

## Error Handling

Errors thrown by `pool.query()` propagate unmodified to the caller. The runtime does not catch database errors, wrap them in custom error types, or add retry logic. This means:

- **`pg` error codes** (`23505` for unique violation, `23503` for foreign key violation, etc.) are available on the thrown error object.
- **Connection errors** (e.g., pool exhaustion, network failure) surface directly.
- **Query syntax errors** from malformed generated SQL are programming errors that should be caught during development and testing, not at runtime.

Application code is responsible for catching and handling database errors at the appropriate boundary.

---

## Providing a Typed Pool

For applications that prefer explicit typing, the pool argument type can be imported from the generated package:

```typescript
import type { PoolLike } from 'generated-package';
```

This allows application code to declare pool-accepting utilities without importing a specific `pg` type, preserving the same implementation-agnostic contract at the application layer.

---

## Future Considerations

The runtime package scaffolding includes placeholder files (`pool-adapter.ts`, `query-executor.ts`, `sql-contracts.ts`) that are currently not populated — the runtime is generated entirely by the compiler rather than shipped as a static package dependency. If a shared runtime base is introduced in a future version, these files provide the intended extension points for:

- A shared `PoolLike` type definition
- A common query execution wrapper
- A base `SqlContracts` factory

Until that point, the interface is embedded directly in the generated output and requires no external runtime package.
