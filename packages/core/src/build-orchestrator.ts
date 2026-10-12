import { scanSqlFiles } from "../../compiler/src/scanner/file-scanner";
import { buildContractAst } from "../../compiler/src/parser/build-contract-ast";
import { generateRuntimeFile, generateRuntimeJs, generateRuntimeDts } from "../../compiler/src/generator/runtime-generator";
import { generateTypesFile, generateTypesDts } from "../../compiler/src/generator/types-generator";
import { generateCommentsFile, generateCommentsJs, generateCommentsDts } from "../../compiler/src/generator/comments-generator";
import { generatePackageJson } from "../../compiler/src/generator/package-generator";
import { generateNpmrc, generateGitlabCi } from "../../compiler/src/generator/ci-generator";
import { writeOutputFiles, OutputFile } from "../../compiler/src/output/write-output-files";
import { buildSchemaRegistry } from "./schema/build-schema-registry";
import { buildEnumRegistry } from "./schema/build-enum-registry";
import { buildCommentsRegistry } from "./schema/build-comments-registry";
import { KyroSQLPublishConfig } from "./config-resolver";

type BuildProjectOptions = {
    input: string;
    output: string;
    packageName: string;
    publish?: KyroSQLPublishConfig;
};

export async function buildProject(options: BuildProjectOptions) {
    console.log("📂 Scanning SQL files...");

    const files = await scanSqlFiles(options.input);

    console.log(`📄 Found ${files.length} SQL files`);

    const enumRegistry = await buildEnumRegistry(options.input);
    const schemaRegistry = await buildSchemaRegistry(options.input, enumRegistry);

    console.log("🌳 Building AST...");

    const ast = await buildContractAst(files, schemaRegistry, enumRegistry);

    console.log("⚙️ Generating runtime...");
    const runtimeTs = await generateRuntimeFile(ast);
    const runtimeJs = await generateRuntimeJs(ast);
    const runtimeDts = await generateRuntimeDts(ast, enumRegistry);

    console.log("🧠 Generating types...");
    const typesTs = await generateTypesFile(ast, enumRegistry);
    const typesDts = await generateTypesDts(ast, enumRegistry);

    console.log("💬 Generating comments registry...");
    const commentsRegistry = await buildCommentsRegistry(files);
    const commentsTs = await generateCommentsFile(commentsRegistry);
    const commentsJs = await generateCommentsJs(commentsRegistry);
    const commentsDts = await generateCommentsDts(commentsRegistry);

    const indexJs = [
        `"use strict";`,
        `var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {`,
        `    if (k2 === undefined) k2 = k;`,
        `    var desc = Object.getOwnPropertyDescriptor(m, k);`,
        `    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {`,
        `        desc = { enumerable: true, get: function() { return m[k]; } };`,
        `    }`,
        `    Object.defineProperty(o, k2, desc);`,
        `}) : (function(o, m, k, k2) {`,
        `    if (k2 === undefined) k2 = k;`,
        `    o[k2] = m[k];`,
        `}));`,
        `var __exportStar = (this && this.__exportStar) || function(m, exports) {`,
        `    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);`,
        `};`,
        `Object.defineProperty(exports, "__esModule", { value: true });`,
        `__exportStar(require("./runtime"), exports);`,
        `__exportStar(require("./types"), exports);`,
        `__exportStar(require("./comments"), exports);`,
    ].join('\n');

    const indexDts = `export * from './runtime';\nexport * from './types';\nexport * from './comments';\n`;

    const typesJs = `"use strict";\nObject.defineProperty(exports, "__esModule", { value: true });\n`;

    console.log("💾 Writing files...");

    const isGitlab = options.publish?.mode === "gitlab" && options.publish.registry?.type === "gitlab";
    const gitlabHost = isGitlab ? options.publish!.registry!.host : undefined;

    const outputFiles: OutputFile[] = [
        { path: "runtime.ts", content: runtimeTs },
        { path: "types.ts", content: typesTs },
        { path: "comments.ts", content: commentsTs },
        { path: "dist/runtime.js", content: runtimeJs },
        { path: "dist/runtime.d.ts", content: runtimeDts },
        { path: "dist/types.js", content: typesJs },
        { path: "dist/types.d.ts", content: typesDts },
        { path: "dist/comments.js", content: commentsJs },
        { path: "dist/comments.d.ts", content: commentsDts },
        { path: "dist/index.js", content: indexJs },
        { path: "dist/index.d.ts", content: indexDts },
        {
            path: "package.json",
            content: await generatePackageJson({
                packageName: options.packageName,
                gitlabRegistry: gitlabHost ? { host: gitlabHost } : undefined,
                access: options.publish?.access,
            }),
        },
    ];

    if (isGitlab && gitlabHost) {
        console.log("🦊 Generating GitLab CI files...");
        outputFiles.push(
            { path: ".npmrc", content: generateNpmrc(gitlabHost, options.packageName) },
            { path: ".gitlab-ci.yml", content: generateGitlabCi(options.publish?.access) },
        );
    }

    await writeOutputFiles({ outputPath: options.output, files: outputFiles });

    console.log("✅ Build completed — package ready at", options.output);
}
