import { TableSchema } from "../../../types/src/schema/table-schema";
import { TableColumn } from "../../../types/src/schema/table-column";
import { EnumRegistry } from "../../../types/src/schema/enum-registry";
import { mapSqlType } from "../../../types/src/sql/sql-column-type";
import { parseCommentStatements } from "./parse-comment-sql";

const TABLE_CONSTRAINT_KEYWORDS = ["CONSTRAINT", "PRIMARY", "FOREIGN", "UNIQUE", "CHECK", "EXCLUDE", "LIKE"];

export function parseTableSql(sql: string, enumRegistry?: EnumRegistry): TableSchema {
    const nameMatch = sql.match(/CREATE TABLE\s+(?:IF NOT EXISTS\s+)?("?\w+"?)/i);

    if (!nameMatch) {
        throw new Error("Invalid CREATE TABLE SQL");
    }

    const tableName = nameMatch[1].replace(/"/g, "");
    const body = extractTableBody(sql);

    const columns = splitTopLevel(body)
        .map((definition) => definition.trim())
        .filter(Boolean)
        .filter((definition) => !isTableConstraint(definition))
        .map((definition) => parseColumn(definition, enumRegistry));

    const comments = parseCommentStatements(sql);
    const comment = comments.tables[tableName];
    const columnComments = comments.columns[tableName];

    if (columnComments) {
        for (const column of columns) {
            const comment = columnComments[column.name];
            if (comment) column.comment = comment;
        }
    }

    return { tableName, columns, comment };
}

function extractTableBody(sql: string): string {
    const start = sql.indexOf("(");

    if (start === -1) {
        throw new Error("Invalid CREATE TABLE SQL");
    }

    let depth = 0;

    for (let i = start; i < sql.length; i++) {
        const char = sql[i];

        if (char === "(") {
            depth++;
        } else if (char === ")") {
            depth--;
            if (depth === 0) {
                return sql.slice(start + 1, i);
            }
        }
    }

    throw new Error("Unbalanced parentheses in CREATE TABLE SQL");
}


function splitTopLevel(body: string): string[] {
    const segments: string[] = [];
    let depth = 0;
    let current = "";

    for (const char of body) {
        if (char === "(") {
            depth++;
        } else if (char === ")") {
            depth--;
        }

        if (char === "," && depth === 0) {
            segments.push(current);
            current = "";
            continue;
        }

        current += char;
    }

    segments.push(current);

    return segments;
}

function isTableConstraint(definition: string): boolean {
    const firstToken = (definition.split(/\s+/)[0] ?? "").toUpperCase();
    return TABLE_CONSTRAINT_KEYWORDS.includes(firstToken);
}

function parseColumn(definition: string, enumRegistry?: EnumRegistry): TableColumn {
    const parts = definition.split(/\s+/);

    const name = parts[0].replace(/"/g, "");
    const type = mapSqlType(parts[1], name, enumRegistry);

    return { name, type };
}
