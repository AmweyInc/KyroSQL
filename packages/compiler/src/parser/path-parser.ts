import path from "node:path";

export type ParsedContractPath = {
    layer: "functions" | "procedures" | "tables" | "enums";
    namespace: string[];
    name: string;
    fullPath: string;
};

export function parsePath(filePath: string): ParsedContractPath {
    const normalizedPath = filePath.replace(/\\/g, "/");

    const parts = normalizedPath.split("/");

    const layerIndex = findLayerIndex(parts);

    if (layerIndex === -1) {
        throw new Error(`Invalid SQL contract path: ${filePath}`);
    }

    const layer = parts[layerIndex] as ParsedContractPath["layer"];

    const relativeParts = parts.slice(layerIndex + 1);

    if (relativeParts.length === 0) {
        throw new Error(`Missing SQL contract file name: ${filePath}`);
    }

    const fileName = relativeParts[relativeParts.length - 1]!;

    const namespace = relativeParts.slice(0, -1);

    const contractName = path.basename(fileName, ".sql");

    return {
        layer,
        namespace: namespace.map(toCamelCase),
        name: toCamelCase(contractName),
        fullPath: normalizedPath,
    };
}

function toCamelCase(value: string): string {
    return value.replace(/-([a-z])/g, (_, char: string) =>
        char.toUpperCase()
    );
}

function findLayerIndex(parts: string[]): number {
    for (let i = parts.length - 1; i >= 0; i--) {
        const part = parts[i];

        if (
            part === "functions" ||
            part === "procedures" ||
            part === "tables" ||
            part === "enums"
        ) {
            return i;
        }
    }

    return -1;
}
