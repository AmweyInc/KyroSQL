import fs from "node:fs/promises";
import path from "node:path";

export interface KyroSQLGitlabRegistry {
    type: "gitlab";
    host: string;
}

export interface KyroSQLPublishConfig {
    mode: "npm" | "link" | "gitlab";
    access?: "public" | "restricted";
    tag?: string;
    registry?: KyroSQLGitlabRegistry;
}

export interface KyroSQLConfig {
    input: string;
    output: string;
    packageName: string;
    publish?: KyroSQLPublishConfig;
}

export async function loadConfig(): Promise<KyroSQLConfig> {
    const cwd = process.cwd();
    const configJsonPath = path.join(cwd, "kyrosql.config.json");

    try {
        const configContent = await fs.readFile(configJsonPath, "utf-8");
        const config: KyroSQLConfig = JSON.parse(configContent);

        return {
            input: path.resolve(cwd, config.input),
            output: path.resolve(cwd, config.output),
            packageName: config.packageName,
            publish: config.publish,
        };
    } catch (error: any) {
        if (error.code === "ENOENT") {
            return {
                input: path.resolve(cwd, "sql"),
                output: path.resolve(cwd, "generated"),
                packageName: "generated-kyrosql",
                publish: { mode: "npm", access: "restricted" },
            };
        }

        console.error("❌ Error while loading config from kyrosql.config.json:", error.message);
        throw error;
    }
}
