import { EnumRegistry } from "../schema/enum-registry";

export function mapSqlType(rawType: string, columnName?: string, enumRegistry?: EnumRegistry): string {
    if (!rawType) return 'any';
    let t = rawType.toLowerCase().trim();

    let arraySuffix = '';
    while (t.endsWith('[]')) {
        arraySuffix += '[]';
        t = t.slice(0, -2).trim();
    }

    const enumLiteral = resolveEnumType(t, enumRegistry);
    if (enumLiteral) return enumLiteral + arraySuffix;

    return mapScalarType(t, columnName) + arraySuffix;
}

/**
 * Resolves a lowercased, array-suffix-stripped SQL type name against a known
 * CREATE TYPE ... AS ENUM registry, returning a TS string-literal union
 * (e.g. `'active' | 'blocked' | 'pending'`), or undefined if it isn't an enum.
 */
export function resolveEnumType(baseType: string, enumRegistry?: EnumRegistry): string | undefined {
    if (!enumRegistry) return undefined;

    const key = Object.keys(enumRegistry).find((name) => name.toLowerCase() === baseType);
    if (!key) return undefined;

    return enumRegistry[key]!.map((value) => `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`).join(' | ');
}

function mapScalarType(t: string, columnName?: string): string {
    if (/^(bigint|int8)/.test(t) && /_at$/.test(columnName ?? '')) return 'Date';
    if (/^(int|integer|smallint|bigint|serial)/.test(t)) return 'number';
    if (/^(float|double|numeric|decimal)/.test(t)) return 'number';
    if (/^(text|varchar|char|character|name)/.test(t)) return 'string';
    if (/^uuid/.test(t)) return 'string';
    if (/^bool(ean)?/.test(t)) return 'boolean';
    if (/^(timestamp|date|time)/.test(t)) return 'Date';
    if (/^json/.test(t)) return 'any';

    return 'any';
}
