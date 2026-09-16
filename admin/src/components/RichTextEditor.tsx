import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useEffect } from "react";

type Props = {
  value: string;
  onChange: (html: string) => void;
};

// Edits the same HTML string the legacy PHP site echoes out unescaped —
// this just gives the admin a formatted view/toolbar instead of raw tags,
// it doesn't change what's actually stored.
export function RichTextEditor({ value, onChange }: Props) {
  const editor = useEditor({
    extensions: [StarterKit],
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
    `rounded px-2 py-1 text-sm font-medium ${active ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"}`;

  return (
    <div className="rounded-md border border-slate-300">
      <div className="flex flex-wrap gap-1 border-b border-slate-200 bg-slate-50 p-1.5">
        <button type="button" className={btn(editor.isActive("bold"))} onClick={() => editor.chain().focus().toggleBold().run()}>
          Bold
        </button>
        <button type="button" className={btn(editor.isActive("italic"))} onClick={() => editor.chain().focus().toggleItalic().run()}>
          Italic
        </button>
        <button type="button" className={btn(editor.isActive("heading", { level: 2 }))} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
          H2
        </button>
        <button type="button" className={btn(editor.isActive("bulletList"))} onClick={() => editor.chain().focus().toggleBulletList().run()}>
          Bullets
        </button>
        <button type="button" className={btn(editor.isActive("orderedList"))} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
          Numbered
        </button>
        <button type="button" className={btn(false)} onClick={() => editor.chain().focus().undo().run()}>
          Undo
        </button>
        <button type="button" className={btn(false)} onClick={() => editor.chain().focus().redo().run()}>
          Redo
        </button>
      </div>
      <EditorContent editor={editor} className="prose prose-sm max-w-none px-3 py-2 [&_.ProseMirror]:min-h-[280px] [&_.ProseMirror]:outline-none" />
    </div>
  );
}
