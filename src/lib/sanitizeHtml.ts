import sanitizeHtml from "sanitize-html";

// وصف المنتج — يُنقّى بما يُنتجه RichTextEditor فعليًا.
//
// كان يمنع كل السمات (allowedAttributes: {}) فيُسقِط أي لون أو محاذاة يكتبها
// المسؤول في المحرر بصمت. الآن يُسمح بـstyle على قائمة خصائص مغلقة وقيم مقيّدة
// بأنماط صريحة (sanitize-html يرفض أي قيمة خارجها) — لا url() ولا expression
// ولا أي شيء يفتح باب حقن. الروابط والصور تبقى ممنوعة.

const COLOR = [/^#(0x)?[0-9a-fA-F]{3,8}$/, /^rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*(,\s*[\d.]+\s*)?\)$/];

export function sanitizeProductHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: [
      "p",
      "strong",
      "em",
      "b",
      "i",
      "u",
      "s",
      "span",
      "ul",
      "ol",
      "li",
      "h2",
      "h3",
      "br",
      "hr",
      "blockquote",
    ],
    allowedAttributes: { "*": ["style"] },
    allowedStyles: {
      "*": {
        color: COLOR,
        "background-color": COLOR,
        "text-align": [/^(right|left|center|justify)$/],
        "font-size": [/^\d{1,3}(\.\d+)?(px|rem|em|%)$/],
        "font-weight": [/^(normal|bold|[1-9]00)$/],
      },
    },
  });
}
