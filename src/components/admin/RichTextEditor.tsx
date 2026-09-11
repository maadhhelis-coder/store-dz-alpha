"use client";

import { useRef, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
// TiptapNode باسم مستعار: Node وحده يتعارض مع Node الخاص بالـDOM فيلتقط TypeScript
// الثاني ويسقط .create()
import { Mark, Node as TiptapNode, mergeAttributes } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import {
  Bold,
  Italic,
  List,
  ListOrdered,
  Heading2,
  Underline,
  Strikethrough,
  Ban,
  ImagePlus,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";

// لون النص — علامة (Mark) محلية بـ@tiptap/core بدل حزمة extension-color: تلك
// ما زالت على TipTap 2 ولا تُركَّب مع 3 (تعارض peer فعلي عند npm install).
// عشرون سطرًا تُغني عن اعتماد لا يُحَل.
const TextColor = Mark.create({
  name: "textColor",
  addAttributes() {
    return {
      color: {
        default: null,
        parseHTML: (element) => element.style.color || null,
        renderHTML: (attributes) =>
          attributes.color ? { style: `color: ${attributes.color}` } : {},
      },
    };
  },
  parseHTML() {
    return [{ style: "color", getAttrs: (value) => (value ? { color: value } : false) }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes(HTMLAttributes), 0];
  },
});

// صورة داخل الوصف — عقدة محلية بـ@tiptap/core لنفس سبب TextColor أعلاه: حزمة
// extension-image ما زالت على TipTap 2 ولا تُركَّب مع 3. عشرة أسطر تُغني عنها.
// المصدر يأتي حصرًا من مسار الرفع الإداري (تخزين المتجر نفسه)، والمنقّي
// (sanitizeProductHtml) يرفض أي مضيف آخر — فلا تُحقن صور خارجية عبر الوصف.
const InlineImage = TiptapNode.create({
  name: "inlineImage",
  group: "block",
  atom: true,
  draggable: true,
  addAttributes() {
    return { src: { default: null }, alt: { default: null } };
  },
  parseHTML() {
    return [{ tag: "img[src]" }];
  },
  renderHTML({ HTMLAttributes }: { HTMLAttributes: Record<string, unknown> }) {
    return ["img", mergeAttributes(HTMLAttributes)];
  },
});

// لوحة الهوية البصرية — الذهبي أولًا، ثم ألوان الحالة. القيم بصيغة hex لأن
// المنقّي (sanitizeProductHtml) يقبل hex/rgb حصرًا ويرفض ما عداهما.
const COLORS: { value: string; label: string }[] = [
  { value: "#e8c66a", label: "ذهبي" },
  { value: "#f5efe0", label: "كريمي" },
  { value: "#ffffff", label: "أبيض" },
  { value: "#f87171", label: "أحمر" },
  { value: "#4ade80", label: "أخضر" },
  { value: "#60a5fa", label: "أزرق" },
];

type RichTextEditorProps = {
  value: string;
  onChange: (html: string) => void;
};

export default function RichTextEditor({ value, onChange }: RichTextEditorProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const editor = useEditor({
    extensions: [StarterKit, TextColor, InlineImage],
    content: value,
    immediatelyRender: false,
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
    editorProps: {
      attributes: {
        class: "prose-invert max-w-none min-h-[160px] px-3 py-2.5 text-sm text-cream focus:outline-none",
        dir: "rtl",
      },
    },
  });

  async function handleImagePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !editor) return;
    setUploadError(null);
    setUploading(true);
    const body = new FormData();
    body.append("file", file);
    try {
      const res = await fetch("/api/admin/media/upload", { method: "POST", body });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.url) {
        setUploadError(data?.error ?? `تعذّر رفع الصورة (رمز ${res.status})`);
        return;
      }
      // alt من اسم الملف (بلا الامتداد) لا نصّ فارغ: الرابط المرفوع UUID لا يدلّ على
      // شيء، أما اسم الملف عند صاحب المتجر («فلتر-قبل-وبعد.jpg») فوصف حقيقي — يفيد
      // محرّكات البحث وقارئات الشاشة بلا أن يكتبه أحد يدويًا.
      const alt = file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim();
      editor.chain().focus().insertContent({ type: "inlineImage", attrs: { src: data.url, alt } }).run();
    } catch {
      setUploadError("تعذّر الاتصال بالخادم أثناء رفع الصورة");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  if (!editor) return null;

  return (
    <div className="rounded-lg bg-black border border-gold/25 focus-within:border-gold transition-colors overflow-hidden">
      <div className="flex flex-wrap items-center gap-1 border-b border-gold/15 px-2 py-1.5">
        <ToolbarButton active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}>
          <Bold className="w-3.5 h-3.5" />
        </ToolbarButton>
        <ToolbarButton active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}>
          <Italic className="w-3.5 h-3.5" />
        </ToolbarButton>
        <ToolbarButton
          active={editor.isActive("underline")}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
        >
          <Underline className="w-3.5 h-3.5" />
        </ToolbarButton>
        <ToolbarButton active={editor.isActive("strike")} onClick={() => editor.chain().focus().toggleStrike().run()}>
          <Strikethrough className="w-3.5 h-3.5" />
        </ToolbarButton>
        <ToolbarButton
          active={editor.isActive("heading", { level: 2 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        >
          <Heading2 className="w-3.5 h-3.5" />
        </ToolbarButton>
        <ToolbarButton
          active={editor.isActive("bulletList")}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          <List className="w-3.5 h-3.5" />
        </ToolbarButton>
        <ToolbarButton
          active={editor.isActive("orderedList")}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          <ListOrdered className="w-3.5 h-3.5" />
        </ToolbarButton>

        <span className="mx-1 h-4 w-px bg-gold/20" />

        {COLORS.map((color) => (
          <button
            key={color.value}
            type="button"
            title={color.label}
            aria-label={`لون النص: ${color.label}`}
            onClick={() => editor.chain().focus().setMark("textColor", { color: color.value }).run()}
            className={cn(
              "w-5 h-5 rounded-full border transition-transform hover:scale-110",
              editor.isActive("textColor", { color: color.value })
                ? "border-gold ring-1 ring-gold"
                : "border-cream/20",
            )}
            style={{ backgroundColor: color.value }}
          />
        ))}
        <ToolbarButton
          active={false}
          onClick={() => editor.chain().focus().unsetMark("textColor").run()}
        >
          <Ban className="w-3.5 h-3.5" />
        </ToolbarButton>

        <span className="mx-1 h-4 w-px bg-gold/20" />

        <ToolbarButton
          active={false}
          title="إضافة صورة داخل الوصف"
          onClick={() => fileInputRef.current?.click()}
        >
          {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ImagePlus className="w-3.5 h-3.5" />}
        </ToolbarButton>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={handleImagePick}
          className="hidden"
        />
      </div>
      {uploadError && <p className="px-3 pt-2 text-xs text-red-400">{uploadError}</p>}
      <EditorContent editor={editor} />
    </div>
  );
}

function ToolbarButton({
  active,
  onClick,
  children,
  title,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={cn(
        "p-1.5 rounded transition-colors",
        active ? "bg-gold text-ink" : "text-cream-dim hover:text-gold",
      )}
    >
      {children}
    </button>
  );
}
