import fs from "node:fs/promises";
import path from "node:path";
import { parseTableSql } from "../../../compiler/src/parser/parse-table-sql";
import { isEnumTypeSql } from "../../../compiler/src/parser/parse-enum-sql";
import type { SchemaRegistry } from "../../../types/src/schema/schema-register";
import type { EnumRegistry } from "../../../types/src/schema/enum-registry";

export async function buildSchemaRegistry(inputPath: string, enumRegistry?: EnumRegistry): Promise<SchemaRegistry> {
    const tablesDir = path.join(path.resolve(inputPath), "tables");
    const registry: SchemaRegistry = {};

    for (const filePath of await collectSqlFiles(tablesDir)) {
        const sql = await fs.readFile(filePath, "utf-8");
        if (isEnumTypeSql(sql)) continue;

        const tableSchema = parseTableSql(sql, enumRegistry);
        registry[tableSchema.tableName] = tableSchema;
    }

    return registry;
}

async function collectSqlFiles(dir: string): Promise<string[]> {
    try {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        const results: string[] = [];
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                results.push(...await collectSqlFiles(fullPath));
            } else if (entry.isFile() && entry.name.endsWith(".sql")) {
                results.push(fullPath);
            }
        }
        return results;
    } catch {
        return [];
    }
}
