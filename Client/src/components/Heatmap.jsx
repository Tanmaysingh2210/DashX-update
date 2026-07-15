import { useMemo, useState } from "react";
import "./Heatmap.css";

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * Determines the cell's color type based on what kind of activity happened.
 *
 *   github-only   → green  (githubCount > 0, leetcodeCount === 0)
 *   leetcode-only → orange (leetcodeCount > 0, githubCount === 0)
 *   both          → blue   (both > 0)
 *   none          → empty  (totalCount === 0)
 *
 * @returns {"empty"|"github"|"leetcode"|"both"}
 */
const getCellType = (day) => {
  if (day.totalCount === 0) return "empty";
  if (day.githubCount > 0 && day.leetcodeCount > 0) return "both";
  if (day.githubCount > 0) return "github";
  return "leetcode";
};

/**
 * Returns intensity level 1-4 based on count vs the max for that type.
 * Level 0 is always "empty" — handled separately.
 */
const getLevel = (count, max) => {
  if (count === 0 || max === 0) return 0;
  if (max <= 4) return Math.min(count, 4);
  const ratio = count / max;
  if (ratio > 0.75) return 4;
  if (ratio > 0.5)  return 3;
  if (ratio > 0.25) return 2;
  return 1;
};

/**
 * Builds a 53-week × 7-day grid ending today.
 * Days not in the `days` array are treated as zero.
 */
const buildWeeks = (days) => {
  const map = new Map(days.map((d) => [d.date, d]));

  // get today as a local YYYY-MM-DD string (matches what APIs/DB store)
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  // parse todayStr back to a UTC Date for arithmetic
  const [ty, tm, td] = todayStr.split("-").map(Number);
  const todayUTC = new Date(Date.UTC(ty, tm - 1, td));

  // go back 52 weeks and align to Sunday
  const start = new Date(todayUTC);
  start.setUTCDate(start.getUTCDate() - 52 * 7);
  start.setUTCDate(start.getUTCDate() - start.getUTCDay()); // back up to Sunday

  const weeks = [];
  let current = new Date(start);

  while (current <= todayUTC) {
    const week = [];
    for (let i = 0; i < 7; i++) {
      const dateStr = current.toISOString().split("T")[0];
      const entry = map.get(dateStr);
      week.push({
        date: dateStr,
        githubCount:   entry?.githubCount   || 0,
        leetcodeCount: entry?.leetcodeCount || 0,
        totalCount:    entry?.totalCount    || 0,
        month:    current.getUTCMonth(),
        isFuture: current > todayUTC,
      });
      current.setUTCDate(current.getUTCDate() + 1);
    }
    weeks.push(week);
  }

  return weeks;
};


const Heatmap = ({ days = [] }) => {
  const [hovered, setHovered] = useState(null);

  const weeks = useMemo(() => buildWeeks(days), [days]);

  // separate maxes per type so intensity scales correctly within each color
  const maxGithub   = useMemo(() => days.reduce((m, d) => Math.max(m, d.githubCount),   1), [days]);
  const maxLeetcode = useMemo(() => days.reduce((m, d) => Math.max(m, d.leetcodeCount), 1), [days]);
  const maxTotal    = useMemo(() => days.reduce((m, d) => Math.max(m, d.totalCount),    1), [days]);

  const monthMarkers = useMemo(() => {
    const markers = [];
    let lastMonth = -1;
    weeks.forEach((week, i) => {
      const firstDay = week[0];
      if (firstDay.month !== lastMonth) {
        // Skip label for the very first month — it's always a partial
        // fragment from the prior year (e.g. a few days of Jun 2025 when
        // today is Jun 2026) and its label collides with the next month.
        const isFirst = markers.length === 0;
        markers.push({
          weekIndex: i,
          label: isFirst ? "" : MONTH_LABELS[firstDay.month],
        });
        lastMonth = firstDay.month;
      }
    });
    return markers;
  }, [weeks]);

  /**
   * Returns the CSS class string for a cell.
   *
   *   empty                → heatmap__cell--empty
   *   github-only lvl 1-4  → heatmap__cell--github-1 … --github-4
   *   leetcode-only lvl 1-4→ heatmap__cell--leetcode-1 … --leetcode-4
   *   both lvl 1-4         → heatmap__cell--both-1 … --both-4
   */
  const getCellClass = (day) => {
    const type = getCellType(day);
    if (type === "empty") return "heatmap__cell heatmap__cell--empty";

    let level;
    if (type === "github")   level = getLevel(day.githubCount,   maxGithub);
    if (type === "leetcode") level = getLevel(day.leetcodeCount, maxLeetcode);
    if (type === "both")     level = getLevel(day.totalCount,    maxTotal);

    return `heatmap__cell heatmap__cell--${type}-${level}`;
  };

  return (
    <div className="heatmap">
      <div className="heatmap__scroll">
        <div className="heatmap__months">
          {weeks.map((_, i) => {
            const marker = monthMarkers.find((m) => m.weekIndex === i);
            return (
              <div key={i} className="heatmap__month-cell">
                {marker?.label || ""}
              </div>
            );
          })}
        </div>

        <div className="heatmap__body">
          <div className="heatmap__days">
            {DAY_LABELS.map((label, i) => (
              <div key={label} className="heatmap__day-label">
                {i % 2 === 1 ? label : ""}
              </div>
            ))}
          </div>

          <div className="heatmap__grid">
            {weeks.map((week, wi) => (
              <div
                className="heatmap__week"
                key={wi}
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
                  month: "short", day: "numeric", year: "numeric",
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
            </>
          ) : (
            <span className="heatmap__tooltip-hint">Hover a day to see details</span>
          )}
        </div>

        {/* three-section legend matching actual colors */}
        <div className="heatmap__legend">
          <span className="heatmap__legend-group">
            <span className="dot dot--github" /> GitHub
            <span className="heatmap__legend-swatches">
              {[1, 2, 3, 4].map((lvl) => (
                <span key={lvl} className={`heatmap__legend-swatch heatmap__cell--github-${lvl}`} />
              ))}
            </span>
          </span>
          <span className="heatmap__legend-group">
            <span className="dot dot--leetcode" /> LeetCode
            <span className="heatmap__legend-swatches">
              {[1, 2, 3, 4].map((lvl) => (
                <span key={lvl} className={`heatmap__legend-swatch heatmap__cell--leetcode-${lvl}`} />
              ))}
            </span>
          </span>
          <span className="heatmap__legend-group">
            <span className="dot dot--combined" /> Both
            <span className="heatmap__legend-swatches">
              {[1, 2, 3, 4].map((lvl) => (
                <span key={lvl} className={`heatmap__legend-swatch heatmap__cell--both-${lvl}`} />
              ))}
            </span>
          </span>
        </div>
      </div>
    </div>
  );
};

export default Heatmap;