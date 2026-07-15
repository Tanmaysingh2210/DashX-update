import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import api from "../api/axios";
import { GitHubIcon, LeetCodeIcon, ArrowRightIcon } from "../components/Icons";
import "./Setup.css";
import { trackEvent } from "../utils/analyticsHelper";

const Setup = () => {
  const { user, refreshUser } = useAuth();
  const navigate = useNavigate();

  const [username, setUsername] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const cleaned = username.trim();
    if (!cleaned) return;

    setSubmitting(true);
    setError(null);

    try {
      await api.patch("/auth/setup-leetcode", { leetcodeUsername: cleaned });

      trackEvent("leetcode_connected", {
        source: "setup",
      });

      await refreshUser();
      navigate("/dashboard");
    } catch (err) {
      setError(err.response?.data?.message || "Couldn't save your LeetCode username");
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
          Add your LeetCode username so DashX can pull your submission history and build your
          unified streak.
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