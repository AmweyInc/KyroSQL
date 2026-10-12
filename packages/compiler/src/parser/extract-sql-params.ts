import { SqlParameter } from "../../../types/src/sql/sql-parameter";

export function extractSqlParams(
    sql: string
): SqlParameter[] {
    const regex = /:([a-zA-Z0-9_]+)/g;

    const params: SqlParameter[] = [];

    const seen = new Set<string>();

    let match: RegExpExecArray | null;

    let position = 1;

    while ((match = regex.exec(sql)) !== null) {
        const name = match[1];

        if (seen.has(name)) {
            continue;
        }

        seen.add(name);

        params.push({
            name,
            position,
        });

        position++;
    }

    return params;
}
