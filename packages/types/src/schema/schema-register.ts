import { TableSchema } from "./table-schema";

export type SchemaRegistry = {
    [tableName: string]: TableSchema;
};
