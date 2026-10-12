import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { extractSqlParams } from '../../../packages/compiler/src/parser/extract-sql-params';

describe('extractSqlParams', () => {
    it('returns empty array when no params', () => {
        const result = extractSqlParams('SELECT * FROM users');
        assert.deepEqual(result, []);
    });

    it('extracts a single param', () => {
        const result = extractSqlParams('SELECT * FROM users WHERE id = :userId');
        assert.deepEqual(result, [{ name: 'userId', position: 1 }]);
    });

    it('extracts multiple params in order', () => {
        const result = extractSqlParams('INSERT INTO users (name, email) VALUES (:name, :email)');
        assert.deepEqual(result, [
            { name: 'name', position: 1 },
            { name: 'email', position: 2 },
        ]);
    });

    it('deduplicates repeated param names', () => {
        const result = extractSqlParams('SELECT * FROM users WHERE id = :id OR parent_id = :id');
        assert.deepEqual(result, [{ name: 'id', position: 1 }]);
    });

    it('assigns sequential positions to distinct params', () => {
        const result = extractSqlParams(':a AND :b AND :c');
        assert.equal(result[0]!.position, 1);
        assert.equal(result[1]!.position, 2);
        assert.equal(result[2]!.position, 3);
    });

    it('supports underscore and digit in param names', () => {
        const result = extractSqlParams('WHERE created_at > :start_date AND count > :count2');
        assert.equal(result[0]!.name, 'start_date');
        assert.equal(result[1]!.name, 'count2');
    });
});
