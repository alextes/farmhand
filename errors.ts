export type FetchError = { type: "FetchError"; error: Error };
export type DecodeError = { type: "DecodeError"; error: Error };
export type BadResponse = { type: "BadResponse"; error: Error; status: number };
