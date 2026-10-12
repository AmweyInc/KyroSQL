import { SelectResult } from "../../../types/src/schema/select-result";
import {SelectColumn} from "../../../types/src/schema/select-column";

export function parseSelect(sql: string): SelectResult {
    const cleanSql = sql.replace(/\s+/g, " ").trim();
    const selectMatch = cleanSql.match(/SELECT\s+(.*?)\s+FROM\s+([a-zA-Z_][a-zA-Z0-9_]*)/i);

    if (!selectMatch) {
        const fromMatch = cleanSql.match(/FROM\s+([a-zA-Z_][a-zA-Z0-9_]*)/i);

        if (fromMatch) {
            const selectPart = cleanSql.substring(
                cleanSql.indexOf("SELECT") + 6,
                cleanSql.indexOf("FROM")
            ).trim();

            const columns = selectPart
                .split(",")
                .map((c) => c.trim())
                .filter(Boolean)
                .map(parseColumn);

            return {
                columns,
                from: fromMatch[1],
            };
        }

        throw new Error(`Invalid SELECT query: ${cleanSql.substring(0, 100)}`);
    }

    const rawColumns = selectMatch[1];
    const from = selectMatch[2];

    const columns = rawColumns
        .split(",")
        .map((c) => c.trim())
        .filter(Boolean)
        .map(parseColumn);

    return {
        columns,
        from,
    };
}

function parseColumn(column: string): SelectColumn {
    const aliasMatch = column.match(/(.+)\s+as\s+(.+)/i);

    if (aliasMatch) {
        return {
            name: aliasMatch[1].trim(),
            alias: aliasMatch[2].trim(),
        };
    }

    return {
        name: column,
    };
}
