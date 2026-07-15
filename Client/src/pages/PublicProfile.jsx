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
                <a
                  href={`https://leetcode.com/${profile.leetcodeUsername}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="public-profile__handle public-profile__handle--lc"
                >
                  <LeetCodeIcon width={14} height={14} /> {profile.leetcodeUsername}
                </a>
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
          <PublicStatCard
            label="LeetCode attempts"
            value={stats.leetcodeTotal}
            sub={`${stats.leetcodeWeekly} this week`}
            icon={<LeetCodeIcon />}
            accent="tertiary"
            delay={120}
          />
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
              <span><span className="dot dot--github" /> GitHub only</span>
              <span><span className="dot dot--leetcode" /> LeetCode only</span>
              <span><span className="dot dot--combined" /> Both</span>
            </div>
          </div>

          <Heatmap days={data.days || []} />

          {insights && (
            <div className="public-profile__heatmap-stats">
              <HeatmapStat icon={<FlameIcon />} label="Best streak" value={`${stats.longestStreak} days`} />
              <HeatmapStat icon={<ClockIcon />} label="Most active" value={insights.mostActiveDay} />
              <HeatmapStat icon={<TrendIcon />} label="Peak month" value={insights.peakMonth} />
              <HeatmapStat icon={<CommitIcon />} label="Daily avg (30d)" value={insights.dailyAvg} />
            </div>
          )}
        </div>

        {/* ── bottom panels ── */}
        <div className="public-profile__panels">
          <div className="card public-profile__panel fade-up" style={{ animationDelay: "280ms" }}>
            <div className="public-profile__panel-header">
              <div className="stat-card__icon stat-card__icon--secondary"><GitHubIcon /></div>
              <h3 className="title-lg">GitHub activity</h3>
            </div>
            <PanelRow label="Contributions this week" value={stats.githubWeekly} />
            <PanelRow label="Last 12 months" value={stats.githubTotal} />
            <PanelRow label="Profile" value={
              <a href={`https://github.com/${profile.githubUsername}`} target="_blank" rel="noopener noreferrer" className="public-profile__link">
                github.com/{profile.githubUsername}
              </a>
            } />
          </div>

          <div className="card public-profile__panel fade-up" style={{ animationDelay: "340ms" }}>
            <div className="public-profile__panel-header">
              <div className="stat-card__icon stat-card__icon--tertiary"><LeetCodeIcon /></div>
              <h3 className="title-lg">LeetCode activity</h3>
            </div>
            <PanelRow label="Attempts this week" value={stats.leetcodeWeekly} />
            <PanelRow label="Last 12 months (incl. failed)" value={stats.leetcodeTotal} />
            <PanelRow label="Profile" value={
              <a href={`https://leetcode.com/${profile.leetcodeUsername}`} target="_blank" rel="noopener noreferrer" className="public-profile__link public-profile__link--lc">
                leetcode.com/{profile.leetcodeUsername}
              </a>
            } />
          </div>
        </div>

        {/* ── footer ── */}
        <div className="public-profile__footer">
          <p className="body-md">
            Built with{" "}
            <Link to="/" className="public-profile__link">DashX</Link>
            {" "}— track your coding consistency across GitHub and LeetCode.
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

const PanelRow = ({ label, value }) => (
  <div className="public-profile__panel-row">
    <span className="body-md public-profile__panel-label">{label}</span>
    <span className="title-lg">{value}</span>
  </div>
);

export default PublicProfile;