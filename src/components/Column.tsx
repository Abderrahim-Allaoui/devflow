"use client";

import { useState } from "react";
import type { Column as ColumnType, Task } from "@/types";
import TaskCard from "./TaskCard";

type Props = {
  column: ColumnType;
  onAddTask: (columnId: string, title: string) => Promise<void>;
  onOpenTask: (task: Task) => void;
  onDeleteTask: (taskId: string) => void;
  onDropTask: (columnId: string, index: number) => void;
  draggingTask: Task | null;
  setDraggingTask: (task: Task | null) => void;
};

export default function Column({
  column,
  onAddTask,
  onOpenTask,
  onDeleteTask,
  onDropTask,
  draggingTask,
  setDraggingTask,
}: Props) {
  const [dragOver, setDragOver] = useState(false);
  const [draft, setDraft] = useState("");
  const [adding, setAdding] = useState(false);

  async function submitAdd(e: React.FormEvent) {
    e.preventDefault();
    const title = draft.trim();
    if (!title) return;
    setAdding(true);
    try {
      await onAddTask(column.id, title);
      setDraft("");
    } finally {
      setAdding(false);
    }
  }

  return (
    <section
      className={`column${dragOver ? " drag-over" : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        // Cursor-based insertion index: first card whose midpoint is below
        // the pointer wins, otherwise append at the end.
        const cards = Array.from(
          e.currentTarget.querySelectorAll<HTMLElement>(".task-card"),
        );
        const y = e.clientY;
        let index = cards.length;
        for (let i = 0; i < cards.length; i++) {
          const rect = cards[i].getBoundingClientRect();
          if (y < rect.top + rect.height / 2) {
            index = i;
            break;
          }
        }
        onDropTask(column.id, index);
      }}
    >
      <div className="column-head">
        <h2>{column.title}</h2>
        <span className="column-count">{column.tasks.length}</span>
      </div>

      {column.tasks.map((task) => (
        <TaskCard
          key={task.id}
          task={task}
          dragging={draggingTask?.id === task.id}
          onOpen={onOpenTask}
          onDelete={onDeleteTask}
          onDragStart={setDraggingTask}
          onDragEnd={() => setDraggingTask(null)}
        />
      ))}

      <form className="add-task" onSubmit={submitAdd}>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="+ Add a task"
          maxLength={160}
          aria-label={`Add task to ${column.title}`}
        />
        {draft.trim() && (
          <button type="submit" className="btn btn-primary" disabled={adding}>
            Add
          </button>
        )}
      </form>
    </section>
  );
}
