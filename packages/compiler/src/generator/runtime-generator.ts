import { RootContractAst } from "../../../types/src/contract/contract-root";
import { ContractNode } from "../../../types/src/contract/contract-node";
import { EnumRegistry } from "../../../types/src/schema/enum-registry";
import { resolveEnumType } from "../../../types/src/sql/sql-column-type";
import { isContractNode } from "../../../utils/is-contract-node";

const RUNTIME_HELPERS_TS = [
    `function __toEpochMs(value: Date | number | string | null | undefined): number | string | null {`,
    `  if (value === null || value === undefined) return null;`,
    `  return value instanceof Date ? value.getTime() : value;`,
    `}`,
    `function __toDate(value: string | number | null | undefined): Date | null {`,
    `  if (value === null || value === undefined) return null;`,
    `  return new Date(Number(value));`,
    `}`,
    `function __toArray(value: unknown): any[] | null {`,
    `  if (value === null || value === undefined) return null;`,
    `  if (Array.isArray(value)) return value;`,
    `  const text = String(value);`,
    `  if (text === '{}') return [];`,
    `  return text.replace(/^\\{/, '').replace(/\\}$/, '').split(',');`,
    `}`,
    `function __toNumber(value: unknown): number | null {`,
    `  if (value === null || value === undefined) return null;`,
    `  return typeof value === 'number' ? value : Number(value);`,
    `}`,
].join('\n');

const RUNTIME_HELPERS_JS = [
    `function __toEpochMs(value) {`,
    `  if (value === null || value === undefined) return null;`,
    `  return value instanceof Date ? value.getTime() : value;`,
    `}`,
    `function __toDate(value) {`,
    `  if (value === null || value === undefined) return null;`,
    `  return new Date(Number(value));`,
    `}`,
    `function __toArray(value) {`,
    `  if (value === null || value === undefined) return null;`,
    `  if (Array.isArray(value)) return value;`,
    `  const text = String(value);`,
    `  if (text === '{}') return [];`,
    `  return text.replace(/^\\{/, '').replace(/\\}$/, '').split(',');`,
    `}`,
    `function __toNumber(value) {`,
    `  if (value === null || value === undefined) return null;`,
    `  return typeof value === 'number' ? value : Number(value);`,
    `}`,
].join('\n');

export async function generateRuntimeFile(ast: RootContractAst): Promise<string> {
    const merged = mergeLayerTrees(ast.functions, ast.procedures);

    return [
        `import type { ISqlContracts } from './types';`,
        ``,
        `type PoolLike = { query(sql: string, values?: any[]): Promise<{ rows: any[] }> };`,
        ``,
        RUNTIME_HELPERS_TS,
        ``,
        `export const SqlContracts = {`,
        generateTree(merged, 1),
        `};`,
    ].join('\n');
}

export async function generateRuntimeJs(ast: RootContractAst): Promise<string> {
    const merged = mergeLayerTrees(ast.functions, ast.procedures);
    return [
        `"use strict";`,
        `Object.defineProperty(exports, "__esModule", { value: true });`,
        `exports.SqlContracts = void 0;`,
        RUNTIME_HELPERS_JS,
        `exports.SqlContracts = {`,
        generateTreeJs(merged, 1),
        `};`,
    ].join('\n');
}

export async function generateRuntimeDts(ast: RootContractAst, enumRegistry?: EnumRegistry): Promise<string> {
    const merged = mergeLayerTrees(ast.functions, ast.procedures);
    return [
        `import type { ISqlContracts } from './types';`,
        ``,
        `type PoolLike = { query(sql: string, values?: any[]): Promise<{ rows: any[] }> };`,
        ``,
        `export declare const SqlContracts: {`,
        generateTreeDts(merged, 1, enumRegistry),
        `};`,
    ].join('\n');
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

function capitalize(s: string): string {
    return s.charAt(0).toUpperCase() + s.slice(1);
}

function toCamelCase(s: string): string {
    return s.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());
}

function nsPath(node: ContractNode): string {
    return node.namespace.map(capitalize).join('.');
}

function generateTree(tree: Record<string, any>, level: number): string {
    return Object.keys(tree).map(key => {
        const value = tree[key];
        if (isContractNode(value)) {
            return generateFunction(key, value as ContractNode, level);
        }
        return [
            `${ind(level)}${capitalize(key)}: {`,
            generateTree(value, level + 1),
            `${ind(level)}},`,
        ].join('\n');
    }).join('\n');
}

function generateFunction(name: string, node: ContractNode, level: number): string {
    const ns = nsPath(node);
    const paramsType = node.params.length > 0
        ? `ISqlContracts.${ns}.${name}.params`
        : 'Record<string, never>';
    const returnType = `ISqlContracts.${ns}.${name}[]`;

    const transforms = node.result
        .map(c => {
            const expr = resultColumnTransform(c);
            return expr ? { name: c.name, expr } : undefined;
        })
        .filter((t): t is { name: string; expr: string } => t !== undefined);

    const valuesArr = node.params.length > 0
        ? `[${node.params.map(p => paramValueExpr(p)).join(', ')}]`
        : '[]';

    const rowsExpr = transforms.length > 0
        ? `result.rows.map((row: any) => (${rowSpread(transforms)}))`
        : `result.rows`;

    return [
        `${ind(level)}${name}: async (params: ${paramsType}, pool: PoolLike): Promise<${returnType}> => {`,
        `${ind(level + 1)}const result = await pool.query(\`${node.sql}\`, ${valuesArr});`,
        `${ind(level + 1)}return ${rowsExpr} as ${returnType};`,
        `${ind(level)}},`,
    ].join('\n');
}

function paramValueExpr(p: { name: string; type?: string }): string {
    const access = `params.${toCamelCase(p.name)}`;
    return isEpochConventionColumn(p.type ?? '', p.name) ? `__toEpochMs(${access})` : access;
}

function isEpochConventionColumn(sqlType: string, columnName?: string): boolean {
    const t = (sqlType ?? '').toLowerCase().trim().replace(/\[\]$/, '');
    return /^(bigint|int8)/.test(t) && /_at$/.test(columnName ?? '');
}

function isArrayColumn(sqlType: string): boolean {
    return /\[\]\s*$/.test((sqlType ?? '').trim());
}

function stripArraySuffix(sqlType: string): string {
    return (sqlType ?? '').trim().replace(/\[\]\s*$/, '');
}

function isNumericType(sqlType: string): boolean {
    return /^(numeric|decimal)/.test((sqlType ?? '').toLowerCase().trim());
}

function isJsonType(sqlType: string): boolean {
    return /^json/.test((sqlType ?? '').toLowerCase().trim());
}

function resultColumnTransform(column: { type: string; name: string }): string | undefined {
    if (isEpochConventionColumn(column.type, column.name)) return `__toDate(row.${column.name})`;

    if (isArrayColumn(column.type)) {
        const elementType = stripArraySuffix(column.type);
        if (isJsonType(elementType)) return undefined;
        if (isNumericType(elementType)) return `__toArray(row.${column.name})?.map(__toNumber) ?? null`;
        return `__toArray(row.${column.name})`;
    }

    if (isNumericType(column.type)) return `__toNumber(row.${column.name})`;

    return undefined;
}

function rowSpread(transforms: Array<{ name: string; expr: string }>): string {
    return `{ ...row, ${transforms.map(t => `${t.name}: ${t.expr}`).join(', ')} }`;
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
    if (enumLiteral) return arraySuffix ? `(${enumLiteral})${arraySuffix}` : enumLiteral;

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

function generateTreeJs(tree: Record<string, any>, level: number): string {
    return Object.keys(tree).map(key => {
        const value = tree[key];
        if (isContractNode(value)) {
            return generateFunctionJs(key, value as ContractNode, level);
        }
        return [
            `${ind(level)}${capitalize(key)}: {`,
            generateTreeJs(value, level + 1),
            `${ind(level)}},`,
        ].join('\n');
    }).join('\n');
}

function generateFunctionJs(name: string, node: ContractNode, level: number): string {
    const transforms = node.result
        .map(c => {
            const expr = resultColumnTransform(c);
            return expr ? { name: c.name, expr } : undefined;
        })
        .filter((t): t is { name: string; expr: string } => t !== undefined);

    const valuesArr = node.params.length > 0
        ? `[${node.params.map(p => paramValueExpr(p)).join(', ')}]`
        : '[]';

    const rowsExpr = transforms.length > 0
        ? `result.rows.map((row) => (${rowSpread(transforms)}))`
        : `result.rows`;

    return [
        `${ind(level)}${name}: async (params, pool) => {`,
        `${ind(level + 1)}const result = await pool.query(\`${node.sql}\`, ${valuesArr});`,
        `${ind(level + 1)}return ${rowsExpr};`,
        `${ind(level)}},`,
    ].join('\n');
}

function generateTreeDts(tree: Record<string, any>, level: number, enumRegistry?: EnumRegistry): string {
    return Object.keys(tree).map(key => {
        const value = tree[key];
        if (isContractNode(value)) {
            return generateFunctionDts(key, value as ContractNode, level, enumRegistry);
        }
        return [
            `${ind(level)}${capitalize(key)}: {`,
            generateTreeDts(value, level + 1, enumRegistry),
            `${ind(level)}};`,
        ].join('\n');
    }).join('\n');
}

function generateFunctionDts(name: string, node: ContractNode, level: number, enumRegistry?: EnumRegistry): string {
    const paramsType = node.params.length > 0
        ? `{ ${node.params.map(p => `${toCamelCase(p.name)}: ${mapType(p.type ?? 'string', p.name, enumRegistry)}${p.nullable ? ' | null' : ''}`).join('; ')} }`
        : 'Record<string, never>';
    const returnType = node.result.length > 0
        ? `{ ${node.result.map(c => `${c.name}: ${mapType(c.type, c.name, enumRegistry)}`).join('; ')} }[]`
        : 'Record<string, unknown>[]';
    return `${ind(level)}${name}: (params: ${paramsType}, pool: PoolLike) => Promise<${returnType}>;`;
}
