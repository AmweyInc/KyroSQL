import { buildProject, loadConfig } from "@kyrosql/core";

export async function buildCommand() {
    console.log("⚙️ KyroSQL build started...");

    const config = await loadConfig();

    await buildProject({
        input: config.input,
        output: config.output,
        packageName: config.packageName,
        publish: config.publish,
    });

    console.log("✅ KyroSQL build finished");
}
