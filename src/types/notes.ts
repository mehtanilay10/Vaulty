export interface NoteTodo {
  id: string;
  text: string;
  completed: boolean;
}

export interface NoteImage {
  id: string;
  name: string;
  url: string;
  mimeType?: string;
  size?: number;
  createdAt: string;
}

export interface NotePageItem {
  id: string;
  userId: string;
  title: string;
  content: string | null;
  todos: NoteTodo[] | null;
  images: NoteImage[] | null;
  color: string | null;
  isPinned: boolean;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
}
