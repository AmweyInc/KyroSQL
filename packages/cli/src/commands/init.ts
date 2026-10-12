import fs from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";

function prompt(rl: readline.Interface, question: string): Promise<string> {
    return new Promise(resolve => rl.question(question, resolve));
}

async function promptChoice<T extends string>(
    rl: readline.Interface,
    label: string,
    choices: { value: T; label: string }[],
    defaultIndex = 0,
): Promise<T> {
    console.log(`\n${label}`);
    choices.forEach((c, i) => {
        const marker = i === defaultIndex ? ">" : " ";
        console.log(`  ${marker} ${i + 1}) ${c.label}`);
    });
    const raw = await prompt(rl, `  Choice [${defaultIndex + 1}]: `);
    const n = parseInt(raw.trim(), 10);
    const idx = Number.isNaN(n) || n < 1 || n > choices.length ? defaultIndex : n - 1;
    return choices[idx].value;
}

const SQL_DIRS = ["functions", "procedures", "tables", "migrations"] as const;

export async function initCommand() {
    const cwd = process.cwd();
    const configPath = path.join(cwd, "kyrosql.config.json");

    try {
        await fs.access(configPath);
        console.log("⚠️  kyrosql.config.json already exists, skipping.");
        return;
    } catch {}

    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

    console.log("KyroSQL init — press Enter to accept defaults\n");

    const packageName = (await prompt(rl, 'Package name ["generated-kyrosql"]: ')).trim() || "generated-kyrosql";
    const input       = (await prompt(rl, 'SQL input dir  ["./sql"]: ')).trim()              || "./sql";
    const output      = (await prompt(rl, 'Output dir     ["./generated"]: ')).trim()        || "./generated";

    const mode = await promptChoice(rl, "Publish mode:", [
        { value: "npm",    label: "npm        — publish to npm registry" },
        { value: "link",   label: "link       — npm link for local development" },
        { value: "gitlab", label: "gitlab     — publish to private GitLab registry" },
    ]);

    let gitlabHost: string | undefined;
    if (mode === "gitlab") {
        gitlabHost = (await prompt(rl, "GitLab host (e.g. gitlab.mycompany.com): ")).trim();
        if (!gitlabHost) {
            console.log("⚠️  No host provided, defaulting to gitlab.com");
            gitlabHost = "gitlab.com";
        }
    }

    const access = await promptChoice(rl, "Access:", [
        { value: "restricted", label: "restricted — private package" },
        { value: "public",     label: "public     — public package" },
    ]);

    const tagInput = (await prompt(rl, 'Tag ["latest"]: ')).trim();
    const tag = tagInput || "latest";

    rl.close();

    const config: Record<string, unknown> = {
        input,
        output,
        packageName,
        publish: {
            mode,
            access,
            tag,
            ...(mode === "gitlab" && gitlabHost
                ? { registry: { type: "gitlab", host: gitlabHost } }
                : {}),
        },
    };

    await fs.writeFile(configPath, JSON.stringify(config, null, 2) + "\n", "utf-8");

    console.log("\n✅ Created kyrosql.config.json");
    console.log(`   packageName: ${packageName}`);
    console.log(`   input:       ${input}`);
    console.log(`   output:      ${output}`);
    console.log(`   publish:     ${mode}${gitlabHost ? ` → ${gitlabHost}` : ""}, access=${access}, tag=${tag}`);

    await ensureSqlStructure(cwd, input);
}

export async function ensureSqlStructure(cwd: string, inputDir: string): Promise<void> {
    const sqlRoot = path.resolve(cwd, inputDir);

    for (const dir of SQL_DIRS) {
        const dirPath = path.join(sqlRoot, dir);

        try {
            await fs.access(dirPath);
        } catch {
            await fs.mkdir(dirPath, { recursive: true });
            console.log(`📁 Created ${path.join(inputDir, dir)}`);
        }
    }
}
