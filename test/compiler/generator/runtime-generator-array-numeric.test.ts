import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { generateRuntimeFile, generateRuntimeJs } from "../../../packages/compiler/src/generator/runtime-generator";
import { RootContractAst } from "../../../packages/types/src/contract/contract-root";
import { ContractNode } from "../../../packages/types/src/contract/contract-node";

function functionNode(overrides: Partial<ContractNode> = {}): ContractNode {
    return {
        type: "functions",
        name: "findCompanyRepresentatives",
        namespace: ["company"],
        filePath: "sql/functions/company/find-company-representatives.sql",
        sql: "SELECT * FROM company_representatives WHERE company_id = $1",
        params: [],
        result: [],
        ...overrides,
    };
}

describe("generateRuntimeFile — array and NUMERIC result columns", () => {
    it("wraps an array-of-enum result column in __toArray", async () => {
        const ast: RootContractAst = {
            tables: {},
            functions: {
                company: {
                    findCompanyRepresentatives: functionNode({
                        result: [{ name: "positions", type: "representative_position_enum[]" }],
                    }),
                },
            },
            procedures: {},
        };

        const output = await generateRuntimeFile(ast);

        assert.match(output, /__toArray\(row\.positions\)/);
    });

    it("wraps a NUMERIC result column in __toNumber", async () => {
        const ast: RootContractAst = {
            tables: {},
            functions: {
                company: {
                    findCompanyRepresentatives: functionNode({
                        result: [{ name: "shareholder_ownership_percent", type: "numeric" }],
                    }),
                },
            },
            procedures: {},
        };

        const output = await generateRuntimeFile(ast);

        assert.match(output, /__toNumber\(row\.shareholder_ownership_percent\)/);
    });

    it("combines __toArray and __toNumber for a NUMERIC[] result column", async () => {
        const ast: RootContractAst = {
            tables: {},
            functions: {
                company: {
                    findCompanyRepresentatives: functionNode({
                        result: [{ name: "scores", type: "numeric[]" }],
                    }),
                },
            },
            procedures: {},
        };

        const output = await generateRuntimeFile(ast);

        assert.match(output, /__toArray\(row\.scores\)\?\.map\(__toNumber\) \?\? null/);
    });

    it("leaves a JSON(B) array result column untouched", async () => {
        const ast: RootContractAst = {
            tables: {},
            functions: {
                company: {
                    findCompanyRepresentatives: functionNode({
                        result: [{ name: "blobs", type: "jsonb[]" }],
                    }),
                },
            },
            procedures: {},
        };

        const output = await generateRuntimeFile(ast);

        assert.doesNotMatch(output, /__toArray\(row\.blobs\)/);
    });

    it("does not wrap a plain TEXT or BOOLEAN result column", async () => {
        const ast: RootContractAst = {
            tables: {},
            functions: {
                company: {
                    findCompanyRepresentatives: functionNode({
                        result: [
                            { name: "first_name", type: "text" },
                            { name: "is_pep", type: "boolean" },
                        ],
                    }),
                },
            },
            procedures: {},
        };

        const output = await generateRuntimeFile(ast);

        assert.doesNotMatch(output, /row\.first_name\)/);
        assert.doesNotMatch(output, /row\.is_pep\)/);
    });

    it("passes an array/NUMERIC parameter through untouched (pg already serializes those on write)", async () => {
        const ast: RootContractAst = {
            tables: {},
            functions: {},
            procedures: {
                company: {
                    createCompanyRepresentative: functionNode({
                        type: "procedures",
                        name: "createCompanyRepresentative",
                        params: [
                            { name: "company_representatives_positions", type: "representative_position_enum[]" },
                            { name: "company_representatives_shareholder_ownership_percent", type: "numeric" },
                        ],
                    }),
                },
            },
        };

        const output = await generateRuntimeFile(ast);

        assert.match(output, /\[params\.companyRepresentativesPositions, params\.companyRepresentativesShareholderOwnershipPercent\]/);
    });

    it("applies the same transforms in the plain-JS runtime output", async () => {
        const ast: RootContractAst = {
            tables: {},
            functions: {
                company: {
                    findCompanyRepresentatives: functionNode({
                        result: [{ name: "positions", type: "representative_position_enum[]" }],
                    }),
                },
            },
            procedures: {},
        };

        const output = await generateRuntimeJs(ast);

        assert.match(output, /__toArray\(row\.positions\)/);
    });
});
