import fs from "node:fs/promises";
import { parseCommentStatements } from "../../../compiler/src/parser/parse-comment-sql";
import type { CommentsRegistry } from "../../../types/src/schema/comments-registry";

export async function buildCommentsRegistry(files: string[]): Promise<CommentsRegistry> {
    const registry: CommentsRegistry = { tables: {}, columns: {}, routines: {}, enums: {} };

    for (const filePath of files) {
        const sql = await fs.readFile(filePath, "utf-8");
        const parsed = parseCommentStatements(sql);

        Object.assign(registry.tables, parsed.tables);
        Object.assign(registry.routines, parsed.routines);
        Object.assign(registry.enums, parsed.enums);

        for (const tableName of Object.keys(parsed.columns)) {
            registry.columns[tableName] ??= {};
            Object.assign(registry.columns[tableName]!, parsed.columns[tableName]);
        }
    }

    return registry;
}
