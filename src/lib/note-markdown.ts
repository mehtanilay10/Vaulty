import StarterKit from "@tiptap/starter-kit";
import { Highlight } from "@tiptap/extension-highlight";
import { Image } from "@tiptap/extension-image";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { Table, TableRow, TableCell, TableHeader } from "@tiptap/extension-table";

export const NOTE_CONTENT_EXTENSIONS = [
  StarterKit.configure({
    heading: { levels: [1, 2, 3] },
    link: { openOnClick: false, autolink: true, linkOnPaste: true },
  }),
  Highlight,
  Image.configure({ inline: false, allowBase64: true }),
  TaskList,
  TaskItem.configure({
    nested: true,
    HTMLAttributes: {
      "data-type": "taskItem",
      class: "task-list-item",
    },
  }),
  Table.configure({ resizable: false }),
  TableRow,
  TableCell,
  TableHeader,
];
