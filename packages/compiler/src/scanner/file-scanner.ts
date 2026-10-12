import fs from "node:fs/promises";
import path from "node:path";

export async function scanSqlFiles(inputPath: string): Promise<string[]> {
    const root = path.resolve(inputPath);
    const results: string[] = [];

    for (const dir of ["functions", "procedures", "tables", "enums"]) {
        const files = await collectSqlFiles(path.join(root, dir));
        results.push(...files);
    }

    return results;
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
                results.push(fullPath.replace(/\\/g, "/"));
            }
        }
        return results;
    } catch {
        return [];
    }
}
