import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { expandSelectStar } from '../../../packages/compiler/src/parser/expand-select';
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
    orders: {
        tableName: 'orders',
        columns: [
            { name: 'id', type: 'string' },
            { name: 'user_id', type: 'string' },
            { name: 'total', type: 'number' },
        ],
    },
};

describe('expandSelectStar', () => {
    it('expands SELECT * FROM known table', () => {
        const result = expandSelectStar('SELECT * FROM users', schema);
        assert.equal(result, 'SELECT id, name, email, created_at FROM users');
    });

    it('expands SELECT * from a different known table', () => {
        const result = expandSelectStar('SELECT * FROM orders', schema);
        assert.equal(result, 'SELECT id, user_id, total FROM orders');
    });

    it('leaves SELECT * intact for unknown table', () => {
        const result = expandSelectStar('SELECT * FROM products', schema);
        assert.equal(result, 'SELECT * FROM products');
    });

    it('does not modify SQL without SELECT *', () => {
        const sql = 'SELECT id, name FROM users';
        const result = expandSelectStar(sql, schema);
        assert.equal(result, sql);
    });

    it('expands RETURNING * for INSERT INTO known table', () => {
        const result = expandSelectStar(
            'INSERT INTO users (name) VALUES ($1) RETURNING *',
            schema
        );
        assert.ok(result.includes('RETURNING id, name, email, created_at'));
    });

    it('leaves RETURNING * intact when table is unknown', () => {
        const result = expandSelectStar(
            'INSERT INTO products (name) VALUES ($1) RETURNING *',
            schema
        );
        assert.ok(result.includes('RETURNING *'));
    });

    it('is case-insensitive for SELECT keyword', () => {
        const result = expandSelectStar('select * from users', schema);
        assert.ok(result.includes('id, name, email, created_at'));
    });
});
