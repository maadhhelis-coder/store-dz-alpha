import sanitizeHtml from "sanitize-html";

// وصف المنتج — يُنقّى بما يُنتجه RichTextEditor فعليًا.
//
// كان يمنع كل السمات (allowedAttributes: {}) فيُسقِط أي لون أو محاذاة يكتبها
// المسؤول في المحرر بصمت. الآن يُسمح بـstyle على قائمة خصائص مغلقة وقيم مقيّدة
// بأنماط صريحة (sanitize-html يرفض أي قيمة خارجها) — لا url() ولا expression
// ولا أي شيء يفتح باب حقن. الروابط تبقى ممنوعة.
//
// الصور مسموحة الآن (طلب صريح: إضافة صور داخل الوصف من اللوحة) لكن بشرط واحد
// صارم: المصدر من مخزن المتجر نفسه حصرًا. allowedSchemes وحدها لا تكفي — لكانت
// أي https:// تمرّ، فتصير خانة الوصف قناة لتحميل موارد من خوادم أخرى (تتبّع
// المستخدم ببكسل خفي، أو تسريب IP الزائر). transformTags أدناه يُسقط أي img لا
// يبدأ مصدره بعنوان التخزين المُهيَّأ.

// نفس مضيف التخزين المُدرَج في next.config.ts (remotePatterns) — مصدر واحد للحقيقة
// عمليًا: أي صورة لا تُطابقه لن يُحسّنها Next أصلًا، فالسماح بها بلا فائدة.
const STORAGE_PREFIX = `${process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""}/storage/v1/object/public/`;

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
      "img",
    ],
    allowedAttributes: { "*": ["style"], img: ["src", "alt"] },
    // بلا هذا يُسقط sanitize-html السمة src على أي بروتوكول غير مُدرَج
    allowedSchemesByTag: { img: ["https"] },
    transformTags: {
      img: (tagName, attribs) => {
        const src = attribs.src ?? "";
        // مضيف غير مضيف المتجر ⇒ span فارغ (لا صورة تُحمَّل من خادم آخر)
        if (!STORAGE_PREFIX || !src.startsWith(STORAGE_PREFIX)) {
          return { tagName: "span", attribs: {} as Record<string, string> };
        }
        return { tagName, attribs: { src, alt: attribs.alt ?? "" } };
      },
    },
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
