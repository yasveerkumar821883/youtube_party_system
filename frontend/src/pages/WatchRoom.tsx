import { type FormEvent, useEffect, useRef, useState } from "react";
import YouTube from "react-youtube";
import { useNavigate, useParams } from "react-router-dom";
import api from "../api/client";
import type { Participant } from "../types";

type ChatMessage = {
  user_id: number;
  username: string;
  role: string;
  message: string;
};

export default function WatchRoom() {
  const { roomCode } = useParams<{ roomCode: string }>();
  const navigate = useNavigate();

  const [participants, setParticipants] = useState<Participant[]>([]);
  const [error, setError] = useState("");
  const [connected, setConnected] = useState(false);

  // --------------------------------------------------
  // Chat
  // --------------------------------------------------

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");

  // Default video while room data is loading
  const [videoId, setVideoId] = useState("dQw4w9WgXcQ");

  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [myRole, setMyRole] = useState("");

  const playerRef = useRef<any>(null);
  const socketRef = useRef<WebSocket | null>(null);

  // Prevent remote Play/Pause/Video changes
  // from being sent back to the server.
  const isRemoteUpdateRef = useRef(false);

  // Prevent remote seek from being detected
  // as a local seek.
  const isRemoteSeekRef = useRef(false);

  // Last known player position.
  const lastTimeRef = useRef(0);

  // --------------------------------------------------
  // RBAC
  // --------------------------------------------------

  const canControl =
    myRole === "HOST" ||
    myRole === "MODERATOR";

  const isHost =
    myRole === "HOST";

  // --------------------------------------------------
  // Logout
  // --------------------------------------------------

  function logout() {
    socketRef.current?.close();

    localStorage.removeItem("access_token");
    localStorage.removeItem("pending_room_code");

    navigate("/login");
  }

  // --------------------------------------------------
  // Get current user ID from JWT
  // --------------------------------------------------

  function getCurrentUserIdFromToken(): number | null {
    const token = localStorage.getItem("access_token");

    if (!token) {
      return null;
    }

    try {
      const payload = JSON.parse(
        atob(token.split(".")[1])
      );

      return Number(payload.sub);
    } catch {
      return null;
    }
  }

  // --------------------------------------------------
  // Load participants
  // --------------------------------------------------

  async function loadParticipants() {
    if (!roomCode) {
      return;
    }

    try {
      const response = await api.get<Participant[]>(
        `/api/rooms/${roomCode}/participants`
      );

      console.log(
        "👥 Participants loaded:",
        response.data
      );

      setParticipants(response.data);

      const currentUserId =
        getCurrentUserIdFromToken();

      console.log(
        "👤 Current user ID:",
        currentUserId
      );

      const currentParticipant =
        response.data.find(
          (participant) =>
            participant.user_id === currentUserId
        );

      if (currentParticipant) {
        console.log(
          "🔐 My role:",
          currentParticipant.role
        );

        setMyRole(currentParticipant.role);
      } else {
        console.warn(
          "⚠️ Current user was not found in participants"
        );

        setMyRole("");
      }
    } catch (error: any) {
      console.error(
        "❌ Failed to load participants:",
        error.response?.data || error
      );

      setError(
        error.response?.data?.detail ||
          "Could not load participants"
      );
    }
  }

  // --------------------------------------------------
  // Load participants when room changes
  // --------------------------------------------------

  useEffect(() => {
    if (roomCode) {
      loadParticipants();
    }
  }, [roomCode]);

  // --------------------------------------------------
  // Load saved room/video
  // --------------------------------------------------

  useEffect(() => {
    async function loadRoom() {
      if (!roomCode) {
        return;
      }

      try {
        console.log(
          "🏠 Loading room:",
          roomCode
        );

        const response = await api.get(
          `/api/rooms/${roomCode}`
        );

        console.log(
          "🏠 Room loaded:",
          response.data
        );

        if (response.data.video_id) {
          console.log(
            "🎬 Loading saved video:",
            response.data.video_id
          );

          setVideoId(
            response.data.video_id
          );

          lastTimeRef.current = 0;
        } else {
          console.log(
            "ℹ️ No saved video. Using default video."
          );
        }
      } catch (error: any) {
        console.error(
          "❌ Failed to load room:",
          error.response?.data || error
        );

        setError(
          error.response?.data?.detail ||
            "Failed to load room"
        );
      }
    }

    loadRoom();
  }, [roomCode]);

  // --------------------------------------------------
  // Update participant role
  // --------------------------------------------------

  async function updateParticipantRole(
    userId: number,
    role:
      | "MODERATOR"
      | "PARTICIPANT"
      | "VIEWER"
  ) {
    if (!roomCode) {
      return;
    }

    // Frontend protection.
    // Backend also validates this permission.
    if (myRole !== "HOST") {
      setError(
        "Only the Host can assign participant roles"
      );

      return;
    }

    try {
      setError("");

      console.log(
        "🔐 Updating participant role:",
        {
          userId,
          role,
        }
      );

      await api.patch(
        `/api/rooms/${roomCode}/participants/${userId}/role`,
        {
          role,
        }
      );

      console.log(
        "✅ Participant role updated"
      );

      // Refresh participant list
      await loadParticipants();
    } catch (error: any) {
      console.error(
        "❌ Failed to update participant role:",
        error.response?.data || error
      );

      setError(
        error.response?.data?.detail ||
          "Could not update participant role"
      );
    }
  }

  // --------------------------------------------------
  // WebSocket
  // --------------------------------------------------

  useEffect(() => {
    const token =
      localStorage.getItem("access_token");

    if (!token || !roomCode) {
      return;
    }

    // Prevent callbacks from an old/cleaned-up
    // WebSocket from changing the current UI state.
    let isActive = true;

    const wsBaseUrl =
      import.meta.env.VITE_WS_URL ||
      "ws://localhost:8000";

    const socket = new WebSocket(
      `${wsBaseUrl}/ws/${roomCode}?token=${token}`
      );
    socketRef.current = socket;

    // ------------------------------------------------
    // WebSocket connected
    // ------------------------------------------------

    socket.onopen = () => {
      if (!isActive) {
        return;
      }

      console.log(
        "✅ WebSocket connected"
      );

      setConnected(true);
      setError("");
    };

    // ------------------------------------------------
    // Receive WebSocket messages
    // ------------------------------------------------

    socket.onmessage = (event) => {
      if (!isActive) {
        return;
      }

      const message = JSON.parse(event.data);

      console.log(
        "📩 WebSocket message:",
        message
      );

      // ------------------------------------------------
      // Backend error
      // ------------------------------------------------

      if (message.event === "error") {
        setError(message.message);
        return;
      }

      // ------------------------------------------------
      // CHAT MESSAGE
      // ------------------------------------------------

      if (message.event === "chat_message") {
        const newMessage: ChatMessage = {
          user_id: Number(message.user_id),
          username: String(message.username),
          role: String(message.role),
          message: String(message.message),
        };

        console.log(
          "💬 New chat message:",
          newMessage
        );

        setChatMessages(
          (previousMessages) => [
            ...previousMessages,
            newMessage,
          ]
        );

        return;
      }

      // ------------------------------------------------
      // USER JOINED
      // ------------------------------------------------

      if (message.event === "user_joined") {
        console.log(
          "👋 User joined:",
          message
        );

        // Refresh participant list
        loadParticipants();

        return;
      }

      // ------------------------------------------------
      // USER LEFT
      // ------------------------------------------------

      if (message.event === "user_left") {
        console.log(
          "👋 User left:",
          message
        );

        // Refresh participant list
        loadParticipants();

        return;
      }

      // ------------------------------------------------
      // Everything below this point is YouTube
      // playback handling.
      // ------------------------------------------------

      if (!playerRef.current) {
        return;
      }

      // ----------------------------------------------
      // REMOTE PLAY
      // ----------------------------------------------

      if (message.event === "play") {
        console.log("▶️ Remote PLAY");

        isRemoteUpdateRef.current = true;

        playerRef.current.playVideo();

        setTimeout(() => {
          if (isActive) {
            isRemoteUpdateRef.current = false;
          }
        }, 700);
      }

      // ----------------------------------------------
      // REMOTE PAUSE
      // ----------------------------------------------

      if (message.event === "pause") {
        console.log("⏸️ Remote PAUSE");

        isRemoteUpdateRef.current = true;

        playerRef.current.pauseVideo();

        setTimeout(() => {
          if (isActive) {
            isRemoteUpdateRef.current = false;
          }
        }, 700);
      }

      // ----------------------------------------------
      // REMOTE SEEK
      // ----------------------------------------------

      if (message.event === "seek") {
        const time = Number(message.time);

        if (
          !Number.isNaN(time) &&
          time >= 0
        ) {
          console.log(
            "⏩ Remote SEEK:",
            time
          );

          isRemoteSeekRef.current = true;

          lastTimeRef.current = time;

          playerRef.current.seekTo(
            time,
            true
          );

          setTimeout(() => {
            if (!isActive) {
              return;
            }

            isRemoteSeekRef.current = false;

            if (playerRef.current) {
              lastTimeRef.current =
                playerRef.current.getCurrentTime();
            }
          }, 700);
        }
      }

      // ----------------------------------------------
      // REMOTE CHANGE VIDEO
      // ----------------------------------------------

      if (
        message.event === "change_video"
      ) {
        const newVideoId =
          message.video_id;

        if (newVideoId) {
          console.log(
            "🎬 Remote CHANGE VIDEO:",
            newVideoId
          );

          isRemoteUpdateRef.current = true;
          isRemoteSeekRef.current = true;

          lastTimeRef.current = 0;

          setVideoId(newVideoId);

          setTimeout(() => {
            if (!isActive) {
              return;
            }

            isRemoteUpdateRef.current = false;
            isRemoteSeekRef.current = false;

            lastTimeRef.current = 0;
          }, 1200);
        }
      }
    };

    // ------------------------------------------------
    // WebSocket error
    // ------------------------------------------------

    socket.onerror = (event) => {
      console.error(
        "❌ WebSocket error:",
        event
      );

      if (!isActive) {
        return;
      }

      setError(
        "WebSocket connection error"
      );
    };

    // ------------------------------------------------
    // WebSocket close
    // ------------------------------------------------

    socket.onclose = () => {
      console.log(
        "🔴 WebSocket disconnected"
      );

      if (!isActive) {
        return;
      }

      setConnected(false);
    };

    // ------------------------------------------------
    // Cleanup
    // ------------------------------------------------

    return () => {
      console.log(
        "🧹 Cleaning up WebSocket"
      );

      isActive = false;

      // Only clear socketRef if this is still
      // the currently active socket.
      if (socketRef.current === socket) {
        socketRef.current = null;
      }

      if (
        socket.readyState === WebSocket.OPEN ||
        socket.readyState === WebSocket.CONNECTING
      ) {
        socket.close();
      }
    };
  }, [roomCode]);

  // --------------------------------------------------
  // Send WebSocket event
  // --------------------------------------------------

  function sendEvent(
    event:
      | "play"
      | "pause"
      | "seek"
      | "change_video"
      | "chat_message",
    data: Record<string, any> = {}
  ) {
    const socket =
      socketRef.current;

    if (
      !socket ||
      socket.readyState !==
        WebSocket.OPEN
    ) {
      console.log(
        "⚠️ WebSocket is not connected"
      );

      return;
    }

    const message = {
      event,
      ...data,
    };

    socket.send(
      JSON.stringify(message)
    );

    console.log(
      "📤 Sent event:",
      message
    );
  }

  // --------------------------------------------------
  // Send chat message
  // --------------------------------------------------

  function sendChatMessage(
    event: FormEvent
  ) {
    event.preventDefault();

    const message =
      chatInput.trim();

    if (!message) {
      return;
    }

    if (message.length > 500) {
      setError(
        "Chat message cannot exceed 500 characters"
      );

      return;
    }

    if (!connected) {
      setError(
        "You are not connected to the watch party"
      );

      return;
    }

    setError("");

    sendEvent(
      "chat_message",
      {
        message,
      }
    );

    setChatInput("");
  }

  // --------------------------------------------------
  // YouTube player ready
  // --------------------------------------------------

  function handlePlayerReady(
    event: any
  ) {
    playerRef.current =
      event.target;

    lastTimeRef.current =
      playerRef.current.getCurrentTime();

    console.log(
      "✅ YouTube player ready"
    );
  }

  // --------------------------------------------------
  // YouTube state changes
  // --------------------------------------------------

  function handlePlayerStateChange(
    event: any
  ) {
    console.log(
      "YouTube state:",
      event.data
    );

    // Ignore Play/Pause caused by
    // remote synchronization.
    if (isRemoteUpdateRef.current) {
      console.log(
        "Ignoring remote playback event:",
        event.data
      );

      return;
    }

    // ------------------------------------------------
    // Participant / Viewer protection
    // ------------------------------------------------

    if (!canControl) {
      console.log(
        "🔒 Playback control blocked for:",
        myRole
      );

      // 1 = PLAYING
      if (event.data === 1) {
        isRemoteUpdateRef.current = true;

        playerRef.current?.pauseVideo();

        setTimeout(() => {
          isRemoteUpdateRef.current = false;
        }, 500);
      }

      return;
    }

    // ------------------------------------------------
    // Host / Moderator PLAY
    // ------------------------------------------------

    if (event.data === 1) {
      console.log(
        "▶️ Local PLAY"
      );

      sendEvent("play");
    }

    // ------------------------------------------------
    // Host / Moderator PAUSE
    // ------------------------------------------------

    if (event.data === 2) {
      console.log(
        "⏸️ Local PAUSE"
      );

      sendEvent("pause");
    }
  }

  // --------------------------------------------------
  // SEEK detection
  // --------------------------------------------------

  useEffect(() => {
    const interval =
      setInterval(() => {
        if (!playerRef.current) {
          return;
        }

        const currentTime =
          playerRef.current.getCurrentTime();

        const currentState =
          playerRef.current.getPlayerState();

        const difference =
          Math.abs(
            currentTime -
              lastTimeRef.current
          );

        if (
          difference > 2 &&
          !isRemoteSeekRef.current &&
          !isRemoteUpdateRef.current
        ) {
          // --------------------------------------------
          // Participant / Viewer cannot seek
          // --------------------------------------------

          if (!canControl) {
            console.log(
              "🔒 Seek blocked for:",
              myRole
            );

            isRemoteSeekRef.current = true;

            playerRef.current?.seekTo(
              lastTimeRef.current,
              true
            );

            setTimeout(() => {
              isRemoteSeekRef.current = false;
            }, 500);

            return;
          }

          // --------------------------------------------
          // Host / Moderator can seek
          // --------------------------------------------

          console.log(
            "⏩ Local SEEK detected:",
            currentTime
          );

          sendEvent("seek", {
            time: currentTime,
          });

          lastTimeRef.current =
            currentTime;

          return;
        }

        if (
          currentState === 1 ||
          currentState === 2
        ) {
          lastTimeRef.current =
            currentTime;
        }
      }, 500);

    return () => {
      clearInterval(interval);
    };
  }, [canControl, myRole]);

  // --------------------------------------------------
  // Extract YouTube video ID
  // --------------------------------------------------

  function extractYouTubeVideoId(
    url: string
  ): string | null {
    try {
      const parsedUrl =
        new URL(url);

      // youtube.com/watch?v=VIDEO_ID
      if (
        parsedUrl.hostname.includes(
          "youtube.com"
        )
      ) {
        const id =
          parsedUrl.searchParams.get(
            "v"
          );

        if (id) {
          return id;
        }
      }

      // youtu.be/VIDEO_ID
      if (
        parsedUrl.hostname ===
        "youtu.be"
      ) {
        const id =
          parsedUrl.pathname
            .substring(1)
            .split("/")[0];

        if (id) {
          return id;
        }
      }

      // youtube.com/embed/VIDEO_ID
      if (
        parsedUrl.pathname.startsWith(
          "/embed/"
        )
      ) {
        const id =
          parsedUrl.pathname
            .split("/")[2];

        if (id) {
          return id;
        }
      }

      // youtube.com/shorts/VIDEO_ID
      if (
        parsedUrl.pathname.startsWith(
          "/shorts/"
        )
      ) {
        const id =
          parsedUrl.pathname
            .split("/")[2];

        if (id) {
          return id;
        }
      }

      return null;
    } catch {
      return null;
    }
  }

  // --------------------------------------------------
  // Change video
  // --------------------------------------------------

  function changeVideo(
    event: FormEvent
  ) {
    event.preventDefault();

    if (
      myRole !== "HOST" &&
      myRole !== "MODERATOR"
    ) {
      setError(
        "Only the Host or Moderator can change the video"
      );

      return;
    }

    const newVideoId =
      extractYouTubeVideoId(
        youtubeUrl
      );

    if (!newVideoId) {
      setError(
        "Please enter a valid YouTube URL"
      );

      return;
    }

    if (
      !/^[A-Za-z0-9_-]{11}$/.test(
        newVideoId
      )
    ) {
      setError(
        "Invalid YouTube video ID"
      );

      return;
    }

    setError("");

    console.log(
      "🎬 Changing video:",
      newVideoId
    );

    isRemoteUpdateRef.current = true;
    isRemoteSeekRef.current = true;

    lastTimeRef.current = 0;

    setVideoId(newVideoId);

    sendEvent(
      "change_video",
      {
        video_id: newVideoId,
      }
    );

    setTimeout(() => {
      isRemoteUpdateRef.current = false;
      isRemoteSeekRef.current = false;
    }, 1200);

    setYoutubeUrl("");
  }

  // --------------------------------------------------
  // Player options
  // --------------------------------------------------

  const playerOptions = {
    height: "450",
    width: "800",

    playerVars: {
      autoplay: 0,

      // Host / Moderator:
      // YouTube controls visible.
      //
      // Participant / Viewer:
      // YouTube controls hidden.
      controls: canControl ? 1 : 0,

      // Disable keyboard controls for
      // Participant / Viewer.
      disablekb: canControl ? 0 : 1,

      modestbranding: 1,
      rel: 0,
    },
  };

  // --------------------------------------------------
  // UI
  // --------------------------------------------------

  return (
    <div className="watch-room">

      <header>
        <div>

          <h1>
            🎬YOUTUBE WATCH PARTY
          </h1>

          <p>
            Room ID: {roomCode}
          </p>

          <p>
            Connection:{" "}
            {connected
              ? "🟢 Live"
              : "🔴 Disconnected"}
          </p>

          <p>
            Your Role:{" "}
            <strong>
              {myRole || "Loading..."}
            </strong>
          </p>

          <button
            onClick={logout}
            style={{
              padding: "10px 18px",
              background: "#dc3545",
              color: "white",
              border: "none",
              borderRadius: "6px",
              cursor: "pointer",
              marginTop: "10px",
            }}
          >
            🚪 Logout
          </button>

        </div>
      </header>

      {error && (
        <div className="error">
          {error}
        </div>
      )}

      <main>

        {/* ==========================================
            YouTube Player
        =========================================== */}

        <section>

          <h2>
            ▶️ TODAY'S SHOW
          </h2>

          {/* Change Video */}

          {canControl && (
            <form
              onSubmit={changeVideo}
              style={{
                marginBottom: "20px",
              }}
            >

              <input
                type="url"
                placeholder="Paste YouTube URL"
                value={youtubeUrl}
                onChange={(event) =>
                  setYoutubeUrl(
                    event.target.value
                  )
                }
                required
                style={{
                  width: "70%",
                  padding: "10px",
                  marginRight: "10px",
                }}
              />

              <button type="submit">
                🎬 Change Video
              </button>

            </form>
          )}

          {/* Show status if role is still loading */}

          {!canControl && myRole === "" && (
            <p>
              Loading permissions...
            </p>
          )}

          {/* Viewer / Participant notice */}

          {!canControl && myRole !== "" && (
            <div className="viewer-notice">
              🔒{" "}
              <span>
                You are watching as{" "}
                <strong>
                  {myRole}
                </strong>
                . Playback is controlled by
                the Host or Moderator.
              </span>
            </div>
          )}

          {/* YouTube Player */}

          <div className="youtube-player">

            <YouTube
              key={`${videoId}-${canControl ? "controller" : "viewer"}`}
              videoId={videoId}
              opts={playerOptions}
              onReady={
                handlePlayerReady
              }
              onStateChange={
                handlePlayerStateChange
              }
            />

          </div>

        </section>

        {/* ==========================================
            Participants + Conversation
        =========================================== */}

        <aside>

          {/* ------------------------------------------
              Participants
          ------------------------------------------- */}

          <section className="participants-section">

            <h2>
              👥 Participants

              <span
                style={{
                  marginLeft: "8px",
                  fontSize: "14px",
                  background: "#007bff",
                  color: "white",
                  padding: "4px 9px",
                  borderRadius: "12px",
                }}
              >
                {participants.length}
              </span>
            </h2>

            {participants.length === 0 ? (
              <p>
                No participants found.
              </p>
            ) : (
              participants.map(
                (participant) => (
                  <div
                    key={
                      participant.user_id
                    }
                    className="participant"
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: "12px",
                      padding: "10px",
                      marginBottom: "8px",
                    }}
                  >

                    <div>
                      <strong>
                        {
                          participant.username
                        }
                      </strong>

                      <div>
                        Role:{" "}
                        {
                          participant.role
                        }
                      </div>
                    </div>

                    {/* Host Role Management */}

                    {isHost &&
                      participant.role !==
                        "HOST" && (
                        <select
                          value={
                            participant.role
                          }
                          onChange={(
                            event
                          ) =>
                            updateParticipantRole(
                              participant.user_id,
                              event.target.value as
                                | "MODERATOR"
                                | "PARTICIPANT"
                                | "VIEWER"
                            )
                          }
                          style={{
                            padding: "6px 8px",
                            borderRadius: "5px",
                            cursor: "pointer",
                          }}
                        >

                          <option value="MODERATOR">
                            Moderator
                          </option>

                          <option value="PARTICIPANT">
                            Participant
                          </option>

                          <option value="VIEWER">
                            Viewer
                          </option>

                        </select>
                      )}

                  </div>
                )
              )
            )}

          </section>

          {/* ------------------------------------------
              Conversation
          ------------------------------------------- */}

          <section
            className="chat-section"
            style={{
              marginTop: "25px",
              borderTop: "1px solid #ddd",
              paddingTop: "20px",
            }}
          >

            <h2>
              💬 Conversation
            </h2>

            {/* Chat messages */}

            <div
              className="chat-messages"
              style={{
                height: "300px",
                overflowY: "auto",
                border: "1px solid #ddd",
                borderRadius: "8px",
                padding: "12px",
                marginBottom: "12px",
                background: "#f8f9fa",
              }}
            >

              {chatMessages.length === 0 ? (
                <p
                  style={{
                    textAlign: "center",
                    color: "#777",
                  }}
                >
                  No messages yet.
                  <br />
                  Start the conversation! 👋
                </p>
              ) : (
                chatMessages.map(
                  (
                    chatMessage,
                    index
                  ) => (
                    <div
                      key={`${chatMessage.user_id}-${index}`}
                      style={{
                        marginBottom: "12px",
                      }}
                    >

                      <div>
                        <strong>
                          {
                            chatMessage.username
                          }
                        </strong>

                        <span
                          style={{
                            marginLeft: "6px",
                            fontSize: "11px",
                            color: "#777",
                          }}
                        >
                          {
                            chatMessage.role
                          }
                        </span>
                      </div>

                      <div
                        style={{
                          marginTop: "3px",
                          padding: "8px 10px",
                          background: "white",
                          borderRadius: "6px",
                          wordBreak: "break-word",
                        }}
                      >
                        {
                          chatMessage.message
                        }
                      </div>

                    </div>
                  )
                )
              )}

            </div>

            {/* Chat input */}

            <form
              onSubmit={sendChatMessage}
              style={{
                display: "flex",
                gap: "8px",
              }}
            >

              <input
                type="text"
                placeholder="Type a message..."
                value={chatInput}
                onChange={(event) =>
                  setChatInput(
                    event.target.value
                  )
                }
                maxLength={500}
                disabled={!connected}
                style={{
                  flex: 1,
                  padding: "10px",
                  border: "1px solid #ccc",
                  borderRadius: "6px",
                }}
              />

              <button
                type="submit"
                disabled={
                  !connected ||
                  !chatInput.trim()
                }
                style={{
                  padding: "10px 16px",
                  border: "none",
                  borderRadius: "6px",
                  cursor:
                    connected &&
                    chatInput.trim()
                      ? "pointer"
                      : "not-allowed",
                }}
              >
                Send
              </button>

            </form>

            <small
              style={{
                display: "block",
                marginTop: "5px",
                color: "#777",
                textAlign: "right",
              }}
            >
              {chatInput.length}/500
            </small>

          </section>

        </aside>

      </main>

    </div>
  );
}

