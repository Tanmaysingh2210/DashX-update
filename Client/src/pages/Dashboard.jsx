import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useActivity } from "../context/ActivityContext";
import Heatmap from "../components/Heatmap";
import StatCard from "../components/StatCard";
import Loader from "../components/Loader";
import ErrorToast from "../components/ErrorToast";
import { trackEvent, trackPageView } from "../utils/analyticsHelper";
import {
  FlameIcon,
  GitHubIcon,
  LeetCodeIcon,
  TrendIcon,
  RefreshIcon,
  CommitIcon,
  ClockIcon,
} from "../components/Icons";
import "./Dashboard.css";
import { ShareIcon } from "../assets/Icons";
import ConnectPlatformsBanner from "../components/ConnectPlatformsBanner";

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];



const formatRelative = (dateStr) => {
  if (!dateStr) return "Never";
  const date = new Date(dateStr);
  const diffMs = Date.now() - date.getTime();
  const diffHrs = Math.floor(diffMs / (1000 * 60 * 60));
  if (diffHrs < 1) return "Just now";
  if (diffHrs < 24) return `${diffHrs}h ago`;
  const diffDays = Math.floor(diffHrs / 24);
  return `${diffDays}d ago`;
};

/** Sync progress steps shown during initial setup sync */
const SYNC_STEPS = [
  "Connecting to GitHub…",
  "Fetching contribution history…",
  "Scanning connected platforms…",
  "Merging activity data…",
  "Calculating streaks…",
];

const Dashboard = () => {
  const [copied, setCopied] = useState(false);
  const { user, refreshUser } = useAuth();
  const { days, stats, loading, syncing, error, clearError, loadAll, sync } = useActivity();

  // ── initial sync state ──
  const [initialSyncing, setInitialSyncing] = useState(false);
  const [syncStepIndex, setSyncStepIndex] = useState(0);
  const [syncFailed, setSyncFailed] = useState(false);

  useEffect(() => {
    trackPageView();
  }, []);

  useEffect(() => {
    // If the user has synced data, just load normally
    if (user?.lastSynced) {
      setInitialSyncing(false);
      loadAll();
      return;
    }

    // No lastSynced — user hasn't synced yet.
    // If syncStatus is "syncing", show the loader and poll.
    // If syncStatus is "done" (race: sync finished before we mounted), load data.
    // Otherwise, just load whatever's there (empty state).

    if (user?.syncStatus !== "syncing") {
      setInitialSyncing(false);
      // Either "done", "idle", "failed", or undefined — just load data
      if (user?.syncStatus === "done") refreshUser(); // update lastSynced in user state
      loadAll();
      return;
    }

    // ── Active sync — show loading screen and poll ──
    setInitialSyncing(true);
    setSyncFailed(false);
    setSyncStepIndex(0);

    let step = 0;
    let cancelled = false;

    const stepTimer = setInterval(() => {
      step = Math.min(step + 1, SYNC_STEPS.length - 1);
      setSyncStepIndex(step);
    }, 4000);

    const startTime = Date.now();

    const poll = async () => {
      if (cancelled) return;

      // 2-minute safety timeout
      if (Date.now() - startTime > 120_000) {
        clearInterval(stepTimer);
        setInitialSyncing(false);
        setSyncFailed(true);
        return;
      }

      try {
        const freshUser = await refreshUser();
        if (freshUser?.lastSynced) {
          // Sync completed!

          //for analytics tracking
          if (!sessionStorage.getItem("initial_sync_tracked")) {
            trackEvent("initial_sync_completed");
            sessionStorage.setItem("initial_sync_tracked", "true");
          }

          clearInterval(stepTimer);
          await loadAll();
          setInitialSyncing(false);
          return;
        }
        if (freshUser?.syncStatus === "failed") {
          if (!sessionStorage.getItem("initial_sync_failed")) {
            trackEvent("initial_sync_failed");
            sessionStorage.setItem("initial_sync_failed", "true");
          }

          clearInterval(stepTimer);
          setInitialSyncing(false);
          setSyncFailed(true);
          return;
        }
      } catch {
        // keep polling
      }

      if (!cancelled) setTimeout(poll, 3000);
    };

    // First poll immediately, then every 3s
    poll();

    return () => {
      cancelled = true;
      clearInterval(stepTimer);
    };
  }, [user?.lastSynced, user?.syncStatus]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── derived insights computed client-side from the raw days array ──
  const insights = useMemo(() => {
    if (!days.length) return null;

    const githubTotal = days.reduce((s, d) => s + d.githubCount, 0);
    const leetcodeTotal = days.reduce((s, d) => s + d.leetcodeCount, 0);

    // ── weekday + month bucketing ──
    // BUG FIX: new Date("YYYY-MM-DD") parses as UTC midnight, but .getDay()/.getMonth()
    // uses LOCAL timezone. In IST (UTC+5:30) a Monday date becomes Sunday night UTC.
    // Fix: parse the date string directly without Date() to avoid timezone shift.
    const weekdayTotals = new Array(7).fill(0);
    const monthTotals = {};

    days.forEach((d) => {
      // parse "YYYY-MM-DD" directly — no Date() constructor, no timezone shift
      const [year, month, day] = d.date.split("-").map(Number);

      // weekday via UTC date — getUTCDay() is timezone-safe
      const utcDate = new Date(Date.UTC(year, month - 1, day));
      const weekday = utcDate.getUTCDay(); // 0=Sun, 1=Mon ... 6=Sat
      weekdayTotals[weekday] += d.totalCount;

      // month key: "2024-7" (month is 0-indexed to match MONTH_NAMES)
      const monthKey = `${year}-${month - 1}`;
      monthTotals[monthKey] = (monthTotals[monthKey] || 0) + d.totalCount;
    });

    const mostActiveDay = DAY_NAMES[weekdayTotals.indexOf(Math.max(...weekdayTotals))];

    // peak month — find the month key with the highest total
    let peakMonth = "—";
    let peakValue = -1;
    Object.entries(monthTotals).forEach(([key, value]) => {
      if (value > peakValue) {
        peakValue = value;
        const [, monthIndex] = key.split("-");
        peakMonth = MONTH_NAMES[Number(monthIndex)]; // monthIndex is already 0-based
      }
    });

    // ── consistency: % of actual last 30 CALENDAR days that had activity ──
    // BUG FIX: `days` only contains active docs (no zeros stored anymore).
    // days.slice(-30) gives last 30 ACTIVE days, not last 30 calendar days.
    // Fix: build a Set of active dates, then check the last 30 calendar days.
    const activeDateSet = new Set(days.map((d) => d.date));

    const today = new Date();
    let activeIn30 = 0;
    for (let i = 0; i < 30; i++) {
      const d = new Date(Date.UTC(
        today.getUTCFullYear(),
        today.getUTCMonth(),
        today.getUTCDate() - i
      ));
      const dateStr = d.toISOString().split("T")[0];
      if (activeDateSet.has(dateStr)) activeIn30++;
    }
    const consistency = Math.round((activeIn30 / 30) * 100);

    // ── active days in last 30 calendar days (same fix) ──
    const activeDaysIn30 = activeIn30; // reuse from above

    // ── daily average: total contributions ÷ 30 calendar days ──
    // BUG FIX: was dividing by activeDays.length (always = days.length since no zeros).
    // "Daily average" should mean per calendar day, not per active day.
    const last30Total = days
      .filter((d) => {
        const cutoff = new Date(Date.UTC(
          today.getUTCFullYear(),
          today.getUTCMonth(),
          today.getUTCDate() - 29
        )).toISOString().split("T")[0];
        return d.date >= cutoff;
      })
      .reduce((s, d) => s + d.totalCount, 0);

    const avgPerDay = (last30Total / 30).toFixed(1);

    // last active date per platform
    const lastGithub = [...days].reverse().find((d) => d.githubCount > 0);
    const lastLeetcode = [...days].reverse().find((d) => d.leetcodeCount > 0);

    // last 7 days totals — use calendar days not slice
    const sevenDaysAgo = new Date(Date.UTC(
      today.getUTCFullYear(),
      today.getUTCMonth(),
      today.getUTCDate() - 6
    )).toISOString().split("T")[0];

    const last7Days = days.filter((d) => d.date >= sevenDaysAgo);
    const githubWeekly = last7Days.reduce((s, d) => s + d.githubCount, 0);
    const leetcodeWeekly = last7Days.reduce((s, d) => s + d.leetcodeCount, 0);

    const tryhackmeTotal = days.reduce((s, d) => s + (d.tryhackmeCount || 0), 0);
    const tryhackmeWeekly = last7Days.reduce((s, d) => s + (d.tryhackmeCount || 0), 0);
    const lastTryhackme = [...days].reverse().find((d) => (d.tryhackmeCount || 0) > 0);

    return {
      githubTotal,
      leetcodeTotal,
      tryhackmeTotal,      // ← new
      mostActiveDay,
      peakMonth,
      avgPerDay,
      activeDaysIn30,
      lastGithub,
      lastLeetcode,
      lastTryhackme,       // ← new
      githubWeekly,
      leetcodeWeekly,
      tryhackmeWeekly,     // ← new
      consistency,
    };
  }, [days]);

  const handleShare = () => {
    const url = `${window.location.origin}/u/${user?.githubUsername}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSync = async () => {
    await sync();
  };

  return (
    <div className="page dashboard fade-in">
      <div className="dashboard__header">
        <div>
          <h1 className="headline-lg">Welcome back, {user?.githubUsername}</h1>
          <p className="body-md">
            Last synced {stats?.lastSynced ? formatRelative(stats.lastSynced) : "never"}
          </p>
        </div>
        <div className="dashboard__header-actions">
          <button
            className="btn btn--secondary"
            onClick={handleShare}
            title={`Copy link: /u/${user?.githubUsername}`}
            type="button"
          >
            <ShareIcon />
            {copied ? "Copied!" : "Share profile"}
          </button>
          <button className="btn btn--secondary" onClick={handleSync} disabled={syncing}>
            <RefreshIcon className={syncing ? "icon-spin" : ""} />
            {syncing ? "Syncing..." : "Sync now"}
          </button>
        </div>
      </div>

      {!initialSyncing && (
        <ErrorToast
          message={error}
          onDismiss={clearError}
          duration={5000}
        />
      )}

      {initialSyncing ? (
        <div className="dashboard__initial-sync fade-in">
          <div className="card dashboard__sync-card">
            <div className="dashboard__sync-spinner" />
            <h2 className="headline-md">Setting up your dashboard</h2>
            <p className="body-md">
              We're pulling your contribution history from all connected
              platforms. This usually takes 15–30 seconds.
            </p>

            {/* progress bar */}
            <div className="dashboard__sync-progress">
              <div
                className="dashboard__sync-progress-fill"
                style={{
                  width: `${Math.round(
                    ((syncStepIndex + 1) / SYNC_STEPS.length) * 100
                  )}%`,
                }}
              />
            </div>

            <div className="dashboard__sync-steps">
              {SYNC_STEPS.map((step, i) => (
                <div
                  key={step}
                  className={`dashboard__sync-step ${i < syncStepIndex
                    ? "done"
                    : i === syncStepIndex
                      ? "active"
                      : ""
                    }`}
                >
                  <span className="dashboard__sync-step-icon">
                    {i < syncStepIndex ? (
                      <span className="dashboard__sync-step-check">
                        <svg viewBox="0 0 16 16">
                          <polyline points="3.5 8.5 6.5 11.5 12.5 4.5" />
                        </svg>
                      </span>
                    ) : (
                      <span className="dashboard__sync-step-dot" />
                    )}
                  </span>
                  <span className="body-md">{step}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : syncFailed ? (
        <div className="dashboard__initial-sync fade-in">
          <div className="card dashboard__sync-card dashboard__sync-card--failed">
            <h2 className="headline-md">Sync failed</h2>
            <p className="body-md">
              Something went wrong during the initial sync. You can try syncing manually.
            </p>
            <button className="btn btn--primary" onClick={handleSync} disabled={syncing}>
              <RefreshIcon className={syncing ? "icon-spin" : ""} />
              {syncing ? "Syncing..." : "Try again"}
            </button>
          </div>
        </div>
      ) : loading && !stats ? (
        <Loader label="Loading your activity..." />
      ) : (
        <>
          <ConnectPlatformsBanner />
          <div className="grid dashboard__stats">
            <StatCard
              label="Combined current streak"
              value={stats?.currentStreak ?? 0}
              unit="days"
              sub={stats?.longestStreak ? `Best is ${stats.longestStreak} days` : undefined}
              icon={<FlameIcon />}
              accent="tertiary"
              delay={0}
            />
            <StatCard
              label="GitHub contributions"
              value={insights?.githubTotal ?? 0}
              sub={insights ? `${insights.githubWeekly} this week` : undefined}
              icon={<GitHubIcon />}
              accent="secondary"
              subTone="success"
              delay={60}
            />
            {user?.leetcodeUsername && (
              <StatCard
                label="LeetCode attempts"
                value={insights?.leetcodeTotal ?? 0}
                sub={insights ? `${insights.leetcodeWeekly} this week (incl. failed)` : undefined}
                icon={<LeetCodeIcon />}
                accent="tertiary"
                subTone="warning"
                delay={120}
              />
            )}
            {user?.tryhackmeUsername && (
              <StatCard
                label="TryHackMe rooms"
                value={insights?.tryhackmeTotal ?? 0}
                sub={insights ? `${insights.tryhackmeWeekly} this week` : undefined}
                icon={<TryHackMeIcon />}
                accent="danger"
                subTone="danger"
                delay={150}
              />
            )}
            <StatCard
              label="Consistency score"
              value={`${insights?.consistency ?? 0}%`}
              sub={insights ? `${insights.activeDaysIn30} active days in last 30` : "Active days in last 30"}
              icon={<TrendIcon />}
              accent="primary"
              subTone="primary"
              delay={180}
            />
          </div>

          <div className="card dashboard__heatmap-card fade-up" style={{ animationDelay: "240ms" }}>
            <div className="dashboard__heatmap-header">
              <h2 className="title-lg">Unified activity heatmap</h2>
              <div className="dashboard__heatmap-legend">
                <span><span className="dot dot--github" /> GitHub</span>
                <span><span className="dot dot--leetcode" /> LeetCode</span>
                <span><span className="dot dot--combined" /> Combined</span>
              </div>
            </div>

            <Heatmap days={days} />

            {insights && (
              <div className="dashboard__heatmap-stats">
                <HeatmapStat icon={<FlameIcon />} label="Best streak" value={`${stats?.longestStreak ?? 0} days`} />
                <HeatmapStat icon={<ClockIcon />} label="Most active" value={insights.mostActiveDay} />
                <HeatmapStat icon={<TrendIcon />} label="Peak month" value={insights.peakMonth} />
                <HeatmapStat icon={<CommitIcon />} label="Daily avg (30d)" value={insights.avgPerDay} />
              </div>
            )}
          </div>

          <div className="dashboard__panels">
            <ActivityPanel
              title="GitHub activity"
              accent="secondary"
              icon={<GitHubIcon />}
              rows={[
                { label: "Contributions this week", value: insights?.githubWeekly ?? 0 },
                { label: "Last 12 months", value: insights?.githubTotal ?? 0 },
                { label: "Username", value: `@${user?.githubUsername}`, mono: true },
              ]}
              lastActive={insights?.lastGithub?.date}
              delay={300}
            />
            {user?.leetcodeUsername && (
              <ActivityPanel
                title="LeetCode activity"
                accent="tertiary"
                icon={<LeetCodeIcon />}
                rows={[
                  { label: "Attempts this week", value: insights?.leetcodeWeekly ?? 0 },
                  { label: "Last 12 months (incl. failed)", value: insights?.leetcodeTotal ?? 0 },
                  { label: "Username", value: `${user?.leetcodeUsername}`, mono: true },
                ]}
                lastActive={insights?.lastLeetcode?.date}
                delay={360}
              />
            )}
            {user?.tryhackmeUsername && (
              <ActivityPanel
                title="TryHackMe activity"
                accent="danger"
                icon={<TryHackMeIcon />}
                rows={[
                  { label: "Rooms this week", value: insights?.tryhackmeWeekly ?? 0 },
                  { label: "Last 12 months", value: insights?.tryhackmeTotal ?? 0 },
                  { label: "Username", value: user.tryhackmeUsername, mono: true },
                ]}
                lastActive={insights?.lastTryhackme?.date}
                delay={420}
              />
            )}
          </div>
        </>
      )}
    </div>
  );
};

const HeatmapStat = ({ icon, label, value }) => (
  <div className="heatmap-stat">
    <div className="heatmap-stat__icon">{icon}</div>
    <div>
      <p className="label-md">{label}</p>
      <p className="title-lg">{value}</p>
    </div>
  </div>
);

const ActivityPanel = ({ title, icon, accent, rows, lastActive, delay }) => (
  <div className={`card activity-panel activity-panel--${accent} fade-up`} style={{ animationDelay: `${delay}ms` }}>
    <div className="activity-panel__header">
      <div className={`stat-card__icon stat-card__icon--${accent}`}>{icon}</div>
      <h3 className="title-lg">{title}</h3>
    </div>

    <div className="activity-panel__rows">
      {rows.map((row) => (
        <div className="activity-panel__row" key={row.label}>
          <span className="body-md activity-panel__row-label">{row.label}</span>
          <span className={row.mono ? "mono" : "title-lg"}>{row.value}</span>
        </div>
      ))}
    </div>

    <div className="activity-panel__footer">
      <span className={`dot dot--${accent === "secondary" ? "github" : "leetcode"}`} />
      <span className="label-md activity-panel__last-active">
        Last active: {lastActive ? formatRelative(lastActive) : "—"}
      </span>
    </div>
  </div>
);

const TryHackMeIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path d="M12 2L2 7l10 5 10-5-10-5z" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M2 17l10 5 10-5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M2 12l10 5 10-5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export default Dashboard;