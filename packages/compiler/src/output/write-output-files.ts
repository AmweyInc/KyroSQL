import fs from 'node:fs/promises';
import path from 'node:path';

export interface OutputFile {
    path: string;
    content: string;
}

export async function writeOutputFiles(options: { outputPath: string; files: OutputFile[] }) {
    await fs.mkdir(options.outputPath, { recursive: true });

    for (const file of options.files) {
        const filePath = path.join(options.outputPath, file.path);
        const dir = path.dirname(filePath);
        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(filePath, file.content);
    }
}
