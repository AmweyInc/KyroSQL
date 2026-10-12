import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseFunctionSql } from '../../../packages/compiler/src/parser/parse-function-sql';

const FIND_USER_SQL = `
CREATE OR REPLACE FUNCTION find_user_by_id(p_user_id UUID)
RETURNS TABLE (
    id UUID,
    name TEXT,
    email TEXT,
    created_at TIMESTAMP
)
LANGUAGE plpgsql AS $$
BEGIN
    RETURN QUERY
    SELECT id, name, email, created_at
    FROM users
    WHERE id = p_user_id;
END;
$$;
`.trim();

const CREATE_USER_SQL = `
CREATE OR REPLACE PROCEDURE create_user(
    p_id UUID,
    p_name TEXT,
    p_email TEXT
)
LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO users (id, name, email)
    VALUES (p_id, p_name, p_email);
END;
$$;
`.trim();

describe('parseFunctionSql — CREATE FUNCTION', () => {
    it('detects isFunction = true for FUNCTION keyword', () => {
        const result = parseFunctionSql(FIND_USER_SQL);
        assert.equal(result.isFunction, true);
    });

    it('extracts the SQL function name', () => {
        const result = parseFunctionSql(FIND_USER_SQL);
        assert.equal(result.sqlName, 'find_user_by_id');
    });

    it('parses parameters with name and type', () => {
        const result = parseFunctionSql(FIND_USER_SQL);
        assert.equal(result.params.length, 1);
        assert.equal(result.params[0]!.name, 'p_user_id');
        assert.equal(result.params[0]!.type, 'UUID');
        assert.equal(result.params[0]!.position, 1);
    });

    it('parses RETURNS TABLE columns', () => {
        const result = parseFunctionSql(FIND_USER_SQL);
        assert.equal(result.returns.length, 4);
        assert.equal(result.returns[0]!.name, 'id');
        assert.equal(result.returns[0]!.type, 'UUID');
        assert.equal(result.returns[2]!.name, 'email');
        assert.equal(result.returns[2]!.type, 'TEXT');
    });

    it('extracts the body SQL', () => {
        const result = parseFunctionSql(FIND_USER_SQL);
        assert.ok(result.selectSql.includes('SELECT'));
        assert.ok(result.selectSql.includes('FROM users'));
    });
});

describe('parseFunctionSql — CREATE PROCEDURE', () => {
    it('detects isFunction = false for PROCEDURE keyword', () => {
        const result = parseFunctionSql(CREATE_USER_SQL);
        assert.equal(result.isFunction, false);
    });

    it('extracts procedure name', () => {
        const result = parseFunctionSql(CREATE_USER_SQL);
        assert.equal(result.sqlName, 'create_user');
    });

    it('parses multiple parameters', () => {
        const result = parseFunctionSql(CREATE_USER_SQL);
        assert.equal(result.params.length, 3);
        assert.equal(result.params[0]!.name, 'p_id');
        assert.equal(result.params[1]!.name, 'p_name');
        assert.equal(result.params[2]!.name, 'p_email');
    });

    it('returns empty result columns for procedure with no RETURNS TABLE', () => {
        const result = parseFunctionSql(CREATE_USER_SQL);
        assert.deepEqual(result.returns, []);
    });
});

describe('parseFunctionSql — raw SQL fallback', () => {
    it('handles raw SQL without CREATE wrapper', () => {
        const result = parseFunctionSql('SELECT * FROM users WHERE id = :userId');
        assert.equal(result.isFunction, true);
        assert.equal(result.sqlName, '');
        assert.equal(result.params[0]!.name, 'userId');
    });

    it('extracts params from raw SQL', () => {
        const result = parseFunctionSql('SELECT * FROM orders WHERE user_id = :userId AND status = :status');
        assert.equal(result.params.length, 2);
        assert.equal(result.params[0]!.name, 'userId');
        assert.equal(result.params[1]!.name, 'status');
    });
});

describe('parseFunctionSql — error handling', () => {
    it('throws on malformed CREATE FUNCTION', () => {
        assert.throws(
            () => parseFunctionSql('CREATE FUNCTION'),
            /Invalid CREATE FUNCTION/i
        );
    });
});

describe("parseFunctionSql — COMMENT ON support", () => {
    it("leaves comment undefined when no COMMENT ON FUNCTION statement is present", () => {
        const signature = parseFunctionSql(`
            CREATE OR REPLACE FUNCTION find_user_by_id(p_user_id UUID)
            RETURNS TABLE (id UUID)
            LANGUAGE plpgsql AS $$
            BEGIN
                RETURN QUERY SELECT * FROM users WHERE id = p_user_id;
            END;
            $$;
        `);

        assert.equal(signature.comment, undefined);
    });

    it("attaches a comment from a trailing COMMENT ON FUNCTION statement", () => {
        const signature = parseFunctionSql(`
            CREATE OR REPLACE FUNCTION find_user_by_id(p_user_id UUID)
            RETURNS TABLE (id UUID)
            LANGUAGE plpgsql AS $$
            BEGIN
                RETURN QUERY SELECT * FROM users WHERE id = p_user_id;
            END;
            $$;

            COMMENT ON FUNCTION find_user_by_id(UUID) IS 'Looks up a single user by primary key';
        `);

        assert.equal(signature.comment, "Looks up a single user by primary key");
    });

    it("attaches a comment from a trailing COMMENT ON PROCEDURE statement", () => {
        const signature = parseFunctionSql(`
            CREATE OR REPLACE PROCEDURE create_user(p_id UUID, p_name TEXT)
            LANGUAGE plpgsql AS $$
            BEGIN
                INSERT INTO users (id, name) VALUES (p_id, p_name);
            END;
            $$;

            COMMENT ON PROCEDURE create_user(UUID, TEXT) IS 'Creates a new user';
        `);

        assert.equal(signature.comment, "Creates a new user");
    });

    it("does not attach a comment meant for a different routine", () => {
        const signature = parseFunctionSql(`
            CREATE OR REPLACE FUNCTION find_user_by_id(p_user_id UUID)
            RETURNS TABLE (id UUID)
            LANGUAGE plpgsql AS $$
            BEGIN
                RETURN QUERY SELECT * FROM users WHERE id = p_user_id;
            END;
            $$;

            COMMENT ON FUNCTION list_users() IS 'Not this function';
        `);

        assert.equal(signature.comment, undefined);
    });
});
