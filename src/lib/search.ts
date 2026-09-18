/** Collapse punctuation so "hydrate me" matches "hydrate-me rinse". */
export function normalizeSearchText(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function searchTextMatches(haystack: string, needle: string) {
  const query = normalizeSearchText(needle);
  if (!query) return true;
  return normalizeSearchText(haystack).includes(query);
}

export function searchTokens(needle: string) {
  return normalizeSearchText(needle).split(" ").filter(Boolean);
}

export function searchFieldsMatch(fields: Array<string | null | undefined>, needle: string) {
  const tokens = searchTokens(needle);
  if (tokens.length === 0) return true;
  const haystack = normalizeSearchText(fields.map((value) => value ?? "").join(" "));
  return tokens.every((token) => haystack.includes(token));
}
