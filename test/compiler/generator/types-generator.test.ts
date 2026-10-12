import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    generateTypesFile,
    generateTypesDts,
} from '../../../packages/compiler/src/generator/types-generator';
import type { RootContractAst } from '../../../packages/types/src/contract/contract-root';

function makeAst(overrides: Partial<RootContractAst> = {}): RootContractAst {
    return {
        functions: {},
        procedures: {},
        tables: {},
        ...overrides,
    };
}

const usersTableNode = {
    type: 'tables' as const,
    name: 'users',
    namespace: [],
    filePath: 'sql/tables/users.sql',
    sql: '',
    params: [],
    result: [
        { name: 'id', type: 'string' },
        { name: 'name', type: 'string' },
        { name: 'email', type: 'string' },
        { name: 'created_at', type: 'Date' },
    ],
};

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

const ast: RootContractAst = makeAst({
    tables: { users: usersTableNode },
    functions: { user: { findUserById: findUserNode } },
});

describe('generateTypesFile', () => {
    it('wraps everything in ISqlContracts namespace', async () => {
        const output = await generateTypesFile(ast);
        assert.ok(output.startsWith('export namespace ISqlContracts {'));
        assert.ok(output.trimEnd().endsWith('}'));
    });

    it('emits a table entity type (singularized)', async () => {
        const output = await generateTypesFile(ast);
        assert.ok(output.includes('export type User = {'));
    });

    it('emits table column types', async () => {
        const output = await generateTypesFile(ast);
        assert.ok(output.includes('id: string'));
        assert.ok(output.includes('created_at: Date'));
    });

    it('emits function namespace', async () => {
        const output = await generateTypesFile(ast);
        assert.ok(output.includes('export namespace User {'));
    });

    it('emits function return type', async () => {
        const output = await generateTypesFile(ast);
        assert.ok(output.includes('export type findUserById = {'));
    });

    it('emits params sub-namespace', async () => {
        const output = await generateTypesFile(ast);
        assert.ok(output.includes('export namespace findUserById {'));
        assert.ok(output.includes('export type params = {'));
    });

    it('maps param SQL types to TypeScript types', async () => {
        const output = await generateTypesFile(ast);
        assert.ok(output.includes('pUserId: string') || output.includes('p_user_id: string'));
    });

    it('uses Record<string, never> for functions with no params', async () => {
        const noParamNode = { ...findUserNode, params: [], name: 'listUsers' };
        const output = await generateTypesFile(makeAst({
            functions: { user: { listUsers: noParamNode } },
        }));
        assert.ok(output.includes('export type params = Record<string, never>'));
    });

    it('uses Record<string, unknown> for functions with no result', async () => {
        const noResultNode = { ...findUserNode, result: [], name: 'deleteUser' };
        const output = await generateTypesFile(makeAst({
            functions: { user: { deleteUser: noResultNode } },
        }));
        assert.ok(output.includes('export type deleteUser = Record<string, unknown>'));
    });
});

describe('generateTypesDts', () => {
    it('uses declare namespace instead of namespace', async () => {
        const output = await generateTypesDts(ast);
        assert.ok(output.includes('export declare namespace ISqlContracts {'));
    });
});

describe("generateTypesFile — COMMENT ON JSDoc emission", () => {
    function tableNode(overrides: Partial<typeof usersTableNode> = {}) {
        return {
            type: "tables" as const,
            name: "users",
            namespace: [],
            filePath: "sql/tables/users.sql",
            sql: "",
            params: [],
            result: [{ name: "id", type: "string" }],
            ...overrides,
        };
    }

    function functionNode(overrides: Partial<typeof findUserNode> = {}) {
        return {
            type: "functions" as const,
            name: "findUserById",
            namespace: ["user"],
            filePath: "sql/functions/user/find-user-by-id.sql",
            sql: "SELECT * FROM users",
            params: [],
            result: [{ name: "id", type: "string" }],
            ...overrides,
        };
    }

    it("emits no JSDoc when no comments are present", async () => {
        const commentAst: RootContractAst = {
            tables: { users: tableNode() },
            functions: {},
            procedures: {},
        };

        const output = await generateTypesFile(commentAst);

        assert.equal(output.includes("/**"), false);
    });

    it("emits a JSDoc block above a commented table type", async () => {
        const commentAst: RootContractAst = {
            tables: { users: tableNode({ comment: "Registered application users" }) },
            functions: {},
            procedures: {},
        };

        const output = await generateTypesFile(commentAst);
        const lines = output.split("\n");
        const typeLineIndex = lines.findIndex(l => l.includes("export type User"));

        assert.equal(lines[typeLineIndex - 1]?.trim(), "/** Registered application users */");
    });

    it("emits a JSDoc block above a commented column", async () => {
        const commentAst: RootContractAst = {
            tables: {
                users: tableNode({
                    result: [{ name: "email", type: "string", comment: "Login email, unique" }],
                }),
            },
            functions: {},
            procedures: {},
        };

        const output = await generateTypesFile(commentAst);
        const lines = output.split("\n");
        const fieldLineIndex = lines.findIndex(l => l.includes("email: string;"));

        assert.equal(lines[fieldLineIndex - 1]?.trim(), "/** Login email, unique */");
    });

    it("emits a JSDoc block above a commented function's result type", async () => {
        const commentAst: RootContractAst = {
            tables: {},
            functions: {
                user: {
                    findUserById: functionNode({ comment: "Looks up a single user by primary key" }),
                },
            },
            procedures: {},
        };

        const output = await generateTypesFile(commentAst);
        const lines = output.split("\n");
        const typeLineIndex = lines.findIndex(l => l.includes("export type findUserById"));

        assert.equal(lines[typeLineIndex - 1]?.trim(), "/** Looks up a single user by primary key */");
    });

    it("collapses newlines/whitespace and escapes a stray */ inside a comment", async () => {
        const commentAst: RootContractAst = {
            tables: {
                users: tableNode({ comment: "Multi\n  line   comment with */ inside" }),
            },
            functions: {},
            procedures: {},
        };

        const output = await generateTypesFile(commentAst);

        assert.match(output, /\/\*\* Multi line comment with \*\\\/ inside \*\//);
    });
});
