import {
  BrowserRouter,
  Routes,
  Route,
} from "react-router-dom";

import WatchRoom from "./pages/WatchRoom";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Dashboard from "./pages/Dashboard";
import ProtectedRoute from "./pages/ProtectedRoute";
import JoinRoom from "./pages/JoinRoom";

function App() {
  return (
    <BrowserRouter>
      <Routes>

        <Route
          path="/login"
          element={<Login />}
        />

        <Route
          path="/register"
          element={<Register />}
        />

        {/* Join through unique room link */}
        <Route
          path="/join/:roomCode"
          element={<JoinRoom />}
        />

        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />

        <Route
          path="/room/:roomCode"
          element={
            <ProtectedRoute>
              <WatchRoom />
            </ProtectedRoute>
          }
        />

        <Route
          path="*"
          element={<Login />}
        />

      </Routes>
    </BrowserRouter>
  );
}

export default App;

