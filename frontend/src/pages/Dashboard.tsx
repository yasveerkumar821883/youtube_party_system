import { type FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/client";
import type { Room } from "../types";

export default function Dashboard() {
  const navigate = useNavigate();

  const [roomName, setRoomName] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function createRoom(event: FormEvent) {
    event.preventDefault();

    setError("");
    setLoading(true);

    try {
      const response = await api.post<Room>("/api/rooms/create", {
        name: roomName,
      });

      navigate(`/room/${response.data.room_code}`);
    } catch (error: any) {
      setError(
        error.response?.data?.detail ||
          "Could not create room"
      );
    } finally {
      setLoading(false);
    }
  }

  async function joinRoom(event: FormEvent) {
    event.preventDefault();

    setError("");
    setLoading(true);

    try {
      const response = await api.post<Room>("/api/rooms/join", {
        room_code: roomCode.toUpperCase(),
      });

      navigate(`/room/${response.data.room_code}`);
    } catch (error: any) {
      setError(
        error.response?.data?.detail ||
          "Could not join room"
      );
    } finally {
      setLoading(false);
    }
  }

  function logout() {
    localStorage.removeItem("access_token");
    navigate("/login");
  }

  return (
    <div className="dashboard">

      {/* =========================
          HEADER
      ========================== */}
      <header className="dashboard-header">
        <div className="dashboard-title">
          <h1>YOUTUBE WATCH PARTY</h1>
          <p>Watch together. Stay connected.</p>
        </div>

        <button
          className="logout-button"
          onClick={logout}
        >
          Logout
        </button>
      </header>

      {/* =========================
          ERROR
      ========================== */}
      {error && (
        <div className="error">
          {error}
        </div>
      )}

      {/* =========================
          CREATE / JOIN
      ========================== */}
      <div className="dashboard-grid">

        {/* Create Room */}
        <section className="dashboard-card">
          <h2 style={{color:"burlywood"}}>🏠 Create Watch Party</h2>

          <p style={{color:"darkgrey"}}>
            Create a new room and become its host.
          </p>

          <form onSubmit={createRoom}>
            <input
              type="text"
              placeholder="Room name"
              value={roomName}
              onChange={(e) => setRoomName(e.target.value)}
              required
            />

            <button
              type="submit"
              disabled={loading}
            >
              {loading ? "Creating..." : "Create Room"}
            </button>
          </form>
        </section>

        {/* Join Room */}
        <section className="dashboard-card">
          <h2 style={{color:"burlywood"}}>🔑 Join Watch Party</h2>

          <p style={{color:"darkgrey"}}>
            Enter a room code to join an existing party.
          </p>

          <form onSubmit={joinRoom}>
            <input
              type="text"
              placeholder="Room code"
              value={roomCode}
              onChange={(e) => setRoomCode(e.target.value)}
              required
            />

            <button
              type="submit"
              disabled={loading}
            >
              {loading ? "Joining..." : "Join Room"}
            </button>
          </form>
        </section>

      </div>

      {/* =========================
          WEB3TASK FOOTER
      ========================== */}
      <footer className="site-footer">
        <div className="footer-container">

          <div className="footer-main">

            <div className="footer-company">
              <h2>WEB3TASK</h2>

              <p>
                Building modern web solutions
                for the next generation.
              </p>
            </div>

            <div className="footer-product">
              <h3>YouTube Watch Party</h3>

              <p>
                Watch YouTube videos together with
                synchronized playback, real-time rooms
                and role-based access.
              </p>
            </div>

            <div className="footer-links">

              <div>
                <h4>Product</h4>
                <span>Watch Party</span>
                <span>Real-time Sync</span>
                <span>Rooms & RBAC</span>
              </div>

              <div>
                <h4>Technology</h4>
                <span>React</span>
                <span>FastAPI</span>
                <span>WebSocket</span>
              </div>

            </div>

          </div>

          <div className="footer-divider"></div>

          <div className="footer-bottom">
            <span>
              © 2026 WEB3TASK. All rights reserved.
            </span>

            <span>
              YouTube Watch Party
            </span>
          </div>

        </div>
      </footer>

    </div>
  );
}

