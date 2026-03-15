const express = require("express");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const store = require("./auth.store");

const router = express.Router();

function signToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, name: user.name },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );
}

// POST /api/auth/register
router.post("/register", async (req, res) => {
  const name = (req.body?.name || "").trim();
  const email = (req.body?.email || "").trim();
  const password = req.body?.password || "";

  if (!name) return res.status(400).json({ message: "Name is required" });
  if (!email) return res.status(400).json({ message: "Email is required" });
  if (password.length < 6) return res.status(400).json({ message: "Password must be at least 6 chars" });

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await store.createUser({ name, email, passwordHash });
  if (!user) return res.status(409).json({ message: "Email already registered" });

  const token = signToken(user);
  res.status(201).json({
    token,
    user: { id: user.id, name: user.name, email: user.email }
  });
});

// POST /api/auth/login
router.post("/login", async (req, res) => {
  const email = (req.body?.email || "").trim();
  const password = req.body?.password || "";

  if (!email || !password) return res.status(400).json({ message: "Email and password required" });

  const user = await store.findByEmail(email);
  if (!user) return res.status(401).json({ message: "Invalid credentials" });

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return res.status(401).json({ message: "Invalid credentials" });

  const token = signToken(user);
  res.json({
    token,
    user: { id: user.id, name: user.name, email: user.email }
  });
});

module.exports = router;