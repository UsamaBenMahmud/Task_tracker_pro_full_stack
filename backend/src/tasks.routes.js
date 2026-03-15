const express = require("express");
const store = require("./tasks.store");
const auth = require("./auth.middleware");

const router = express.Router();

const allowedPriorities = new Set(["low", "medium", "high"]);
const allowedStatuses = new Set(["todo", "doing", "done"]);
const isISODate = (s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);

router.use(auth);

// GET /api/tasks
router.get("/", async (req, res) => {
  const tasks = await store.getAll(req.user.id);
  res.json(tasks);
});

// POST /api/tasks
router.post("/", async (req, res) => {
  const title = (req.body?.title || "").trim();
  const priority = (req.body?.priority || "medium").toLowerCase();
  const dueDate = req.body?.dueDate ?? null;
  const status = (req.body?.status || "todo").toLowerCase();

  if (!title) return res.status(400).json({ message: "Title is required" });
  if (!allowedPriorities.has(priority)) return res.status(400).json({ message: "Priority must be low, medium, or high" });
  if (!(dueDate === null || isISODate(dueDate))) return res.status(400).json({ message: "dueDate must be YYYY-MM-DD or null" });
  if (!allowedStatuses.has(status)) return res.status(400).json({ message: "status must be todo, doing, or done" });

  const task = await store.create(req.user.id, { title, priority, dueDate, status });
  res.status(201).json(task);
});

// PATCH /api/tasks/:id
router.patch("/:id", async (req, res) => {
  const patch = {};

  if (typeof req.body?.title === "string") {
    const t = req.body.title.trim();
    if (!t) return res.status(400).json({ message: "Title cannot be empty" });
    patch.title = t;
  }

  if (typeof req.body?.priority === "string") {
    const p = req.body.priority.toLowerCase();
    if (!allowedPriorities.has(p)) return res.status(400).json({ message: "Priority must be low, medium, or high" });
    patch.priority = p;
  }

  if ("dueDate" in (req.body || {})) {
    const d = req.body.dueDate;
    if (!(d === null || isISODate(d))) return res.status(400).json({ message: "dueDate must be YYYY-MM-DD or null" });
    patch.dueDate = d;
  }

  if (typeof req.body?.status === "string") {
    const s = req.body.status.toLowerCase();
    if (!allowedStatuses.has(s)) return res.status(400).json({ message: "status must be todo, doing, or done" });
    patch.status = s;
  }

  if (typeof req.body?.completed === "boolean") {
    patch.completed = req.body.completed;
  }

  const updated = await store.update(req.user.id, req.params.id, patch);
  if (!updated) return res.status(404).json({ message: "Task not found" });

  res.json(updated);
});

// POST /api/tasks/reorder-kanban
router.post("/reorder-kanban", async (req, res) => {
  const columns = req.body?.columns;

  const result = await store.reorderKanban(req.user.id, columns);
  if (!result) return res.status(400).json({ message: "Invalid columns payload" });

  res.json(result);
});

// DELETE /api/tasks/:id
router.delete("/:id", async (req, res) => {
  const ok = await store.remove(req.user.id, req.params.id);
  if (!ok) return res.status(404).json({ message: "Task not found" });
  res.json({ ok: true });
});

module.exports = router;