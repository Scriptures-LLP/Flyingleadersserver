import Color from "@tiptap/extension-color";
import Highlight from "@tiptap/extension-highlight";
import Placeholder from "@tiptap/extension-placeholder";
import TextAlign from "@tiptap/extension-text-align";
import TextStyle from "@tiptap/extension-text-style";
import Underline from "@tiptap/extension-underline";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useEffect } from "react";

import { FontSize } from "./tiptapFontSize";

type Props = {
  value: string;
  onChange: (html: string) => void;
  minHeight?: number;
  placeholder?: string;
};

const HIGHLIGHT_COLORS = ["#FEF08A", "#BBF7D0", "#BFDBFE", "#FBCFE8"];
const TEXT_COLORS = ["#111827", "#DC2626", "#2563EB", "#16A34A", "#9333EA"];

// Edits the same HTML string the app/PDF render elsewhere — this is the one
// place admins write it, so it needs to cover real formatting (headings,
// alignment, color, lists) rather than a plain textarea they'd have to
// hand-write HTML into.
export function RichTextEditor({ value, onChange, minHeight = 160, placeholder }: Props) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      TextStyle,
      FontSize,
      Color,
      Highlight.configure({ multicolor: true }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Placeholder.configure({ placeholder: placeholder ?? "" }),
    ],
    content: value,
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
  });

  useEffect(() => {
    if (editor && value !== editor.getHTML()) {
      editor.commands.setContent(value, false);
    }
    // Only resync when the external value changes (e.g. after load/save) —
    // not on every keystroke, which would fight the user's cursor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, editor]);

  if (!editor) return null;

  const btn = (active: boolean) =>
    `rounded px-2 py-1 text-xs font-medium ${active ? "bg-red-600 text-white" : "text-slate-600 hover:bg-slate-100"}`;
  const sep = <div className="mx-1 w-px self-stretch bg-slate-200" />;

  return (
    <div className="rounded-md border border-slate-300">
      <div className="flex flex-wrap items-center gap-1 border-b border-slate-200 bg-slate-50 p-1.5">
        <button type="button" className={btn(editor.isActive("bold"))} onClick={() => editor.chain().focus().toggleBold().run()}>
          <b>B</b>
        </button>
        <button type="button" className={btn(editor.isActive("italic"))} onClick={() => editor.chain().focus().toggleItalic().run()}>
          <i>I</i>
        </button>
        <button type="button" className={btn(editor.isActive("underline"))} onClick={() => editor.chain().focus().toggleUnderline().run()}>
          <u>U</u>
        </button>
        {sep}
        <select
          title="Block style — applies to the whole line/paragraph"
          className="rounded border border-slate-300 bg-white px-1.5 py-1 text-xs"
          value={editor.isActive("heading", { level: 1 }) ? "1" : editor.isActive("heading", { level: 2 }) ? "2" : editor.isActive("heading", { level: 3 }) ? "3" : "0"}
          onChange={(e) => {
            const level = Number(e.target.value);
            if (level === 0) editor.chain().focus().setParagraph().run();
            else editor.chain().focus().toggleHeading({ level: level as 1 | 2 | 3 }).run();
          }}
        >
          <option value="0">Paragraph</option>
          <option value="1">Heading 1</option>
          <option value="2">Heading 2</option>
          <option value="3">Heading 3</option>
        </select>
        <select
          title="Font size — applies only to the selected text"
          className="rounded border border-slate-300 bg-white px-1.5 py-1 text-xs"
          value={(editor.getAttributes("textStyle").fontSize as string | undefined) ?? ""}
          onChange={(e) => {
            const size = e.target.value;
            if (!size) editor.chain().focus().unsetFontSize().run();
            else editor.chain().focus().setFontSize(size).run();
          }}
        >
          <option value="">Normal size</option>
          <option value="0.85em">Small</option>
          <option value="1.25em">Large</option>
          <option value="1.5em">Extra large</option>
        </select>
        {sep}
        <button type="button" className={btn(editor.isActive({ textAlign: "left" }))} onClick={() => editor.chain().focus().setTextAlign("left").run()}>
          Left
        </button>
        <button type="button" className={btn(editor.isActive({ textAlign: "center" }))} onClick={() => editor.chain().focus().setTextAlign("center").run()}>
          Center
        </button>
        <button type="button" className={btn(editor.isActive({ textAlign: "right" }))} onClick={() => editor.chain().focus().setTextAlign("right").run()}>
          Right
        </button>
        {sep}
        <button type="button" className={btn(editor.isActive("bulletList"))} onClick={() => editor.chain().focus().toggleBulletList().run()}>
          • List
        </button>
        <button type="button" className={btn(editor.isActive("orderedList"))} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
          1. List
        </button>
        {sep}
        <span className="text-xs text-slate-500">Color</span>
        {TEXT_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            title="Text color"
            className="h-5 w-5 rounded-full border border-slate-300"
            style={{ backgroundColor: c }}
            onClick={() => editor.chain().focus().setColor(c).run()}
          />
        ))}
        <button
          type="button"
          className="rounded px-1.5 py-1 text-xs text-slate-600 hover:bg-slate-100"
          onClick={() => editor.chain().focus().unsetColor().run()}
        >
          Reset
        </button>
        {sep}
        <span className="text-xs text-slate-500">Highlight</span>
        {HIGHLIGHT_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            title="Highlight"
            className="h-5 w-5 rounded-full border border-slate-300"
            style={{ backgroundColor: c }}
            onClick={() => editor.chain().focus().toggleHighlight({ color: c }).run()}
          />
        ))}
        <button
          type="button"
          className="rounded px-1.5 py-1 text-xs text-slate-600 hover:bg-slate-100"
          onClick={() => editor.chain().focus().unsetHighlight().run()}
        >
          None
        </button>
        {sep}
        <button type="button" className={btn(false)} onClick={() => editor.chain().focus().undo().run()}>
          Undo
        </button>
        <button type="button" className={btn(false)} onClick={() => editor.chain().focus().redo().run()}>
          Redo
        </button>
      </div>
      <EditorContent
        editor={editor}
        className="prose prose-sm max-w-none px-3 py-2 [&_.ProseMirror]:outline-none"
        style={{ minHeight }}
      />
    </div>
  );
}
