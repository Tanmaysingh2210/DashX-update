import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { useActivity } from "../context/ActivityContext";
import api from "../api/axios";
import {
  GitHubIcon,
  LeetCodeIcon,
  RefreshIcon,
  ZapIcon,
} from "../components/Icons";
import "./Settings.css";
import { trackPageView } from "../utils/analyticsHelper";

const formatRelative = (dateStr) => {
  if (!dateStr) return "Never";
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins} min${diffMins > 1 ? "s" : ""} ago`;
  const diffHrs = Math.floor(diffMins / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  return `${Math.floor(diffHrs / 24)}d ago`;
};

const Settings = () => {
  const { user, loginWithGitHub, refreshUser } = useAuth();
  const { stats, syncing, error, sync } = useActivity();

  const [leetcodeInput, setLeetcodeInput] = useState(user?.leetcodeUsername || "");
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState(null);

  const [isPublic, setIsPublic] = useState(user?.isPublic ?? true);
  const [privacySaving, setPrivacySaving] = useState(false);

  // ── preference toggles ──
  const [prefs, setPrefs] = useState({
    includePrivate: user?.includePrivate ?? false,
    weeklyReports: user?.weeklyReports ?? false,
    notifications: user?.notifications ?? true,
  });

  useEffect(() => {
    if (user) {
      setIsPublic(user.isPublic ?? true);
      setPrefs({
        includePrivate: user.includePrivate ?? false,
        weeklyReports: user.weeklyReports ?? false,
        notifications: user.notifications ?? true,
      });
    }
  }, [user]);

  const togglePref = async (key) => {
    const newValue = !prefs[key];
    setPrefs((p) => ({ ...p, [key]: newValue }));
    try {
      await api.patch("/auth/preferences", { [key]: newValue });
      await refreshUser();
    } catch {
      // revert on failure
      setPrefs((p) => ({ ...p, [key]: !newValue }));
    }
  };

  const handleSaveLeetcode = async (e) => {
    e.preventDefault();
    const cleaned = leetcodeInput.trim();
    if (!cleaned) return;

    setSaving(true);
    setSaveMessage(null);
    try {
      await api.patch("/auth/setup-leetcode", { leetcodeUsername: cleaned });
      await refreshUser();
      setSaveMessage({ type: "success", text: "LeetCode username saved. Syncing in background…" });
    } catch (err) {
      setSaveMessage({
        type: "error",
        text: err.response?.data?.message || "Couldn't save LeetCode username",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleSync = async () => {
    setSaveMessage(null);
    const result = await sync();
    if (!result.success) {
      setSaveMessage({ type: "error", text: result.message });
    } else {
      setSaveMessage({ type: "success", text: "Sync complete." });
    }
  };

  const handlePrivacyToggle = async () => {
    const newValue = !isPublic;
    setIsPublic(newValue);
    setPrivacySaving(true);
    try {
      await api.patch("/public/privacy", { isPublic: newValue });
      await refreshUser();
    } catch {
      // revert on failure
      setIsPublic(!newValue);
    } finally {
      setPrivacySaving(false);
    }
  };

  useEffect(() => {
    trackPageView();
  }, []);

  const connectedCount = [user?.githubUsername, user?.leetcodeUsername].filter(Boolean).length;

  return (
    <div className="page settings-page fade-in">
      <div className="settings-page__header">
        <h1 className="headline-lg">Settings</h1>
        <p className="body-md">Connect your developer profiles to sync activity and generate insights.</p>
      </div>

      <div className="settings-grid">
        <div className="card profile-card fade-up" style={{ animationDelay: "0ms" }}>
          <div className="profile-card__top">
            <div className="stat-card__icon stat-card__icon--secondary">
              <GitHubIcon />
            </div>
            <span className="pill pill--success pill--dot">Connected</span>
          </div>
          <p className="title-lg">@{user?.githubUsername}</p>
          <p className="label-md">GitHub</p>

          <div className="profile-card__divider" />

          <div className="profile-card__row">
            <span className="body-md">Last synced</span>
            <span className="mono">{formatRelative(stats?.lastSynced)}</span>
          </div>

          <button className="btn btn--secondary btn--full" onClick={loginWithGitHub}>
            Reconnect
          </button>
        </div>

        <div className="card profile-card fade-up" style={{ animationDelay: "60ms" }}>
          <div className="profile-card__top">
            <div className="stat-card__icon stat-card__icon--tertiary">
              <LeetCodeIcon />
            </div>
            {user?.leetcodeUsername ? (
              <span className="pill pill--success pill--dot">Connected</span>
            ) : (
              <span className="pill" style={{ color: "var(--color-outline)", background: "var(--fill-ghost)" }}>
                Not connected
              </span>
            )}
          </div>
          <p className="title-lg">{user?.leetcodeUsername || "—"}</p>
          <p className="label-md">LeetCode</p>

          <div className="profile-card__divider" />

          <form className="profile-card__form" onSubmit={handleSaveLeetcode}>
            <div className="field">
              <label htmlFor="leetcode-username">LeetCode username</label>
              <input
                id="leetcode-username"
                type="text"
                placeholder="e.g. tanmay123"
                value={leetcodeInput}
                onChange={(e) => setLeetcodeInput(e.target.value)}
              />
            </div>
            <button className="btn btn--tertiary btn--full" type="submit" disabled={saving}>
              {saving ? "Saving..." : "Save LeetCode username"}
            </button>
          </form>
        </div>

        <div className="card preferences-card fade-up" style={{ animationDelay: "120ms" }}>
          <h3 className="title-lg">Preferences</h3>

          <Toggle
            label="Public profile"
            sub={isPublic
              ? `Visible at /u/${user?.githubUsername}`
              : "Profile hidden from public"
            }
            checked={isPublic}
            onChange={handlePrivacyToggle}
            disabled={privacySaving}
          />

          <Toggle
            label="Include private GitHub"
            sub="Count private contributions"
            checked={prefs.includePrivate}
            onChange={() => togglePref("includePrivate")}
          />
          <Toggle
            label="Weekly insight reports"
            sub="Receive email summaries"
            checked={prefs.weeklyReports}
            onChange={() => togglePref("weeklyReports")}
          />
          <Toggle
            label="Activity notifications"
            sub="Alerts on major milestones"
            checked={prefs.notifications}
            onChange={() => togglePref("notifications")}
          />
        </div>
      </div>

      <div className="settings-grid settings-grid--bottom">
        <div className="card sync-card fade-up" style={{ animationDelay: "180ms" }}>
          <h3 className="title-lg">Manual sync</h3>
          <p className="body-md">
            Pulls your full GitHub contribution history and LeetCode submission calendar, merges
            them by date, and refreshes your dashboard. Limited to once per hour.
          </p>

          {saveMessage && (
            <div className={`sync-card__message sync-card__message--${saveMessage.type}`}>
              {saveMessage.text}
            </div>
          )}
          {error && !saveMessage && <div className="sync-card__message sync-card__message--error">{error}</div>}

          {isPublic && user?.leetcodeUsername && (
            <div className="sync-card__public-url">
              <span className="label-md">Your public profile</span>
              <div className="sync-card__url-row">
                <code className="sync-card__url mono">
                  {window.location.origin}/u/{user.githubUsername}
                </code>
                <button
                  className="btn btn--ghost"
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(
                      `${window.location.origin}/u/${user.githubUsername}`
                    );
                  }}
                >
                  Copy
                </button>
              </div>
            </div>
          )}

          <button className="btn btn--primary btn--full" onClick={handleSync} disabled={syncing}>
            <RefreshIcon className={syncing ? "icon-spin" : ""} />
            {syncing ? "Syncing profiles..." : "Sync profiles"}
          </button>
        </div>

        <div className="card status-card fade-up" style={{ animationDelay: "240ms" }}>
          <div className="status-card__header">
            <div className="stat-card__icon stat-card__icon--primary">
              <ZapIcon />
            </div>
            <h3 className="title-lg">All systems normal</h3>
          </div>

          <div className="status-card__row">
            <span className="body-md">Connected profiles</span>
            <span className="title-lg">{connectedCount} / 2 active</span>
          </div>

          <div className="breakdown__track">
            <div
              className="breakdown__fill breakdown__fill--primary"
              style={{ width: `${(connectedCount / 2) * 100}%` }}
            />
          </div>

          <p className="body-md status-card__note">
            {connectedCount === 2
              ? "Both profiles connected. Sync runs on demand from this page, rate-limited to once per hour."
              : "Add your LeetCode username to unlock the unified heatmap and combined streak."}
          </p>
        </div>
      </div>
    </div>
  );
};

const Toggle = ({ label, sub, checked, onChange }) => (
  <div className="toggle-row">
    <div>
      <p className="body-lg toggle-row__label">{label}</p>
      <p className="label-md toggle-row__sub">{sub}</p>
    </div>
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      className={`switch ${checked ? "switch--on" : ""}`}
      onClick={onChange}
    >
      <span className="switch__thumb" />
    </button>
  </div>
);

export default Settings;