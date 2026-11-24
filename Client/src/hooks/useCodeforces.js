import { useState, useEffect, useCallback } from "react";
import api from "../api/axios";

/**
 * Custom hook for all Codeforces data fetching.
 * Centralizes all CF API calls so components don't duplicate logic.
 */
export const useCodeforces = () => {
  const [profile, setProfile] = useState(null);
  const [stats, setStats] = useState(null);
  const [ratingHistory, setRatingHistory] = useState([]);
  const [syncStatus, setSyncStatus] = useState("idle");
  const [syncError, setSyncError] = useState(null);
  const [lastSyncedAt, setLastSyncedAt] = useState(null);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState(null);

  const fetchProfile = useCallback(async () => {
    try {
      const { data } = await api.get("/api/codeforces/profile");
      if (data.success) {
        setProfile(data.profile);
        setSyncStatus(data.syncStatus || "idle");
        setSyncError(data.syncError || null);
        setLastSyncedAt(data.lastSyncedAt || null);
      }
      return data.profile;
    } catch (err) {
      setError(err.response?.data?.message || "Failed to load Codeforces profile");
      return null;
    }
  }, []);

  const fetchStats = useCallback(async () => {
    try {
      const { data } = await api.get("/api/codeforces/stats");
      if (data.success) setStats(data.stats);
      return data.stats;
    } catch {
      return null;
    }
  }, []);

  const fetchRatingHistory = useCallback(async () => {
    try {
      const { data } = await api.get("/api/codeforces/rating-history");
      if (data.success) setRatingHistory(data.ratingHistory || []);
      return data.ratingHistory || [];
    } catch {
      return [];
    }
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await Promise.all([fetchProfile(), fetchStats(), fetchRatingHistory()]);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to load Codeforces data");
    } finally {
      setLoading(false);
    }
  }, [fetchProfile, fetchStats, fetchRatingHistory]);

  const triggerSync = useCallback(async () => {
    setSyncing(true);
    setError(null);
    try {
      await api.post("/api/codeforces/sync");
      // Poll for completion
      await new Promise((resolve) => setTimeout(resolve, 2000));
      await loadAll();
      return { success: true };
    } catch (err) {
      const message = err.response?.data?.message || "Sync failed";
      setError(message);
      return { success: false, message };
    } finally {
      setSyncing(false);
    }
  }, [loadAll]);

  return {
    profile,
    stats,
    ratingHistory,
    syncStatus,
    syncError,
    lastSyncedAt,
    loading,
    syncing,
    error,
    loadAll,
    fetchProfile,
    fetchStats,
    fetchRatingHistory,
    triggerSync,
  };
};
