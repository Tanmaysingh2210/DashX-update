import { useState } from "react";
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

// ── TryHackMe icon (inline — not in Icons.jsx yet) ──
const TryHackMeIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path d="M12 2L2 7l10 5 10-5-10-5z" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M2 17l10 5 10-5" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M2 12l10 5 10-5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const formatRelative = (dateStr) => {
  if (!dateStr) return "Never";
  const diffMs   = Date.now() - new Date(dateStr).getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1)  return "Just now";
  if (diffMins < 60) return `${diffMins} min${diffMins > 1 ? "s" : ""} ago`;
  const diffHrs = Math.floor(diffMins / 60);
  if (diffHrs < 24)  return `${diffHrs}h ago`;
  return `${Math.floor(diffHrs / 24)}d ago`;
};

const Settings = () => {
  const { user, loginWithGitHub, refreshUser } = useAuth();
  const { stats, syncing, error, sync } = useActivity();

  // ── LeetCode connect form ──
  const [leetcodeInput, setLeetcodeInput]   = useState(user?.leetcodeUsername || "");
  const [lcSaving, setLcSaving]             = useState(false);
  const [lcMessage, setLcMessage]           = useState(null);

  // ── TryHackMe connect form ──
  const [thmInput, setThmInput]             = useState(user?.tryhackmeUsername || "");
  const [thmSaving, setThmSaving]           = useState(false);
  const [thmMessage, setThmMessage]         = useState(null);

  const [syncMessage, setSyncMessage]       = useState(null);

  // ── preference toggles ──
  const [prefs, setPrefs] = useState({
    isPublic:       user?.isPublic       ?? true,
    autoSync:       true,
    includePrivate: user?.includePrivate ?? false,
    weeklyReports:  user?.weeklyReports  ?? false,
    notifications:  user?.notifications  ?? true,
  });
  const [prefSaving, setPrefSaving] = useState(false);

  const togglePref = async (key) => {
    const newValue  = !prefs[key];
    setPrefs((p)   => ({ ...p, [key]: newValue }));
    setPrefSaving(true);
    try {
      if (key === "isPublic") {
        await api.patch("/public/privacy", { isPublic: newValue });
      } else {
        await api.patch("/auth/preferences", { [key]: newValue });
      }
    } catch {
      // revert on failure
      setPrefs((p) => ({ ...p, [key]: !newValue }));
    } finally {
      setPrefSaving(false);
    }
  };

  // ── connect LeetCode ──
  const handleConnectLeetCode = async (e) => {
    e.preventDefault();
    const cleaned = leetcodeInput.trim();
    if (!cleaned) return;
    setLcSaving(true);
    setLcMessage(null);
    try {
      await api.patch("/auth/connect/leetcode", { leetcodeUsername: cleaned });
      await refreshUser();
      setLcMessage({ type: "success", text: "LeetCode connected. Syncing in background…" });
    } catch (err) {
      setLcMessage({ type: "error", text: err.response?.data?.message || "Failed to connect LeetCode" });
    } finally {
      setLcSaving(false);
    }
  };

  // ── disconnect a platform ──
  const handleDisconnect = async (platform) => {
    if (!confirm(`Disconnect ${platform}? Your activity data will be kept.`)) return;
    try {
      await api.delete(`/auth/disconnect/${platform}`);
      await refreshUser();
      if (platform === "leetcode") setLeetcodeInput("");
      if (platform === "tryhackme") setThmInput("");
    } catch (err) {
      console.error("Disconnect failed:", err.message);
    }
  };

  // ── connect TryHackMe ──
  const handleConnectTryHackMe = async (e) => {
    e.preventDefault();
    const cleaned = thmInput.trim();
    if (!cleaned) return;
    setThmSaving(true);
    setThmMessage(null);
    try {
      await api.patch("/auth/connect/tryhackme", { tryhackmeUsername: cleaned });
      await refreshUser();
      setThmMessage({ type: "success", text: "TryHackMe connected. Syncing in background…" });
    } catch (err) {
      setThmMessage({ type: "error", text: err.response?.data?.message || "Failed to connect TryHackMe" });
    } finally {
      setThmSaving(false);
    }
  };

  // ── manual sync ──
  const handleSync = async () => {
    setSyncMessage(null);
    const result = await sync();
    setSyncMessage(result.success
      ? { type: "success", text: result.message || "Sync complete." }
      : { type: "error",   text: result.message }
    );
  };

  const connectedCount = [
    true,                        // GitHub always
    !!user?.leetcodeUsername,
    !!user?.tryhackmeUsername,
  ].filter(Boolean).length;

  return (
    <div className="page settings-page fade-in">
      <div className="settings-page__header">
        <h1 className="headline-lg">Settings</h1>
        <p className="body-md">Connect your developer profiles to sync activity and generate insights.</p>
      </div>

      {/* ── Platform cards ── */}
      <div className="settings-platforms">

        {/* GitHub — always connected, can reconnect */}
        <PlatformCard
          icon={<GitHubIcon />}
          accent="secondary"
          name="GitHub"
          username={`@${user?.githubUsername}`}
          label="GITHUB"
          connected
          lastSynced={stats?.lastSynced}
          onReconnect={loginWithGitHub}
        />

        {/* LeetCode — optional */}
        <PlatformCard
          icon={<LeetCodeIcon />}
          accent="tertiary"
          name="LeetCode"
          username={user?.leetcodeUsername}
          label="LEETCODE"
          connected={!!user?.leetcodeUsername}
          lastSynced={user?.leetcodeUsername ? stats?.lastSynced : null}
          onReconnect={() => handleDisconnect("leetcode")}
          reconnectLabel="Disconnect"
          form={
            <form className="platform-card__form" onSubmit={handleConnectLeetCode}>
              <div className="field">
                <label htmlFor="lc-username">LeetCode username or profile URL</label>
                <input
                  id="lc-username"
                  type="text"
                  placeholder="e.g. Tanmay2210 or leetcode.com/u/Tanmay2210"
                  value={leetcodeInput}
                  onChange={(e) => setLeetcodeInput(e.target.value)}
                />
              </div>
              {lcMessage && (
                <p className={`platform-card__msg platform-card__msg--${lcMessage.type}`}>
                  {lcMessage.text}
                </p>
              )}
              <button className="btn btn--tertiary btn--full" type="submit" disabled={lcSaving}>
                {lcSaving ? "Connecting…" : user?.leetcodeUsername ? "Update username" : "Connect LeetCode"}
              </button>
            </form>
          }
        />

        {/* TryHackMe — optional */}
        <PlatformCard
          icon={<TryHackMeIcon />}
          accent="danger"
          name="TryHackMe"
          username={user?.tryhackmeUsername}
          label="TRYHACKME"
          connected={!!user?.tryhackmeUsername}
          lastSynced={user?.tryhackmeUsername ? stats?.lastSynced : null}
          onReconnect={() => handleDisconnect("tryhackme")}
          reconnectLabel="Disconnect"
          form={
            <form className="platform-card__form" onSubmit={handleConnectTryHackMe}>
              <div className="field">
                <label htmlFor="thm-username">TryHackMe username</label>
                <input
                  id="thm-username"
                  type="text"
                  placeholder="e.g. Tanmay2210"
                  value={thmInput}
                  onChange={(e) => setThmInput(e.target.value)}
                />
              </div>
              {thmMessage && (
                <p className={`platform-card__msg platform-card__msg--${thmMessage.type}`}>
                  {thmMessage.text}
                </p>
              )}
              <button className="btn btn--full settings-page__thm-btn" type="submit" disabled={thmSaving}>
                {thmSaving ? "Connecting…" : user?.tryhackmeUsername ? "Update username" : "Connect TryHackMe"}
              </button>
            </form>
          }
        />

        {/* Preferences */}
        <div className="card preferences-card fade-up" style={{ animationDelay: "180ms" }}>
          <h3 className="title-lg">Preferences</h3>

          <Toggle
            label="Public profile"
            sub={prefs.isPublic
              ? `Visible at /u/${user?.githubUsername}`
              : "Profile hidden from public"}
            checked={prefs.isPublic}
            onChange={() => togglePref("isPublic")}
            disabled={prefSaving}
          />
          <Toggle
            label="Include private GitHub"
            sub="Count private repo contributions"
            checked={prefs.includePrivate}
            onChange={() => togglePref("includePrivate")}
            disabled={prefSaving}
          />
          <Toggle
            label="Weekly insight reports"
            sub="Receive email summaries"
            checked={prefs.weeklyReports}
            onChange={() => togglePref("weeklyReports")}
            disabled={prefSaving}
          />
          <Toggle
            label="Activity notifications"
            sub="Alerts on major milestones"
            checked={prefs.notifications}
            onChange={() => togglePref("notifications")}
            disabled={prefSaving}
          />
        </div>
      </div>

      {/* ── Bottom row: Manual sync + System status ── */}
      <div className="settings-grid settings-grid--bottom">
        <div className="card sync-card fade-up" style={{ animationDelay: "240ms" }}>
          <h3 className="title-lg">Manual sync</h3>
          <p className="body-md">
            Pulls your contribution history from all connected platforms, merges
            by date, and refreshes your dashboard. Rate-limited to once per hour.
          </p>

          {prefs.isPublic && user?.githubUsername && (
            <div className="sync-card__public-url">
              <span className="label-md">Your public profile</span>
              <div className="sync-card__url-row">
                <code className="sync-card__url mono">
                  {window.location.origin}/u/{user.githubUsername}
                </code>
                <button
                  className="btn btn--ghost"
                  type="button"
                  onClick={() =>
                    navigator.clipboard.writeText(
                      `${window.location.origin}/u/${user.githubUsername}`
                    )
                  }
                >
                  Copy
                </button>
              </div>
            </div>
          )}

          {syncMessage && (
            <div className={`sync-card__message sync-card__message--${syncMessage.type}`}>
              {syncMessage.text}
            </div>
          )}
          {error && !syncMessage && (
            <div className="sync-card__message sync-card__message--error">{error}</div>
          )}

          <button className="btn btn--primary btn--full" onClick={handleSync} disabled={syncing}>
            <RefreshIcon className={syncing ? "icon-spin" : ""} />
            {syncing ? "Syncing profiles…" : "Sync profiles"}
          </button>
        </div>

        <div className="card status-card fade-up" style={{ animationDelay: "300ms" }}>
          <div className="status-card__header">
            <div className="stat-card__icon stat-card__icon--primary"><ZapIcon /></div>
            <h3 className="title-lg">All systems normal</h3>
          </div>

          <div className="status-card__row">
            <span className="body-md">Connected profiles</span>
            <span className="title-lg">{connectedCount} / 3 active</span>
          </div>

          <div className="breakdown__track">
            <div
              className="breakdown__fill breakdown__fill--primary"
              style={{ width: `${(connectedCount / 3) * 100}%` }}
            />
          </div>

          <div className="status-card__platforms">
            <PlatformStatus label="GitHub"     active={true}                      dot="github"    />
            <PlatformStatus label="LeetCode"   active={!!user?.leetcodeUsername}  dot="leetcode"  />
            <PlatformStatus label="TryHackMe"  active={!!user?.tryhackmeUsername} dot="tryhackme" />
          </div>

          <p className="body-md status-card__note">
            {connectedCount === 3
              ? "All platforms connected. Auto-syncs every 24 hours."
              : "Connect more platforms to get a fuller picture of your coding activity."}
          </p>
        </div>
      </div>
    </div>
  );
};

// ── sub-components ────────────────────────────────────────────────────────────

const PlatformCard = ({
  icon, accent, name, username, label,
  connected, lastSynced, onReconnect, reconnectLabel = "Reconnect", form
}) => (
  <div className={`card platform-card platform-card--${accent} fade-up`}>
    <div className="platform-card__top">
      <div className={`stat-card__icon stat-card__icon--${accent}`}>{icon}</div>
      {connected
        ? <span className="pill pill--success pill--dot">Connected</span>
        : <span className="pill" style={{ color: "var(--color-outline)", background: "var(--fill-ghost)" }}>Not connected</span>
      }
    </div>

    <p className="title-lg">{username || "—"}</p>
    <p className="label-md">{label}</p>

    {connected && (
      <>
        <div className="platform-card__divider" />
        <div className="platform-card__row">
          <span className="body-md">Last synced</span>
          <span className="mono">{lastSynced ? formatRelative(lastSynced) : "Never"}</span>
        </div>
        <button className="btn btn--secondary btn--full" onClick={onReconnect}>
          {reconnectLabel}
        </button>
      </>
    )}

    {form && <div className="platform-card__divider" />}
    {form}
  </div>
);

const PlatformStatus = ({ label, active, dot }) => (
  <div className="platform-status">
    <span className={`dot dot--${dot}`} style={{ opacity: active ? 1 : 0.3 }} />
    <span className="body-md" style={{ color: active ? "var(--color-on-surface)" : "var(--color-outline)" }}>
      {label}
    </span>
    <span className="label-md" style={{ marginLeft: "auto", textTransform: "none", letterSpacing: 0, color: active ? "var(--color-secondary)" : "var(--color-outline)" }}>
      {active ? "Active" : "Not connected"}
    </span>
  </div>
);

const Toggle = ({ label, sub, checked, onChange, disabled }) => (
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
      disabled={disabled}
    >
      <span className="switch__thumb" />
    </button>
  </div>
);

export default Settings;