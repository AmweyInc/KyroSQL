import fs from "node:fs/promises";
import path from "node:path";
import { isEnumTypeSql, parseEnumTypeSql } from "../../../compiler/src/parser/parse-enum-sql";
import type { EnumRegistry } from "../../../types/src/schema/enum-registry";

export async function buildEnumRegistry(inputPath: string): Promise<EnumRegistry> {
    const root = path.resolve(inputPath);
    const registry: EnumRegistry = {};

    for (const dir of ["enums", "tables"]) {
        for (const filePath of await collectSqlFiles(path.join(root, dir))) {
            const sql = await fs.readFile(filePath, "utf-8");
            if (!isEnumTypeSql(sql)) continue;

            const enumDefinition = parseEnumTypeSql(sql);
            registry[enumDefinition.name] = enumDefinition.values;
        }
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
