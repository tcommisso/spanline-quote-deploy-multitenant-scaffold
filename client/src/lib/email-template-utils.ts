type TemplateLike = {
  letterType?: string | null;
  name?: string | null;
  subject?: string | null;
};

export type TemplateVariableMap = Record<string, string | number | null | undefined>;

export function formatTemplateKey(value: string) {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function formatEmailTemplateLabel(template: TemplateLike) {
  if (template.subject?.trim()) return template.subject.trim();
  if (template.name?.trim()) return template.name.trim();
  if (template.letterType?.trim()) return formatTemplateKey(template.letterType);
  return "Untitled template";
}

export function renderTemplateVariables(value: string, replacements: TemplateVariableMap) {
  return value.replace(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g, (_match, key) => {
    const replacement = replacements[key];
    return replacement == null ? "" : String(replacement);
  });
}

export function hasHtmlMarkup(value: string) {
  return /<\/?[a-z][\s\S]*>/i.test(value);
}

export function sanitizeTemplateHtml(value: string) {
  return value
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/\son[a-z]+\s*=\s*(['"]).*?\1/gi, "")
    .replace(/\son[a-z]+\s*=\s*[^\s>]+/gi, "");
}

export function htmlToPlainText(value: string) {
  const withoutScripts = sanitizeTemplateHtml(value);
  const withBreaks = withoutScripts
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, "\n")
    .replace(/<li\b[^>]*>/gi, "- ")
    .replace(/<[^>]+>/g, "");

  return decodeBasicHtmlEntities(withBreaks)
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function messageBodyToHtml(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return hasHtmlMarkup(trimmed) ? sanitizeTemplateHtml(trimmed) : trimmed.replace(/\n/g, "<br/>");
}

export function messageBodyToText(value: string) {
  return hasHtmlMarkup(value) ? htmlToPlainText(value) : value;
}

export function appendTemplateBody(current: string, renderedBody: string) {
  const next = renderedBody.trim();
  const existing = current.trim();
  if (!next) return current;
  if (!existing) return next;
  return hasHtmlMarkup(existing) || hasHtmlMarkup(next)
    ? `${existing}<br/><br/>${next}`
    : `${existing}\n\n${next}`;
}

function decodeBasicHtmlEntities(value: string) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}
