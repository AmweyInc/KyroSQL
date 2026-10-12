export type ParsedComments = {
    tables: Record<string, string>;
    columns: Record<string, Record<string, string>>;
    routines: Record<string, string>;
    enums: Record<string, string>;
};

const COMMENT_ON_TABLE = /COMMENT\s+ON\s+TABLE\s+"?(\w+)"?\s+IS\s+'((?:[^']|'')*)'/gi;
const COMMENT_ON_COLUMN = /COMMENT\s+ON\s+COLUMN\s+"?(\w+)"?\."?(\w+)"?\s+IS\s+'((?:[^']|'')*)'/gi;
const COMMENT_ON_ROUTINE = /COMMENT\s+ON\s+(?:FUNCTION|PROCEDURE)\s+"?(\w+)"?\s*\([^)]*\)\s+IS\s+'((?:[^']|'')*)'/gi;
const COMMENT_ON_TYPE = /COMMENT\s+ON\s+TYPE\s+"?(\w+)"?\s+IS\s+'((?:[^']|'')*)'/gi;

export function parseCommentStatements(sql: string): ParsedComments {
    const tables: Record<string, string> = {};
    const columns: Record<string, Record<string, string>> = {};
    const routines: Record<string, string> = {};
    const enums: Record<string, string> = {};

    for (const match of sql.matchAll(COMMENT_ON_TABLE)) {
        tables[match[1]!] = unescapeComment(match[2]!);
    }

    for (const match of sql.matchAll(COMMENT_ON_COLUMN)) {
        const tableName = match[1]!;
        columns[tableName] ??= {};
        columns[tableName]![match[2]!] = unescapeComment(match[3]!);
    }

    for (const match of sql.matchAll(COMMENT_ON_ROUTINE)) {
        routines[match[1]!] = unescapeComment(match[2]!);
    }

    for (const match of sql.matchAll(COMMENT_ON_TYPE)) {
        enums[match[1]!] = unescapeComment(match[2]!);
    }

    return { tables, columns, routines, enums };
}

function unescapeComment(text: string): string {
    return text.replace(/''/g, "'");
}
