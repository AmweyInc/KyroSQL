import { ContractTree } from "./contract-tree";

export type RootContractAst = {
    functions: ContractTree;
    procedures: ContractTree;
    tables: ContractTree;
};
