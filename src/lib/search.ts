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

export function searchFieldsMatch(fields: Array<string | null | undefined>, needle: string) {
  return searchTextMatches(fields.map((value) => value ?? "").join(" "), needle);
}
