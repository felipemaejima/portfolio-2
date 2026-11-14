/** Paragraphs of a text typed with blank lines between them; single line breaks (hard wraps) stay inside. */
export function paragraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

/** Items of a list typed as "a | b | c". */
export function splitItems(text: string): string[] {
  return text
    .split('|')
    .map((item) => item.trim())
    .filter(Boolean);
}
