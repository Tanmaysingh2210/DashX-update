import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useActivity } from "../context/ActivityContext";
import StatCard from "../components/StatCard";
import Loader from "../components/Loader";
import { trackPageView } from "../utils/analyticsHelper";
import {
  FlameIcon,
  CalendarIcon,
  CodeIcon,
  SparklesIcon,
  TrendIcon,
  ClockIcon,
  ZapIcon,
  GitHubIcon,
  LeetCodeIcon,
  ShieldIcon,
} from "../components/Icons";
import { CodeforcesIcon } from "../components/CodeforcesIcon";
import api from "../api/axios";
import "./Activity.css";

const formatDate = (dateStr) => {
  // parse without Date() constructor to avoid timezone shift
  const [year, month, day] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  const today = new Date();
  const todayUTC = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const diffDays = Math.round((todayUTC - date) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
};

/**
 * Returns a YYYY-MM-DD string for N days ago in UTC.
 */
const utcDateStr = (daysAgo = 0) => {
  const d = new Date();
  return new Date(Date.UTC(
    d.getUTCFullYear(),
    d.getUTCMonth(),
    d.getUTCDate() - daysAgo
  )).toISOString().split("T")[0];
};



const Activity = () => {
  const { user } = useAuth();
  const { days, stats, loading, error, loadAll } = useActivity();
  const [platformFilter, setPlatformFilter] = useState("all");
  const [cfDetails, setCfDetails] = useState([]);

  const hasTHM = !!user?.tryhackmeUsername;
  const hasLC = !!user?.leetcodeUsername;
  const hasCF = !!user?.codeforcesHandle;

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  useEffect(() => {
    trackPageView();
  }, []);

  useEffect(() => {
    if (user?.codeforcesHandle) {
      api.get("/api/codeforces/activity")
        .then((res) => {
          if (res.data?.success) setCfDetails(res.data.days || []);
        })
        .catch(() => {});
    }
  }, [user?.codeforcesHandle]);

  const cfDetailMap = useMemo(() => new Map(cfDetails.map((d) => [d.date, d])), [cfDetails]);

  const data = useMemo(() => {
    if (!days.length) return null;

    // Build a Set for O(1) date lookup
    const activeDateSet = new Set(days.map((d) => d.date));

    const today = utcDateStr(0);

    // ── last 7 calendar days (not last 7 active days) ──
    const sevenDaysAgo = utcDateStr(6);
    const last7Days = days.filter((d) => d.date >= sevenDaysAgo);
    const weeklyActivity = last7Days.reduce((s, d) => s + d.totalCount, 0);
    const problemsThisWeek = last7Days.reduce((s, d) => s + d.leetcodeCount, 0);
    const tryhackmeThisWeek = last7Days.reduce((s, d) => s + (d.tryhackmeCount || 0), 0);
    const codeforcesThisWeek = last7Days.reduce((s, d) => s + (d.codeforcesCount || 0), 0);

    // ── previous 7 days (for velocity comparison) ──
    const fourteenDaysAgo = utcDateStr(13);
    const prev7Days = days.filter((d) => d.date >= fourteenDaysAgo && d.date < sevenDaysAgo);
    const prevWeekly = prev7Days.reduce((s, d) => s + d.totalCount, 0);
    const velocityChange = prevWeekly > 0
      ? Math.round(((weeklyActivity - prevWeekly) / prevWeekly) * 100)
      : null;

    // ── last 30 CALENDAR days ──
    const thirtyDaysAgo = utcDateStr(29);
    const last30Days = days.filter((d) => d.date >= thirtyDaysAgo);
    const githubLast30 = last30Days.reduce((s, d) => s + d.githubCount, 0);
    const leetcodeLast30 = last30Days.reduce((s, d) => s + d.leetcodeCount, 0);
    const tryhackmeLast30 = last30Days.reduce((s, d) => s + (d.tryhackmeCount || 0), 0);
    const codeforcesLast30 = last30Days.reduce((s, d) => s + (d.codeforcesCount || 0), 0);
    const total30 = githubLast30 + leetcodeLast30 + tryhackmeLast30 + codeforcesLast30;

    // count active calendar days in last 30
    let activeDays30 = 0;
    for (let i = 0; i < 30; i++) {
      if (activeDateSet.has(utcDateStr(i))) activeDays30++;
    }

    const githubPct = total30 ? Math.round((githubLast30 / total30) * 100) : 0;
    const leetcodePct = total30 ? Math.round((leetcodeLast30 / total30) * 100) : 0;
    const tryhackmePct = total30 ? Math.round((tryhackmeLast30 / total30) * 100) : 0;
    const codeforcesPct = total30 ? Math.max(0, 100 - githubPct - leetcodePct - tryhackmePct) : 0;
    const activeDaysPct = Math.round((activeDays30 / 30) * 100);

    // daily average = total ÷ 30 calendar days (consistent with Dashboard)
    const dailyAvg = (total30 / 30).toFixed(1);

    // ── timeline: filtered by platform ──
    const filteredDays = days.filter((d) => {
      if (platformFilter === "github") return d.githubCount > 0;
      if (platformFilter === "leetcode") return d.leetcodeCount > 0;
      if (platformFilter === "tryhackme") return (d.tryhackmeCount || 0) > 0;
      if (platformFilter === "codeforces") return (d.codeforcesCount || 0) > 0;
      return true;
    });
    const timeline = [...filteredDays].reverse().slice(0, 8);

    // ── most active weekday — UTC-safe ──
    const weekdayTotals = new Array(7).fill(0);
    const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    days.forEach((d) => {
      const [y, m, day] = d.date.split("-").map(Number);
      const wd = new Date(Date.UTC(y, m - 1, day)).getUTCDay();
      weekdayTotals[wd] += d.totalCount;
    });
    const peakDay = dayNames[weekdayTotals.indexOf(Math.max(...weekdayTotals))];

    return {
      weeklyActivity,
      activeDays30,
      problemsThisWeek,
      tryhackmeThisWeek,
      codeforcesThisWeek,
      githubPct,
      leetcodePct,
      tryhackmePct,
      codeforcesPct,
      activeDaysPct,
      dailyAvg,
      timeline,
      velocityChange,
      peakDay,
      githubLast30,
      leetcodeLast30,
      tryhackmeLast30,
      codeforcesLast30,
    };
  }, [days, platformFilter]);

  // Dynamic stat card count for grid layout
  const statCount = 3 + (hasLC ? 1 : 0) + (hasTHM ? 1 : 0) + (hasCF ? 1 : 0);

  return (
    <div className="page activity-page fade-in">
      <div className="activity-page__header">
        <h1 className="headline-lg">Activity &amp; insights</h1>
        <p className="body-md">Analyze your coding patterns across all connected platforms.</p>
      </div>

      {error && <div className="dashboard__error card">{error}</div>}

      {loading && !stats ? (
        <Loader label="Loading insights..." />
      ) : (
        <>
          <div className={`grid activity-page__stats activity-page__stats--${statCount}`}>
            <StatCard
              label="Weekly activity"
              value={data?.weeklyActivity ?? 0}
              sub="contributions this week"
              icon={<TrendIcon />}
              accent="primary"
              delay={0}
            />
            <StatCard
              label="Current streak"
              value={stats?.currentStreak ?? 0}
              unit="days"
              sub={stats?.longestStreak ? `Best is ${stats.longestStreak} days` : undefined}
              icon={<FlameIcon />}
              accent="tertiary"
              delay={60}
            />
            <StatCard
              label="Active days"
              value={`${data?.activeDays30 ?? 0} / 30`}
              sub="last 30 calendar days"
              icon={<CalendarIcon />}
              accent="secondary"
              delay={120}
            />
            {hasLC && (
              <StatCard
                label="LeetCode attempts"
                value={data?.problemsThisWeek ?? 0}
                sub="this week (incl. failed submits)"
                icon={<CodeIcon />}
                accent="tertiary"
                subTone="warning"
                delay={180}
              />
            )}
            {hasTHM && (
              <StatCard
                label="TryHackMe events"
                value={data?.tryhackmeThisWeek ?? 0}
                sub="events this week"
                icon={<ShieldIcon />}
                accent="danger"
                subTone="danger"
                delay={210}
              />
            )}
            {hasCF && (
              <StatCard
                label="Codeforces submissions"
                value={data?.codeforcesThisWeek ?? 0}
                sub="submissions this week"
                icon={<CodeforcesIcon />}
                accent="primary"
                subTone="primary"
                delay={240}
              />
            )}
          </div>

          <div className="activity-filters fade-up">
            <button
              type="button"
              className={`activity-filter-btn ${platformFilter === "all" ? "active" : ""}`}
              onClick={() => setPlatformFilter("all")}
            >
              All platforms
            </button>
            <button
              type="button"
              className={`activity-filter-btn ${platformFilter === "github" ? "active" : ""}`}
              onClick={() => setPlatformFilter("github")}
            >
              <GitHubIcon width={14} height={14} /> GitHub
            </button>
            {hasLC && (
              <button
                type="button"
                className={`activity-filter-btn ${platformFilter === "leetcode" ? "active" : ""}`}
                onClick={() => setPlatformFilter("leetcode")}
              >
                <LeetCodeIcon width={14} height={14} /> LeetCode
              </button>
            )}
            {hasTHM && (
              <button
                type="button"
                className={`activity-filter-btn ${platformFilter === "tryhackme" ? "active" : ""}`}
                onClick={() => setPlatformFilter("tryhackme")}
              >
                <ShieldIcon width={14} height={14} /> TryHackMe
              </button>
            )}
            {hasCF && (
              <button
                type="button"
                className={`activity-filter-btn ${platformFilter === "codeforces" ? "active" : ""}`}
                onClick={() => setPlatformFilter("codeforces")}
              >
                <CodeforcesIcon width={14} height={14} /> Codeforces
              </button>
            )}
          </div>

          <div className="activity-page__main">
            <div className="card activity-page__timeline fade-up" style={{ animationDelay: "240ms" }}>
              <h2 className="title-lg activity-page__section-title">Recent activity timeline</h2>

              {data?.timeline?.length ? (
                <ul className="timeline">
                  {data.timeline.map((day, i) => {
                    const cfDay = cfDetailMap.get(day.date);
                    return (
                    <li key={day.date} className="timeline__item fade-up" style={{ animationDelay: `${280 + i * 50}ms` }}>
                      <div className="timeline__rail">
                        <span className="timeline__dot" />
                        {i < data.timeline.length - 1 && <span className="timeline__line" />}
                      </div>
                      <div className="timeline__content">
                        <div className="timeline__meta">
                          <span className="label-md">{formatDate(day.date)}</span>
                          <span className="timeline__total">{day.totalCount} total</span>
                        </div>
                        <div className="timeline__entries">
                          {day.githubCount > 0 && (
                            <div className="timeline__entry">
                              <span className="stat-card__icon stat-card__icon--secondary timeline__icon">
                                <GitHubIcon width={14} height={14} />
                              </span>
                              <span className="body-md">
                                {day.githubCount} GitHub contribution{day.githubCount > 1 ? "s" : ""}
                              </span>
                            </div>
                          )}
                          {day.leetcodeCount > 0 && (
                            <div className="timeline__entry">
                              <span className="stat-card__icon stat-card__icon--tertiary timeline__icon">
                                <LeetCodeIcon width={14} height={14} />
                              </span>
                              <span className="body-md">
                                {day.leetcodeCount} LeetCode submission{day.leetcodeCount > 1 ? "s" : ""}
                              </span>
                            </div>
                          )}
                          {(day.tryhackmeCount || 0) > 0 && (
                            <div className="timeline__entry">
                              <span className="stat-card__icon stat-card__icon--danger timeline__icon">
                                <ShieldIcon width={14} height={14} />
                              </span>
                              <span className="body-md">
                                {day.tryhackmeCount} TryHackMe event{day.tryhackmeCount > 1 ? "s" : ""}
                              </span>
                            </div>
                          )}
                          {(day.codeforcesCount || 0) > 0 && (
                            <div className="timeline__entry">
                              <span className="stat-card__icon stat-card__icon--primary timeline__icon">
                                <CodeforcesIcon width={14} height={14} />
                              </span>
                              <span className="body-md">
                                {day.codeforcesCount} Codeforces submission{day.codeforcesCount > 1 ? "s" : ""}
                                {cfDay && (
                                  <span style={{ opacity: 0.8, marginLeft: 6, fontSize: "0.85em" }}>
                                    ({cfDay.accepted} accepted, {cfDay.uniqueSolved} solved)
                                  </span>
                                )}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    </li>
                  )})}
                </ul>
              ) : (
                <p className="body-md">No recent activity found for this filter.</p>
              )}
            </div>

            <div className="activity-page__insights">
              <h2 className="title-lg activity-page__section-title">
                <SparklesIcon /> Insights
              </h2>

              <InsightCard icon={<TrendIcon />} accent="secondary" title="Weekly velocity" delay={240}>
                {data?.velocityChange === null && "Keep going to start tracking week-over-week trends."}
                {data?.velocityChange !== null && data?.velocityChange >= 0 && (
                  <>Your activity is up{" "}
                    <strong className="insight-card__highlight insight-card__highlight--secondary">
                      {data.velocityChange}%
                    </strong>{" "}compared to last week.</>
                )}
                {data?.velocityChange < 0 && (
                  <>Activity is down{" "}
                    <strong className="insight-card__highlight insight-card__highlight--tertiary">
                      {Math.abs(data.velocityChange)}%
                    </strong>{" "}from last week — a good day to get back on track.</>
                )}
              </InsightCard>

              <InsightCard icon={<ClockIcon />} accent="primary" title="Peak productivity" delay={300}>
                You're most active on{" "}
                <strong className="insight-card__highlight insight-card__highlight--primary">
                  {data?.peakDay ?? "—"}
                </strong>. Plan your hardest tasks for that day.
              </InsightCard>

              {hasLC && (
                <InsightCard icon={<ZapIcon />} accent="tertiary" title="LeetCode activity" delay={360}>
                  You made{" "}
                  <strong className="insight-card__highlight insight-card__highlight--tertiary">
                    {data?.leetcodeLast30 ?? 0} submission attempts
                  </strong>{" "}
                  in the last 30 days (includes failed submits — accepted count is on your LeetCode profile).
                </InsightCard>
              )}

              {hasCF && (
                <InsightCard icon={<CodeforcesIcon />} accent="primary" title="Codeforces submissions" delay={390}>
                  You logged{" "}
                  <strong className="insight-card__highlight insight-card__highlight--primary">
                    {data?.codeforcesLast30 ?? 0} Codeforces submissions
                  </strong>{" "}
                  over the last 30 days.
                </InsightCard>
              )}

              <InsightCard icon={<GitHubIcon />} accent="secondary" title="Shipping pace" delay={420}>
                <strong className="insight-card__highlight insight-card__highlight--secondary">
                  {data?.githubLast30 ?? 0} GitHub contributions
                </strong>{" "}logged over the last 30 days.
              </InsightCard>

              {hasTHM && (
                <InsightCard icon={<ShieldIcon />} accent="danger" title="TryHackMe activity" delay={480}>
                  You completed{" "}
                  <strong className="insight-card__highlight insight-card__highlight--danger">
                    {data?.tryhackmeLast30 ?? 0} events
                  </strong>{" "}
                  on TryHackMe in the last 30 days — machines started, questions answered, and more.
                </InsightCard>
              )}
            </div>
          </div>

          <div className="card activity-page__breakdown fade-up" style={{ animationDelay: "480ms" }}>
            <h2 className="title-lg activity-page__section-title">Activity breakdown (last 30 days)</h2>

            <div className={`breakdown ${hasTHM || hasCF ? 'breakdown--with-thm' : ''}`}>
              <BreakdownBar label="GitHub activity" pct={data?.githubPct ?? 0} color="secondary" delay={520} />
              {hasLC && (
                <BreakdownBar label="LeetCode activity" pct={data?.leetcodePct ?? 0} color="tertiary" delay={580} />
              )}
              {hasTHM && (
                <BreakdownBar label="TryHackMe activity" pct={data?.tryhackmePct ?? 0} color="danger" delay={610} />
              )}
              {hasCF && (
                <BreakdownBar label="Codeforces activity" pct={data?.codeforcesPct ?? 0} color="primary" delay={630} />
              )}
              <BreakdownBar
                label="Active days"
                pct={data?.activeDaysPct ?? 0}
                sublabel={`${data?.activeDays30 ?? 0} out of 30 days`}
                color="primary"
                delay={640}
              />
              <div className="breakdown__avg">
                <span className="label-md">Daily average</span>
                <p className="display breakdown__avg-value">{data?.dailyAvg ?? "0"}</p>
                <span className="body-md">contributions / day</span>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

const InsightCard = ({ icon, accent, title, children, delay }) => (
  <div className="card insight-card fade-up" style={{ animationDelay: `${delay}ms` }}>
    <div className={`stat-card__icon stat-card__icon--${accent}`}>{icon}</div>
    <div>
      <h3 className="title-lg insight-card__title">{title}</h3>
      <p className="body-md">{children}</p>
    </div>
  </div>
);

const BreakdownBar = ({ label, pct, sublabel, color, delay }) => (
  <div className="breakdown__row fade-up" style={{ animationDelay: `${delay}ms` }}>
    <div className="breakdown__row-header">
      <span className="body-md">{label}</span>
      <span className="title-lg">{pct}%</span>
    </div>
    <div className="breakdown__track">
      <div
        className={`breakdown__fill breakdown__fill--${color}`}
        style={{ width: `${pct}%`, animationDelay: `${delay + 100}ms` }}
      />
    </div>
    {sublabel && <span className="label-md breakdown__sublabel">{sublabel}</span>}
  </div>
);

export default Activity;