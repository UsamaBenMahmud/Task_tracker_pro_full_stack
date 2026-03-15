const path = require("path");
const fs = require("fs/promises");
const { randomUUID } = require("crypto");

const DATA_DIR = path.join(__dirname, "..", "data");
const FILE = path.join(DATA_DIR, "tasks.json");

const STATUSES = ["todo", "doing", "done"];

async function ensureFile() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(FILE);
  } catch {
    await fs.writeFile(FILE, "[]", "utf8");
  }
}

async function readAll() {
  await ensureFile();
  const raw = await fs.readFile(FILE, "utf8");
  const data = JSON.parse(raw || "[]");
  return Array.isArray(data) ? data : [];
}

async function writeAll(tasks) {
  await ensureFile();
  await fs.writeFile(FILE, JSON.stringify(tasks, null, 2), "utf8");
}

async function getAll(userId) {
  const tasks = await readAll();
  return tasks
    .filter((t) => t.userId === userId)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

async function create(userId, { title, priority = "medium", dueDate = null, status = "todo" }) {
  const tasks = await readAll();

  if (!STATUSES.includes(status)) status = "todo";

  const userTasksSameStatus = tasks.filter((t) => t.userId === userId && (t.status || "todo") === status);
  const maxOrder = userTasksSameStatus.reduce((m, t) => Math.max(m, t.order ?? 0), 0);

  const now = new Date().toISOString();
  const task = {
    id: randomUUID(),
    userId,
    title,
    priority,
    dueDate,
    status,
    completed: status === "done",
    order: maxOrder + 1,
    createdAt: now,
    updatedAt: now
  };

  tasks.push(task);
  await writeAll(tasks);
  return task;
}

async function update(userId, id, patch) {
  const tasks = await readAll();
  const idx = tasks.findIndex((t) => t.id === id && t.userId === userId);
  if (idx === -1) return null;

  // keep status/completed in sync if provided
  const next = { ...tasks[idx], ...patch };

  if (typeof patch.status === "string" && STATUSES.includes(patch.status)) {
    next.completed = patch.status === "done";
  }

  if (typeof patch.completed === "boolean") {
    next.status = patch.completed ? "done" : (next.status === "done" ? "todo" : next.status);
  }

  next.updatedAt = new Date().toISOString();

  tasks[idx] = next;
  await writeAll(tasks);
  return next;
}

async function remove(userId, id) {
  const tasks = await readAll();
  const before = tasks.length;
  const next = tasks.filter((t) => !(t.id === id && t.userId === userId));
  if (next.length === before) return false;
  await writeAll(next);
  return true;
}

/**
 * columns payload:
 * {
 *   todo:  [id1, id2],
 *   doing: [id3],
 *   done:  [id4, id5]
 * }
 */
async function reorderKanban(userId, columns) {
  const tasks = await readAll();
  const userTasks = tasks.filter((t) => t.userId === userId);
  const userTaskIds = new Set(userTasks.map((t) => t.id));

  // validate ids belong to this user
  for (const s of STATUSES) {
    const arr = columns?.[s];
    if (!Array.isArray(arr)) return null;
    for (const id of arr) {
      if (!userTaskIds.has(id)) return null;
    }
  }

  // build map id -> {status, order}
  const map = new Map();
  for (const s of STATUSES) {
    columns[s].forEach((id, index) => {
      map.set(id, { status: s, order: index + 1 });
    });
  }

  const updated = tasks.map((t) => {
    if (t.userId !== userId) return t;
    const m = map.get(t.id);
    if (!m) return t;

    const now = new Date().toISOString();
    return {
      ...t,
      status: m.status,
      completed: m.status === "done",
      order: m.order,
      updatedAt: now
    };
  });

  await writeAll(updated);
  return await getAll(userId);
}

module.exports = { getAll, create, update, remove, reorderKanban };