import { SchemaRegistry } from "../../../types/src/schema/schema-register";

export function expandSelectStar(sql: string, schema: SchemaRegistry): string {
    let result = sql;

    result = result.replace(
        /SELECT\s+\*\s+FROM\s+([a-zA-Z_]+)/gi,
        (_, tableName: string) => {
            const table = schema[tableName];
            if (!table) return `SELECT * FROM ${tableName}`;
            return `SELECT ${table.columns.map(c => c.name).join(', ')} FROM ${tableName}`;
        }
    );

    result = result.replace(
        /RETURNING\s+\*/gi,
        () => {
            const tableMatch = result.match(/(?:INSERT\s+INTO\s+|UPDATE\s+)(\w+)/i);
            if (!tableMatch) return 'RETURNING *';
            const table = schema[tableMatch[1]!];
            if (!table) return 'RETURNING *';
            return `RETURNING ${table.columns.map(c => c.name).join(', ')}`;
        }
    );

    return result;
}
