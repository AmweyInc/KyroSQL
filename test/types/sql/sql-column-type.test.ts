import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mapSqlType } from '../../../packages/types/src/sql/sql-column-type';

describe('mapSqlType', () => {
    it('maps integer types to number', () => {
        assert.equal(mapSqlType('int'), 'number');
        assert.equal(mapSqlType('integer'), 'number');
        assert.equal(mapSqlType('smallint'), 'number');
        assert.equal(mapSqlType('bigint'), 'number');
        assert.equal(mapSqlType('serial'), 'number');
    });

    it('maps float/decimal types to number', () => {
        assert.equal(mapSqlType('float'), 'number');
        assert.equal(mapSqlType('double'), 'number');
        assert.equal(mapSqlType('numeric'), 'number');
        assert.equal(mapSqlType('decimal'), 'number');
    });

    it('maps string types', () => {
        assert.equal(mapSqlType('text'), 'string');
        assert.equal(mapSqlType('varchar'), 'string');
        assert.equal(mapSqlType('char'), 'string');
        assert.equal(mapSqlType('character'), 'string');
        assert.equal(mapSqlType('name'), 'string');
        assert.equal(mapSqlType('uuid'), 'string');
    });

    it('maps boolean', () => {
        assert.equal(mapSqlType('bool'), 'boolean');
        assert.equal(mapSqlType('boolean'), 'boolean');
    });

    it('maps date/time types to Date', () => {
        assert.equal(mapSqlType('timestamp'), 'Date');
        assert.equal(mapSqlType('date'), 'Date');
        assert.equal(mapSqlType('time'), 'Date');
    });

    it('maps json types to any', () => {
        assert.equal(mapSqlType('json'), 'any');
        assert.equal(mapSqlType('jsonb'), 'any');
    });

    it('returns any for unknown types', () => {
        assert.equal(mapSqlType('unknown_type'), 'any');
        assert.equal(mapSqlType(''), 'any');
    });

    it('is case-insensitive', () => {
        assert.equal(mapSqlType('TEXT'), 'string');
        assert.equal(mapSqlType('INTEGER'), 'number');
        assert.equal(mapSqlType('BOOLEAN'), 'boolean');
        assert.equal(mapSqlType('TIMESTAMP'), 'Date');
    });

    it('maps a bigint column ending in _at to Date (epoch-ms convention)', () => {
        assert.equal(mapSqlType('bigint', 'created_at'), 'Date');
        assert.equal(mapSqlType('int8', 'updated_at'), 'Date');
    });

    it('does not apply the epoch convention to a bigint column not ending in _at', () => {
        assert.equal(mapSqlType('bigint', 'counter'), 'number');
    });

    it('maps array types by recursing into the element type', () => {
        assert.equal(mapSqlType('text[]'), 'string[]');
        assert.equal(mapSqlType('int[]'), 'number[]');
        assert.equal(mapSqlType('uuid[][]'), 'string[][]');
    });

    it('resolves an enum type against a provided registry', () => {
        const result = mapSqlType('user_status', undefined, { user_status: ['active', 'blocked', 'pending'] });
        assert.equal(result, "'active' | 'blocked' | 'pending'");
    });
});
