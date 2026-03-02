export const stripHtmlTags = (value: unknown): unknown => {
  if (typeof value !== "string") return value;
  return value
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/\s*p\s*>/gi, "\n\n")
    .replace(/<\s*li[^>]*>/gi, "- ")
    .replace(/<\/\s*li\s*>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .trim();
};

export const sanitizeTextFields = <T extends Record<string, any>>(
  payload: T,
  fields: string[]
): T => {
  const next = { ...payload };
  for (const field of fields) {
    if (field in next) {
      (next as Record<string, unknown>)[field] = stripHtmlTags(
        (next as Record<string, unknown>)[field]
      );
    }
  }
  return next;
};
