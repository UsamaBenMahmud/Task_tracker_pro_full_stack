import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { clearAuth, getUser } from "../auth";

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

import { DndContext, closestCorners } from "@dnd-kit/core";
import { SortableContext, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

const STATUSES = [
  { key: "todo", title: "To Do" },
  { key: "doing", title: "Doing" },
  { key: "done", title: "Done" }
];

function Badge({ priority }) {
  const p = (priority || "medium").toLowerCase();
  return <span className={`badge ${p}`}>{p}</span>;
}

function TaskCard({ task, onDelete }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: task.id });

  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <div ref={setNodeRef} style={style} className="taskCard">
      <div className="taskTop">
        <div className={task.status === "done" ? "taskTitle done" : "taskTitle"}>
          {task.title}
        </div>
        <Badge priority={task.priority} />
      </div>

      <div className="taskMeta">
        <span>Due: {task.dueDate || "-"}</span>
      </div>

      <div className="taskActions">
        <button className="btn" {...attributes} {...listeners} title="Drag">
          Drag
        </button>
        <button className="btn danger" onClick={() => onDelete(task)}>
          Delete
        </button>
      </div>
    </div>
  );
}

function downloadFile(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function TasksPage() {
  const user = getUser();

  const [tasks, setTasks] = useState([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  // create
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState("medium");
  const [dueDate, setDueDate] = useState("");

  // UI
  const [q, setQ] = useState("");
  const [profileOpen, setProfileOpen] = useState(false);

  function showNotice(msg) {
    setNotice(msg);
    setTimeout(() => setNotice(""), 1400);
  }

  async function load() {
    setError("");
    try {
      const data = await api("/api/tasks");
      setTasks(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e.message);
    }
  }

  useEffect(() => {
    // Avoid calling setState synchronously in effect
    const fetchTasks = async () => {
      await load();
    };
    fetchTasks();
  }, []);

  const byId = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);

  const filteredTasks = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return tasks;
    return tasks.filter((t) => (t.title || "").toLowerCase().includes(query));
  }, [tasks, q]);

  const columns = useMemo(() => {
    const base = { todo: [], doing: [], done: [] };

    // sort by order inside each status
    const sorted = [...filteredTasks].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    for (const t of sorted) {
      const s = (t.status || "todo").toLowerCase();
      if (base[s]) base[s].push(t.id);
    }
    return base;
  }, [filteredTasks]);

  const stats = useMemo(() => {
    const total = tasks.length;
    const done = tasks.filter((t) => (t.status || "todo") === "done").length;
    const doing = tasks.filter((t) => (t.status || "todo") === "doing").length;
    const todo = total - done - doing;
    return { total, todo, doing, done };
  }, [tasks]);

  async function addTask(e) {
    e.preventDefault();
    const t = title.trim();
    if (!t) return;

    setError("");
    try {
      await api("/api/tasks", {
        method: "POST",
        body: JSON.stringify({
          title: t,
          priority,
          dueDate: dueDate || null,
          status: "todo"
        })
      });
      setTitle("");
      setPriority("medium");
      setDueDate("");
      await load();
      showNotice("Task added");
    } catch (e) {
      setError(e.message);
    }
  }

  async function del(task) {
    if (!confirm("Delete this task?")) return;
    setError("");
    try {
      await api(`/api/tasks/${task.id}`, { method: "DELETE" });
      await load();
      showNotice("Deleted");
    } catch (e) {
      setError(e.message);
    }
  }

  function findContainerOfTaskId(taskId) {
    for (const s of ["todo", "doing", "done"]) {
      if (columns[s].includes(taskId)) return s;
    }
    return null;
  }

  async function persistKanban(nextColumns) {
    // update server (status + order)
    await api("/api/tasks/reorder-kanban", {
      method: "POST",
      body: JSON.stringify({ columns: nextColumns })
    });
    // reload to keep orders consistent
    await load();
  }

  async function onDragEnd(event) {
    const { active, over } = event;
    if (!over) return;

    const activeId = active.id;
    const overId = over.id;

    if (activeId === overId) return;

    const from = findContainerOfTaskId(activeId);
    const to = findContainerOfTaskId(overId) || overId; // if over a column

    if (!from || !to) return;

    // make mutable copies
    const next = {
      todo: [...columns.todo],
      doing: [...columns.doing],
      done: [...columns.done]
    };

    // remove from source
    next[from] = next[from].filter((id) => id !== activeId);

    // if dropping on a column (not on a task), add to end
    if (["todo", "doing", "done"].includes(to) && !byId.has(to)) {
      next[to].push(activeId);
    } else {
      // dropping on a task: insert before that task in its column
      const toCol = findContainerOfTaskId(overId) || from;
      const idx = next[toCol].indexOf(overId);
      next[toCol].splice(idx < 0 ? next[toCol].length : idx, 0, activeId);
    }

    // quick optimistic UI update (optional)
    // setTasks(...) is not needed; we persist then reload

    try {
      await persistKanban(next);
      showNotice("Reordered");
    } catch (e) {
      setError(e.message);
      await load();
    }
  }

  function exportCSV() {
    const rows = tasks.map((t) => ({
      title: t.title,
      status: t.status || "todo",
      priority: t.priority || "medium",
      dueDate: t.dueDate || "",
      updatedAt: t.updatedAt || ""
    }));

    const header = "title,status,priority,dueDate,updatedAt\n";
    const csv =
      header +
      rows
        .map((r) =>
          `"${String(r.title).replaceAll('"', '""')}",${r.status},${r.priority},${r.dueDate},${r.updatedAt}`
        )
        .join("\n");

    downloadFile("tasks.csv", csv, "text/csv;charset=utf-8");
  }

  function exportPDF() {
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text("Task Tracker Pro - Tasks Export", 14, 16);

    doc.setFontSize(10);
    doc.text(
      `Total: ${stats.total} | ToDo: ${stats.todo} | Doing: ${stats.doing} | Done: ${stats.done}`,
      14,
      24
    );

    const body = tasks
      .slice()
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .map((t) => [
        t.title,
        (t.status || "todo").toUpperCase(),
        (t.priority || "medium").toUpperCase(),
        t.dueDate || "-",
        t.updatedAt ? new Date(t.updatedAt).toLocaleString() : "-"
      ]);

    autoTable(doc, {
      startY: 30,
      head: [["Title", "Status", "Priority", "Due", "Updated"]],
      body,
      styles: { fontSize: 9, cellPadding: 2 },
      headStyles: { fillColor: [74, 99, 255] }
    });

    doc.save("tasks.pdf");
  }

  function logout() {
    clearAuth();
    window.location.href = "/login";
  }

  return (
    <div className="page" onClick={() => setProfileOpen(false)}>
      <div className="topbar">
        <div>
          <h1>Task Tracker Pro</h1>
          <p className="muted">Kanban • Drag & Drop • JWT • Export CSV/PDF</p>
        </div>

        <div className="rightTop">
          <div className="stats">
            <div className="pill">Total: <b>{stats.total}</b></div>
            <div className="pill">To Do: <b>{stats.todo}</b></div>
            <div className="pill">Doing: <b>{stats.doing}</b></div>
            <div className="pill">Done: <b>{stats.done}</b></div>
          </div>

          <div className="profileWrap" onClick={(e) => e.stopPropagation()}>
            <button className="btn" onClick={() => setProfileOpen((v) => !v)}>
              {user?.name || "Profile"} ▾
            </button>

            {profileOpen ? (
              <div className="profileMenu">
                <div className="profileName">{user?.name || "-"}</div>
                <div className="profileEmail">{user?.email || "-"}</div>
                <div className="profileDivider" />
                <button className="btn danger" onClick={logout}>Logout</button>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="card">
        <form className="create" onSubmit={addTask}>
          <div className="field">
            <label>Task</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g., Demo to supervisor" />
          </div>

          <div className="field">
            <label>Priority</label>
            <select value={priority} onChange={(e) => setPriority(e.target.value)}>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </div>

          <div className="field">
            <label>Due</label>
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>

          <button className="primary" type="submit">Add</button>
        </form>

        <div className="controls">
          <input className="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search tasks..." />
          <div className="exportRow">
            <button type="button" className="btn" onClick={exportCSV}>Export CSV</button>
            <button type="button" className="btn" onClick={exportPDF}>Export PDF</button>
          </div>
        </div>

        {notice ? <div className="notice">{notice}</div> : null}
        {error ? <div className="error">{error}</div> : null}

        <DndContext collisionDetection={closestCorners} onDragEnd={onDragEnd}>
          <div className="kanban">
            {STATUSES.map((col) => (
              <div key={col.key} className="column" id={col.key}>
                <div className="columnHeader">
                  <div className="columnTitle">{col.title}</div>
                  <div className="columnCount">{columns[col.key].length}</div>
                </div>

                <SortableContext items={columns[col.key]}>
                  <div className="columnBody">
                    {columns[col.key].map((id) => {
                      const task = byId.get(id);
                      if (!task) return null;
                      return <TaskCard key={id} task={task} onDelete={del} />;
                    })}
                  </div>
                </SortableContext>
              </div>
            ))}
          </div>
        </DndContext>
      </div>
    </div>
  );
}