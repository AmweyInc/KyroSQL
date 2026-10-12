import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseTableSql } from '../../../packages/compiler/src/parser/parse-table-sql';

const USERS_TABLE_SQL = `
CREATE TABLE users (
    id UUID PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);
`.trim();

describe('parseTableSql', () => {
    it('extracts the table name', () => {
        const result = parseTableSql(USERS_TABLE_SQL);
        assert.equal(result.tableName, 'users');
    });

    it('parses all columns', () => {
        const result = parseTableSql(USERS_TABLE_SQL);
        assert.equal(result.columns.length, 4);
    });

    it('maps column names correctly', () => {
        const result = parseTableSql(USERS_TABLE_SQL);
        const names = result.columns.map(c => c.name);
        assert.deepEqual(names, ['id', 'name', 'email', 'created_at']);
    });

    it('maps SQL types to TypeScript types', () => {
        const result = parseTableSql(USERS_TABLE_SQL);
        assert.equal(result.columns[0]!.type, 'string');
        assert.equal(result.columns[1]!.type, 'string');
        assert.equal(result.columns[3]!.type, 'Date');
    });

    it('handles a simple two-column table', () => {
        const sql = 'CREATE TABLE products (id INTEGER, price NUMERIC)';
        const result = parseTableSql(sql);
        assert.equal(result.tableName, 'products');
        assert.equal(result.columns[0]!.name, 'id');
        assert.equal(result.columns[0]!.type, 'number');
        assert.equal(result.columns[1]!.name, 'price');
        assert.equal(result.columns[1]!.type, 'number');
    });

    it('throws on invalid CREATE TABLE SQL', () => {
        assert.throws(
            () => parseTableSql('SELECT 1'),
            /Invalid CREATE TABLE SQL/i
        );
    });
});

describe("parseTableSql — COMMENT ON support", () => {
    it("leaves table and columns without a comment field when none are declared", () => {
        const table = parseTableSql(`
            CREATE TABLE users (
                id UUID PRIMARY KEY,
                email TEXT NOT NULL
            );
        `);

        assert.equal(table.comment, undefined);
        assert.equal(table.columns.find(c => c.name === "email")?.comment, undefined);
    });

    it("attaches a table-level comment from COMMENT ON TABLE", () => {
        const table = parseTableSql(`
            CREATE TABLE users (
                id UUID PRIMARY KEY
            );

            COMMENT ON TABLE users IS 'Registered application users';
        `);

        assert.equal(table.comment, "Registered application users");
    });

    it("attaches per-column comments from COMMENT ON COLUMN", () => {
        const table = parseTableSql(`
            CREATE TABLE users (
                id UUID PRIMARY KEY,
                email TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT NOW()
            );

            COMMENT ON COLUMN users.email IS 'User''s login email, unique';
            COMMENT ON COLUMN users.created_at IS 'Row creation timestamp';
        `);

        assert.equal(table.columns.find(c => c.name === "email")?.comment, "User's login email, unique");
        assert.equal(table.columns.find(c => c.name === "created_at")?.comment, "Row creation timestamp");
        assert.equal(table.columns.find(c => c.name === "id")?.comment, undefined);
    });

    it("ignores a COMMENT ON COLUMN for a column that doesn't exist on the table", () => {
        const table = parseTableSql(`
            CREATE TABLE users (
                id UUID PRIMARY KEY
            );

            COMMENT ON COLUMN users.nickname IS 'Does not exist';
        `);

        assert.equal(table.columns.length, 1);
        assert.equal(table.columns[0]!.comment, undefined);
    });

    it("ignores comments addressed to a different table", () => {
        const table = parseTableSql(`
            CREATE TABLE users (
                id UUID PRIMARY KEY
            );

            COMMENT ON TABLE orders IS 'Not this table';
            COMMENT ON COLUMN orders.id IS 'Not this column either';
        `);

        assert.equal(table.comment, undefined);
        assert.equal(table.columns[0]!.comment, undefined);
    });
});
