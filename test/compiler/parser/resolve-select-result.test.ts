import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveSelectResult } from '../../../packages/compiler/src/parser/resolve-select-result';
import type { SchemaRegistry } from '../../../packages/types/src/schema/schema-register';

const schema: SchemaRegistry = {
    users: {
        tableName: 'users',
        columns: [
            { name: 'id', type: 'string' },
            { name: 'name', type: 'string' },
            { name: 'email', type: 'string' },
            { name: 'created_at', type: 'Date' },
        ],
    },
};

describe('resolveSelectResult', () => {
    it('resolves SELECT * from known table', () => {
        const result = resolveSelectResult('SELECT * FROM users', schema);
        assert.equal(result.length, 4);
        assert.equal(result[0]!.name, 'id');
        assert.equal(result[0]!.type, 'string');
        assert.equal(result[3]!.name, 'created_at');
        assert.equal(result[3]!.type, 'Date');
    });

    it('resolves named columns', () => {
        const result = resolveSelectResult('SELECT id, name FROM users', schema);
        assert.equal(result.length, 2);
        assert.equal(result[0]!.name, 'id');
        assert.equal(result[1]!.name, 'name');
    });

    it('returns any type for columns not found in schema', () => {
        const result = resolveSelectResult('SELECT unknown_col FROM users', schema);
        assert.equal(result[0]!.type, 'any');
    });

    it('returns empty array for SELECT * from unknown table', () => {
        const result = resolveSelectResult('SELECT * FROM products', schema);
        assert.deepEqual(result, []);
    });

    it('resolves RETURNING clause for INSERT', () => {
        const sql = 'INSERT INTO users (name) VALUES ($1) RETURNING id, name';
        const result = resolveSelectResult(sql, schema);
        assert.equal(result.length, 2);
        assert.equal(result[0]!.name, 'id');
    });

    it('resolves RETURNING * for INSERT', () => {
        const sql = 'INSERT INTO users (name) VALUES ($1) RETURNING *';
        const result = resolveSelectResult(sql, schema);
        assert.equal(result.length, 4);
    });

    it('returns empty array when no SELECT or RETURNING', () => {
        const result = resolveSelectResult('CALL do_something()', schema);
        assert.deepEqual(result, []);
    });

    it('handles column with table alias prefix', () => {
        const result = resolveSelectResult('SELECT u.id, u.name FROM users u', schema);
        assert.equal(result[0]!.name, 'id');
        assert.equal(result[0]!.type, 'string');
    });
});

describe("resolveSelectResult — comment propagation", () => {
    const schemaWithComments: SchemaRegistry = {
        users: {
            tableName: "users",
            comment: "Registered application users",
            columns: [
                { name: "id", type: "string" },
                { name: "email", type: "string", comment: "Login email, unique" },
            ],
        },
    };

    it("carries column comments from the schema when expanding SELECT *", () => {
        const result = resolveSelectResult("SELECT * FROM users", schemaWithComments);

        assert.deepEqual(result, [
            { name: "id", type: "string" },
            { name: "email", type: "string", comment: "Login email, unique" },
        ]);
    });

    it("carries the column comment for an explicit column list", () => {
        const result = resolveSelectResult("SELECT email FROM users", schemaWithComments);

        assert.deepEqual(result, [
            { name: "email", type: "string", comment: "Login email, unique" },
        ]);
    });

    it("omits the comment field for a column with no comment", () => {
        const result = resolveSelectResult("SELECT id FROM users", schemaWithComments);

        assert.deepEqual(result, [{ name: "id", type: "string" }]);
        assert.equal("comment" in result[0]!, false);
    });

    it("leaves an unknown column without a comment", () => {
        const result = resolveSelectResult("SELECT nickname FROM users", schemaWithComments);

        assert.deepEqual(result, [{ name: "nickname", type: "any" }]);
    });

    it("carries column comments through RETURNING *", () => {
        const result = resolveSelectResult("INSERT INTO users (id) VALUES ($1) RETURNING *", schemaWithComments);

        assert.deepEqual(result, [
            { name: "id", type: "string" },
            { name: "email", type: "string", comment: "Login email, unique" },
        ]);
    });
});
