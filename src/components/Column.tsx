"use client";

import { useState } from "react";
import type { Column as ColumnType, Task } from "@/types";
import TaskCard from "./TaskCard";

type Props = {
  column: ColumnType;
  onAddTask: (columnId: string, title: string) => Promise<boolean>;
  onOpenTask: (task: Task) => void;
  onDeleteTask: (taskId: string) => void;
  onDropTask: (columnId: string, index: number) => void;
  onRenameColumn: (columnId: string, title: string) => void;
  onDeleteColumn: (columnId: string) => void;
  draggingTask: Task | null;
  setDraggingTask: (task: Task | null) => void;
};

export default function Column({
  column,
  onAddTask,
  onOpenTask,
  onDeleteTask,
  onDropTask,
  onRenameColumn,
  onDeleteColumn,
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
      const ok = await onAddTask(column.id, title);
      if (ok) setDraft("");
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
        // Insertion index: first card whose midpoint is below the pointer
        // wins, else append at the end. The dragged card is excluded so a
        // same-column drop doesn't land +1 slot lower.
        const others = Array.from(
          e.currentTarget.querySelectorAll<HTMLElement>(".task-card"),
        ).filter((el) => el.dataset.taskId !== draggingTask?.id);
        const y = e.clientY;
        let index = others.length;
        for (let i = 0; i < others.length; i++) {
          const rect = others[i].getBoundingClientRect();
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
        <span className="column-count" title={column.tasks.length >= 50 ? "Showing first 50 — open the board to see all" : undefined}>
          {column.taskCount ?? column.tasks.length}
          {column.tasks.length >= 50 && column.taskCount && column.taskCount > 50 ? "+" : ""}
        </span>
        <span className="column-actions">
          <button
            type="button"
            className="icon-btn"
            aria-label={`Rename column ${column.title}`}
            title="Rename column"
            onClick={() => {
              const next = window.prompt("Rename column", column.title);
              if (next?.trim()) onRenameColumn(column.id, next.trim());
            }}
          >
            ✎
          </button>
          <button
            type="button"
            className="icon-btn"
            aria-label={`Delete column ${column.title}`}
            title="Delete column"
            style={{ color: "var(--danger, #f87171)" }}
            onClick={() => {
              if (window.confirm(`Delete column "${column.title}" and all its tasks?`)) {
                onDeleteColumn(column.id);
              }
            }}
          >
            🗑
          </button>
        </span>
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
