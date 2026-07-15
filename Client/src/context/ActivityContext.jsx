import { createContext, useContext, useState, useCallback } from "react";
import api from "../api/axios";

const ActivityContext = createContext(null);

/**
 * ActivityProvider
 *
 * Holds the data that both Dashboard and Activity & Insights pages need:
 *   - heatmap days  (GET /activity/heatmap)
 *   - summary stats (GET /activity/stats)
 *   - sync status   (POST /activity/sync)
 *
 * Lives above the protected routes so switching between Dashboard
 * and Activity pages doesn't refetch everything.
 */
export const ActivityProvider = ({ children }) => {
  const [days, setDays] = useState([]);          // [{ date, githubCount, leetcodeCount, totalCount }]
  const [stats, setStats] = useState(null);       // { currentStreak, longestStreak, totalActiveDays, ... }
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState(null);


  const fetchHeatmap = useCallback(async (from, to) => {
    const now = new Date();
    const localToday = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

    const params = { today: localToday };
    if (from) params.from = from;
    if (to) params.to = to;

    const { data } = await api.get("/activity/heatmap", { params });
    setDays(data.days || []);
    return data.days;
  }, []);


  const fetchStats = useCallback(async () => {
    const { data } = await api.get("/activity/stats");
    setStats(data.stats);
    return data.stats;
  }, []);

  /**
   * Loads both heatmap + stats together — used on Dashboard mount.
   */
  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await Promise.all([fetchHeatmap(), fetchStats()]);
    } catch (err) {
      setError(err.response?.data?.message || "Couldn't load activity data");
    } finally {
      setLoading(false);
    }
  }, [fetchHeatmap, fetchStats]);

  /**
   * Triggers a manual sync. Backend rate-limits to once per hour
   * and returns 429 with a message if too soon.
   */
  const sync = useCallback(async () => {
    setSyncing(true);
    setError(null);
    try {
      const { data } = await api.post("/activity/sync");
      await loadAll();

      // sync can "succeed" overall but have one source fail (e.g. bad
      // GITHUB_PAT or LeetCode 403) — surface that as a warning
      if (data.stats?.sourceErrors) {
        setError(data.message);
      }

      return { success: true, stats: data.stats, message: data.message };
    } catch (err) {
      const message = err.response?.data?.message || "Sync failed";
      setError(message);
      return { success: false, message };
    } finally {
      setSyncing(false);
    }
  }, [loadAll]);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const value = {
    days,
    stats,
    loading,
    syncing,
    error,
    clearError,
    fetchHeatmap,
    fetchStats,
    loadAll,
    sync,
  };

  return <ActivityContext.Provider value={value}>{children}</ActivityContext.Provider>;
};

export const useActivity = () => {
  const ctx = useContext(ActivityContext);
  if (!ctx) throw new Error("useActivity must be used within an ActivityProvider");
  return ctx;
};