export const SqlOperationType = {
    Select: "select",
    Mutation: "mutation",
    Procedure: "procedure",
} as const;

export type SqlOperationType =
    typeof SqlOperationType[keyof typeof SqlOperationType];
