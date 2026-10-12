export function isContractNode(node: any): boolean {
    return node && node.sql !== undefined;
}
