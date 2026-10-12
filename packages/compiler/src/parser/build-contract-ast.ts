import fs from "node:fs/promises";
import { parsePath } from "./path-parser";
import { RootContractAst } from "../../../types/src/contract/contract-root";
import { ContractNode } from "../../../types/src/contract/contract-node";
import { ContractTree } from "../../../types/src/contract/contract-tree";
import { expandSelectStar } from "./expand-select";
import { parseTableSql } from "./parse-table-sql";
import { parseFunctionSql } from "./parse-function-sql";
import { isEnumTypeSql } from "./parse-enum-sql";
import { resolveSelectResult } from "./resolve-select-result";
import { SchemaRegistry } from "../../../types/src/schema/schema-register";
import { EnumRegistry } from "../../../types/src/schema/enum-registry";

export async function buildContractAst(
    files: string[],
    schemaRoot: SchemaRegistry,
    enumRegistry?: EnumRegistry
): Promise<RootContractAst> {
    const ast: RootContractAst = {
        functions: {},
        procedures: {},
        tables: {},
    };

    for (const filePath of files) {
        const parsed = parsePath(filePath);
        const sql = await fs.readFile(filePath, "utf-8");

        if (parsed.layer === "enums") {
            continue;
        }

        if (parsed.layer === "tables" && isEnumTypeSql(sql)) {
            continue;
        }

        if (parsed.layer === "tables") {
            const tableSchema = parseTableSql(sql, enumRegistry);
            const node: ContractNode = {
                type: parsed.layer,
                name: parsed.name,
                namespace: parsed.namespace,
                filePath: parsed.fullPath,
                sql,
                params: [],
                result: tableSchema.columns,
                comment: tableSchema.comment,
            };
            insertNode(ast, node);
        } else {
            const signature = parseFunctionSql(sql);


            const placeholders = signature.params
                .map((_, i) => `$${i + 1}`)
                .join(', ');
            const callSql = signature.isFunction
                ? `SELECT * FROM ${signature.sqlName}(${placeholders})`
                : `CALL ${signature.sqlName}(${placeholders})`;

            let result = signature.returns;
            if (result.length === 0 && signature.selectSql && signature.isFunction) {
                const expanded = expandSelectStar(signature.selectSql, schemaRoot);
                result = resolveSelectResult(expanded, schemaRoot);
            }

            const node: ContractNode = {
                type: parsed.layer,
                name: parsed.name,
                namespace: parsed.namespace,
                filePath: parsed.fullPath,
                sql: callSql,
                params: signature.params,
                result,
                comment: signature.comment,
            };
            insertNode(ast, node);
        }
    }

    return ast;
}

function insertNode(ast: RootContractAst, node: ContractNode) {
    let current: ContractTree = ast[node.type];
    for (const part of node.namespace) {
        if (!current[part]) current[part] = {};
        current = current[part] as ContractTree;
    }
    current[node.name] = node;
}
