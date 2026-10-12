import fs from "node:fs/promises";
import path from "node:path";

export async function resolveSchemaRoot(input: string): Promise<string> {
    const tablesPath = path.join(input, "tables");

    try {
        const stat = await fs.stat(tablesPath);

        if (stat.isDirectory()) {
            return tablesPath;
        }
    } catch {}

    return input;
}
