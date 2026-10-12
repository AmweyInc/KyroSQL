import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isContractNode } from '../../packages/utils/is-contract-node';

describe('isContractNode', () => {
    it('returns true when object has a sql property', () => {
        assert.equal(isContractNode({ sql: 'SELECT 1', params: [], result: [] }), true);
    });

    it('returns true even when sql is an empty string', () => {
        assert.equal(isContractNode({ sql: '' }), true);
    });

    it('returns false when sql property is absent', () => {
        assert.equal(isContractNode({ name: 'user', nested: {} }), false);
    });

    it('returns falsy for null', () => {
        assert.ok(!isContractNode(null));
    });

    it('returns falsy for undefined', () => {
        assert.ok(!isContractNode(undefined));
    });

    it('returns false for empty object', () => {
        assert.equal(isContractNode({}), false);
    });

    it('returns false for a plain namespace tree node', () => {
        assert.equal(isContractNode({ findUser: { sql: 'SELECT 1' } }), false);
    });
});
