// El parser entrega datos externos; los tests validan su estructura desde unknown.
declare module "js-yaml" {
  export function load(source: string): unknown;
}
