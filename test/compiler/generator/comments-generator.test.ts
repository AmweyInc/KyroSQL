import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { generateCommentsDts, generateCommentsFile, generateCommentsJs } from "../../../packages/compiler/src/generator/comments-generator";
import type { CommentsRegistry } from "../../../packages/types/src/schema/comments-registry";

const REGISTRY: CommentsRegistry = {
    tables: { users: "Registered application users" },
    columns: { users: { email: "Login email" } },
    routines: { find_user_by_id: "Looks up a user by id" },
    enums: { user_status_enum: "Lifecycle state of a user account" },
};

describe("generateCommentsFile", () => {
    it("embeds a literal-keyed CommentsRegistry type derived from the actual data", async () => {
        const src = await generateCommentsFile(REGISTRY);

        assert.match(src, /type CommentsRegistry = \{/);
        assert.match(src, /"users": string;/);
        assert.match(src, /"email": string;/);
        assert.match(src, /"find_user_by_id": string;/);
        assert.match(src, /"user_status_enum": string;/);
        assert.match(src, /export const SqlComments: CommentsRegistry = /);
        assert.match(src, /"users": "Registered application users"/);
    });

    it("declares getSqlDescription overloads keyed off the literal CommentsRegistry shape", async () => {
        const src = await generateCommentsFile(REGISTRY);

        assert.match(src, /export function getSqlDescription\(kind: 'table', name: keyof CommentsRegistry\['tables'\]\)/);
        assert.match(src, /export function getSqlDescription\(kind: 'function' \| 'procedure', name: keyof CommentsRegistry\['routines'\]\)/);
        assert.match(src, /export function getSqlDescription\(kind: 'enum', name: keyof CommentsRegistry\['enums'\]\)/);
        assert.match(
            src,
            /export function getSqlDescription<T extends keyof CommentsRegistry\['columns'\]>\(kind: 'column', table: T, column: keyof CommentsRegistry\['columns'\]\[T\]\)/,
        );
    });

    it("emits {} for a category with no comments, so its keyof is never", async () => {
        const empty: CommentsRegistry = { tables: {}, columns: {}, routines: {}, enums: {} };

        const src = await generateCommentsFile(empty);

        assert.match(src, /"enums": \{\};/);
    });

    it("exports an enum-like SqlDescriptionKind const so callers can write SqlDescriptionKind.table instead of a raw string", async () => {
        const src = await generateCommentsFile(REGISTRY);

        assert.match(src, /export const SqlDescriptionKind = \{/);
        assert.match(src, /table: 'table',/);
        assert.match(src, /function: 'function',/);
        assert.match(src, /procedure: 'procedure',/);
        assert.match(src, /enum: 'enum',/);
        assert.match(src, /column: 'column',/);
        assert.match(src, /\} as const;/);
        assert.match(src, /export type SqlDescriptionKind = typeof SqlDescriptionKind\[keyof typeof SqlDescriptionKind\];/);
    });
});

describe("generateCommentsDts", () => {
    it("declares SqlComments and the getSqlDescription overloads without a runtime body", async () => {
        const dts = await generateCommentsDts(REGISTRY);

        assert.match(dts, /export declare const SqlComments: CommentsRegistry;/);
        assert.match(dts, /export declare function getSqlDescription\(kind: 'table', name: keyof CommentsRegistry\['tables'\]\)/);
        assert.match(
            dts,
            /export declare function getSqlDescription<T extends keyof CommentsRegistry\['columns'\]>\(kind: 'column', table: T, column: keyof CommentsRegistry\['columns'\]\[T\]\)/,
        );
        assert.doesNotMatch(dts, /SqlComments\.tables/);
    });

    it("declares SqlDescriptionKind as a readonly value shape, not just a union type", async () => {
        const dts = await generateCommentsDts(REGISTRY);

        assert.match(dts, /export declare const SqlDescriptionKind: \{/);
        assert.match(dts, /readonly table: 'table';/);
        assert.match(dts, /readonly column: 'column';/);
        assert.match(dts, /export type SqlDescriptionKind = typeof SqlDescriptionKind\[keyof typeof SqlDescriptionKind\];/);
    });
});

describe("generateCommentsJs", () => {
    it("emits a CommonJS module whose getSqlDescription resolves every entity kind", async () => {
        const src = await generateCommentsJs(REGISTRY);

        const module = {
            exports: {} as {
                SqlComments: CommentsRegistry;
                SqlDescriptionKind: Record<string, string>;
                getSqlDescription: Function;
            },
        };
        new Function("module", "exports", src)(module, module.exports);

        assert.equal(module.exports.getSqlDescription("table", "users"), "Registered application users");
        assert.equal(module.exports.getSqlDescription("column", "users", "email"), "Login email");
        assert.equal(module.exports.getSqlDescription("function", "find_user_by_id"), "Looks up a user by id");
        assert.equal(module.exports.getSqlDescription("procedure", "find_user_by_id"), "Looks up a user by id");
        assert.equal(module.exports.getSqlDescription("enum", "user_status_enum"), "Lifecycle state of a user account");
        assert.equal(module.exports.getSqlDescription("table", "unknown"), undefined);
        assert.equal(module.exports.getSqlDescription("column", "users", "unknown"), undefined);
    });

    it("exposes SqlDescriptionKind at runtime so getSqlDescription(SqlDescriptionKind.table, ...) works", async () => {
        const src = await generateCommentsJs(REGISTRY);

        const module = {
            exports: {} as {
                SqlComments: CommentsRegistry;
                SqlDescriptionKind: Record<string, string>;
                getSqlDescription: Function;
            },
        };
        new Function("module", "exports", src)(module, module.exports);

        assert.deepEqual(module.exports.SqlDescriptionKind, {
            table: "table",
            function: "function",
            procedure: "procedure",
            enum: "enum",
            column: "column",
        });
        assert.equal(
            module.exports.getSqlDescription(module.exports.SqlDescriptionKind.table, "users"),
            "Registered application users",
        );
    });
});
