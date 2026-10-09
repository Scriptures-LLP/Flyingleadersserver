import BulletList from "@tiptap/extension-bullet-list";
import Color from "@tiptap/extension-color";
import Heading from "@tiptap/extension-heading";
import Highlight from "@tiptap/extension-highlight";
import OrderedList from "@tiptap/extension-ordered-list";
import Placeholder from "@tiptap/extension-placeholder";
import TextAlign from "@tiptap/extension-text-align";
import TextStyle from "@tiptap/extension-text-style";
import Underline from "@tiptap/extension-underline";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import { TextSelection } from "@tiptap/pm/state";
import StarterKit from "@tiptap/starter-kit";
import { useEffect, useMemo, useRef } from "react";

import { FontSize } from "./tiptapFontSize";

type Props = {
  value: string;
  onChange: (html: string) => void;
  minHeight?: number;
  placeholder?: string;
};

const HIGHLIGHT_COLORS = ["#FEF08A", "#BBF7D0", "#BFDBFE", "#FBCFE8"];
const TEXT_COLORS = ["#111827", "#DC2626", "#2563EB", "#16A34A", "#9333EA"];

// Typing "- ", "* ", "1. " or "# " at the start of a line silently turns it into
// a bullet list / numbered list / heading (markdown shortcuts). For terms and
// itinerary text that's a trap — people type those characters as plain text
// and end up with a whole document inside a list they never asked for. Lists
// and headings come only from the toolbar; the shortcuts are switched off.
const NoShortcutBulletList = BulletList.extend({ addInputRules: () => [] });
const NoShortcutOrderedList = OrderedList.extend({ addInputRules: () => [] });
const NoShortcutHeading = Heading.extend({ addInputRules: () => [] });

// Alignment belongs to a whole paragraph, but much of the content is several
// lines joined by line breaks (<br>) inside ONE paragraph — pasted text, older
// tours, Shift+Enter. Aligning one of those lines used to move all of them.
// Turn the line breaks just outside the selection into real paragraph breaks
// first, so only the selected line(s) become their own paragraph to align.
function isolateSelectedLines(editor: Editor) {
  const { state } = editor;
  const { $from, $to } = state.selection;
  const breaks = (parent: typeof $from.parent, start: number) => {
    const out: number[] = [];
    parent.forEach((child, offset) => {
      if (child.type.name === "hardBreak") out.push(start + offset);
    });
    return out;
  };
  const before = breaks($from.parent, $from.start()).filter((p) => p < $from.pos).pop();
  const after = breaks($to.parent, $to.start()).find((p) => p >= $to.pos);
  // Later position first, so the earlier one isn't shifted by the first edit.
  const cuts = [after, before].filter((p): p is number => p !== undefined);
  if (!cuts.length) return;
  const tr = state.tr;
  for (const pos of cuts) tr.delete(pos, pos + 1).split(pos);
  // Keep the selection's end on its own side of a new split — mapped as-is it
  // could slide onto the next line, which would then get aligned too.
  const from = tr.mapping.map($from.pos, 1);
  tr.setSelection(TextSelection.create(tr.doc, from, Math.max(from, tr.mapping.map($to.pos, -1))));
  editor.view.dispatch(tr);
}

// Edits the same HTML string the app/PDF render elsewhere — this is the one
// place admins write it, so it needs to cover real formatting (headings,
// alignment, color, lists) rather than a plain textarea they'd have to
// hand-write HTML into.
export function RichTextEditor({ value, onChange, minHeight = 160, placeholder }: Props) {
  // The toolbar's onMouseDown below can't preventDefault for a <select> (that
  // would stop it opening at all), so opening one still lets the browser steal
  // the editor's selection the same way a plain button click used to before it
  // was guarded. Snapshot the selection here, on the select's own mousedown —
  // which fires before that happens — and restore it in the change handler
  // before running the command, instead of trusting .focus() to still know
  // where the text was.
  const savedSelection = useRef<{ from: number; to: number } | null>(null);

  // onChange's identity changes every render (it's an inline arrow at every call
  // site, e.g. `(html) => set("shortDesc", html)`) — keep onUpdate's closure off
  // of that entirely via a ref, so it's never a reason for `extensions` below to
  // need to change either.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // TipTap reinitializes the whole editor when the `extensions` array it's given
  // is a new reference — documented TipTap behaviour, not a bug in their code.
  // This used to be a plain array literal inline in useEditor(), i.e. a brand
  // new array on every render, which React gives you on EVERY keystroke here
  // (typing -> onUpdate -> onChange -> the parent's state update -> re-render).
  // Reinitializing the editor drops the DOM's own live cursor/selection, so
  // characters typed right as a reinit lands went missing or landed in the
  // wrong place -- reproduced live: typing a full sentence left only its last
  // few words in the field, no styling applied despite clicking the toolbar,
  // and a few visible flickers, all from repeated silent reinitialization.
  // Memoizing on `placeholder` (its only real input) keeps the array the same
  // reference across every render that doesn't actually change it.
  const extensions = useMemo(
    () => [
      StarterKit.configure({
        bulletList: false,
        orderedList: false,
        heading: false,
        // Not offered in the toolbar, so their typing shortcuts (">", "```",
        // "---", backticks, "~~") would only ever fire by accident.
        blockquote: false,
        codeBlock: false,
        horizontalRule: false,
        code: false,
        strike: false,
      }),
      NoShortcutBulletList,
      NoShortcutOrderedList,
      NoShortcutHeading.configure({ levels: [1, 2, 3] }),
      Underline,
      TextStyle,
      FontSize,
      Color,
      Highlight.configure({ multicolor: true }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Placeholder.configure({ placeholder: placeholder ?? "" }),
    ],
    [placeholder],
  );

  // useEditor re-applies `content` (among its other options) via a live
  // editor.setOptions() whenever it sees ANY tracked option differ from the
  // previous render -- and `content` legitimately differs on every single
  // keystroke here (that's the whole point of a controlled value), so this
  // fired on nearly every keystroke regardless of the extensions fix above.
  // setOptions({content}) resets the document wholesale, which drops the
  // DOM's own live cursor/selection even when the text ends up identical --
  // reproduced live: typing a full sentence left only its last few words in
  // the field, with no styling applied despite clicking every toolbar button.
  // Only ever hand useEditor the value this editor was FIRST created with;
  // every update after that already goes through the useEffect below, which
  // is the one place that correctly guards against fighting the user's own
  // typing (it only calls setContent when value doesn't already match what's
  // in the editor -- i.e. only for a genuinely external change, like loading
  // a different tour to edit).
  const initialValue = useRef(value).current;
  // What we ourselves most recently emitted via onChange -- see the effect
  // below for why this, and not editor.getHTML(), is what `value` needs
  // comparing against.
  const lastEmitted = useRef(initialValue);

  const editor = useEditor({
    extensions,
    content: initialValue,
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      lastEmitted.current = html;
      onChangeRef.current(html);
    },
    // A documented TipTap/ProseMirror quirk: clicking into an empty document
    // can leave a mark (bold, in practice, every time this was tested) as the
    // PENDING "stored mark" for whatever's typed next, with no toolbar button
    // ever pressed and no sign of it until the text comes out already
    // bolded. Reproduced live on a brand-new "Add Tour" form: the very first
    // character typed into a totally empty description came out as
    // <strong>, on both the local build and the already-deployed one — this
    // is the library's own known behaviour around empty-paragraph stored
    // marks, not something specific to how this file configures it.
    //
    // unsetAllMarks() doesn't touch this: it strips marks from the SELECTED
    // TEXT, and a collapsed cursor in an empty paragraph has no text to act
    // on, so it's a silent no-op here (confirmed -- it alone didn't stop the
    // bug). What actually needs clearing is ProseMirror's stored-marks state
    // directly, one level below TipTap's own commands.
    onFocus: ({ editor }) => {
      if (editor.isEmpty) editor.view.dispatch(editor.state.tr.setStoredMarks([]));
    },
    onSelectionUpdate: ({ editor }) => {
      if (editor.isEmpty) editor.view.dispatch(editor.state.tr.setStoredMarks([]));
    },
  });

  useEffect(() => {
    if (!editor) return;
    // Comparing against editor.getHTML() (what this used to do) races fast
    // typing: onUpdate fires -> onChange -> the parent re-renders with a NEW
    // value prop, but React can take more than one keystroke's worth of time
    // to actually deliver that prop back down here, by which point the
    // editor's LIVE content has already moved further ahead (more keystrokes
    // applied on top). That later, larger getHTML() no longer matches this
    // now-stale `value`, so the guard below used to read as "value differs,
    // this must be an external change" and call setContent(value) -- rolling
    // the whole document back to that stale snapshot and silently discarding
    // everything typed in between. Reproduced live: typing a full sentence
    // fast left only its last few words in the field.
    //
    // Comparing against `lastEmitted` instead asks the right question: is
    // this `value` something WE just told the parent (however late it
    // arrives), or does it not match anything we emitted -- which only
    // happens for a genuinely external change, like loading a different
    // tour to edit. Only that second case should ever touch the document.
    if (value !== lastEmitted.current) {
      lastEmitted.current = value;
      editor.commands.setContent(value, false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, editor]);

  if (!editor) return null;

  const btn = (active: boolean) =>
    `rounded px-2 py-1 text-xs font-medium ${active ? "bg-red-600 text-white" : "text-neutral-600 hover:bg-neutral-100"}`;
  const sep = <div className="mx-1 w-px self-stretch bg-neutral-200" />;

  const captureSelection = () => {
    savedSelection.current = { from: editor.state.selection.from, to: editor.state.selection.to };
  };
  const withSavedSelection = (chain: ReturnType<typeof editor.chain>) => {
    const sel = savedSelection.current;
    return sel ? chain.setTextSelection(sel) : chain;
  };
  const align = (side: "left" | "center" | "right") => {
    isolateSelectedLines(editor);
    editor.chain().focus().setTextAlign(side).run();
  };

  return (
    <div className="rounded-md border border-neutral-300">
      <div
        className="flex flex-wrap items-center gap-1 border-b border-neutral-200 bg-neutral-50 p-1.5"
        // Keep the editor's text selection when a toolbar control is pressed.
        // Without this, mousedown moves focus out of the editor and collapses the
        // selection before the click handler runs — so color / font-size / marks
        // land on an empty selection and appear to "do nothing". The <select>
        // dropdowns are exempted so they can still open.
        onMouseDown={(e) => {
          if (!(e.target as HTMLElement).closest("select")) e.preventDefault();
        }}
      >
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
          className="rounded border border-neutral-300 bg-white px-1.5 py-1 text-xs"
          value={editor.isActive("heading", { level: 1 }) ? "1" : editor.isActive("heading", { level: 2 }) ? "2" : editor.isActive("heading", { level: 3 }) ? "3" : "0"}
          onMouseDown={captureSelection}
          onChange={(e) => {
            const level = Number(e.target.value);
            const chain = withSavedSelection(editor.chain().focus());
            if (level === 0) chain.setParagraph().run();
            else chain.toggleHeading({ level: level as 1 | 2 | 3 }).run();
          }}
        >
          <option value="0">Paragraph</option>
          <option value="1">Heading 1</option>
          <option value="2">Heading 2</option>
          <option value="3">Heading 3</option>
        </select>
        <select
          title="Font size — applies only to the selected text"
          className="rounded border border-neutral-300 bg-white px-1.5 py-1 text-xs"
          value={(editor.getAttributes("textStyle").fontSize as string | undefined) ?? ""}
          onMouseDown={captureSelection}
          onChange={(e) => {
            const size = e.target.value;
            const chain = withSavedSelection(editor.chain().focus());
            if (!size) chain.unsetFontSize().run();
            else chain.setFontSize(size).run();
          }}
        >
          <option value="">Normal size</option>
          <option value="0.85em">Small</option>
          <option value="1.25em">Large</option>
          <option value="1.5em">Extra large</option>
        </select>
        {sep}
        <button type="button" className={btn(editor.isActive({ textAlign: "left" }))} onClick={() => align("left")}>
          Left
        </button>
        <button type="button" className={btn(editor.isActive({ textAlign: "center" }))} onClick={() => align("center")}>
          Center
        </button>
        <button type="button" className={btn(editor.isActive({ textAlign: "right" }))} onClick={() => align("right")}>
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
        <span className="text-xs text-neutral-500">Color</span>
        {TEXT_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            title="Text color"
            className="h-5 w-5 rounded-full border border-neutral-300"
            style={{ backgroundColor: c }}
            onClick={() => editor.chain().focus().setColor(c).run()}
          />
        ))}
        <button
          type="button"
          className="rounded px-1.5 py-1 text-xs text-neutral-600 hover:bg-neutral-100"
          onClick={() => editor.chain().focus().unsetColor().run()}
        >
          Reset
        </button>
        {sep}
        <span className="text-xs text-neutral-500">Highlight</span>
        {HIGHLIGHT_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            title="Highlight"
            className="h-5 w-5 rounded-full border border-neutral-300"
            style={{ backgroundColor: c }}
            // set, not toggle: toggling removed the highlight instead whenever the
            // selection already had that colour, so a click seemed to do nothing
            // or wipe it. "None" is the way to remove one.
            onClick={() => editor.chain().focus().setHighlight({ color: c }).run()}
          />
        ))}
        <button
          type="button"
          className="rounded px-1.5 py-1 text-xs text-neutral-600 hover:bg-neutral-100"
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
        className="rte max-w-none px-3 py-2"
        style={{ minHeight }}
      />
    </div>
  );
}
