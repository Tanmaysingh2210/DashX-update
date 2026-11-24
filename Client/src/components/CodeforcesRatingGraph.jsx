import { useState, useEffect, useRef } from "react";
import { CodeforcesIcon } from "./CodeforcesIcon";
import { getCfRankColor, formatRatingChange } from "../utils/codeforcesHelpers";
import "./CodeforcesRatingGraph.css";

/**
 * A pure-CSS/SVG rating progression graph for Codeforces.
 * Uses the ratingHistory array from /api/codeforces/rating-history.
 * No external charting library required.
 */
const CodeforcesRatingGraph = ({ ratingHistory, handle }) => {
  const svgRef = useRef(null);
  const [tooltip, setTooltip] = useState(null);
  const [dimensions, setDimensions] = useState({ width: 600, height: 240 });

  useEffect(() => {
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setDimensions({
          width: entry.contentRect.width || 600,
          height: 240,
        });
      }
    });
    if (svgRef.current) observer.observe(svgRef.current.parentElement);
    return () => observer.disconnect();
  }, []);

  if (!ratingHistory || ratingHistory.length === 0) {
    return (
      <div className="cf-graph cf-graph--empty">
        <CodeforcesIcon width={32} height={32} style={{ opacity: 0.3 }} />
        <p className="body-md">No contest rating history yet.</p>
      </div>
    );
  }

  const { width, height } = dimensions;
  const PADDING = { top: 20, right: 24, bottom: 40, left: 48 };
  const plotW = width - PADDING.left - PADDING.right;
  const plotH = height - PADDING.top - PADDING.bottom;

  // Min/max rating with some headroom
  const ratings = ratingHistory.map((e) => e.newRating);
  const minRating = Math.max(0, Math.min(...ratings) - 100);
  const maxRating = Math.max(...ratings) + 100;
  const ratingRange = maxRating - minRating || 1;

  const minTime = ratingHistory[0].ratingUpdateTimeSeconds;
  const maxTime = ratingHistory[ratingHistory.length - 1].ratingUpdateTimeSeconds;
  const timeRange = maxTime - minTime || 1;

  const toX = (t) => PADDING.left + ((t - minTime) / timeRange) * plotW;
  const toY = (r) => PADDING.top + plotH - ((r - minRating) / ratingRange) * plotH;

  // Build SVG path
  const points = ratingHistory.map((e) => ({
    x: toX(e.ratingUpdateTimeSeconds),
    y: toY(e.newRating),
    entry: e,
  }));

  const pathD = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(" ");

  // Fill area under the line
  const fillD =
    pathD +
    ` L ${points[points.length - 1].x.toFixed(1)} ${(PADDING.top + plotH).toFixed(1)} L ${PADDING.left.toFixed(1)} ${(PADDING.top + plotH).toFixed(1)} Z`;

  // Y-axis ticks (4 evenly spaced)
  const yTicks = Array.from({ length: 5 }, (_, i) => {
    const r = Math.round(minRating + (ratingRange * i) / 4);
    return { r, y: toY(r) };
  });

  const handleMouseMove = (e) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const mx = e.clientX - rect.left;

    // Find closest point
    let closest = null;
    let minDist = Infinity;
    for (const p of points) {
      const dist = Math.abs(p.x - mx);
      if (dist < minDist) {
        minDist = dist;
        closest = p;
      }
    }

    if (closest && minDist < 40) {
      const formatted = formatRatingChange(closest.entry);
      setTooltip({ ...formatted, x: closest.x, y: closest.y });
    } else {
      setTooltip(null);
    }
  };

  return (
    <div className="cf-graph">
      <div className="cf-graph__header">
        <div className="cf-graph__title-row">
          <CodeforcesIcon width={16} height={16} />
          <span className="label-md">Rating progression</span>
          {handle && (
            <a
              href={`https://codeforces.com/profile/${handle}`}
              target="_blank"
              rel="noopener noreferrer"
              className="cf-graph__handle-link"
            >
              @{handle}
            </a>
          )}
        </div>
        <div className="cf-graph__legend">
          <span className="label-md">{ratingHistory.length} contests</span>
          <span className="label-md">
            Peak: <strong>{Math.max(...ratings)}</strong>
          </span>
          <span className="label-md">
            Current: <strong>{ratings[ratings.length - 1]}</strong>
          </span>
        </div>
      </div>

      <div className="cf-graph__svg-wrap" ref={svgRef}>
        <svg
          width="100%"
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="none"
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setTooltip(null)}
          style={{ display: "block" }}
        >
          <defs>
            <linearGradient id="cf-fill-gradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#c084fc" stopOpacity="0.3" />
              <stop offset="100%" stopColor="#c084fc" stopOpacity="0.02" />
            </linearGradient>
          </defs>

          {/* Y-axis grid lines + labels */}
          {yTicks.map(({ r, y }) => (
            <g key={r}>
              <line
                x1={PADDING.left}
                y1={y}
                x2={PADDING.left + plotW}
                y2={y}
                stroke="rgba(192,132,252,0.08)"
                strokeWidth="1"
              />
              <text
                x={PADDING.left - 6}
                y={y}
                textAnchor="end"
                dominantBaseline="middle"
                fontSize="10"
                fill="var(--color-outline)"
              >
                {r}
              </text>
            </g>
          ))}

          {/* Fill area */}
          <path d={fillD} fill="url(#cf-fill-gradient)" />

          {/* Rating line */}
          <path
            d={pathD}
            fill="none"
            stroke="var(--color-primary)"
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
          />

          {/* Data points */}
          {points.map((p, i) => (
            <circle
              key={i}
              cx={p.x}
              cy={p.y}
              r={tooltip?.contest === p.entry.contestName ? 5 : 3}
              fill={tooltip?.contest === p.entry.contestName ? "var(--color-primary)" : "var(--color-surface-low)"}
              stroke="var(--color-primary)"
              strokeWidth="1.5"
              style={{ cursor: "pointer", transition: "r 0.1s" }}
            />
          ))}

          {/* Hover vertical line */}
          {tooltip && (
            <line
              x1={tooltip.x}
              y1={PADDING.top}
              x2={tooltip.x}
              y2={PADDING.top + plotH}
              stroke="var(--color-primary)"
              strokeWidth="1"
              strokeDasharray="4,3"
              opacity="0.5"
            />
          )}
        </svg>

        {/* Tooltip */}
        {tooltip && (
          <div
            className="cf-graph__tooltip"
            style={{
              left: `${Math.min(tooltip.x + 12, dimensions.width - 180)}px`,
              top: `${Math.max(tooltip.y - 60, 4)}px`,
            }}
          >
            <p className="cf-graph__tooltip-contest">{tooltip.contest}</p>
            <p className="label-md">{tooltip.date}</p>
            <div className="cf-graph__tooltip-row">
              <span className="body-md">Rank</span>
              <span className="title-lg">#{tooltip.rank}</span>
            </div>
            <div className="cf-graph__tooltip-row">
              <span className="body-md">Rating</span>
              <span className="title-lg">
                {tooltip.newRating}
                <span
                  className="cf-graph__tooltip-change"
                  style={{ color: tooltip.change >= 0 ? "var(--color-secondary)" : "var(--color-danger)" }}
                >
                  {" "}({tooltip.changeSign}{tooltip.change})
                </span>
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CodeforcesRatingGraph;
