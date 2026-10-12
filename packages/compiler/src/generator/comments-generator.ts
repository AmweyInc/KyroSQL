import type { CommentsRegistry } from "../../../types/src/schema/comments-registry";

type ShapeNode = string | { [key: string]: ShapeNode };

function ind(level: number): string {
    return '  '.repeat(level);
}

function mapValues<T, R>(obj: Record<string, T>, fn: (value: T) => R): Record<string, R> {
    return Object.fromEntries(Object.entries(obj).map(([key, value]) => [key, fn(value)]));
}

// key -> literal type text for each row's real, per-key shape (not a generic Record<string, ...>),
// so consumers get IDE autocomplete for which table/column/routine/enum name is valid to pass.
function emitTypeLiteral(node: ShapeNode, level: number): string {
    if (typeof node === 'string') return node;

    const keys = Object.keys(node);
    if (keys.length === 0) return '{}';

    const inner = keys
        .map(key => `${ind(level + 1)}${JSON.stringify(key)}: ${emitTypeLiteral(node[key]!, level + 1)};`)
        .join('\n');
    return `{\n${inner}\n${ind(level)}}`;
}

// `satisfies Record<keyof CommentsRegistry, ...>` makes it a compile error for this map to miss
// a field (or carry a stale one) if CommentsRegistry itself ever changes shape.
const REGISTRY_FIELD_SHAPES = {
    tables: (r: CommentsRegistry): ShapeNode => mapValues(r.tables, () => 'string'),
    columns: (r: CommentsRegistry): ShapeNode => mapValues(r.columns, cols => mapValues(cols, () => 'string')),
    routines: (r: CommentsRegistry): ShapeNode => mapValues(r.routines, () => 'string'),
    enums: (r: CommentsRegistry): ShapeNode => mapValues(r.enums, () => 'string'),
} satisfies Record<keyof CommentsRegistry, (registry: CommentsRegistry) => ShapeNode>;

function generateRegistryTypeDecl(registry: CommentsRegistry): string {
    const shape: Record<string, ShapeNode> = {};
    for (const field of Object.keys(REGISTRY_FIELD_SHAPES) as Array<keyof typeof REGISTRY_FIELD_SHAPES>) {
        shape[field] = REGISTRY_FIELD_SHAPES[field](registry);
    }
    return `type CommentsRegistry = ${emitTypeLiteral(shape, 0)};`;
}

// Enum-like const (TS type + value share the name via declaration merging) so callers can write
// SqlDescriptionKind.table instead of the raw string literal 'table'.
const SQL_DESCRIPTION_KIND_DECL_TS = [
    `export const SqlDescriptionKind = {`,
    `  table: 'table',`,
    `  function: 'function',`,
    `  procedure: 'procedure',`,
    `  enum: 'enum',`,
    `  column: 'column',`,
    `} as const;`,
    `export type SqlDescriptionKind = typeof SqlDescriptionKind[keyof typeof SqlDescriptionKind];`,
].join('\n');

const SQL_DESCRIPTION_KIND_DECL_DTS = [
    `export declare const SqlDescriptionKind: {`,
    `  readonly table: 'table';`,
    `  readonly function: 'function';`,
    `  readonly procedure: 'procedure';`,
    `  readonly enum: 'enum';`,
    `  readonly column: 'column';`,
    `};`,
    `export type SqlDescriptionKind = typeof SqlDescriptionKind[keyof typeof SqlDescriptionKind];`,
].join('\n');

const SQL_DESCRIPTION_KIND_DECL_JS = [
    `exports.SqlDescriptionKind = {`,
    `  table: 'table',`,
    `  function: 'function',`,
    `  procedure: 'procedure',`,
    `  enum: 'enum',`,
    `  column: 'column',`,
    `};`,
].join('\n');

const ACCESSOR_OVERLOADS = (declare: boolean) => {
    const prefix = declare ? 'export declare function' : 'export function';
    return [
        `${prefix} getSqlDescription(kind: 'table', name: keyof CommentsRegistry['tables']): string | undefined;`,
        `${prefix} getSqlDescription(kind: 'function' | 'procedure', name: keyof CommentsRegistry['routines']): string | undefined;`,
        `${prefix} getSqlDescription(kind: 'enum', name: keyof CommentsRegistry['enums']): string | undefined;`,
        `${prefix} getSqlDescription<T extends keyof CommentsRegistry['columns']>(kind: 'column', table: T, column: keyof CommentsRegistry['columns'][T]): string | undefined;`,
    ].join('\n');
};

// `b` is typed as `unknown` (not `string`) purely so this implementation signature is compatible
// with the generic 'column' overload above — TS can't reduce `keyof CommentsRegistry['columns'][T]`
// against a plain `string` for an unresolved T. Callers never see this signature; the public
// overloads above still constrain them to real table/column names.
const ACCESSOR_IMPL_TS = [
    `export function getSqlDescription(kind: SqlDescriptionKind, a: string, b?: unknown): string | undefined {`,
    `  switch (kind) {`,
    `    case 'table': return (SqlComments.tables as Record<string, string>)[a];`,
    `    case 'enum': return (SqlComments.enums as Record<string, string>)[a];`,
    `    case 'function':`,
    `    case 'procedure': return (SqlComments.routines as Record<string, string>)[a];`,
    `    case 'column': return b !== undefined ? (SqlComments.columns as Record<string, Record<string, string>>)[a]?.[b as string] : undefined;`,
    `  }`,
    `}`,
].join('\n');

const ACCESSOR_JS = [
    `function getSqlDescription(kind, a, b) {`,
    `  switch (kind) {`,
    `    case 'table': return exports.SqlComments.tables[a];`,
    `    case 'enum': return exports.SqlComments.enums[a];`,
    `    case 'function':`,
    `    case 'procedure': return exports.SqlComments.routines[a];`,
    `    case 'column': return b !== undefined ? exports.SqlComments.columns[a]?.[b] : undefined;`,
    `  }`,
    `}`,
    `exports.getSqlDescription = getSqlDescription;`,
].join('\n');

export async function generateCommentsFile(registry: CommentsRegistry): Promise<string> {
    return [
        generateRegistryTypeDecl(registry),
        ``,
        SQL_DESCRIPTION_KIND_DECL_TS,
        ``,
        `export const SqlComments: CommentsRegistry = ${JSON.stringify(registry, null, 2)};`,
        ``,
        ACCESSOR_OVERLOADS(false),
        ACCESSOR_IMPL_TS,
    ].join('\n');
}

export async function generateCommentsJs(registry: CommentsRegistry): Promise<string> {
    return [
        `"use strict";`,
        `Object.defineProperty(exports, "__esModule", { value: true });`,
        `exports.getSqlDescription = exports.SqlComments = exports.SqlDescriptionKind = void 0;`,
        SQL_DESCRIPTION_KIND_DECL_JS,
        `exports.SqlComments = ${JSON.stringify(registry, null, 2)};`,
        ACCESSOR_JS,
    ].join('\n');
}

export async function generateCommentsDts(registry: CommentsRegistry): Promise<string> {
    return [
        generateRegistryTypeDecl(registry),
        ``,
        SQL_DESCRIPTION_KIND_DECL_DTS,
        ``,
        `export declare const SqlComments: CommentsRegistry;`,
        ACCESSOR_OVERLOADS(true),
    ].join('\n');
}
