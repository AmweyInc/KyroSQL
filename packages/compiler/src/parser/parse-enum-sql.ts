export interface EnumDefinition {
    name: string;
    values: string[];
}

const ENUM_SQL_PATTERN = /CREATE\s+TYPE\s+("?\w+"?)\s+AS\s+ENUM\s*\(([\s\S]*?)\)/i;

export function isEnumTypeSql(sql: string): boolean {
    return ENUM_SQL_PATTERN.test(sql);
}

export function parseEnumTypeSql(sql: string): EnumDefinition {
    const match = sql.match(ENUM_SQL_PATTERN);

    if (!match) {
        throw new Error("Invalid CREATE TYPE ... AS ENUM SQL");
    }

    const name = match[1]!.replace(/"/g, "");
    const values = match[2]!
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean)
        .map((value) => value.replace(/^'([\s\S]*)'$/, "$1").replace(/''/g, "'"));

    return { name, values };
}
