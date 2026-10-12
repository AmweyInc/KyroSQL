import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseCommentStatements } from "../../../packages/compiler/src/parser/parse-comment-sql";

describe("parseCommentStatements", () => {
    it("returns empty structures when no COMMENT ON statements are present", () => {
        const result = parseCommentStatements("CREATE TABLE users (id UUID);");

        assert.deepEqual(result, { tables: {}, columns: {}, routines: {}, enums: {} });
    });

    it("parses a COMMENT ON TABLE statement", () => {
        const result = parseCommentStatements(
            `COMMENT ON TABLE users IS 'Registered application users';`
        );

        assert.equal(result.tables.users, "Registered application users");
    });

    it("parses multiple COMMENT ON COLUMN statements for the same table", () => {
        const sql = [
            `COMMENT ON COLUMN users.email IS 'Login email';`,
            `COMMENT ON COLUMN users.created_at IS 'Row creation timestamp';`,
        ].join("\n");

        const result = parseCommentStatements(sql);

        assert.deepEqual(result.columns.users, {
            email: "Login email",
            created_at: "Row creation timestamp",
        });
    });

    it("keeps column comments scoped to their own table", () => {
        const sql = [
            `COMMENT ON COLUMN users.id IS 'User primary key';`,
            `COMMENT ON COLUMN orders.id IS 'Order primary key';`,
        ].join("\n");

        const result = parseCommentStatements(sql);

        assert.equal(result.columns.users?.id, "User primary key");
        assert.equal(result.columns.orders?.id, "Order primary key");
    });

    it("parses COMMENT ON FUNCTION and COMMENT ON PROCEDURE statements", () => {
        const sql = [
            `COMMENT ON FUNCTION find_user_by_id(UUID) IS 'Looks up a user by id';`,
            `COMMENT ON PROCEDURE create_user(UUID, TEXT) IS 'Creates a new user';`,
        ].join("\n");

        const result = parseCommentStatements(sql);

        assert.equal(result.routines.find_user_by_id, "Looks up a user by id");
        assert.equal(result.routines.create_user, "Creates a new user");
    });

    it("unescapes doubled single quotes inside comment text", () => {
        const result = parseCommentStatements(
            `COMMENT ON COLUMN users.email IS 'User''s login email, unique';`
        );

        assert.equal(result.columns.users?.email, "User's login email, unique");
    });

    it("is case-insensitive and tolerates quoted identifiers", () => {
        const result = parseCommentStatements(
            `comment on table "users" is 'Registered application users';`
        );

        assert.equal(result.tables.users, "Registered application users");
    });

    it("parses a COMMENT ON TYPE statement for an enum", () => {
        const result = parseCommentStatements(
            `COMMENT ON TYPE user_status_enum IS 'Lifecycle state of a user account';`
        );

        assert.equal(result.enums.user_status_enum, "Lifecycle state of a user account");
    });

    it("unescapes doubled single quotes inside an enum comment", () => {
        const result = parseCommentStatements(
            `COMMENT ON TYPE user_status_enum IS '''active'' or ''blocked''';`
        );

        assert.equal(result.enums.user_status_enum, "'active' or 'blocked'");
    });
});
