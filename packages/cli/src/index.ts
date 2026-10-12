#!/usr/bin/env node

import { buildCommand } from "./commands/build";
import { watchCommand } from "./commands/watch";
import { publishCommand } from "./commands/publish";
import { initCommand } from "./commands/init";

const args = process.argv.slice(2);

const command = args[0];

async function main() {
    switch (command) {
        case "build":
            await buildCommand();
            break;

        case "watch":
            await watchCommand();
            break;

        case "publish":
            await publishCommand();
            break;

        case "init":
            await initCommand();
            break;

        default:
            console.log(`
KyroSQL CLI

Commands:
  kyrosql init     Create kyrosql.config.json with default settings
  kyrosql build    Generate TypeScript from SQL files
  kyrosql watch    Watch SQL files and rebuild on changes
  kyrosql publish  Publish generated package to npm or link locally
`);
    }
}

main();
