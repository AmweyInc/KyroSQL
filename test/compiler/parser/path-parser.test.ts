import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parsePath } from '../../../packages/compiler/src/parser/path-parser';

describe('parsePath', () => {
    it('parses a function path with namespace', () => {
        const result = parsePath('sql/functions/user/find-user-by-id.sql');
        assert.equal(result.layer, 'functions');
        assert.deepEqual(result.namespace, ['user']);
        assert.equal(result.name, 'findUserById');
    });

    it('parses a procedure path with namespace', () => {
        const result = parsePath('sql/procedures/user/create-user.sql');
        assert.equal(result.layer, 'procedures');
        assert.deepEqual(result.namespace, ['user']);
        assert.equal(result.name, 'createUser');
    });

    it('parses a table path (no namespace)', () => {
        const result = parsePath('sql/tables/users.sql');
        assert.equal(result.layer, 'tables');
        assert.deepEqual(result.namespace, []);
        assert.equal(result.name, 'users');
    });

    it('converts kebab-case file name to camelCase', () => {
        const result = parsePath('sql/functions/order/find-all-orders-by-user.sql');
        assert.equal(result.name, 'findAllOrdersByUser');
    });

    it('converts kebab-case folder name to camelCase', () => {
        const result = parsePath('sql/functions/user-profile/get-profile.sql');
        assert.equal(result.namespace[0], 'userProfile');
    });

    it('handles Windows backslash paths', () => {
        const result = parsePath('sql\\functions\\user\\find-user-by-id.sql');
        assert.equal(result.layer, 'functions');
        assert.equal(result.name, 'findUserById');
    });

    it('preserves fullPath as normalized forward-slash path', () => {
        const result = parsePath('sql/functions/user/find-user-by-id.sql');
        assert.ok(!result.fullPath.includes('\\'));
    });

    it('supports deep nested namespaces', () => {
        const result = parsePath('sql/functions/admin/reports/get-report.sql');
        assert.deepEqual(result.namespace, ['admin', 'reports']);
        assert.equal(result.name, 'getReport');
    });

    it('parses an enums path (no namespace)', () => {
        const result = parsePath('sql/enums/user-status.sql');
        assert.equal(result.layer, 'enums');
        assert.deepEqual(result.namespace, []);
        assert.equal(result.name, 'userStatus');
    });

    it('throws when layer directory is missing', () => {
        assert.throws(
            () => parsePath('some/random/path/file.sql'),
            /Invalid SQL contract path/i
        );
    });

    it('throws when file name is missing after layer', () => {
        assert.throws(
            () => parsePath('sql/functions'),
            /Missing SQL contract file name/i
        );
    });
});
