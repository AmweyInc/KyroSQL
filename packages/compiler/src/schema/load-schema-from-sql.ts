import fs from "node:fs/promises";
import path from "node:path";
import { parseTableSql } from "../parser/parse-table-sql";

export async function loadSchemaFromSql(
    root: string
) {
    const tableDir = path.join(root, "tables");

    const files = await fs.readdir(tableDir);

    const schema: Record<string, any> = {};

    for (const file of files) {
        const sql = await fs.readFile(
            path.join(tableDir, file),
            "utf-8"
        );

        const table = parseTableSql(sql);

        schema[table.tableName] = table;
    }

    return schema;
}
