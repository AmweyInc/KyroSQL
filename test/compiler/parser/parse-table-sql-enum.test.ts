import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseTableSql } from "../../../packages/compiler/src/parser/parse-table-sql";
import type { EnumRegistry } from "../../../packages/types/src/schema/enum-registry";

describe("parseTableSql — enum type resolution", () => {
    const enumRegistry: EnumRegistry = {
        user_status: ["active", "blocked", "pending"],
    };

    it("maps a column typed with a known enum to a TS string-literal union", () => {
        const table = parseTableSql(
            `CREATE TABLE users (
                id UUID PRIMARY KEY,
                status user_status NOT NULL
            );`,
            enumRegistry
        );

        assert.equal(table.columns.find(c => c.name === "status")?.type, "'active' | 'blocked' | 'pending'");
    });

    it("falls back to 'any' for an unrecognized type when no registry entry matches", () => {
        const table = parseTableSql(
            `CREATE TABLE users (
                id UUID PRIMARY KEY,
                status some_unknown_type NOT NULL
            );`,
            enumRegistry
        );

        assert.equal(table.columns.find(c => c.name === "status")?.type, "any");
    });

    it("resolves an array-of-enum column with the array suffix preserved", () => {
        const table = parseTableSql(
            `CREATE TABLE users (
                id UUID PRIMARY KEY,
                statuses user_status[] NOT NULL
            );`,
            enumRegistry
        );

        assert.equal(table.columns.find(c => c.name === "statuses")?.type, "'active' | 'blocked' | 'pending'[]");
    });

    it("still maps built-in types normally when a registry is provided", () => {
        const table = parseTableSql(
            `CREATE TABLE users (
                id UUID PRIMARY KEY,
                email TEXT NOT NULL
            );`,
            enumRegistry
        );

        assert.equal(table.columns.find(c => c.name === "email")?.type, "string");
    });

    it("behaves exactly as before when no registry is passed at all", () => {
        const table = parseTableSql(`CREATE TABLE users (
            id UUID PRIMARY KEY,
            status TEXT NOT NULL
        );`);

        assert.equal(table.columns.find(c => c.name === "status")?.type, "string");
    });
});
