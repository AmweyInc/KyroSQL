import { ContractLayer } from "./contract-layer";
import { SqlParameter } from "../sql/sql-parameter";

export type ContractNode = {
    type: ContractLayer;
    name: string;
    namespace: string[];
    filePath: string;
    sql: string;
    params: SqlParameter[];
    result: Array<{ name: string; type: string; comment?: string }>;
    comment?: string;
};
