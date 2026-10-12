export type CommentsRegistry = {
    tables: Record<string, string>;
    columns: Record<string, Record<string, string>>;
    routines: Record<string, string>;
    enums: Record<string, string>;
};
