/**
 * HTML Signature Sanitiser
 * Cleans and normalises HTML pasted from Outlook, Gmail, Apple Mail, etc.
 * Removes proprietary markup, inline styles that break rendering,
 * and produces clean, consistent HTML suitable for email signatures.
 */

// Tags allowed in email signatures
const ALLOWED_TAGS = new Set([
  "a", "b", "br", "div", "em", "h1", "h2", "h3", "h4", "h5", "h6",
  "i", "img", "li", "ol", "p", "span", "strong", "table", "tbody",
  "td", "th", "thead", "tr", "u", "ul", "hr", "blockquote", "font",
]);

// Attributes allowed on specific tags
const ALLOWED_ATTRS: Record<string, Set<string>> = {
  a: new Set(["href", "target", "title", "style"]),
  img: new Set(["src", "alt", "width", "height", "style"]),
  td: new Set(["style", "width", "height", "colspan", "rowspan", "valign", "align"]),
  th: new Set(["style", "width", "height", "colspan", "rowspan", "valign", "align"]),
  table: new Set(["style", "width", "cellpadding", "cellspacing", "border"]),
  tr: new Set(["style"]),
  div: new Set(["style"]),
  p: new Set(["style"]),
  span: new Set(["style"]),
  font: new Set(["color", "size", "face", "style"]),
  hr: new Set(["style"]),
};

// CSS properties allowed in inline styles
const ALLOWED_CSS_PROPS = new Set([
  "color", "background-color", "background",
  "font-family", "font-size", "font-weight", "font-style", "text-decoration",
  "text-align", "vertical-align", "line-height", "letter-spacing",
  "padding", "padding-top", "padding-right", "padding-bottom", "padding-left",
  "margin", "margin-top", "margin-right", "margin-bottom", "margin-left",
  "border", "border-top", "border-right", "border-bottom", "border-left",
  "border-color", "border-width", "border-style", "border-collapse", "border-spacing",
  "width", "max-width", "min-width", "height",
  "display", "white-space", "word-break",
  "table-layout",
]);

/**
 * Remove Microsoft Office conditional comments and proprietary tags
 */
function removeMsoMarkup(html: string): string {
  // Remove <!--[if ...]>...<![endif]--> conditional comments
  html = html.replace(/<!--\[if[\s\S]*?<!\[endif\]-->/gi, "");
  // Remove <!-- ... --> comments
  html = html.replace(/<!--[\s\S]*?-->/g, "");
  // Remove <o:p>, <o:OfficeDocumentSettings>, etc.
  html = html.replace(/<o:[^>]*>[\s\S]*?<\/o:[^>]*>/gi, "");
  html = html.replace(/<o:[^>]*\/>/gi, "");
  // Remove <v:*> VML tags
  html = html.replace(/<v:[^>]*>[\s\S]*?<\/v:[^>]*>/gi, "");
  html = html.replace(/<v:[^>]*\/>/gi, "");
  // Remove <w:*> Word tags
  html = html.replace(/<w:[^>]*>[\s\S]*?<\/w:[^>]*>/gi, "");
  html = html.replace(/<w:[^>]*\/>/gi, "");
  // Remove XML namespace declarations
  html = html.replace(/\s*xmlns:[a-z]+="[^"]*"/gi, "");
  // Remove class="Mso*" attributes
  html = html.replace(/\s*class="Mso[^"]*"/gi, "");
  // Remove class="gmail_*" attributes
  html = html.replace(/\s*class="gmail_[^"]*"/gi, "");
  // Remove data-* attributes
  html = html.replace(/\s*data-[a-z-]+="[^"]*"/gi, "");
  return html;
}

/**
 * Clean inline styles - keep only allowed CSS properties
 */
function cleanInlineStyle(style: string): string {
  const cleaned: string[] = [];
  // Parse style string into property:value pairs
  const declarations = style.split(";").map(d => d.trim()).filter(Boolean);
  for (const decl of declarations) {
    const colonIdx = decl.indexOf(":");
    if (colonIdx === -1) continue;
    const prop = decl.substring(0, colonIdx).trim().toLowerCase();
    const value = decl.substring(colonIdx + 1).trim();
    if (ALLOWED_CSS_PROPS.has(prop) && value) {
      // Skip mso-* properties
      if (prop.startsWith("mso-")) continue;
      // Skip expressions
      if (value.includes("expression(")) continue;
      cleaned.push(`${prop}: ${value}`);
    }
  }
  return cleaned.join("; ");
}

/**
 * Sanitise an HTML element and its children recursively
 */
function sanitiseNode(node: Node, doc: Document): Node | null {
  if (node.nodeType === Node.TEXT_NODE) {
    return doc.createTextNode(node.textContent || "");
  }

  if (node.nodeType !== Node.ELEMENT_NODE) {
    return null;
  }

  const el = node as Element;
  const tagName = el.tagName.toLowerCase();

  // Skip disallowed tags but keep their children
  if (!ALLOWED_TAGS.has(tagName)) {
    const fragment = doc.createDocumentFragment();
    for (const child of Array.from(el.childNodes)) {
      const sanitised = sanitiseNode(child, doc);
      if (sanitised) fragment.appendChild(sanitised);
    }
    return fragment;
  }

  // Create clean element
  const cleanEl = doc.createElement(tagName);
  const allowedAttrs = ALLOWED_ATTRS[tagName] || new Set<string>();

  // Copy allowed attributes
  for (const attr of Array.from(el.attributes)) {
    const attrName = attr.name.toLowerCase();
    if (allowedAttrs.has(attrName)) {
      if (attrName === "style") {
        const cleanedStyle = cleanInlineStyle(attr.value);
        if (cleanedStyle) {
          cleanEl.setAttribute("style", cleanedStyle);
        }
      } else if (attrName === "href" || attrName === "src") {
        // Only allow http, https, mailto protocols
        const val = attr.value.trim();
        if (val.startsWith("http://") || val.startsWith("https://") || val.startsWith("mailto:")) {
          cleanEl.setAttribute(attrName, val);
        }
      } else {
        cleanEl.setAttribute(attrName, attr.value);
      }
    }
  }

  // Ensure links open in new tab
  if (tagName === "a" && !cleanEl.getAttribute("target")) {
    cleanEl.setAttribute("target", "_blank");
  }

  // Recursively sanitise children
  for (const child of Array.from(el.childNodes)) {
    const sanitised = sanitiseNode(child, doc);
    if (sanitised) cleanEl.appendChild(sanitised);
  }

  return cleanEl;
}

/**
 * Post-process: collapse empty paragraphs, normalise whitespace
 */
function postProcess(html: string): string {
  // Remove empty tags (except br, img, hr)
  html = html.replace(/<(p|div|span|td|tr|table|tbody|thead)>\s*<\/\1>/gi, "");
  // Collapse multiple br tags
  html = html.replace(/(<br\s*\/?>){3,}/gi, "<br><br>");
  // Remove leading/trailing whitespace
  html = html.trim();
  // Remove excessive newlines
  html = html.replace(/\n{3,}/g, "\n\n");
  return html;
}

/**
 * Main sanitiser function - takes raw HTML from clipboard and returns clean HTML
 */
export function sanitiseSignatureHtml(rawHtml: string): string {
  if (!rawHtml || !rawHtml.trim()) return "";

  // Step 1: Remove MSO/proprietary markup at string level
  let html = removeMsoMarkup(rawHtml);

  // Step 2: Parse into DOM
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");

  // Step 3: Extract body content and sanitise
  const body = doc.body;
  const cleanDoc = document.implementation.createHTMLDocument("");
  const fragment = cleanDoc.createDocumentFragment();

  for (const child of Array.from(body.childNodes)) {
    const sanitised = sanitiseNode(child, cleanDoc);
    if (sanitised) fragment.appendChild(sanitised);
  }

  // Step 4: Serialize back to HTML
  const wrapper = cleanDoc.createElement("div");
  wrapper.appendChild(fragment);
  let result = wrapper.innerHTML;

  // Step 5: Post-process
  result = postProcess(result);

  return result;
}

/**
 * Detect the source of pasted HTML (for user feedback)
 */
export function detectSignatureSource(html: string): string {
  if (html.includes("urn:schemas-microsoft-com:office") || html.includes("class=\"Mso")) {
    return "Microsoft Outlook";
  }
  if (html.includes("class=\"gmail_")) {
    return "Gmail";
  }
  if (html.includes("-apple-") || html.includes("webkit-")) {
    return "Apple Mail";
  }
  if (html.includes("yahoo.com") || html.includes("ymail")) {
    return "Yahoo Mail";
  }
  return "Unknown";
}
