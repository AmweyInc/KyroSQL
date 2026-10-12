import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { generateRuntimeJs } from "../../../packages/compiler/src/generator/runtime-generator";
import { RootContractAst } from "../../../packages/types/src/contract/contract-root";
import { ContractNode } from "../../../packages/types/src/contract/contract-node";

/**
 * The other runtime-generator tests only assert on the generated *source text*
 * (e.g. that "__toArray(row.positions)" appears). This test actually executes
 * the generated JS against a fake pg pool returning raw, unparsed values exactly
 * as node-postgres would (array literal strings, numeric-as-string), to prove
 * __toArray/__toNumber really transform them, not just that the call is present.
 *
 * Uses `new Function` (runs in this realm) rather than node:vm's createContext
 * (a separate realm, whose Array/Object aren't reference-equal to this file's
 * for assert.deepEqual, even when structurally identical).
 */
function loadGeneratedSqlContracts(source: string): any {
    const module = { exports: {} as any };
    new Function("module", "exports", source)(module, module.exports);
    return module.exports.SqlContracts;
}

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

describe("generated runtime output — actually executed against raw pg-shaped rows", () => {
    it("parses an enum[] array literal, a NUMERIC[] literal, a NUMERIC scalar, an epoch-ms BIGINT, and leaves TEXT alone", async () => {
        const ast: RootContractAst = {
            tables: {},
            functions: {
                company: {
                    findCompanyRepresentatives: functionNode({
                        result: [
                            { name: "first_name", type: "text" },
                            { name: "positions", type: "representative_position_enum[]" },
                            { name: "ubo_funds_source", type: "ubo_funds_source_enum[]" },
                            { name: "shareholder_ownership_percent", type: "numeric" },
                            { name: "scores", type: "numeric[]" },
                            { name: "created_at", type: "bigint" },
                        ],
                    }),
                },
            },
            procedures: {},
        };

        const source = await generateRuntimeJs(ast);
        const SqlContracts = loadGeneratedSqlContracts(source);

        const rawRow = {
            first_name: "Jane",
            positions: "{director,board_member}",
            ubo_funds_source: "{salary_honorary,dividends_interests}",
            shareholder_ownership_percent: "12.50",
            scores: "{1.5,2.5}",
            created_at: "1700000000000",
        };
        const fakePool = { query: async () => ({ rows: [rawRow] }) };

        const [row] = await SqlContracts.Company.findCompanyRepresentatives({}, fakePool);

        assert.equal(row.first_name, "Jane");
        assert.deepEqual(row.positions, ["director", "board_member"]);
        assert.deepEqual(row.ubo_funds_source, ["salary_honorary", "dividends_interests"]);
        assert.equal(row.shareholder_ownership_percent, 12.5);
        assert.equal(typeof row.shareholder_ownership_percent, "number");
        assert.deepEqual(row.scores, [1.5, 2.5]);
        assert.ok(row.scores.every((n: unknown) => typeof n === "number"));
        assert.ok(row.created_at instanceof Date);
        assert.equal(row.created_at.getTime(), 1700000000000);
    });

    it("passes through null array/numeric columns as null instead of throwing", async () => {
        const ast: RootContractAst = {
            tables: {},
            functions: {
                company: {
                    findCompanyRepresentatives: functionNode({
                        result: [
                            { name: "positions", type: "representative_position_enum[]" },
                            { name: "shareholder_ownership_percent", type: "numeric" },
                        ],
                    }),
                },
            },
            procedures: {},
        };

        const source = await generateRuntimeJs(ast);
        const SqlContracts = loadGeneratedSqlContracts(source);
        const fakePool = {
            query: async () => ({ rows: [{ positions: null, shareholder_ownership_percent: null }] }),
        };

        const [row] = await SqlContracts.Company.findCompanyRepresentatives({}, fakePool);

        assert.equal(row.positions, null);
        assert.equal(row.shareholder_ownership_percent, null);
    });

    it("parses an empty Postgres array literal '{}' into an empty array, not [''])", async () => {
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

        const source = await generateRuntimeJs(ast);
        const SqlContracts = loadGeneratedSqlContracts(source);
        const fakePool = { query: async () => ({ rows: [{ positions: "{}" }] }) };

        const [row] = await SqlContracts.Company.findCompanyRepresentatives({}, fakePool);

        assert.deepEqual(row.positions, []);
    });
});
