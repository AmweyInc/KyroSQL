import { TableColumn } from "./table-column";

export type TableSchema = {
    tableName: string;
    columns: TableColumn[];
    comment?: string;
};
