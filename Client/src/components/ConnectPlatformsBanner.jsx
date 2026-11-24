import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import "./ConnectPlatformsBanner.css";

/**
 * ConnectPlatformsBanner
 *
 * Shown on the Dashboard when the user hasn't connected any
 * secondary platforms (LeetCode or TryHackMe).
 *
 * Replaces the old forced /setup redirect — users can now connect
 * platforms at their own pace from Settings.
 */
const ConnectPlatformsBanner = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const hasLeetCode   = !!user?.leetcodeUsername;
  const hasTryHackMe  = !!user?.tryhackmeUsername;
  const hasCodeforces = !!user?.codeforcesHandle;

  // if all secondary connected, don't show anything
  if (hasLeetCode && hasTryHackMe && hasCodeforces) return null;

  return (
    <div className="connect-banner card fade-up">
      <div className="connect-banner__left">
        <p className="title-lg connect-banner__title">
          {!hasLeetCode && !hasTryHackMe && !hasCodeforces
            ? "Connect your coding platforms"
            : "Add more platforms"}
        </p>
        <p className="body-md">
          {!hasLeetCode && !hasTryHackMe && !hasCodeforces
            ? "Your GitHub heatmap is live. Connect LeetCode, TryHackMe, or Codeforces to unify all your coding activity into one streak."
            : "Connect more platforms to track your problem-solving, competitive programming, and learning alongside GitHub."}
        </p>

        <div className="connect-banner__platforms">
          {!hasLeetCode && (
            <PlatformChip
              color="tertiary"
              label="LeetCode"
              icon="⟨/⟩"
              description="Problem solving"
            />
          )}
          {!hasTryHackMe && (
            <PlatformChip
              color="danger"
              label="TryHackMe"
              icon="⬡"
              description="Cybersecurity"
            />
          )}
          {!hasCodeforces && (
            <PlatformChip
              color="primary"
              label="Codeforces"
              icon="📊"
              description="Contests & rating"
            />
          )}
        </div>
      </div>

      <button
        className="btn btn--primary connect-banner__btn"
        onClick={() => navigate("/settings")}
      >
        Connect platforms →
      </button>
    </div>
  );
};

const PlatformChip = ({ color, label, icon, description }) => (
  <div className={`platform-chip platform-chip--${color}`}>
    <span className="platform-chip__icon">{icon}</span>
    <div>
      <p className="platform-chip__label">{label}</p>
      <p className="platform-chip__desc">{description}</p>
    </div>
  </div>
);

export default ConnectPlatformsBanner;