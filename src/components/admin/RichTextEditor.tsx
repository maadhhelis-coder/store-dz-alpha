"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import { Mark, mergeAttributes } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { Bold, Italic, List, ListOrdered, Heading2, Underline, Strikethrough, Ban } from "lucide-react";
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
  const editor = useEditor({
    extensions: [StarterKit, TextColor],
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
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}

function ToolbarButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
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
