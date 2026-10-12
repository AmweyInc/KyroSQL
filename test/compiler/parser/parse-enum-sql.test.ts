import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isEnumTypeSql, parseEnumTypeSql } from "../../../packages/compiler/src/parser/parse-enum-sql";

describe("parseEnumTypeSql", () => {
    it("recognizes a CREATE TYPE ... AS ENUM statement", () => {
        assert.equal(isEnumTypeSql(`CREATE TYPE user_status AS ENUM ('active', 'blocked', 'pending');`), true);
    });

    it("does not recognize a CREATE TABLE statement", () => {
        assert.equal(isEnumTypeSql(`CREATE TABLE users (id UUID PRIMARY KEY);`), false);
    });

    it("extracts the type name and values", () => {
        const result = parseEnumTypeSql(`CREATE TYPE user_status AS ENUM ('active', 'blocked', 'pending');`);
        assert.equal(result.name, "user_status");
        assert.deepEqual(result.values, ["active", "blocked", "pending"]);
    });

    it("unescapes doubled single quotes inside a value", () => {
        const result = parseEnumTypeSql(`CREATE TYPE tricky AS ENUM ('can''t stop');`);
        assert.deepEqual(result.values, ["can't stop"]);
    });

    it("strips double-quoted identifiers from the type name", () => {
        const result = parseEnumTypeSql(`CREATE TYPE "user_status" AS ENUM ('active');`);
        assert.equal(result.name, "user_status");
    });
});
