"use client";

import { useMemo } from "react";

import { generateHTML } from "@tiptap/html";
import { type JSONContent } from "@tiptap/react";
import StartedKit from "@tiptap/starter-kit";
import TextAlign from "@tiptap/extension-text-align";
import { InlineImage } from "./InlineImage";

import parse from "html-react-parser";

interface iRenderDescriptionProps {
  json: JSONContent;
}

export function RenderDescription({ json }: iRenderDescriptionProps) {
  const output = useMemo(() => {
    return generateHTML(json, [
      StartedKit,
      InlineImage,
      TextAlign.configure({
        types: ["heading", "paragraph"],
      }),
    ]);
  }, [json]);

  return (
    <div className="prose dark:prose-invert prose-li:marker:text-primary max-w-none">
      {parse(output)}
    </div>
  );
}
