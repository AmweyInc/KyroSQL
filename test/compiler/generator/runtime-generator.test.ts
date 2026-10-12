import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    generateRuntimeFile,
    generateRuntimeJs,
    generateRuntimeDts,
} from '../../../packages/compiler/src/generator/runtime-generator';
import type { RootContractAst } from '../../../packages/types/src/contract/contract-root';

function makeAst(overrides: Partial<RootContractAst> = {}): RootContractAst {
    return {
        functions: {},
        procedures: {},
        tables: {},
        ...overrides,
    };
}

const findUserNode = {
    type: 'functions' as const,
    name: 'findUserById',
    namespace: ['user'],
    filePath: 'sql/functions/user/find-user-by-id.sql',
    sql: 'SELECT * FROM find_user_by_id($1)',
    params: [{ name: 'p_user_id', type: 'UUID', position: 1 }],
    result: [
        { name: 'id', type: 'string' },
        { name: 'name', type: 'string' },
    ],
};

const createUserNode = {
    type: 'procedures' as const,
    name: 'createUser',
    namespace: ['user'],
    filePath: 'sql/procedures/user/create-user.sql',
    sql: 'CALL create_user($1, $2)',
    params: [
        { name: 'p_id', type: 'UUID', position: 1 },
        { name: 'p_name', type: 'TEXT', position: 2 },
    ],
    result: [],
};

const ast: RootContractAst = makeAst({
    functions: { user: { findUserById: findUserNode } },
    procedures: { user: { createUser: createUserNode } },
});

describe('generateRuntimeFile (TypeScript source)', () => {
    it('includes SqlContracts export', async () => {
        const output = await generateRuntimeFile(ast);
        assert.ok(output.includes('export const SqlContracts'));
    });

    it('includes PoolLike type definition', async () => {
        const output = await generateRuntimeFile(ast);
        assert.ok(output.includes('PoolLike'));
    });

    it('generates async function for a SQL function', async () => {
        const output = await generateRuntimeFile(ast);
        assert.ok(output.includes('findUserById'));
        assert.ok(output.includes('async'));
        assert.ok(output.includes('pool.query'));
    });

    it('generates async function for a SQL procedure', async () => {
        const output = await generateRuntimeFile(ast);
        assert.ok(output.includes('createUser'));
    });

    it('groups methods under capitalized namespace', async () => {
        const output = await generateRuntimeFile(ast);
        assert.ok(output.includes('User:'));
    });

    it('passes param values as positional array', async () => {
        const output = await generateRuntimeFile(ast);
        assert.ok(output.includes('params.pUserId') || output.includes('params.p_user_id'));
    });
});

describe('generateRuntimeJs (CommonJS output)', () => {
    it('uses require-style exports', async () => {
        const output = await generateRuntimeJs(ast);
        assert.ok(output.includes('exports.SqlContracts'));
    });

    it('generates async function without TypeScript types', async () => {
        const output = await generateRuntimeJs(ast);
        assert.ok(output.includes('async (params, pool)'));
    });
});

describe('generateRuntimeDts (declaration file)', () => {
    it('uses declare keyword', async () => {
        const output = await generateRuntimeDts(ast);
        assert.ok(output.includes('declare const SqlContracts'));
    });

    it('generates typed function signatures', async () => {
        const output = await generateRuntimeDts(ast);
        assert.ok(output.includes('findUserById'));
        assert.ok(output.includes('Promise<'));
    });
});

describe('generateRuntimeFile — edge cases', () => {
    it('handles empty AST without throwing', async () => {
        const output = await generateRuntimeFile(makeAst());
        assert.ok(output.includes('SqlContracts'));
    });

    it('uses Record<string, never> for functions with no params', async () => {
        const noParamNode = { ...findUserNode, params: [], name: 'listUsers' };
        const output = await generateRuntimeFile(makeAst({
            functions: { user: { listUsers: noParamNode } },
        }));
        assert.ok(output.includes("Record<string, never>"));
    });
});
