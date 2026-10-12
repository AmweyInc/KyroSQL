import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { buildCommentsRegistry } from "../../../packages/core/src/schema/build-comments-registry";

describe("buildCommentsRegistry", () => {
    let dir: string;

    before(async () => {
        dir = await fs.mkdtemp(path.join(os.tmpdir(), "kyrosql-comments-"));

        await fs.writeFile(
            path.join(dir, "table.sql"),
            [
                `CREATE TABLE users (id UUID, email TEXT);`,
                `COMMENT ON TABLE users IS 'Registered application users';`,
                `COMMENT ON COLUMN users.email IS 'Login email';`,
            ].join("\n"),
        );

        await fs.writeFile(
            path.join(dir, "function.sql"),
            [
                `CREATE FUNCTION find_user_by_id(id UUID) RETURNS TABLE (id UUID) LANGUAGE plpgsql AS $$ BEGIN END; $$;`,
                `COMMENT ON FUNCTION find_user_by_id(UUID) IS 'Looks up a user by id';`,
            ].join("\n"),
        );

        await fs.writeFile(
            path.join(dir, "enum.sql"),
            [
                `CREATE TYPE user_status_enum AS ENUM ('active', 'blocked');`,
                `COMMENT ON TYPE user_status_enum IS 'Lifecycle state of a user account';`,
            ].join("\n"),
        );
    });

    after(async () => {
        await fs.rm(dir, { recursive: true, force: true });
    });

    it("merges comments from every file into one registry", async () => {
        const files = [
            path.join(dir, "table.sql"),
            path.join(dir, "function.sql"),
            path.join(dir, "enum.sql"),
        ];

        const registry = await buildCommentsRegistry(files);

        assert.equal(registry.tables.users, "Registered application users");
        assert.equal(registry.columns.users?.email, "Login email");
        assert.equal(registry.routines.find_user_by_id, "Looks up a user by id");
        assert.equal(registry.enums.user_status_enum, "Lifecycle state of a user account");
    });

    it("returns empty structures for an empty file list", async () => {
        const registry = await buildCommentsRegistry([]);

        assert.deepEqual(registry, { tables: {}, columns: {}, routines: {}, enums: {} });
    });
});
