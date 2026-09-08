import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import api from "../api/client";

export default function JoinRoom() {
  const { roomCode } = useParams<{ roomCode: string }>();
  const navigate = useNavigate();

  const [status, setStatus] = useState("Joining watch party...");
  const [error, setError] = useState("");

  useEffect(() => {
    async function joinRoom() {
      if (!roomCode) {
        setError("Invalid room link.");
        return;
      }

      const token = localStorage.getItem("access_token");

      // User must be logged in.
      if (!token) {
        localStorage.setItem(
          "pending_room_code",
          roomCode.toUpperCase()
        );

        navigate("/login");
        return;
      }

      try {
        const code = roomCode.trim().toUpperCase();

        setStatus(`Joining room ${code}...`);

        const response = await api.post("/api/rooms/join", {
          room_code: code,
        });

        navigate(`/room/${response.data.room_code}`, {
          replace: true,
        });
      } catch (error: any) {
        console.error("Join room error:", error);

        setError(
          error.response?.data?.detail ||
            "Could not join this watch party."
        );
      }
    }

    joinRoom();
  }, [roomCode, navigate]);

  return (
    <div className="auth-page">
      <div className="auth-card">
        {error ? (
          <>
            <h1>❌ Unable to Join</h1>
            <p>{error}</p>

            <button onClick={() => navigate("/dashboard")}>
              Go to Dashboard
            </button>
          </>
        ) : (
          <>
            <h1>🎬 Watch Party</h1>
            <p>{status}</p>
            <p>Please wait...</p>
          </>
        )}
      </div>
    </div>
  );
}

