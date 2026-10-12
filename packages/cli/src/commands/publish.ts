import { execSync } from "node:child_process";
import { loadConfig } from "@kyrosql/core";

export async function publishCommand() {
    console.log("📦 KyroSQL publish started...");

    const config = await loadConfig();
    const publish = config.publish ?? { mode: "npm", access: "restricted" };

    console.log(`Package: ${config.packageName}`);
    console.log(`Output:  ${config.output}`);
    console.log(`Mode:    ${publish.mode}`);

    if (publish.mode === "link") {
        console.log("🔗 Running npm link...");
        execSync("npm link", { cwd: config.output, stdio: "inherit" });
        console.log(`✅ Linked. Use "npm link ${config.packageName}" in your project.`);
        return;
    }

    const args: string[] = ["npm", "publish"];

    if (publish.access) {
        args.push("--access", publish.access);
    }

    if (publish.tag) {
        args.push("--tag", publish.tag);
    }

    console.log(`🚀 Running: ${args.join(" ")}`);
    execSync(args.join(" "), { cwd: config.output, stdio: "inherit" });
    console.log("✅ Published successfully");
}
