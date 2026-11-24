import { getCfRankColor } from "../utils/codeforcesHelpers";
import { CodeforcesIcon } from "./CodeforcesIcon";
import "./CodeforcesProfileCard.css";

/**
 * Compact Codeforces profile card — fits the existing Settings and Dashboard patterns.
 * Shows avatar, handle (clickable), rank, rating, max rating, contribution.
 */
const CodeforcesProfileCard = ({ profile, stats, lastSyncedAt, onSync, syncing }) => {
  if (!profile && !stats) return null;

  const handle = profile?.handle || stats?.handle;
  const rating = profile?.rating ?? stats?.rating ?? null;
  const maxRating = profile?.maxRating ?? stats?.maxRating ?? null;
  const rank = profile?.rank ?? stats?.rank ?? null;
  const maxRank = profile?.maxRank ?? stats?.maxRank ?? null;
  const contribution = profile?.contribution ?? null;
  const avatar = profile?.avatar ?? null;

  const rankColor = getCfRankColor(rank);

  const formatSynced = (dateStr) => {
    if (!dateStr) return "Never";
    const diffMs = Date.now() - new Date(dateStr).getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHrs = Math.floor(diffMins / 60);
    if (diffHrs < 24) return `${diffHrs}h ago`;
    return `${Math.floor(diffHrs / 24)}d ago`;
  };

  return (
    <div className="cf-profile-card">
      <div className="cf-profile-card__top">
        <div className="cf-profile-card__avatar-wrap">
          {avatar ? (
            <img src={avatar} alt={handle} className="cf-profile-card__avatar" />
          ) : (
            <div className="cf-profile-card__avatar-placeholder">
              <CodeforcesIcon width={28} height={28} />
            </div>
          )}
        </div>
        <div className="cf-profile-card__info">
          <a
            href={`https://codeforces.com/profile/${handle}`}
            target="_blank"
            rel="noopener noreferrer"
            className="cf-profile-card__handle"
          >
            {handle}
          </a>
          {rank && (
            <span
              className="cf-profile-card__rank label-md"
              style={{ color: rankColor }}
            >
              {rank}
            </span>
          )}
        </div>
      </div>

      <div className="cf-profile-card__stats">
        <StatItem label="Rating" value={rating ?? "—"} highlight />
        <StatItem label="Max Rating" value={maxRating ?? "—"} />
        <StatItem label="Max Rank" value={maxRank ?? "—"} />
        {contribution !== null && <StatItem label="Contribution" value={contribution >= 0 ? `+${contribution}` : contribution} />}
      </div>

      <div className="cf-profile-card__footer">
        <span className="label-md">
          Synced {formatSynced(lastSyncedAt)}
        </span>
        {onSync && (
          <button
            className="btn btn--ghost cf-profile-card__sync-btn"
            onClick={onSync}
            disabled={syncing}
            type="button"
          >
            {syncing ? "Syncing…" : "Sync now"}
          </button>
        )}
      </div>
    </div>
  );
};

const StatItem = ({ label, value, highlight }) => (
  <div className="cf-profile-stat">
    <span className="label-md">{label}</span>
    <span className={highlight ? "title-lg cf-profile-stat__highlight" : "title-lg"}>
      {value}
    </span>
  </div>
);

export default CodeforcesProfileCard;
