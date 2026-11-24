import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import api from "../api/axios";
import { GitHubIcon, LeetCodeIcon, ArrowRightIcon } from "../components/Icons";
import { CodeforcesIcon } from "../components/CodeforcesIcon";
import "./Setup.css";
import { trackEvent } from "../utils/analyticsHelper";

const Setup = () => {
  const { user, refreshUser } = useAuth();
  const navigate = useNavigate();

  const [username, setUsername] = useState("");
  const [cfHandle, setCfHandle] = useState("");
  const [cfVerifying, setCfVerifying] = useState(false);
  const [cfError, setCfError] = useState(null);
  const [cfProfile, setCfProfile] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const handleVerifyCodeforces = async (e) => {
    e?.preventDefault();
    const cleaned = cfHandle.trim();
    if (!cleaned) return;

    setCfVerifying(true);
    setCfError(null);
    try {
      await api.patch("/auth/connect/codeforces", { codeforcesHandle: cleaned });
      setCfProfile({ handle: cleaned });
      const profRes = await api.get("/api/codeforces/profile").catch(() => null);
      if (profRes?.data?.profile) {
        setCfProfile(profRes.data.profile);
      }
      trackEvent("codeforces_connected", { source: "setup" });
    } catch (err) {
      setCfError(err.response?.data?.message || "Invalid Codeforces handle");
      setCfProfile(null);
    } finally {
      setCfVerifying(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const cleanedLc = username.trim();
    const cleanedCf = cfHandle.trim();

    if (!cleanedLc && !cleanedCf && !cfProfile) {
      setError("Please add at least your LeetCode username or Codeforces handle");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      if (cleanedLc) {
        await api.patch("/auth/setup-leetcode", { leetcodeUsername: cleanedLc });
        trackEvent("leetcode_connected", { source: "setup" });
      }

      if (cleanedCf && !cfProfile) {
        await api.patch("/auth/connect/codeforces", { codeforcesHandle: cleanedCf });
        trackEvent("codeforces_connected", { source: "setup" });
      }

      await refreshUser();
      navigate("/dashboard");
    } catch (err) {
      setError(err.response?.data?.message || "Couldn't save your profile details");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="page setup-page">
      <div className="card setup-card fade-up">
        <div className="setup-card__connected">
          <div className="setup-card__avatar">
            {user?.avatar ? <img src={user.avatar} alt={user.githubUsername} /> : <GitHubIcon />}
          </div>
          <div>
            <p className="title-lg">@{user?.githubUsername}</p>
            <p className="label-md">
              <span className="dot dot--github" style={{ marginRight: 6, verticalAlign: "-1px" }} />
              GitHub connected
            </p>
          </div>
        </div>

        <h1 className="headline-md setup-card__title">One more step</h1>
        <p className="body-md">
          Connect your coding platforms so DashX can pull your activity and build your unified streak.
        </p>

        <form onSubmit={handleSubmit} className="setup-card__form">
          <div className="field">
            <label htmlFor="leetcode">
              <LeetCodeIcon width={16} height={16} /> LeetCode username
            </label>
            <input
              id="leetcode"
              type="text"
              placeholder="e.g. tanmay123"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoFocus
            />
          </div>

          <div className="field">
            <label htmlFor="codeforces">
              <CodeforcesIcon width={16} height={16} /> Codeforces handle (optional)
            </label>
            <div style={{ display: "flex", gap: "8px" }}>
              <input
                id="codeforces"
                type="text"
                placeholder="e.g. tourist"
                value={cfHandle}
                onChange={(e) => {
                  setCfHandle(e.target.value);
                  setCfProfile(null);
                  setCfError(null);
                }}
                style={{ flex: 1 }}
              />
              <button
                type="button"
                className="btn btn--secondary"
                onClick={handleVerifyCodeforces}
                disabled={cfVerifying || !cfHandle.trim() || !!cfProfile}
                style={{ padding: "8px 14px", fontSize: "13px" }}
              >
                {cfVerifying ? "Verifying…" : cfProfile ? "Connected" : "Verify"}
              </button>
            </div>
            {cfError && <p className="setup-card__error" style={{ marginTop: 4 }}>{cfError}</p>}
          </div>

          {/* Codeforces Profile Preview */}
          {cfProfile && (
            <div className="setup-card__cf-preview">
              <div className="setup-card__cf-profile">
                {cfProfile.avatar ? (
                  <img src={cfProfile.avatar} alt={cfProfile.handle} className="setup-card__cf-avatar" />
                ) : (
                  <CodeforcesIcon width={24} height={24} />
                )}
                <div className="setup-card__cf-details">
                  <span className="title-lg" style={{ fontSize: "15px" }}>@{cfProfile.handle}</span>
                  <span className="setup-card__cf-rating">
                    {cfProfile.rank ? `${cfProfile.rank} (${cfProfile.rating || "unrated"})` : "Verified"}
                  </span>
                </div>
              </div>
              <span className="pill pill--success pill--dot">Connected</span>
            </div>
          )}

          {error && <p className="setup-card__error">{error}</p>}

          <button className="btn btn--primary btn--full" type="submit" disabled={submitting}>
            {submitting ? "Saving..." : "Continue to dashboard"}
            {!submitting && <ArrowRightIcon />}
          </button>
        </form>
      </div>
    </div>
  );
};

export default Setup;