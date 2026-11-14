/** The project filter's tags, kept in the URL as `tags=a,b` so a filtered list can be shared. */
export function selectedTags(params: URLSearchParams): string[] {
  return params.get('tags')?.split(',').filter(Boolean) ?? [];
}

/** `params` with `tag` added to or removed from the filter, back on the first page. */
export function toggleTag(params: URLSearchParams, tag: string): URLSearchParams {
  const selected = selectedTags(params);
  const others = selected.filter((t) => !sameTag(t, tag));
  const tags = others.length < selected.length ? others : [...selected, tag];
  const next = new URLSearchParams(params);
  if (tags.length) next.set('tags', tags.join(','));
  else next.delete('tags');
  next.delete('page');
  return next;
}

/** One spelling per tag (the first one), alphabetical: the filter chips. */
export function uniqueTags(tags: string[]): string[] {
  const byKey = new Map<string, string>();
  for (const tag of tags) if (!byKey.has(tag.toLowerCase())) byKey.set(tag.toLowerCase(), tag);
  return [...byKey.values()].sort((a, b) => a.localeCompare(b));
}

/** The API matches tags case-insensitively. */
export const sameTag = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
