import sanitizeHtml from "sanitize-html";

// يحصر المسموح بما يُنتجه RichTextEditor فعليًا (TipTap: Bold, Italic, Heading2, قوائم) —
// لا روابط ولا صور ولا أي سمة (attribute)، فلا حاجة لأي تعقيد إضافي فخيارات sanitize-html.
export function sanitizeProductHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: ["p", "strong", "em", "b", "i", "ul", "ol", "li", "h2", "br"],
    allowedAttributes: {},
  });
}
