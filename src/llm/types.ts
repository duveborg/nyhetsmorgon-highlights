export interface LlmBackend {
  name: string;
  // Returns JSON matching `schema` (a JSON Schema object). Callers validate it.
  generate(req: { system: string; prompt: string; schema: object }): Promise<unknown>;
}
