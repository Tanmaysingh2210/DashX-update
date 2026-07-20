import { useMemo, useState } from "react";
import "./Heatmap.css";

const MONTH_LABELS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const DAY_LABELS   = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

/**
 * Determines cell color type based on which platforms had activity.
 *
 * Priority (when multiple platforms active on same day):
 *   github + leetcode + tryhackme → "all"      (white/bright)
 *   github + leetcode             → "both"      (purple)
 *   github + tryhackme            → "gh-thm"   (teal)
 *   leetcode + tryhackme          → "lc-thm"   (pink)
 *   github only                   → "github"   (green)
 *   leetcode only                 → "leetcode" (orange)
 *   tryhackme only                → "tryhackme"(cyan/red)
 *   none                          → "empty"
 */
const getCellType = (day) => {
  const g = day.githubCount    > 0;
  const l = day.leetcodeCount  > 0;
  const t = (day.tryhackmeCount || 0) > 0;

  if (!g && !l && !t) return "empty";
  if (g && l && t)    return "all";
  if (g && l)         return "both";
  if (g && t)         return "gh-thm";
  if (l && t)         return "lc-thm";
  if (g)              return "github";
  if (l)              return "leetcode";
  return "tryhackme";
};

const getLevel = (count, max) => {
  if (count === 0 || max === 0) return 0;
  if (max <= 4) return Math.min(count, 4);
  const r = count / max;
  if (r > 0.75) return 4;
  if (r > 0.5)  return 3;
  if (r > 0.25) return 2;
  return 1;
};

const buildWeeks = (days) => {
  const map = new Map(days.map((d) => [d.date, d]));
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const start = new Date(today);
  start.setDate(start.getDate() - 52 * 7);
  start.setDate(start.getDate() - start.getDay());

  const weeks = [];
  let current = new Date(start);

  while (current <= today) {
    const week = [];
    for (let i = 0; i < 7; i++) {
      const dateStr = current.toISOString().split("T")[0];
      const entry   = map.get(dateStr);
      week.push({
        date:           dateStr,
        githubCount:    entry?.githubCount    || 0,
        leetcodeCount:  entry?.leetcodeCount  || 0,
        tryhackmeCount: entry?.tryhackmeCount || 0,
        totalCount:     entry?.totalCount     || 0,
        month:          current.getMonth(),
        isFuture:       current > today,
      });
      current.setDate(current.getDate() + 1);
    }
    weeks.push(week);
  }
  return weeks;
};

const Heatmap = ({ days = [] }) => {
  const [hovered, setHovered] = useState(null);
  const weeks = useMemo(() => buildWeeks(days), [days]);

  const maxGithub    = useMemo(() => days.reduce((m, d) => Math.max(m, d.githubCount),             1), [days]);
  const maxLeetcode  = useMemo(() => days.reduce((m, d) => Math.max(m, d.leetcodeCount),           1), [days]);
  const maxTryhackme = useMemo(() => days.reduce((m, d) => Math.max(m, d.tryhackmeCount || 0),     1), [days]);
  const maxTotal     = useMemo(() => days.reduce((m, d) => Math.max(m, d.totalCount),              1), [days]);

  const monthMarkers = useMemo(() => {
    const markers = [];
    let lastMonth = -1;
    weeks.forEach((week, i) => {
      if (week[0].month !== lastMonth) {
        markers.push({ weekIndex: i, label: MONTH_LABELS[week[0].month] });
        lastMonth = week[0].month;
      }
    });
    return markers;
  }, [weeks]);

  const getCellClass = (day) => {
    const type = getCellType(day);
    if (type === "empty") return "heatmap__cell heatmap__cell--empty";

    let level;
    switch (type) {
      case "github":   level = getLevel(day.githubCount,            maxGithub);    break;
      case "leetcode": level = getLevel(day.leetcodeCount,          maxLeetcode);  break;
      case "tryhackme":level = getLevel(day.tryhackmeCount || 0,   maxTryhackme); break;
      default:         level = getLevel(day.totalCount,             maxTotal);     break;
    }

    return `heatmap__cell heatmap__cell--${type}-${level}`;
  };

  return (
    <div className="heatmap">
      <div className="heatmap__scroll">
        <div className="heatmap__months">
          {weeks.map((_, i) => {
            const marker = monthMarkers.find((m) => m.weekIndex === i);
            return <div key={i} className="heatmap__month-cell">{marker?.label || ""}</div>;
          })}
        </div>

        <div className="heatmap__body">
          <div className="heatmap__days">
            {DAY_LABELS.map((label, i) => (
              <div key={label} className="heatmap__day-label">{i % 2 === 1 ? label : ""}</div>
            ))}
          </div>

          <div className="heatmap__grid">
            {weeks.map((week, wi) => (
              <div
                key={wi}
                className="heatmap__week"
                style={{ animationDelay: `${Math.min(wi * 6, 300)}ms` }}
              >
                {week.map((day) => (
                  <div
                    key={day.date}
                    className={`${getCellClass(day)} ${day.isFuture ? "heatmap__cell--future" : ""}`}
                    style={{ animationDelay: `${Math.min(wi * 6, 300)}ms` }}
                    onMouseEnter={() => setHovered(day)}
                    onMouseLeave={() => setHovered(null)}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="heatmap__footer">
        <div className="heatmap__tooltip" aria-live="polite">
          {hovered && hovered.totalCount > 0 ? (
            <>
              <span className="heatmap__tooltip-date">
                {new Date(hovered.date).toLocaleDateString(undefined, {
                  month: "short", day: "numeric", year: "numeric", timeZone: "UTC"
                })}
              </span>
              {hovered.githubCount > 0 && (
                <span className="heatmap__tooltip-detail">
                  <span className="dot dot--github" /> {hovered.githubCount} commit{hovered.githubCount > 1 ? "s" : ""}
                </span>
              )}
              {hovered.leetcodeCount > 0 && (
                <span className="heatmap__tooltip-detail">
                  <span className="dot dot--leetcode" /> {hovered.leetcodeCount} solved
                </span>
              )}
              {(hovered.tryhackmeCount || 0) > 0 && (
                <span className="heatmap__tooltip-detail">
                  <span className="dot dot--tryhackme" /> {hovered.tryhackmeCount} event{hovered.tryhackmeCount > 1 ? "s" : ""}
                </span>
              )}
            </>
          ) : (
            <span className="heatmap__tooltip-hint">Hover a day to see details</span>
          )}
        </div>

        <div className="heatmap__legend">
          <span className="heatmap__legend-group">
            <span className="dot dot--github" /> GitHub
            <span className="heatmap__legend-swatches">
              {[1,2,3,4].map((l) => <span key={l} className={`heatmap__legend-swatch heatmap__cell--github-${l}`} />)}
            </span>
          </span>
          <span className="heatmap__legend-group">
            <span className="dot dot--leetcode" /> LeetCode
            <span className="heatmap__legend-swatches">
              {[1,2,3,4].map((l) => <span key={l} className={`heatmap__legend-swatch heatmap__cell--leetcode-${l}`} />)}
            </span>
          </span>
          <span className="heatmap__legend-group">
            <span className="dot dot--tryhackme" /> TryHackMe
            <span className="heatmap__legend-swatches">
              {[1,2,3,4].map((l) => <span key={l} className={`heatmap__legend-swatch heatmap__cell--tryhackme-${l}`} />)}
            </span>
          </span>
          <span className="heatmap__legend-group">
            <span className="dot dot--combined" /> Combined
            <span className="heatmap__legend-swatches">
              {[1,2,3,4].map((l) => <span key={l} className={`heatmap__legend-swatch heatmap__cell--both-${l}`} />)}
            </span>
          </span>
        </div>
      </div>
    </div>
  );
};

export default Heatmap;