import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseSelect } from '../../../packages/compiler/src/parser/extract-sql-result';

describe('parseSelect', () => {
    it('parses a basic SELECT with FROM', () => {
        const result = parseSelect('SELECT id, name FROM users');
        assert.equal(result.from, 'users');
        assert.equal(result.columns.length, 2);
        assert.equal(result.columns[0]!.name, 'id');
        assert.equal(result.columns[1]!.name, 'name');
    });

    it('handles SELECT * as a single wildcard column', () => {
        const result = parseSelect('SELECT * FROM users');
        assert.equal(result.from, 'users');
        assert.equal(result.columns[0]!.name, '*');
    });

    it('parses columns with AS alias', () => {
        const result = parseSelect('SELECT id AS user_id, name AS user_name FROM accounts');
        assert.equal(result.columns[0]!.alias, 'user_id');
        assert.equal(result.columns[1]!.alias, 'user_name');
    });

    it('extracts FROM table name correctly', () => {
        const result = parseSelect('SELECT a, b FROM my_table WHERE x = 1');
        assert.equal(result.from, 'my_table');
    });

    it('normalizes whitespace before parsing', () => {
        const result = parseSelect('SELECT  id ,  name   FROM   users');
        assert.equal(result.columns.length, 2);
        assert.equal(result.from, 'users');
    });

    it('throws on SQL without FROM', () => {
        assert.throws(
            () => parseSelect('SELECT 1 + 1'),
            /Invalid SELECT query/i
        );
    });
});
