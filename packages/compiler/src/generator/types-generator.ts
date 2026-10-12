import { RootContractAst } from "../../../types/src/contract/contract-root";
import { ContractNode } from "../../../types/src/contract/contract-node";
import { EnumRegistry } from "../../../types/src/schema/enum-registry";
import { resolveEnumType } from "../../../types/src/sql/sql-column-type";
import { isContractNode } from "../../../utils/is-contract-node";

export async function generateTypesDts(ast: RootContractAst, enumRegistry?: EnumRegistry): Promise<string> {
    const src = await generateTypesFile(ast, enumRegistry);
    return src.replace('export namespace ISqlContracts {', 'export declare namespace ISqlContracts {');
}

export async function generateTypesFile(ast: RootContractAst, enumRegistry?: EnumRegistry): Promise<string> {
    const lines: string[] = ['export namespace ISqlContracts {'];

    emitTableTypes(ast.tables, lines, enumRegistry);

    const merged = mergeLayerTrees(ast.functions, ast.procedures);
    emitNamespaceTree(merged, lines, 1, enumRegistry);

    lines.push('}');
    return lines.join('\n');
}

function mergeLayerTrees(a: Record<string, any>, b: Record<string, any>): Record<string, any> {
    const result: Record<string, any> = { ...a };
    for (const key of Object.keys(b)) {
        if (result[key] && !isContractNode(result[key]) && !isContractNode(b[key])) {
            result[key] = mergeLayerTrees(result[key], b[key]);
        } else {
            result[key] = b[key];
        }
    }
    return result;
}

function ind(level: number): string {
    return '  '.repeat(level);
}

function escapeComment(comment: string): string {
    return comment.replace(/\*\//g, '*\\/').replace(/\s+/g, ' ').trim();
}

function emitJsDoc(comment: string | undefined, lines: string[], level: number) {
    if (!comment) return;
    lines.push(`${ind(level)}/** ${escapeComment(comment)} */`);
}

function capitalize(s: string): string {
    return s.charAt(0).toUpperCase() + s.slice(1);
}

function toCamelCase(s: string): string {
    return s.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());
}

function singularize(name: string): string {
    if (name.endsWith('ies') && name.length > 3) return name.slice(0, -3) + 'y';
    if (/(?:s|x|z|ch|sh)es$/.test(name)) return name.slice(0, -2);
    if (name.endsWith('s') && !name.endsWith('ss') && name.length > 2) return name.slice(0, -1);
    return name;
}

function tableTypeName(camelName: string): string {
    return capitalize(singularize(camelName));
}

function mapType(sqlType: string, columnName?: string, enumRegistry?: EnumRegistry): string {
    if (!sqlType) return 'any';
    if (sqlType.includes("'")) return sqlType;

    let t = sqlType.toLowerCase().trim();
    let arraySuffix = '';
    while (t.endsWith('[]')) {
        arraySuffix += '[]';
        t = t.slice(0, -2).trim();
    }

    const enumLiteral = resolveEnumType(t, enumRegistry);
    if (enumLiteral) return enumLiteral + arraySuffix;

    return mapTypeScalar(t, columnName) + arraySuffix;
}

function mapTypeScalar(t: string, columnName?: string): string {
    if (t === 'string' || t === 'number' || t === 'boolean' || t === 'any') return t;
    if (t === 'date') return 'Date';
    if (/^(bigint|int8)/.test(t) && /_at$/.test(columnName ?? '')) return 'Date';
    if (/^(int|integer|smallint|bigint|serial|float|double|numeric|decimal)/.test(t)) return 'number';
    if (/^(text|varchar|char|character|name)/.test(t)) return 'string';
    if (/^uuid/.test(t)) return 'string';
    if (/^bool(ean)?/.test(t)) return 'boolean';
    if (/^(date|time|timestamp)/.test(t)) return 'Date';
    if (/^json/.test(t)) return 'any';
    return 'any';
}

function emitTableTypes(tree: Record<string, any>, lines: string[], enumRegistry?: EnumRegistry) {
    for (const key of Object.keys(tree)) {
        const value = tree[key];
        if (isContractNode(value)) {
            const node = value as ContractNode;
            const name = tableTypeName(node.name);
            emitJsDoc(node.comment, lines, 1);
            lines.push(`  export type ${name} = {`);
            for (const col of node.result) {
                emitJsDoc(col.comment, lines, 2);
                lines.push(`    ${col.name}: ${mapType(col.type, col.name, enumRegistry)};`);
            }
            lines.push(`  }`);
            lines.push('');
        } else {
            emitTableTypes(value, lines, enumRegistry);
        }
    }
}

function emitNamespaceTree(tree: Record<string, any>, lines: string[], level: number, enumRegistry?: EnumRegistry) {
    for (const key of Object.keys(tree)) {
        const value = tree[key];
        if (isContractNode(value)) {
            emitFunctionTypes(key, value as ContractNode, lines, level, enumRegistry);
        } else {
            lines.push(`${ind(level)}export namespace ${capitalize(key)} {`);
            emitFunctionSubTree(value, lines, level + 1, enumRegistry);
            lines.push(`${ind(level)}}`);
            lines.push('');
        }
    }
}

function emitFunctionSubTree(tree: Record<string, any>, lines: string[], level: number, enumRegistry?: EnumRegistry) {
    for (const key of Object.keys(tree)) {
        const value = tree[key];
        if (isContractNode(value)) {
            emitFunctionTypes(key, value as ContractNode, lines, level, enumRegistry);
        } else {
            lines.push(`${ind(level)}export namespace ${capitalize(key)} {`);
            emitFunctionSubTree(value, lines, level + 1, enumRegistry);
            lines.push(`${ind(level)}}`);
        }
    }
}

function emitFunctionTypes(name: string, node: ContractNode, lines: string[], level: number, enumRegistry?: EnumRegistry) {
    emitJsDoc(node.comment, lines, level);

    if (node.result && node.result.length > 0) {
        lines.push(`${ind(level)}export type ${name} = {`);
        for (const col of node.result) {
            emitJsDoc(col.comment, lines, level + 1);
            lines.push(`${ind(level + 1)}${col.name}: ${mapType(col.type, col.name, enumRegistry)};`);
        }
        lines.push(`${ind(level)}}`);
    } else {
        lines.push(`${ind(level)}export type ${name} = Record<string, unknown>`);
    }

    lines.push(`${ind(level)}export namespace ${name} {`);
    if (node.params.length > 0) {
        lines.push(`${ind(level + 1)}export type params = {`);
        for (const param of node.params) {
            lines.push(`${ind(level + 2)}${toCamelCase(param.name)}: ${param.type ? mapType(param.type, param.name, enumRegistry) : 'string'};`);
        }
        lines.push(`${ind(level + 1)}}`);
    } else {
        lines.push(`${ind(level + 1)}export type params = Record<string, never>`);
    }
    lines.push(`${ind(level)}}`);
    lines.push('');
}
