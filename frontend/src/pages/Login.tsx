import {type FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import api from "../api/client";

export default function Login() {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");

    try {
      const response = await api.post("/api/auth/login", {
        email,
        password,
      });

      localStorage.setItem(
        "access_token",
        response.data.access_token
      );

      navigate("/dashboard");
    } catch (error: any) {
      setError(
        error.response?.data?.detail ||
        "Login failed"
      );
    }
  }

  return (
    <div className="auth-page">
      {/* WEB3TASK Header */}

      <header className="auth-header">
        <div className="auth-brand"> WEB3TASK </div>
      </header>

      <div className="auth-card">
        <h1 style={{ color: "white" }}>YOUTUBE WATCH PARTY</h1>

        <p>Sign in to join your watch party</p>

        {error && (
          <div className="error">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />

          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />

          <button type="submit">
            Login
          </button>
        </form>

        <p>
          Don't have an account?{" "}
          <Link to="/register">
            Register
          </Link>
        </p>
      </div>
    </div>
  );
}

