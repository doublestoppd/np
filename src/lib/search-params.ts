export type SearchParams = Record<string, string | string[] | undefined>;

/** Narrows a search param that may arrive as an array. */
export function firstParam(
  value: string | string[] | undefined,
): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
