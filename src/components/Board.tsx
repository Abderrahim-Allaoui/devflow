"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Board as BoardType, Task } from "@/types";
import Column from "./Column";

type EditingState = { task: Task } | null;

export default function Board({ user }: { user: { name: string } }) {
  const router = useRouter();
  const [boards, setBoards] = useState<BoardType[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<EditingState>(null);
  const [draggingTask, setDraggingTask] = useState<Task | null>(null);
  const [error, setError] = useState<string | null>(null);

  const active =
    boards.find((b) => b.id === activeId) ?? boards[0] ?? null;

  const load = useCallback(async () => {
    const res = await fetch("/api/boards");
    if (res.status === 401) {
      router.push("/login");
      return;
    }
    const data = await res.json().catch(() => ({ boards: [] }));
    setBoards(data.boards ?? []);
    setLoading(false);
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  async function api<T>(
    url: string,
    method: string,
    body?: unknown,
  ): Promise<{ ok: boolean; data?: T; error?: string }> {
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, error: data.error ?? "Request failed" };
    }
    return { ok: true, data: data as T };
  }

  function applyTaskPatch(columnId: string, taskId: string, patch: Partial<Task>) {
    setBoards((prev) =>
      prev.map((b) => ({
        ...b,
        columns: b.columns.map((c) =>
          c.id !== columnId
            ? c
            : {
                ...c,
                tasks: c.tasks.map((t) => (t.id === taskId ? { ...t, ...patch } : t)),
              },
        ),
      })),
    );
  }

  async function createBoard() {
    const title = window.prompt("Board name?");
    if (!title?.trim()) return;
    const res = await api<{ board: BoardType }>("/api/boards", "POST", {
      title: title.trim(),
    });
    if (!res.ok || !res.data) {
      setError(res.error ?? "Could not create board");
      return;
    }
    setBoards((prev) => [res.data!.board, ...prev]);
    setActiveId(res.data.board.id);
  }

  async function addTask(columnId: string, title: string) {
    const res = await api<{ task: Task }>("/api/tasks", "POST", {
      columnId,
      title,
    });
    if (!res.ok || !res.data) return;
    setBoards((prev) =>
      prev.map((b) =>
        b.id !== active?.id
          ? b
          : {
              ...b,
              columns: b.columns.map((c) =>
                c.id !== columnId
                  ? c
                  : { ...c, tasks: [...c.tasks, res.data!.task] },
              ),
            },
      ),
    );
  }

  async function addColumn(title: string) {
    if (!active) return;
    const res = await api<{ column: { id: string; title: string; position: number } }>(
      `/api/boards/${active.id}/columns`,
      "POST",
      { title },
    );
    if (!res.ok || !res.data) return;
    setBoards((prev) =>
      prev.map((b) =>
        b.id !== active.id
          ? b
          : {
              ...b,
              columns: [
                ...b.columns,
                { ...res.data!.column, boardId: b.id, tasks: [] },
              ],
            },
      ),
    );
  }

  async function deleteTask(taskId: string) {
    const res = await api(`/api/tasks/${taskId}`, "DELETE");
    if (!res.ok) return;
    setBoards((prev) =>
      prev.map((b) => ({
        ...b,
        columns: b.columns.map((c) => ({
          ...c,
          tasks: c.tasks.filter((t) => t.id !== taskId),
        })),
      })),
    );
  }

  /** Move a task to (columnId, index) — optimistic, reconciled by the API. */
  async function dropTask(columnId: string, index: number) {
    const task = draggingTask;
    setDraggingTask(null);
    if (!task || !active) return;

    const sourceColumnId = task.columnId;

    // Optimistic move
    setBoards((prev) =>
      prev.map((b) => {
        if (b.id !== active.id) return b;
        const without = b.columns.map((c) => ({
          ...c,
          tasks: c.tasks.filter((t) => t.id !== task.id),
        }));
        return {
          ...b,
          columns: without.map((c) =>
            c.id !== columnId
              ? c
              : {
                  ...c,
                  tasks: [
                    ...c.tasks.slice(0, index),
                    { ...task, columnId },
                    ...c.tasks.slice(index),
                  ],
                },
          ),
        };
      }),
    );

    const res = await api<{ task: Task }>(`/api/tasks/${task.id}`, "PATCH", {
      columnId,
      position: index,
    });
    if (!res.ok) {
      setError(res.error ?? "Move failed");
      await load();
      return;
    }
    // Reconcile server state (ids/order stay authoritative)
    applyTaskPatch(sourceColumnId, task.id, res.data!.task as Partial<Task>);
    await load();
  }

  async function saveEditing(patch: {
    title: string;
    description: string;
    priority: string;
  }) {
    if (!editing) return;
    const id = editing.task.id;
    const res = await api<{ task: Task }>(`/api/tasks/${id}`, "PATCH", patch);
    if (!res.ok) {
      setError(res.error ?? "Update failed");
      return;
    }
    setBoards((prev) =>
      prev.map((b) => ({
        ...b,
        columns: b.columns.map((c) => ({
          ...c,
          tasks: c.tasks.map((t) => (t.id === id ? res.data!.task : t)),
        })),
      })),
    );
    setEditing(null);
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
    router.refresh();
  }

  if (loading) {
    return <div className="empty-state">Loading your workspace…</div>;
  }

  return (
    <>
      <header className="site-header">
        <div className="logo">
          Dev<span>Flow</span>
        </div>
        <nav style={{ display: "flex", gap: "0.6rem", alignItems: "center" }}>
          <span style={{ color: "var(--muted)", fontSize: "0.85rem" }}>
            {user.name}
          </span>
          <button type="button" className="btn btn-ghost" onClick={logout}>
            Sign out
          </button>
        </nav>
      </header>

      <main className="board-page">
        {error && (
          <div className="auth-error" onClick={() => setError(null)} role="alert">
            {error}
          </div>
        )}

        <div className="board-top">
          <select
            value={active?.id ?? ""}
            onChange={(e) => setActiveId(e.target.value)}
            aria-label="Select board"
          >
            {boards.map((b) => (
              <option key={b.id} value={b.id}>
                {b.title}
              </option>
            ))}
          </select>
          <button type="button" className="btn" onClick={createBoard}>
            + New board
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => window.open("/api/boards", "_blank")}
            title="Raw JSON — the REST API is public and typed"
          >
            API ↗
          </button>
        </div>

        {!active ? (
          <div className="empty-state">
            <p>No boards yet — create your first one.</p>
            <button type="button" className="btn btn-primary" onClick={createBoard}>
              + New board
            </button>
          </div>
        ) : (
          <div className="board-columns">
            {active.columns.map((column) => (
              <Column
                key={column.id}
                column={column}
                onAddTask={addTask}
                onOpenTask={(task) => setEditing({ task })}
                onDeleteTask={deleteTask}
                onDropTask={dropTask}
                draggingTask={draggingTask}
                setDraggingTask={setDraggingTask}
              />
            ))}
            <button
              type="button"
              className="add-column"
              onClick={() => {
                const title = window.prompt("Column name?");
                if (title?.trim()) void addColumn(title.trim());
              }}
            >
              + Add column
            </button>
          </div>
        )}
      </main>

      {editing && (
        <TaskModal
          task={editing.task}
          onClose={() => setEditing(null)}
          onSave={saveEditing}
          onDelete={(id) => {
            void deleteTask(id);
            setEditing(null);
          }}
        />
      )}
    </>
  );
}

function TaskModal({
  task,
  onClose,
  onSave,
  onDelete,
}: {
  task: Task;
  onClose: () => void;
  onSave: (patch: { title: string; description: string; priority: string }) => void;
  onDelete: (id: string) => void;
}) {
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? "");
  const [priority, setPriority] = useState(task.priority);

  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
      role="presentation"
    >
      <div className="modal" role="dialog" aria-modal="true">
        <h2>Edit task</h2>

        <div className="field">
          <label htmlFor="task-title">Title</label>
          <input
            id="task-title"
            className="input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={160}
            autoFocus
          />
        </div>

        <div className="field">
          <label htmlFor="task-desc">Description</label>
          <textarea
            id="task-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={2000}
            placeholder="What needs to be done?"
          />
        </div>

        <div className="field">
          <label htmlFor="task-priority">Priority</label>
          <select
            id="task-priority"
            value={priority}
            onChange={(e) => setPriority(e.target.value as Task["priority"])}
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </div>

        <div className="modal-actions">
          <button
            type="button"
            className="btn btn-danger"
            onClick={() => onDelete(task.id)}
          >
            Delete
          </button>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                if (title.trim()) {
                  onSave({ title: title.trim(), description, priority });
                }
              }}
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
