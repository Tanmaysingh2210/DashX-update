import { Routes, Route } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { ActivityProvider } from "./context/ActivityContext";
import ProtectedRoute from "./components/ProtectedRoute";
import Navbar from "./components/Navbar";

import Home from "./pages/Home";
import Setup from "./pages/Setup";
import Dashboard from "./pages/Dashboard";
import Activity from "./pages/Activity";
import Settings from "./pages/Settings";
import PublicProfile from "./pages/PublicProfile";
import AuthCallback from "./pages/AuthCallback";


/**
 * App
 *
 * AuthProvider wraps everything — every page needs to know
 * whether someone is logged in.
 *
 * ActivityProvider only wraps the protected routes — heatmap/stats
 * data is meaningless before login, and this avoids firing
 * /activity/* requests for anonymous visitors on "/".
 */
function App() {
  return (
    <AuthProvider>
      <Navbar />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/u/:username" element={<PublicProfile />} />

        {/* ── protected app ── */}
        <Route
          element={
            <ActivityProvider>
              <ProtectedRoute />
            </ActivityProvider>
          }
        >
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/activity" element={<Activity />} />
          <Route path="/settings" element={<Settings />} />
        </Route>

        {/* fallback — unknown routes go home */}
        <Route path="*" element={<Home />} />
      </Routes>
    </AuthProvider>
  );
}

export default App;