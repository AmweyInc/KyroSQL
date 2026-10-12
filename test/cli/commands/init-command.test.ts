import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { ensureSqlStructure } from '../../../packages/cli/src/commands/init';

const SQL_DIRS = ['functions', 'procedures', 'tables', 'migrations'];

async function makeTempDir(): Promise<string> {
    return fs.mkdtemp(path.join(os.tmpdir(), 'kyrosql-test-'));
}

async function dirExists(p: string): Promise<boolean> {
    try {
        const stat = await fs.stat(p);
        return stat.isDirectory();
    } catch {
        return false;
    }
}

describe('ensureSqlStructure', () => {
    it('creates all four SQL directories when none exist', async () => {
        const tmp = await makeTempDir();
        try {
            await ensureSqlStructure(tmp, './sql');

            for (const dir of SQL_DIRS) {
                assert.ok(
                    await dirExists(path.join(tmp, 'sql', dir)),
                    `Expected directory "sql/${dir}" to exist`
                );
            }
        } finally {
            await fs.rm(tmp, { recursive: true, force: true });
        }
    });

    it('creates missing directories but leaves existing ones untouched', async () => {
        const tmp = await makeTempDir();
        try {
            await fs.mkdir(path.join(tmp, 'sql', 'functions'), { recursive: true });
            await fs.writeFile(path.join(tmp, 'sql', 'functions', 'marker.sql'), '-- keep me');

            await ensureSqlStructure(tmp, './sql');

            for (const dir of SQL_DIRS) {
                assert.ok(
                    await dirExists(path.join(tmp, 'sql', dir)),
                    `Expected directory "sql/${dir}" to exist`
                );
            }

            const marker = await fs.readFile(
                path.join(tmp, 'sql', 'functions', 'marker.sql'),
                'utf-8'
            );
            assert.equal(marker, '-- keep me');
        } finally {
            await fs.rm(tmp, { recursive: true, force: true });
        }
    });

    it('does not throw when all directories already exist', async () => {
        const tmp = await makeTempDir();
        try {
            for (const dir of SQL_DIRS) {
                await fs.mkdir(path.join(tmp, 'sql', dir), { recursive: true });
            }

            await assert.doesNotReject(() => ensureSqlStructure(tmp, './sql'));
        } finally {
            await fs.rm(tmp, { recursive: true, force: true });
        }
    });

    it('respects a custom input directory path', async () => {
        const tmp = await makeTempDir();
        try {
            await ensureSqlStructure(tmp, './db/queries');

            for (const dir of SQL_DIRS) {
                assert.ok(
                    await dirExists(path.join(tmp, 'db', 'queries', dir)),
                    `Expected directory "db/queries/${dir}" to exist`
                );
            }
        } finally {
            await fs.rm(tmp, { recursive: true, force: true });
        }
    });

    it('creates nested input dir if it does not exist yet', async () => {
        const tmp = await makeTempDir();
        try {
            await ensureSqlStructure(tmp, './sql/deep/nested');

            assert.ok(await dirExists(path.join(tmp, 'sql', 'deep', 'nested', 'functions')));
        } finally {
            await fs.rm(tmp, { recursive: true, force: true });
        }
    });
});
