import "./StatCard.css";

/**
 * StatCard
 *
 * @param {string} label     - small uppercase label e.g. "Combined Current Streak"
 * @param {string|number} value - the big headline number
 * @param {string} unit      - small text after the value e.g. "days"
 * @param {string} sub       - secondary text below e.g. "+12%" or "32 Repos · 85 PRs"
 * @param {"success"|"warning"|"primary"|"default"} subTone - color of sub text
 * @param {ReactNode} icon   - icon element shown top-right
 * @param {string} accent    - "primary" | "secondary" | "tertiary" — tints the icon chip
 * @param {number} delay     - ms animation delay for stagger
 */
const StatCard = ({ label, value, unit, sub, subTone = "default", icon, accent = "primary", delay = 0 }) => {
  return (
    <div className="stat-card card card--interactive fade-up" style={{ animationDelay: `${delay}ms` }}>
      <div className="stat-card__top">
        <span className="label-md">{label}</span>
        {icon && <div className={`stat-card__icon stat-card__icon--${accent}`}>{icon}</div>}
      </div>

      <div className="stat-card__value">
        <span className="display stat-card__number">{value}</span>
        {unit && <span className="stat-card__unit">{unit}</span>}
      </div>

      {sub && <div className={`stat-card__sub stat-card__sub--${subTone}`}>{sub}</div>}
    </div>
  );
};

export default StatCard;