import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { generateTypesFile } from "../../../packages/compiler/src/generator/types-generator";
import { RootContractAst } from "../../../packages/types/src/contract/contract-root";
import { ContractNode } from "../../../packages/types/src/contract/contract-node";
import type { EnumRegistry } from "../../../packages/types/src/schema/enum-registry";

function tableNode(overrides: Partial<ContractNode> = {}): ContractNode {
    return {
        type: "tables",
        name: "users",
        namespace: [],
        filePath: "sql/tables/users.sql",
        sql: "",
        params: [],
        result: [{ name: "id", type: "string" }],
        ...overrides,
    };
}

function functionNode(overrides: Partial<ContractNode> = {}): ContractNode {
    return {
        type: "functions",
        name: "findUserById",
        namespace: ["user"],
        filePath: "sql/functions/user/find-user-by-id.sql",
        sql: "SELECT * FROM users",
        params: [],
        result: [{ name: "id", type: "string" }],
        ...overrides,
    };
}

describe("generateTypesFile — enum support", () => {
    it("passes through a table column already pre-resolved to a string-literal union by parseTableSql", async () => {
        const ast: RootContractAst = {
            tables: {
                users: tableNode({
                    result: [{ name: "status", type: "'active' | 'blocked' | 'pending'" }],
                }),
            },
            functions: {},
            procedures: {},
        };

        const output = await generateTypesFile(ast);

        assert.match(output, /status: 'active' \| 'blocked' \| 'pending';/);
        assert.equal(output.includes("status: any"), false);
    });

    it("resolves a raw enum type name on a function parameter when given a matching registry", async () => {
        const ast: RootContractAst = {
            tables: {},
            functions: {
                user: {
                    findUserById: functionNode({
                        params: [{ name: "users_status", type: "user_status" }],
                    }),
                },
            },
            procedures: {},
        };

        const enumRegistry: EnumRegistry = { user_status: ["active", "blocked", "pending"] };
        const output = await generateTypesFile(ast, enumRegistry);

        assert.match(output, /usersStatus: 'active' \| 'blocked' \| 'pending';/);
    });

    it("falls back to 'any' for an unknown raw type when no registry entry matches", async () => {
        const ast: RootContractAst = {
            tables: {},
            functions: {
                user: {
                    findUserById: functionNode({
                        params: [{ name: "users_status", type: "some_unknown_enum" }],
                    }),
                },
            },
            procedures: {},
        };

        const output = await generateTypesFile(ast, {});

        assert.match(output, /usersStatus: any;/);
    });
});
