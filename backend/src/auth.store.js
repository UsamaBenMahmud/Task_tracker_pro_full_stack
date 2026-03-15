const path = require("path");
const fs = require("fs/promises");
const { randomUUID } = require("crypto");

const DATA_DIR = path.join(__dirname, "..", "data");
const FILE = path.join(DATA_DIR, "users.json");

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

async function writeAll(users) {
  await ensureFile();
  await fs.writeFile(FILE, JSON.stringify(users, null, 2), "utf8");
}

async function findByEmail(email) {
  const users = await readAll();
  return users.find((u) => u.email.toLowerCase() === email.toLowerCase()) || null;
}

async function createUser({ name, email, passwordHash }) {
  const users = await readAll();
  const exists = users.some((u) => u.email.toLowerCase() === email.toLowerCase());
  if (exists) return null;

  const user = {
    id: randomUUID(),
    name,
    email,
    passwordHash,
    createdAt: new Date().toISOString()
  };

  users.push(user);
  await writeAll(users);

  return user;
}

module.exports = { findByEmail, createUser };