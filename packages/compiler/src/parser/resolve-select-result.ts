import { SchemaRegistry } from "../../../types/src/schema/schema-register";

export function resolveSelectResult(
    sql: string,
    schema: SchemaRegistry
): Array<{ name: string; type: string; comment?: string }> {
    const clean = sql.replace(/\s+/g, ' ').trim();

    const selectMatch = clean.match(/SELECT\s+([\s\S]+?)\s+FROM\s+(\w+)/i);
    if (selectMatch) {
        return resolveColumns(selectMatch[1]!, selectMatch[2]!, schema);
    }

    const returningMatch = clean.match(/RETURNING\s+([\s\S]+?)(?:\s*;?\s*$)/i);
    const tableMatch = clean.match(/(?:INSERT\s+INTO\s+|UPDATE\s+|DELETE\s+FROM\s+)(\w+)/i);
    if (returningMatch && tableMatch) {
        return resolveColumns(returningMatch[1]!, tableMatch[1]!, schema);
    }

    return [];
}

function resolveColumns(
    columnList: string,
    tableName: string,
    schema: SchemaRegistry
): Array<{ name: string; type: string; comment?: string }> {
    const tableSchema = schema[tableName];

    if (columnList.trim() === '*') {
        return tableSchema ? tableSchema.columns.map(c => buildColumn(c.name, c.type, c.comment)) : [];
    }

    return columnList
        .split(',')
        .map(c => c.trim())
        .filter(Boolean)
        .map(col => {
            const aliasMatch = col.match(/(.+)\s+(?:AS\s+)?(\w+)$/i);
            const colName = aliasMatch ? aliasMatch[2]!.trim() : col.replace(/^\w+\./, '').trim();
            const rawName = aliasMatch ? aliasMatch[1]!.trim().replace(/^\w+\./, '') : colName;
            const matchedColumn = tableSchema?.columns.find(c => c.name === rawName);
            return buildColumn(colName, matchedColumn?.type ?? 'any', matchedColumn?.comment);
        });
}

function buildColumn(name: string, type: string, comment: string | undefined): { name: string; type: string; comment?: string } {
    return comment !== undefined ? { name, type, comment } : { name, type };
}
