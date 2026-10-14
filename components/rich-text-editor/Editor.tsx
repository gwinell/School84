"use client";

import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import StartedKit from "@tiptap/starter-kit";
import { Underline } from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import { useRef } from "react";
import { toast } from "sonner";

import { MenuBar, type MenuBarState } from "./MenuBar";
import { InlineImage } from "./InlineImage";

interface RichTextEditorField {
  onChange: (value: string) => void;
  value: string | undefined;
}

const UnderlineWithShortcut = Underline.extend({
  addKeyboardShortcuts() {
    return {
      "Mod-Shift-u": () => this.editor.commands.toggleUnderline(),
    };
  },
});

const EMPTY_MENU_BAR_STATE: MenuBarState = {
  bold: false,
  italic: false,
  underline: false,
  strike: false,
  heading1: false,
  heading2: false,
  heading3: false,
  bulletList: false,
  orderedList: false,
  alignLeft: false,
  alignCenter: false,
  alignRight: false,
  canUndo: false,
  canRedo: false,
};

export function RichTextEditor({ field, courseId }: { field: RichTextEditorField; courseId?: string }) {
  const imageInput = useRef<HTMLInputElement>(null);
  const editor = useEditor({
    extensions: [
      StartedKit,
      UnderlineWithShortcut,
      InlineImage,
      TextAlign.configure({
        types: ["heading", "paragraph"],
      }),
    ],
    editorProps: {
      attributes: {
        class:
          "min-h-[300px] p-4 focus:outline-none prose prose-sm sm:prose lg:prose-lg xl:prose-xl dark:prose-invert !w-full !max-w-none",
      },
    },
    onUpdate: ({ editor }) => {
      field.onChange(JSON.stringify(editor.getJSON()));
    },
    content: field.value ? JSON.parse(field.value) : "",
    immediatelyRender: false,
  });

  const state: MenuBarState = useEditorState({
    editor,
    selector: ({ editor }) => ({
      bold: editor?.isActive("bold") ?? false,
      italic: editor?.isActive("italic") ?? false,
      underline: editor?.isActive("underline") ?? false,
      strike: editor?.isActive("strike") ?? false,
      heading1: editor?.isActive("heading", { level: 1 }) ?? false,
      heading2: editor?.isActive("heading", { level: 2 }) ?? false,
      heading3: editor?.isActive("heading", { level: 3 }) ?? false,
      bulletList: editor?.isActive("bulletList") ?? false,
      orderedList: editor?.isActive("orderedList") ?? false,
      alignLeft: editor?.isActive({ textAlign: "left" }) ?? false,
      alignCenter: editor?.isActive({ textAlign: "center" }) ?? false,
      alignRight: editor?.isActive({ textAlign: "right" }) ?? false,
      canUndo: editor?.can().undo() ?? false,
      canRedo: editor?.can().redo() ?? false,
    }),
  }) ?? EMPTY_MENU_BAR_STATE;

  async function uploadInlineImage(file: File) {
    if (!editor) return;
    try {
      const response = await fetch("/api/s3/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: file.name,
          contentType: file.type,
          size: file.size,
          isImage: true,
          ...(courseId ? { courseId } : {}),
        }),
      });
      if (!response.ok) throw new Error("Could not prepare image upload");
      const { presignedUrl, key } = (await response.json()) as {
        presignedUrl: string;
        key: string;
      };
      const uploaded = await fetch(presignedUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!uploaded.ok) throw new Error("Image upload failed");
      editor
        .chain()
        .focus()
        .insertContent({
          type: "inlineImage",
          attrs: { src: URL.createObjectURL(file), key, alt: file.name },
        })
        .run();
      toast.success("Изображение добавлено");
    } catch {
      toast.error("Не удалось загрузить изображение");
    }
  }

  return (
    <div className="w-full border border-input rounded-lg overflow-hidden dark:bg-input/30">
      <MenuBar
        editor={editor}
        state={state}
        onImageClick={() => imageInput.current?.click()}
      />
      <input
        ref={imageInput}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void uploadInlineImage(file);
        }}
      />
      <EditorContent editor={editor} />
    </div>
  );
}
