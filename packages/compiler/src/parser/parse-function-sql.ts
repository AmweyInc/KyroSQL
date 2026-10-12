import { SqlParameter } from "../../../types/src/sql/sql-parameter";
import { parseCommentStatements } from "./parse-comment-sql";

export interface FunctionSignature {
    sqlName: string;
    isFunction: boolean;
    params: SqlParameter[];
    returns: Array<{ name: string; type: string }>;
    selectSql: string;
    comment?: string;
}

export function parseFunctionSql(sql: string): FunctionSignature {
    const trimmed = sql.trim();

    if (/^\s*CREATE\s+(?:OR\s+REPLACE\s+)?(?:FUNCTION|PROCEDURE)/i.test(trimmed)) {
        return parseCreateFunction(trimmed);
    }

    return parseRawSql(trimmed);
}

function parseCreateFunction(sql: string): FunctionSignature {
    const headerMatch = sql.match(
        /CREATE\s+(?:OR\s+REPLACE\s+)?(FUNCTION|PROCEDURE)\s+(\w+)\s*\(([\s\S]*?)\)\s*(?:RETURNS\s+TABLE\s*\(([\s\S]*?)\))?/i
    );

    if (!headerMatch) {
        throw new Error(`Invalid CREATE FUNCTION/PROCEDURE SQL: ${sql.substring(0, 80)}`);
    }

    const isFunction = headerMatch[1]!.toUpperCase() === 'FUNCTION';
    const sqlName = headerMatch[2]!;
    const params = parseParameters(headerMatch[3] ?? '');
    const returns = headerMatch[4] ? parseReturns(headerMatch[4]) : [];

    const bodyMatch = sql.match(/AS\s*\$\$\s*([\s\S]*?)\s*\$\$/i);
    const selectSql = bodyMatch ? bodyMatch[1].trim() : '';

    const comment = parseCommentStatements(sql).routines[sqlName];

    return { sqlName, isFunction, params, returns, selectSql, comment };
}

function parseRawSql(sql: string): FunctionSignature {
    return {
        sqlName: '',
        isFunction: true,
        params: extractRawParams(sql),
        returns: [],
        selectSql: sql,
    };
}

function extractRawParams(sql: string): SqlParameter[] {
    const regex = /:([a-zA-Z0-9_]+)/g;
    const params: SqlParameter[] = [];
    const seen = new Set<string>();
    let position = 1;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(sql)) !== null) {
        const name = match[1]!;
        if (seen.has(name)) continue;
        seen.add(name);
        params.push({ name, position });
        position++;
    }

    return params;
}

function parseParameters(paramsPart: string): SqlParameter[] {
    if (!paramsPart.trim()) return [];

    let position = 1;
    const result: SqlParameter[] = [];

    for (const line of paramsPart.split(",").map(p => p.trim()).filter(Boolean)) {
        const stripped = line.replace(/^(IN|OUT|INOUT|VARIADIC)\s+/i, '');
        const match = stripped.match(/([a-zA-Z_][a-zA-Z0-9_]*)\s+([a-zA-Z_][a-zA-Z0-9_]*(?:\s*\([^)]*\))?(?:\s*\[\s*\])*)/);
        if (match) {
            result.push({ name: match[1]!, type: match[2]!.trim(), position: position++ });
        }
    }

    return result;
}

function parseReturns(returnsPart: string): Array<{ name: string; type: string }> {
    if (!returnsPart.trim()) return [];

    const result: Array<{ name: string; type: string }> = [];

    for (const line of returnsPart.split(",").map(r => r.trim()).filter(Boolean)) {
        const match = line.match(/([a-zA-Z_][a-zA-Z0-9_]*)\s+([a-zA-Z_][a-zA-Z0-9_]*(?:\s*\([^)]*\))?(?:\s*\[\s*\])*)/);
        if (match) {
            result.push({ name: match[1]!, type: match[2]!.trim() });
        }
    }

    return result;
}
