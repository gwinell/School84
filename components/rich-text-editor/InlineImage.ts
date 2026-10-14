import { Node } from "@tiptap/react";

export const InlineImage = Node.create({
  name: "inlineImage",
  group: "block",
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      src: { default: null },
      key: { default: null },
      alt: { default: "" },
    };
  },

  parseHTML() {
    return [{ tag: "img[data-key]" }, { tag: "img[src]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["img", { ...HTMLAttributes, "data-key": HTMLAttributes.key }];
  },
});
