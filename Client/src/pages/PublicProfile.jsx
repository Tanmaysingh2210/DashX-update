import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import api from "../api/axios";
import Heatmap from "../components/Heatmap";
import Loader from "../components/Loader";
import useMeta from "../utils/useMeta";
import {
  FlameIcon,
  GitHubIcon,
  LeetCodeIcon,
  TryHackMeIcon,
  TrendIcon,
  CalendarIcon,
  CommitIcon,
  ClockIcon,
} from "../components/Icons";
import "./PublicProfile.css";

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const utcDateStr = (daysAgo = 0) => {
  const d = new Date();
  return new Date(Date.UTC(
    d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - daysAgo
  )).toISOString().split("T")[0];
};

/**
 * Formats a YYYY-MM-DD date string into a relative "Xd ago" label.
 * Uses UTC parsing to avoid timezone shift issues.
 */
const formatDateRelative = (dateStr) => {
  if (!dateStr) return null;
  const [y, m, d] = dateStr.split("-").map(Number);
  const dateUTC = new Date(Date.UTC(y, m - 1, d));
  const now = new Date();
  const todayUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const diffMs = todayUTC.getTime() - dateUTC.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  return `${diffDays}d ago`;
};

const PublicProfile = () => {
  const { username } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const fetch = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await api.get(`/public/${username}`);
        setData(res.data);
      } catch (err) {
        const msg = err.response?.data?.message || "Profile not found";
        setError(msg);
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, [username]);

  const handleCopy = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // ── derived insights from days ──
  const insights = data ? (() => {
    const days = data.days || [];

    const weekdayTotals = new Array(7).fill(0);
    const monthTotals = {};

    days.forEach((d) => {
      const [y, m, day] = d.date.split("-").map(Number);
      const wd = new Date(Date.UTC(y, m - 1, day)).getUTCDay();
      weekdayTotals[wd] += d.totalCount;
      const key = `${y}-${m - 1}`;
      monthTotals[key] = (monthTotals[key] || 0) + d.totalCount;
    });

    const mostActiveDay = DAY_NAMES[weekdayTotals.indexOf(Math.max(...weekdayTotals))];

    let peakMonth = "—";
    let peakVal = -1;
    Object.entries(monthTotals).forEach(([key, val]) => {
      if (val > peakVal) {
        peakVal = val;
        const [, mi] = key.split("-");
        peakMonth = MONTH_NAMES[Number(mi)];
      }
    });

    const thirtyDaysAgo = utcDateStr(29);
    const last30Total = days
      .filter((d) => d.date >= thirtyDaysAgo)
      .reduce((s, d) => s + d.totalCount, 0);
    const dailyAvg = (last30Total / 30).toFixed(1);

    return { mostActiveDay, peakMonth, dailyAvg };
  })() : null;

  // safe destructure to avoid TDZ when using below
  const { profile, stats } = data || {};
  const pStats = profile?.platformStats || {};

  useMeta(
    profile
      ? {
        title: `${profile.githubUsername}'s coding profile — DashX`,
        description: `🔥 ${stats?.longestStreak}-day best streak · ${stats?.totalActiveDays} active days · ${stats?.consistency}% consistency. View full activity heatmap on DashX.`,
        image: profile.avatar || "https://dashx.aalsicoders.in/og-image.png",
        url: `https://dashx.aalsicoders.in/u/${profile.githubUsername}`,
      }
      : {
        title: "DashX — Developer Profile",
        description: "Track your coding consistency across GitHub and LeetCode.",
        image: "https://dashx.aalsicoders.in/og-image.png",
        url: `https://dashx.aalsicoders.in/u/${username}`,
      }
  );

  if (loading) {
    return (
      <div className="public-profile__loading">
        <Loader label="Loading profile..." />
      </div>
    );
  }

  if (error) {
    return (
      <div className="public-profile__error-page">
        <div className="public-profile__error-card card">
          <h1 className="headline-md">Profile not found</h1>
          <p className="body-md">{error}</p>
          <Link to="/" className="btn btn--primary">Go to DashX</Link>
        </div>
      </div>
    );
  }

  const connectedCount = 1 + (profile.leetcodeUsername ? 1 : 0) + (profile.tryhackmeUsername ? 1 : 0);

  return (
    <div className="public-profile fade-in">

      {/* ── hero header ── */}
      <div className="public-profile__hero">
        <div className="page public-profile__hero-inner">
          <div className="public-profile__identity">
            <img
              className="public-profile__avatar"
              src={profile.avatar}
              alt={profile.githubUsername}
            />
            <div>
              <h1 className="headline-lg public-profile__name">
                @{profile.githubUsername}
              </h1>
              <div className="public-profile__handles">
                <a
                  href={`https://github.com/${profile.githubUsername}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="public-profile__handle"
                >
                  <GitHubIcon width={14} height={14} /> {profile.githubUsername}
                </a>
                {profile.leetcodeUsername && (
                  <a
                    href={`https://leetcode.com/${profile.leetcodeUsername}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="public-profile__handle public-profile__handle--lc"
                  >
                    <LeetCodeIcon width={14} height={14} /> {profile.leetcodeUsername}
                  </a>
                )}
                {profile.tryhackmeUsername && (
                  <a
                    href={`https://tryhackme.com/r/p/${profile.tryhackmeUsername}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="public-profile__handle public-profile__handle--thm"
                  >
                    <TryHackMeIcon width={14} height={14} /> {profile.tryhackmeUsername}
                  </a>
                )}
              </div>

              {/* ── connected platforms badges ── */}
              <div className="public-profile__platforms">
                <span className="public-profile__platform-badge public-profile__platform-badge--github">
                  <GitHubIcon width={12} height={12} /> GitHub
                </span>
                {profile.leetcodeUsername && (
                  <span className="public-profile__platform-badge public-profile__platform-badge--lc">
                    <LeetCodeIcon width={12} height={12} /> LeetCode
                  </span>
                )}
                {profile.tryhackmeUsername && (
                  <span className="public-profile__platform-badge public-profile__platform-badge--thm">
                    <TryHackMeIcon width={12} height={12} /> TryHackMe
                  </span>
                )}
              </div>

              <p className="label-md public-profile__since">
                Member since {new Date(profile.memberSince).toLocaleDateString(undefined, {
                  month: "long", year: "numeric", timeZone: "UTC"
                })}
              </p>
            </div>
          </div>

          <div className="public-profile__hero-actions">
            <button className="btn btn--secondary" onClick={handleCopy}>
              {copied ? "✓ Copied!" : "Copy link"}
            </button>
            <Link to="/" className="btn btn--ghost">
              Powered by DashX →
            </Link>
          </div>
        </div>
      </div>

      <div className="page public-profile__body">

        {/* ── top stat cards ── */}
        <div className="public-profile__stats">
          <PublicStatCard
            label="Current streak"
            value={stats.currentStreak}
            unit="days"
            sub={`Best: ${stats.longestStreak} days`}
            icon={<FlameIcon />}
            accent="tertiary"
            delay={0}
          />
          <PublicStatCard
            label="GitHub contributions"
            value={stats.githubTotal}
            sub={`${stats.githubWeekly} this week`}
            icon={<GitHubIcon />}
            accent="secondary"
            delay={60}
          />
          {profile.leetcodeUsername && (
            <PublicStatCard
              label="LeetCode attempts"
              value={stats.leetcodeTotal}
              sub={`${stats.leetcodeWeekly} this week`}
              icon={<LeetCodeIcon />}
              accent="tertiary"
              delay={120}
            />
          )}
          {profile.tryhackmeUsername && (
            <PublicStatCard
              label="TryHackMe events"
              value={stats.tryhackmeTotal ?? 0}
              sub={`${stats.tryhackmeWeekly ?? 0} this week`}
              icon={<TryHackMeIcon />}
              accent="danger"
              delay={150}
            />
          )}
          <PublicStatCard
            label="Consistency"
            value={`${stats.consistency}%`}
            sub={`${stats.activeIn30} active days in last 30`}
            icon={<TrendIcon />}
            accent="primary"
            delay={180}
          />
        </div>

        {/* ── heatmap ── */}
        <div className="card public-profile__heatmap-card fade-up" style={{ animationDelay: "220ms" }}>
          <div className="public-profile__heatmap-header">
            <h2 className="title-lg">Activity heatmap</h2>
            <div className="public-profile__heatmap-legend">
              <span><span className="dot dot--github" /> GitHub</span>
              {profile.leetcodeUsername && <span><span className="dot dot--leetcode" /> LeetCode</span>}
              {profile.tryhackmeUsername && <span><span className="dot dot--tryhackme" /> TryHackMe</span>}
              {((profile.leetcodeUsername ? 1 : 0) + (profile.tryhackmeUsername ? 1 : 0) >= 1) && (
                <span><span className="dot dot--combined" /> Combined</span>
              )}
            </div>
          </div>

          <Heatmap
            days={data.days || []}
            connectedPlatforms={profile?.connectedPlatforms}
          />

          {insights && (
            <div className="public-profile__heatmap-stats">
              <HeatmapStat icon={<FlameIcon />} label="Best streak" value={`${stats.longestStreak} days`} />
              <HeatmapStat icon={<ClockIcon />} label="Most active" value={insights.mostActiveDay} />
              <HeatmapStat icon={<TrendIcon />} label="Peak month" value={insights.peakMonth} />
              <HeatmapStat icon={<CommitIcon />} label="Daily avg (30d)" value={insights.dailyAvg} />
            </div>
          )}
        </div>

        {/* ── activity panels (dashboard-style) ── */}
        <div className={`public-profile__panels ${connectedCount >= 3 ? 'public-profile__panels--three' : ''}`}>
          <ActivityPanel
            title="GitHub activity"
            accent="secondary"
            icon={<GitHubIcon />}
            rows={[
              { label: "Contributions this week", value: stats.githubWeekly ?? 0 },
              { label: "Last 12 months", value: stats.githubTotal ?? 0 },
              { label: "Public repos", value: pStats.github?.publicRepos ?? "—" },
              {
                label: "Profile",
                value: (
                  <a href={`https://github.com/${profile.githubUsername}`} target="_blank" rel="noopener noreferrer" className="public-profile__link">
                    github.com/{profile.githubUsername}
                  </a>
                ),
              },
            ]}
            lastActive={stats.lastGithub}
            delay={280}
          />

          {profile.leetcodeUsername && (
            <ActivityPanel
              title="LeetCode activity"
              accent="tertiary"
              icon={<LeetCodeIcon />}
              rows={[
                { label: "Attempts this week", value: stats.leetcodeWeekly ?? 0 },
                { label: "Last 12 months (incl. failed)", value: stats.leetcodeTotal ?? 0 },
                { label: "Questions solved", value: pStats.leetcode?.totalSolved ?? "—" },
                {
                  label: "Difficulty",
                  value: pStats.leetcode
                    ? <DifficultyBadges easy={pStats.leetcode.easy} medium={pStats.leetcode.medium} hard={pStats.leetcode.hard} />
                    : "—",
                },
                {
                  label: "Profile",
                  value: (
                    <a href={`https://leetcode.com/${profile.leetcodeUsername}`} target="_blank" rel="noopener noreferrer" className="public-profile__link public-profile__link--lc">
                      leetcode.com/{profile.leetcodeUsername}
                    </a>
                  ),
                },
              ]}
              lastActive={stats.lastLeetcode}
              delay={340}
            />
          )}

          {profile.tryhackmeUsername && (
            <ActivityPanel
              title="TryHackMe activity"
              accent="danger"
              icon={<TryHackMeIcon />}
              rows={[
                { label: "Events this week", value: stats.tryhackmeWeekly ?? 0 },
                { label: "Last 12 months", value: stats.tryhackmeTotal ?? 0 },
                { label: "Rooms completed", value: pStats.tryhackme?.roomsCompleted ?? "—" },
                {
                  label: "Profile",
                  value: (
                    <a href={`https://tryhackme.com/r/p/${profile.tryhackmeUsername}`} target="_blank" rel="noopener noreferrer" className="public-profile__link public-profile__link--thm">
                      tryhackme.com/r/p/{profile.tryhackmeUsername}
                    </a>
                  ),
                },
              ]}
              lastActive={stats.lastTryhackme}
              delay={380}
            />
          )}
        </div>

        {/* ── footer ── */}
        <div className="public-profile__footer">
          <p className="body-md">
            Built with{" "}
            <Link to="/" className="public-profile__link">DashX</Link>
            {" "}— track your coding consistency across GitHub, LeetCode, and TryHackMe.
          </p>
        </div>

      </div>
    </div>
  );
};

const PublicStatCard = ({ label, value, unit, sub, icon, accent, delay }) => (
  <div className="card public-stat-card fade-up" style={{ animationDelay: `${delay}ms` }}>
    <div className="public-stat-card__top">
      <span className="label-md">{label}</span>
      <div className={`stat-card__icon stat-card__icon--${accent}`}>{icon}</div>
    </div>
    <div className="public-stat-card__value">
      <span className="public-stat-card__number">{value}</span>
      {unit && <span className="public-stat-card__unit">{unit}</span>}
    </div>
    {sub && <p className="body-md public-stat-card__sub">{sub}</p>}
  </div>
);

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
      <span className={`dot dot--${accent === "secondary" ? "github" : accent === "danger" ? "tryhackme" : "leetcode"}`} />
      <span className="label-md activity-panel__last-active">
        Last active: {lastActive ? formatDateRelative(lastActive) : "—"}
      </span>
    </div>
  </div>
);

const DifficultyBadges = ({ easy, medium, hard }) => (
  <div className="difficulty-badges">
    <span className="difficulty-badge difficulty-badge--easy">{easy} Easy</span>
    <span className="difficulty-badge difficulty-badge--medium">{medium} Med</span>
    <span className="difficulty-badge difficulty-badge--hard">{hard} Hard</span>
  </div>
);

export default PublicProfile;