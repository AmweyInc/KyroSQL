import { ContractNode } from "./contract-node";

export type ContractTree = {
    [key: string]: ContractTree | ContractNode;
};
