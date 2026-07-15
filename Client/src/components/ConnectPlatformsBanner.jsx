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

  // if both connected, don't show anything
  if (hasLeetCode && hasTryHackMe) return null;

  return (
    <div className="connect-banner card fade-up">
      <div className="connect-banner__left">
        <p className="title-lg connect-banner__title">
          {!hasLeetCode && !hasTryHackMe
            ? "Connect your coding platforms"
            : "Add more platforms"}
        </p>
        <p className="body-md">
          {!hasLeetCode && !hasTryHackMe
            ? "Your GitHub heatmap is live. Connect LeetCode or TryHackMe to unify all your coding activity into one streak."
            : !hasLeetCode
            ? "Connect LeetCode to track your problem-solving alongside GitHub and TryHackMe."
            : "Connect TryHackMe to track cybersecurity learning alongside your GitHub and LeetCode activity."}
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