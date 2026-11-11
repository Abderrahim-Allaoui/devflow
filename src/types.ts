export type Task = {
  id: string;
  title: string;
  description: string | null;
  priority: "low" | "medium" | "high";
  position: number;
  columnId: string;
  createdAt: string;
  updatedAt: string;
};

export type Column = {
  id: string;
  title: string;
  position: number;
  boardId: string;
  tasks: Task[];
  /** Real total task count for this column (pre-cap). Present when the API computed it. */
  taskCount?: number;
};

export type Board = {
  id: string;
  title: string;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
  columns: Column[];
};

export type User = {
  id: string;
  name: string;
  email: string;
};
