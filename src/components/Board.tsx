"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Board as BoardType, Task } from "@/types";
import { APP_NAME } from "@/lib/brand";
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
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [newBoardTitle, setNewBoardTitle] = useState("");
  const [renamingBoard, setRenamingBoard] = useState(false);
  const [renameValue, setRenameValue] = useState("");

  const active =
    boards.find((b) => b.id === activeId) ?? boards[0] ?? null;

  const load = useCallback(async (cursor?: string | null) => {
    const res = await fetch(
      cursor ? `/api/boards?cursor=${encodeURIComponent(cursor)}` : "/api/boards",
    );
    if (res.status === 401) {
      router.push("/login");
      return;
    }
    const data = await res.json().catch(() => ({ boards: [], nextCursor: null }));
    if (cursor) {
      setBoards((prev) => [...prev, ...(data.boards ?? [])]);
    } else {
      setBoards(data.boards ?? []);
    }
    setNextCursor(data.nextCursor ?? null);
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
    const title = newBoardTitle.trim();
    if (!title) return;
    setNewBoardTitle("");
    const res = await api<{ board: BoardType }>("/api/boards", "POST", { title });
    if (!res.ok || !res.data) {
      setError(res.error ?? "Could not create board");
      return;
    }
    setBoards((prev) => [res.data!.board, ...prev]);
    setActiveId(res.data.board.id);
  }

  async function renameActiveBoard() {
    const title = renameValue.trim();
    if (!active || !title) return;
    const res = await api(`/api/boards/${active.id}`, "PATCH", { title });
    if (!res.ok) {
      setError(res.error ?? "Could not rename board");
      return;
    }
    setBoards((prev) =>
      prev.map((b) => (b.id === active.id ? { ...b, title } : b)),
    );
    setRenamingBoard(false);
  }

  async function deleteActiveBoard() {
    if (!active) return;
    if (!window.confirm(`Delete board "${active.title}" and all its tasks?`)) return;
    const res = await api(`/api/boards/${active.id}`, "DELETE");
    if (!res.ok) {
      setError(res.error ?? "Could not delete board");
      return;
    }
    setBoards((prev) => {
      const next = prev.filter((b) => b.id !== active.id);
      setActiveId(next[0]?.id ?? null);
      return next;
    });
  }

  async function addTask(columnId: string, title: string): Promise<boolean> {
    const res = await api<{ task: Task }>("/api/tasks", "POST", {
      columnId,
      title,
    });
    if (!res.ok || !res.data) {
      setError(res.error ?? "Could not create task");
      return false;
    }
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
    return true;
  }

  async function addColumn(title: string) {
    if (!active) return;
    const res = await api<{ column: { id: string; title: string; position: number } }>(
      `/api/boards/${active.id}/columns`,
      "POST",
      { title },
    );
    if (!res.ok || !res.data) {
      setError(res.error ?? "Could not add column");
      return;
    }
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

  async function renameColumn(columnId: string, title: string) {
    if (!active) return;
    const res = await api(`/api/boards/${active.id}/columns/${columnId}`, "PATCH", { title });
    if (!res.ok) {
      setError(res.error ?? "Could not rename column");
      return;
    }
    setBoards((prev) =>
      prev.map((b) =>
        b.id !== active.id
          ? b
          : { ...b, columns: b.columns.map((c) => (c.id === columnId ? { ...c, title } : c)) },
      ),
    );
  }

  async function deleteColumn(columnId: string) {
    if (!active) return;
    const res = await api(`/api/boards/${active.id}/columns/${columnId}`, "DELETE");
    if (!res.ok) {
      setError(res.error ?? "Could not delete column");
      return;
    }
    await load();
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
        <h1 className="sr-only">{APP_NAME} — Kanban board</h1>
        <div className="logo" aria-hidden="true">
          {APP_NAME.slice(0, 3)}
          <span>{APP_NAME.slice(3)}</span>
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
          <button
            type="button"
            className="auth-error"
            onClick={() => setError(null)}
            role="alert"
            aria-label="Dismiss error"
            style={{ width: "100%", textAlign: "left", cursor: "pointer", border: 0 }}
          >
            {error} <span aria-hidden="true" style={{ opacity: 0.6 }}>✕</span>
          </button>
        )}

        <div className="board-top">
          {renamingBoard ? (
            <span style={{ display: "flex", gap: "0.4rem", flex: 1 }}>
              <input
                className="input"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void renameActiveBoard();
                  if (e.key === "Escape") setRenamingBoard(false);
                }}
                autoFocus
                maxLength={120}
                aria-label="Rename board"
              />
              <button type="button" className="btn btn-primary" onClick={() => void renameActiveBoard()}>
                Save
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => setRenamingBoard(false)}>
                Cancel
              </button>
            </span>
          ) : (
            <>
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
              <button
                type="button"
                className="btn btn-ghost"
                aria-label="Rename board"
                title="Rename board"
                onClick={() => {
                  if (!active) return;
                  setRenameValue(active.title);
                  setRenamingBoard(true);
                }}
              >
                ✎
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                aria-label="Delete board"
                title="Delete board"
                style={{ color: "var(--danger, #f87171)" }}
                onClick={() => void deleteActiveBoard()}
              >
                🗑
              </button>
            </>
          )}
          <span style={{ display: "flex", gap: "0.4rem" }}>
            <input
              className="input"
              style={{ maxWidth: 180 }}
              placeholder="New board…"
              value={newBoardTitle}
              onChange={(e) => setNewBoardTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void createBoard();
              }}
              maxLength={120}
              aria-label="New board title"
            />
            <button type="button" className="btn btn-primary" onClick={() => void createBoard()}>
              + Add
            </button>
          </span>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => window.open("/api/boards", "_blank")}
            title="Raw JSON — the REST API is public and typed"
          >
            API ↗
          </button>
        </div>
        {nextCursor && (
          <div style={{ margin: "0.25rem 1rem" }}>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => void load(nextCursor)}
            >
              Load more boards ↓
            </button>
          </div>
        )}

        {!active ? (
          <div className="empty-state">
            <p>No boards yet — create your first one.</p>
            <input
              className="input"
              placeholder="Board name…"
              value={newBoardTitle}
              onChange={(e) => setNewBoardTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void createBoard();
              }}
              autoFocus
              maxLength={120}
              aria-label="First board name"
            />
            <button type="button" className="btn btn-primary" onClick={() => void createBoard()}>
              Create board
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
                onRenameColumn={renameColumn}
                onDeleteColumn={deleteColumn}
                draggingTask={draggingTask}
                setDraggingTask={setDraggingTask}
              />
            ))}
            <AddingColumn onAdd={async (title) => { await addColumn(title); }} />
          </div>
        )}
      </main>

      {editing && (
        <TaskModal
          task={editing.task}
          columns={active?.columns ?? []}
          onClose={() => setEditing(null)}
          onSave={saveEditing}
          onMove={async (columnId) => {
            if (!active) return;
            const res = await api(`/api/tasks/${editing.task.id}`, "PATCH", { columnId });
            if (!res.ok) setError(res.error ?? "Move failed");
            // Force reload: columnId changed and task order may have changed.
            await load();
            setEditing(null);
          }}
          onMoveIndex={async (delta) => {
            if (!active) return;
            const col = active.columns.find((c) => c.id === editing.task.columnId);
            if (!col) return;
            const idx = col.tasks.findIndex((t) => t.id === editing.task.id);
            const to = Math.max(0, Math.min(col.tasks.length - 1, idx + delta));
            const res = await api(`/api/tasks/${editing.task.id}`, "PATCH", { position: to });
            if (!res.ok) setError(res.error ?? "Move failed");
            await load();
          }}
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
  columns,
  onClose,
  onSave,
  onMove,
  onMoveIndex,
  onDelete,
}: {
  task: Task;
  columns: { id: string; title: string }[];
  onClose: () => void;
  onSave: (patch: { title: string; description: string; priority: string }) => void;
  onMove: (columnId: string) => Promise<void>;
  onMoveIndex: (delta: -1 | 1) => Promise<void>;
  onDelete: (id: string) => void;
}) {
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? "");
  const [priority, setPriority] = useState(task.priority);
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    previousFocus.current = document.activeElement as HTMLElement | null;
    // Focus the first field on open
    const first = dialogRef.current?.querySelector<HTMLElement>("input, select, textarea, button");
    first?.focus();
    // Restore focus on close
    return () => {
      previousFocus.current?.focus?.();
    };
  }, []);

  // Focus trap: keep Tab/Shift+Tab inside the dialog while open.
  function onTrapKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "Tab") return;
    const root = dialogRef.current;
    if (!root) return;
    const focusables = Array.from(
      root.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      ),
    ).filter((el) => !el.hasAttribute("disabled"));
    if (focusables.length === 0) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = document.activeElement as HTMLElement;
    if (e.shiftKey && active === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  }

  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="presentation"
    >
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-task-heading"
        ref={dialogRef}
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose(); else onTrapKeyDown(e);
        }}
      >
        <h2 id="edit-task-heading">Edit task</h2>

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

        <div className="field">
          <label htmlFor="task-move">Move to column</label>
          <div style={{ display: "flex", gap: "0.4rem", alignItems: "center" }}>
            <select
              id="task-move"
              aria-label="Move task to column"
              value={task.columnId}
              onChange={(e) => void onMove(e.target.value)}
            >
              {columns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="btn btn-ghost"
              aria-label="Move up in column"
              onClick={() => void onMoveIndex(-1)}
            >
              ↑
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              aria-label="Move down in column"
              onClick={() => void onMoveIndex(1)}
            >
              ↓
            </button>
          </div>
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

function AddingColumn({ onAdd }: { onAdd: (title: string) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const t = title.trim();
    if (!t) return;
    await onAdd(t);
    setTitle("");
    setOpen(false);
  }

  if (!open) {
    return (
      <button type="button" className="add-column" onClick={() => setOpen(true)}>
        + Add column
      </button>
    );
  }
  return (
    <form className="add-column" onSubmit={submit} style={{ display: "flex", gap: "0.4rem" }}>
      <input
        className="input"
        autoFocus
        placeholder="Column name�"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
        }}
        maxLength={80}
        aria-label="New column name"
      />
      <button type="submit" className="btn btn-primary">Add</button>
    </form>
  );
}
