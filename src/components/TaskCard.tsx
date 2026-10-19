"use client";

import type { Task } from "@/types";

type Props = {
  task: Task;
  onOpen: (task: Task) => void;
  onDelete: (taskId: string) => void;
  onDragStart: (task: Task) => void;
  onDragEnd: () => void;
  dragging: boolean;
};

export default function TaskCard({
  task,
  onOpen,
  onDelete,
  onDragStart,
  onDragEnd,
  dragging,
}: Props) {
  return (
    <div
      className={`task-card${dragging ? " dragging" : ""}`}
      draggable
      onDragStart={() => {
        onDragStart(task);
      }}
      onDragEnd={onDragEnd}
      onClick={() => onOpen(task)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter") onOpen(task);
      }}
      data-task-id={task.id}
    >
      <h3>{task.title}</h3>
      <div className="task-meta">
        <span className={`badge badge-${task.priority}`}>{task.priority}</span>
        <button
          type="button"
          className="task-delete"
          aria-label="Delete task"
          onClick={(e) => {
            e.stopPropagation();
            onDelete(task.id);
          }}
        >
          ✕
        </button>
      </div>
    </div>
  );
}
