import { type ElementType } from "react";
import { type Editor } from "@tiptap/react";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";
import { Toggle } from "../ui/toggle";
import {
  AlignCenterIcon,
  AlignLeftIcon,
  AlignRightIcon,
  BoldIcon,
  Heading1Icon,
  Heading2Icon,
  Heading3Icon,
  ImagePlusIcon,
  ItalicIcon,
  ListIcon,
  ListOrderedIcon,
  RedoIcon,
  StrikethroughIcon,
  UnderlineIcon,
  UndoIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatShortcut } from "@/lib/format-shortcut";
import { useIsMac } from "@/hooks/use-is-mac";
import { Button } from "../ui/button";

const SHORTCUTS = {
  Bold: "Mod-B",
  Italic: "Mod-I",
  Underline: "Mod-Shift-u",
  Strike: "Mod-Shift-s",
  "Heading 1": "Mod-Alt-1",
  "Heading 2": "Mod-Alt-2",
  "Heading 3": "Mod-Alt-3",
  "Bullet List": "Mod-Shift-8",
  "Ordered List": "Mod-Shift-7",
  "Align Left": "Mod-Shift-l",
  "Align Center": "Mod-Shift-e",
  "Align Right": "Mod-Shift-r",
  Undo: "Mod-z",
  Redo: "Mod-Shift-z",
} as const satisfies Record<string, string>;

export interface MenuBarState {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  heading1: boolean;
  heading2: boolean;
  heading3: boolean;
  bulletList: boolean;
  orderedList: boolean;
  alignLeft: boolean;
  alignCenter: boolean;
  alignRight: boolean;
  canUndo: boolean;
  canRedo: boolean;
}

interface MenuBarProps {
  editor: Editor | null;
  state: MenuBarState;
  onImageClick?: () => void;
}

interface ToggleItem {
  icon: ElementType;
  label: string;
  pressed: boolean;
  shortcut: string;
  onPressedChange: () => void;
}

interface ButtonItem {
  icon: ElementType;
  label: string;
  shortcut: string;
  onClick: () => void;
  disabled: boolean;
}

export function MenuBar({ editor, state, onImageClick }: MenuBarProps) {
  const isMac = useIsMac();
  if (!editor) return null;

  const toggleItems: ToggleItem[] = [
    {
      icon: BoldIcon,
      label: "Bold",
      pressed: state.bold,
      shortcut: SHORTCUTS.Bold,
      onPressedChange: () => editor.chain().toggleBold().run(),
    },
    {
      icon: ItalicIcon,
      label: "Italic",
      pressed: state.italic,
      shortcut: SHORTCUTS.Italic,
      onPressedChange: () => editor.chain().toggleItalic().run(),
    },
    {
      icon: UnderlineIcon,
      label: "Underline",
      pressed: state.underline,
      shortcut: SHORTCUTS.Underline,
      onPressedChange: () => editor.chain().toggleUnderline().run(),
    },
    {
      icon: StrikethroughIcon,
      label: "Strike",
      pressed: state.strike,
      shortcut: SHORTCUTS.Strike,
      onPressedChange: () => editor.chain().toggleStrike().run(),
    },
    {
      icon: Heading1Icon,
      label: "Heading 1",
      pressed: state.heading1,
      shortcut: SHORTCUTS["Heading 1"],
      onPressedChange: () => editor.chain().toggleHeading({ level: 1 }).run(),
    },
    {
      icon: Heading2Icon,
      label: "Heading 2",
      pressed: state.heading2,
      shortcut: SHORTCUTS["Heading 2"],
      onPressedChange: () => editor.chain().toggleHeading({ level: 2 }).run(),
    },
    {
      icon: Heading3Icon,
      label: "Heading 3",
      pressed: state.heading3,
      shortcut: SHORTCUTS["Heading 3"],
      onPressedChange: () => editor.chain().toggleHeading({ level: 3 }).run(),
    },
    {
      icon: ListIcon,
      label: "Bullet List",
      pressed: state.bulletList,
      shortcut: SHORTCUTS["Bullet List"],
      onPressedChange: () => editor.chain().toggleBulletList().run(),
    },
    {
      icon: ListOrderedIcon,
      label: "Ordered List",
      pressed: state.orderedList,
      shortcut: SHORTCUTS["Ordered List"],
      onPressedChange: () => editor.chain().toggleOrderedList().run(),
    },
  ];

  const alignItems: ToggleItem[] = [
    {
      icon: AlignLeftIcon,
      label: "Align Left",
      pressed: state.alignLeft,
      shortcut: SHORTCUTS["Align Left"],
      onPressedChange: () => editor.chain().toggleTextAlign("left").run(),
    },
    {
      icon: AlignCenterIcon,
      label: "Align Center",
      pressed: state.alignCenter,
      shortcut: SHORTCUTS["Align Center"],
      onPressedChange: () => editor.chain().toggleTextAlign("center").run(),
    },
    {
      icon: AlignRightIcon,
      label: "Align Right",
      pressed: state.alignRight,
      shortcut: SHORTCUTS["Align Right"],
      onPressedChange: () => editor.chain().toggleTextAlign("right").run(),
    },
  ];

  const historyItems: ButtonItem[] = [
    {
      icon: UndoIcon,
      label: "Undo",
      shortcut: SHORTCUTS.Undo,
      onClick: () => editor.chain().undo().run(),
      disabled: !state.canUndo,
    },
    {
      icon: RedoIcon,
      label: "Redo",
      shortcut: SHORTCUTS.Redo,
      onClick: () => editor.chain().redo().run(),
      disabled: !state.canRedo,
    },
  ];

  const renderToggleGroup = (items: ToggleItem[]) =>
    items.map((item) => {
      const Icon = item.icon;
      const shortcutLabel = formatShortcut(item.shortcut, isMac);
      return (
        <Tooltip key={item.label}>
          <TooltipTrigger
            render={
              <Toggle
                size="sm"
                pressed={item.pressed}
                onPressedChange={item.onPressedChange}
                className={cn(item.pressed && "bg-muted text-muted-foreground")}
              >
                <Icon />
              </Toggle>
            }
          />
          <TooltipContent>
            <span className="inline-flex items-center gap-2">
              <span>{item.label}</span>
              <kbd className="rounded border border-background/20 bg-background/10 px-1.5 py-0.5 font-mono text-[10px] leading-none">
                {shortcutLabel}
              </kbd>
            </span>
          </TooltipContent>
        </Tooltip>
      );
    });

  const renderButtonGroup = (items: ButtonItem[]) =>
    items.map((item) => {
      const Icon = item.icon;
      const shortcutLabel = formatShortcut(item.shortcut, isMac);
      return (
        <Tooltip key={item.label}>
          <TooltipTrigger
            render={
              <Button
                size="sm"
                variant="ghost"
                type="button"
                onClick={item.onClick}
                disabled={item.disabled}
              >
                <Icon />
              </Button>
            }
          />
          <TooltipContent>
            <span className="inline-flex items-center gap-2">
              <span>{item.label}</span>
              <kbd className="rounded border border-background/20 bg-background/10 px-1.5 py-0.5 font-mono text-[10px] leading-none">
                {shortcutLabel}
              </kbd>
            </span>
          </TooltipContent>
        </Tooltip>
      );
    });

  return (
    <div className="border border-input border-t-0 border-x-0 rounded-tl-lg p-2 bg-card flex flex-wrap gap-1 items-center">
      <div className="flex flex-wrap gap-1">
        {renderToggleGroup(toggleItems)}
      </div>

      <div className="w-px h-6 bg-border mx-2" />

      <div className="flex flex-wrap gap-1">
        {renderToggleGroup(alignItems)}
      </div>

      <div className="w-px h-6 bg-border mx-2" />

      <div className="flex flex-wrap gap-1">
        {renderButtonGroup(historyItems)}
      </div>

      {onImageClick ? (
        <>
          <div className="w-px h-6 bg-border mx-2" />
          <Button
            size="sm"
            variant="outline"
            type="button"
            onClick={onImageClick}
          >
            <ImagePlusIcon />
            <span className="hidden sm:inline">Добавить изображение</span>
          </Button>
        </>
      ) : null}
    </div>
  );
}
