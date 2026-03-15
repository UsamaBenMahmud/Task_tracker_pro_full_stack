import { useState } from "react";
import { api } from "../api";
import { setToken, setUser } from "../auth";

export default function AuthPage() {
  const [mode, setMode] = useState("login"); // login | register
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  async function submit(e) {
    e.preventDefault();
    setError("");

    try {
      const body =
        mode === "register"
          ? { name, email, password }
          : { email, password };

      const data = await api(`/api/auth/${mode}`, {
        method: "POST",
        body: JSON.stringify(body)
      });

      setToken(data.token);
      setUser(data.user);
      window.location.href = "/";
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <div className="page">
      <div className="authCard">
        <h1>Task Tracker Pro</h1>
        <p className="muted">Login / Signup with JWT</p>

        <div className="tabs">
          <button className={mode === "login" ? "btn active" : "btn"} onClick={() => setMode("login")}>
            Login
          </button>
          <button className={mode === "register" ? "btn active" : "btn"} onClick={() => setMode("register")}>
            Signup
          </button>
        </div>

        <form onSubmit={submit} className="authForm">
          {mode === "register" ? (
            <div className="field">
              <label>Name</label>
              <input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
          ) : null}

          <div className="field">
            <label>Email</label>
            <input value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>

          <div className="field">
            <label>Password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>

          {error ? <div className="error">{error}</div> : null}

          <button className="primary" type="submit">
            {mode === "login" ? "Login" : "Create Account"}
          </button>

          <p className="muted" style={{ marginTop: 10 }}>
            Demo tip: create account, then add tasks, reorder by drag & drop, export PDF/CSV.
          </p>
        </form>
      </div>
    </div>
  );
}