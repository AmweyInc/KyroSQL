import chokidar from "chokidar";
import { buildCommand } from "./build";
import { loadConfig } from "@kyrosql/core";

export async function watchCommand() {
    const config = await loadConfig();

    console.log("👀 KyroSQL watch mode started...");

    const watcher = chokidar.watch(config.input, {
        ignored: /node_modules/,
        persistent: true,
    });

    let timeout: NodeJS.Timeout | null = null;

    watcher.on("all", async () => {
        if (timeout) clearTimeout(timeout);

        timeout = setTimeout(async () => {
            console.log("🔄 Change detected, rebuilding...");
            await buildCommand();
        }, 200);
    });
}
