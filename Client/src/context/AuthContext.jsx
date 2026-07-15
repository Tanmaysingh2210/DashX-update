import { createContext, useContext, useState, useEffect, useCallback } from "react";
import api from "../api/axios";
import { trackEvent } from "../utils/analyticsHelper";

const AuthContext = createContext(null);

/**
 * AuthProvider
 *
 * Wraps the app. On mount, checks GET /auth/me to see if the
 * httpOnly JWT cookie is valid and fetches the current user.
 *
 * Exposes:
 *   user            - current user object or null
 *   loading         - true while the initial /auth/me check is running
 *   isAuthenticated - boolean shortcut
 *   loginWithGitHub - redirects to backend OAuth entry point
 *   logout          - clears cookie + local state
 *   refreshUser     - re-fetches /auth/me (call after setup/sync)
 */
export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    try {
      const { data } = await api.get("/auth/me");
      setUser(data.user);
      return data.user;
    } catch {
      // 401 → not logged in, this is a normal state, not an error
      setUser(null);
      return null;
    }
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await refreshUser();
      setLoading(false);
    })();
  }, [refreshUser]);

  /**
   * Redirects the full page to the backend's GitHub OAuth entry point.
   * This is a hard redirect (not an axios call) — OAuth requires
   * the browser itself to navigate to GitHub's consent screen.
   */
  const loginWithGitHub = () => {
    const base = import.meta.env.VITE_API_URL || "http://localhost:5000";
    window.location.href = `${base}/auth/github`;
  };

  const logout = async () => {
    try {

      trackEvent("logout");
      
      await api.post("/auth/logout");
    } finally {
      setUser(null);
    }
  };

  const value = {
    user,
    loading,
    isAuthenticated: !!user,
    loginWithGitHub,
    logout,
    refreshUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
};