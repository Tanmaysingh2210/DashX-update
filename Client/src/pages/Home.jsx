import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import "./Home.css";
import { trackEvent } from "../utils/analyticsHelper";

// ── mini heatmap data for the dashboard preview ──
const PREVIEW_WEEKS = Array.from({ length: 20 }, (_, wi) =>
  Array.from({ length: 7 }, (_, di) => {
    const r = Math.random();
    if (r > 0.72) return "github";
    if (r > 0.55) return "leetcode";
    if (r > 0.45) return "both";
    return "empty";
  })
);

const Home = () => {
  const { isAuthenticated, loading, loginWithGitHub } = useAuth();
  const navigate = useNavigate();
  const glowRef = useRef(null);

  const handleGitHubLogin = () => {
    trackEvent("login_attempt", {
      provider: "github",
    });

    loginWithGitHub();
  };

  useEffect(() => {
    if (!loading && isAuthenticated) navigate("/dashboard", { replace: true });
  }, [loading, isAuthenticated, navigate]);

  // subtle parallax on the glow orb
  useEffect(() => {
    const handleMove = (e) => {
      if (!glowRef.current) return;
      const x = (e.clientX / window.innerWidth - 0.5) * 30;
      const y = (e.clientY / window.innerHeight - 0.5) * 20;
      glowRef.current.style.transform = `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`;
    };
    window.addEventListener("mousemove", handleMove);
    return () => window.removeEventListener("mousemove", handleMove);
  }, []);

  return (
    <div className="home">
      {/* ── ambient background glows ── */}
      <div className="home__glow-orb home__glow-orb--main" ref={glowRef} />
      <div className="home__glow-orb home__glow-orb--secondary" />

      {/* ═══════════════════════════════════════
          HERO
      ═══════════════════════════════════════ */}
      <section className="home__hero page">
        {/* left — copy */}
        <div className="home__hero-left">
          <div className="home__eyebrow">
            <span className="home__eyebrow-icon">✦</span>
            All your progress. One dashboard.
          </div>

          <h1 className="home__headline">
            Track your<br />
            <span className="home__headline-accent">coding consistency,</span><br />
            not just commits.
          </h1>

          <p className="home__subtitle">
            Combine your GitHub contributions and LeetCode progress
            into a single developer dashboard. Monitor streaks, analyze
            patterns, and stay accountable — every day.
          </p>

          <button className="home__cta-btn" onClick={handleGitHubLogin}>
            <GitHubRoundIcon />
            Continue with GitHub
            <span className="home__cta-arrow">→</span>
          </button>

          <p className="home__cta-note">
            <ShieldIcon />
            GitHub authenticates your account.<br />
            You'll connect your LeetCode profile during onboarding.
          </p>

          <div className="home__trust">
            <TrustBadge icon={<LockIcon />} label="Secure & private" sub="Your data stays yours" />
            <div className="home__trust-divider" />
            <TrustBadge icon={<ZapIcon />} label="Quick setup" sub="Takes less than 10 seconds" />
            <div className="home__trust-divider" />
            <TrustBadge icon={<GroupIcon />} label="Built for developers" sub="Loved by devs worldwide" />
          </div>
        </div>

        {/* right — floating dashboard mockup */}
        <div className="home__hero-right">
          <div className="home__dashboard-wrapper">
            <div className="home__card-glow" />
            <div className="home__dashboard-card">
              {/* card header */}
              <div className="home__card-header">
                <div className="home__card-avatar">DX</div>
                <div>
                  <p className="home__card-label">Welcome back,</p>
                  <p className="home__card-username">Tanmay👋</p>
                </div>
                <button className="home__card-view-btn" onClick={handleGitHubLogin}>
                  View full dashboard →
                </button>
              </div>

              {/* mini stat row */}
              <div className="home__card-stats">
                <MiniStat
                  label="Current Streak"
                  value="29"
                  unit="days"
                  sub="Best: 29 days"
                  icon="🔥"
                  accent="tertiary"
                />
                <MiniStat
                  label="GitHub Contributions"
                  value="534"
                  sub="this week"
                  subColor="secondary"
                  icon={<GitHubSmallIcon />}
                  accent="secondary"
                />
                <MiniStat
                  label="LeetCode Solved"
                  value="514"
                  sub="this week"
                  subColor="tertiary"
                  icon={<LeetCodeSmallIcon />}
                  accent="tertiary"
                />
              </div>

              {/* mini heatmap */}
              <div className="home__card-heatmap">
                <div className="home__card-heatmap-header">
                  <span className="home__card-section-label">Activity Heatmap</span>
                  <div className="home__card-heatmap-legend">
                    <span>Less</span>
                    {[1, 2, 3, 4].map((l) => (
                      <span key={l} className={`home__card-heatmap-swatch home__swatch--both-${l}`} />
                    ))}
                    <span>More</span>
                  </div>
                </div>

                <div className="home__card-heatmap-months">
                  {["Jan", "Feb", "Mar", "Apr", "May", "Jun"].map((m) => (
                    <span key={m}>{m}</span>
                  ))}
                </div>

                <div className="home__card-heatmap-grid">
                  {PREVIEW_WEEKS.map((week, wi) => (
                    <div key={wi} className="home__card-heatmap-col">
                      {week.map((type, di) => (
                        <span
                          key={di}
                          className={`home__card-heatmap-cell home__cell--${type}`}
                          style={{ animationDelay: `${wi * 30 + di * 10}ms` }}
                        />
                      ))}
                    </div>
                  ))}
                </div>
              </div>

              {/* bottom mini stats */}
              <div className="home__card-bottom-stats">
                <BottomStat icon="📅" label="Most Active Day" value="Sunday" />
                <BottomStat icon="📈" label="Peak Month" value="August" />
                <BottomStat
                  icon={<ConsistencyRing pct={97} />}
                  label="Consistency Score"
                  value="97%"
                  wide
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════
          PLATFORMS ROW
      ═══════════════════════════════════════ */}
      <section className="home__platforms page">
        <p className="home__platforms-label">Built to work with the tools you use</p>
        <div className="home__platforms-list">
          <PlatformPill
            logo={<GitHubLogo />}
            name="GitHub"
            status="Live"
            statusType="working"
          />
          <PlatformPill
            logo={<LeetCodeLogo />}
            name="LeetCode"
            status="Live"
            statusType="working"
          />
          <PlatformPill
            logo={<CodeforcesLogo />}
            name="Codeforces"
            status="Upcoming"
            statusType="upcoming"
          />
          <PlatformPill
            logo={<HackerRankLogo />}
            name="HackerRank"
            status="Upcoming"
            statusType="upcoming"
          />
          <PlatformPill
            logo={<TryHackMeLogo />}
            name="Try Hack Me"
            status="Upcoming"
            statusType="upcoming"
          />
        </div>
      </section>
    </div>
  );
};

// ── sub-components ──────────────────────────────────────────

const TrustBadge = ({ icon, label, sub }) => (
  <div className="home__trust-badge">
    <span className="home__trust-icon">{icon}</span>
    <div>
      <p className="home__trust-label">{label}</p>
      <p className="home__trust-sub">{sub}</p>
    </div>
  </div>
);

const MiniStat = ({ label, value, unit, sub, subColor, icon, accent }) => (
  <div className={`home__mini-stat home__mini-stat--${accent}`}>
    <div className="home__mini-stat-top">
      <span className="home__mini-stat-label">{label}</span>
      <span className="home__mini-stat-icon">{icon}</span>
    </div>
    <p className="home__mini-stat-value">
      {value} {unit && <span className="home__mini-stat-unit">{unit}</span>}
    </p>
    {sub && (
      <p className={`home__mini-stat-sub home__mini-stat-sub--${subColor || "default"}`}>
        {sub}
      </p>
    )}
  </div>
);

const BottomStat = ({ icon, label, value, wide }) => (
  <div className={`home__bottom-stat ${wide ? "home__bottom-stat--wide" : ""}`}>
    <div className="home__bottom-stat-icon">{icon}</div>
    <p className="home__bottom-stat-label">{label}</p>
    <p className="home__bottom-stat-value">{value}</p>
  </div>
);

const ConsistencyRing = ({ pct }) => {
  const r = 16;
  const c = 2 * Math.PI * r;
  const dash = (pct / 100) * c;
  return (
    <svg width="40" height="40" viewBox="0 0 40 40">
      <circle cx="20" cy="20" r={r} fill="none" stroke="rgba(192,132,252,0.15)" strokeWidth="3" />
      <circle
        cx="20" cy="20" r={r} fill="none"
        stroke="#c084fc" strokeWidth="3"
        strokeDasharray={`${dash} ${c - dash}`}
        strokeLinecap="round"
        transform="rotate(-90 20 20)"
      />
      <text x="20" y="24" textAnchor="middle" fill="#c084fc" fontSize="10" fontWeight="600">
        {pct}%
      </text>
    </svg>
  );
};

const PlatformPill = ({ logo, name, status, statusType }) => (
  <div className="home__platform-pill">
    <span className="home__platform-logo">{logo}</span>
    <span className="home__platform-name">{name}</span>
    <span className={`home__platform-status home__platform-status--${statusType}`}>
      {(statusType === "connected" || statusType === "working") && "✓ "}
      {statusType === "next" && "⟳ "}
      {status}
    </span>
  </div>
);

// ── inline SVG icons ────────────────────────────────────────

const GitHubRoundIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 .5C5.7.5.5 5.7.5 12c0 5 3.2 9.2 7.7 10.7.6.1.8-.2.8-.6v-2.2c-3.1.7-3.8-1.3-3.8-1.3-.5-1.3-1.2-1.7-1.2-1.7-1-.7.1-.7.1-.7 1.1.1 1.7 1.1 1.7 1.1 1 1.7 2.6 1.2 3.2.9.1-.7.4-1.2.7-1.5-2.5-.3-5.1-1.2-5.1-5.5 0-1.2.4-2.2 1.1-3-.1-.3-.5-1.5.1-3.1 0 0 1-.3 3.2 1.2.9-.3 1.9-.4 2.9-.4s2 .1 2.9.4c2.2-1.5 3.2-1.2 3.2-1.2.6 1.6.2 2.8.1 3.1.7.8 1.1 1.8 1.1 3 0 4.3-2.6 5.2-5.1 5.5.4.4.8 1.1.8 2.2v3.3c0 .4.2.7.8.6 4.5-1.5 7.7-5.7 7.7-10.7C23.5 5.7 18.3.5 12 .5z" />
  </svg>
);
const GitHubSmallIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 .5C5.7.5.5 5.7.5 12c0 5 3.2 9.2 7.7 10.7.6.1.8-.2.8-.6v-2.2c-3.1.7-3.8-1.3-3.8-1.3-.5-1.3-1.2-1.7-1.2-1.7-1-.7.1-.7.1-.7 1.1.1 1.7 1.1 1.7 1.1 1 1.7 2.6 1.2 3.2.9.1-.7.4-1.2.7-1.5-2.5-.3-5.1-1.2-5.1-5.5 0-1.2.4-2.2 1.1-3-.1-.3-.5-1.5.1-3.1 0 0 1-.3 3.2 1.2.9-.3 1.9-.4 2.9-.4s2 .1 2.9.4c2.2-1.5 3.2-1.2 3.2-1.2.6 1.6.2 2.8.1 3.1.7.8 1.1 1.8 1.1 3 0 4.3-2.6 5.2-5.1 5.5.4.4.8 1.1.8 2.2v3.3c0 .4.2.7.8.6 4.5-1.5 7.7-5.7 7.7-10.7C23.5 5.7 18.3.5 12 .5z" />
  </svg>
);
const LeetCodeSmallIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="m9 18-6-6 6-6M15 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const ShieldIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const LockIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" strokeLinecap="round" />
  </svg>
);
const ZapIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M13 2 4 13h6l-1 9 9-11h-6l1-9z" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const GroupIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" strokeLinecap="round" />
  </svg>
);
const GitHubLogo = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 .5C5.7.5.5 5.7.5 12c0 5 3.2 9.2 7.7 10.7.6.1.8-.2.8-.6v-2.2c-3.1.7-3.8-1.3-3.8-1.3-.5-1.3-1.2-1.7-1.2-1.7-1-.7.1-.7.1-.7 1.1.1 1.7 1.1 1.7 1.1 1 1.7 2.6 1.2 3.2.9.1-.7.4-1.2.7-1.5-2.5-.3-5.1-1.2-5.1-5.5 0-1.2.4-2.2 1.1-3-.1-.3-.5-1.5.1-3.1 0 0 1-.3 3.2 1.2.9-.3 1.9-.4 2.9-.4s2 .1 2.9.4c2.2-1.5 3.2-1.2 3.2-1.2.6 1.6.2 2.8.1 3.1.7.8 1.1 1.8 1.1 3 0 4.3-2.6 5.2-5.1 5.5.4.4.8 1.1.8 2.2v3.3c0 .4.2.7.8.6 4.5-1.5 7.7-5.7 7.7-10.7C23.5 5.7 18.3.5 12 .5z" />
  </svg>
);
const LeetCodeLogo = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#ffb867" strokeWidth="1.8">
    <path d="m9 18-6-6 6-6M15 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const CodeforcesLogo = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
    <rect x="2" y="12" width="5" height="10" rx="1" fill="#818cf8" />
    <rect x="9" y="6" width="5" height="16" rx="1" fill="#a78bfa" />
    <rect x="16" y="2" width="5" height="20" rx="1" fill="#c084fc" />
  </svg>
);
const HackerRankLogo = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="#22c55e">
    <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm-1 14.5v-2.2c-1.2-.4-2-1.5-2-2.8s.8-2.4 2-2.8V6.5h2v2.2c1.2.4 2 1.5 2 2.8s-.8 2.4-2 2.8v2.2h-2z" />
  </svg>
);

const TryHackMeLogo = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="#ff4e53">
    <path d="M10.705 0C7.54 0 4.902 2.285 4.349 5.291a4.525 4.525 0 0 0-4.107 4.5 4.525 4.525 0 0 0 4.52 4.52h6.761a.625.625 0 1 0 0-1.25H4.761a3.273 3.273 0 0 1-3.27-3.27A3.273 3.273 0 0 1 6.59 7.08a.625.625 0 0 0 .7-1.035 4.488 4.488 0 0 0-1.68-.69 5.223 5.223 0 0 1 5.096-4.104 5.221 5.221 0 0 1 5.174 4.57 4.489 4.489 0 0 0-.488.305.625.625 0 1 0 .731 1.013 3.245 3.245 0 0 1 1.912-.616 3.278 3.278 0 0 1 3.203 2.61.625.625 0 0 0 1.225-.251 4.533 4.533 0 0 0-4.428-3.61 4.54 4.54 0 0 0-.958.105C16.556 2.328 13.9 0 10.705 0zm5.192 10.64a.925.925 0 0 0-.462.108.913.913 0 0 0-.313.29 1.27 1.27 0 0 0-.175.427 2.39 2.39 0 0 0-.054.514c0 .181.018.353.054.517.036.164.095.307.175.43a.899.899 0 0 0 .313.297c.127.073.281.11.462.11.18 0 .334-.037.46-.11a.897.897 0 0 0 .309-.296c.08-.124.137-.267.173-.431.036-.164.054-.336.054-.517 0-.18-.018-.352-.054-.514a1.271 1.271 0 0 0-.173-.426.901.901 0 0 0-.309-.291.917.917 0 0 0-.46-.108zm6.486 0a.925.925 0 0 0-.462.108.913.913 0 0 0-.313.29 1.27 1.27 0 0 0-.175.427 2.39 2.39 0 0 0-.053.514c0 .181.017.353.053.517.036.164.095.307.175.43a.899.899 0 0 0 .313.297c.127.073.281.11.462.11.18 0 .334-.037.46-.11a.897.897 0 0 0 .31-.296c.078-.124.136-.267.172-.431.036-.164.054-.336.054-.517 0-.18-.018-.352-.054-.514a1.271 1.271 0 0 0-.173-.426.901.901 0 0 0-.308-.291.916.916 0 0 0-.461-.108zm-8.537.068l-.84.618.313.43.476-.368v1.877h.603v-2.557zm6.486 0l-.841.618.314.43.477-.368v1.877h.603v-2.557zm-4.435.445c.08 0 .143.028.193.084.05.057.087.127.114.21.026.083.044.173.054.269a2.541 2.541 0 0 1 0 .533c-.01.097-.028.187-.054.27a.584.584 0 0 1-.114.21.243.243 0 0 1-.193.085.248.248 0 0 1-.195-.086.584.584 0 0 1-.118-.209 1.245 1.245 0 0 1-.056-.27 2.645 2.645 0 0 1 0-.533c.01-.096.029-.186.056-.27a.583.583 0 0 1 .118-.209.25.25 0 0 1 .195-.084zm6.486 0c.08 0 .144.028.193.084.05.057.087.127.114.21.027.083.044.173.054.269a2.541 2.541 0 0 1 0 .533c-.01.097-.027.187-.054.27a.584.584 0 0 1-.114.21.243.243 0 0 1-.193.085.249.249 0 0 1-.195-.086.581.581 0 0 1-.117-.209 1.245 1.245 0 0 1-.056-.27 2.642 2.642 0 0 1 0-.533c.01-.096.028-.186.056-.27a.58.58 0 0 1 .117-.209.25.25 0 0 1 .195-.084zm-2.191 3.51a.93.93 0 0 0-.463.109.908.908 0 0 0-.312.291c-.08.122-.139.263-.175.426a2.383 2.383 0 0 0-.054.514c0 .18.018.353.054.516.036.164.094.308.175.432a.91.91 0 0 0 .312.296.92.92 0 0 0 .463.11c.18 0 .333-.037.46-.11a.892.892 0 0 0 .308-.296 1.32 1.32 0 0 0 .174-.432c.036-.163.054-.335.054-.516 0-.18-.018-.352-.054-.514a1.274 1.274 0 0 0-.174-.426.89.89 0 0 0-.309-.291.918.918 0 0 0-.46-.108zm-6.402.07l-.841.617.314.43.476-.369v1.878h.604v-2.557zm2.125 0l-.841.617.314.43.477-.369v1.878h.603v-2.557zm2.116 0l-.84.617.313.43.477-.369v1.878h.603v-2.557zm2.16.443c.08 0 .144.028.194.085a.605.605 0 0 1 .114.21c.026.083.044.172.053.269a2.639 2.639 0 0 1 0 .532 1.28 1.28 0 0 1-.053.27.585.585 0 0 1-.114.21.244.244 0 0 1-.193.085.25.25 0 0 1-.196-.085.589.589 0 0 1-.117-.21 1.245 1.245 0 0 1-.056-.27 2.597 2.597 0 0 1 0-.532c.01-.097.028-.186.056-.27a.589.589 0 0 1 .117-.209.249.249 0 0 1 .196-.085zm-6.729 3.073a.676.676 0 0 0-.335.078.661.661 0 0 0-.227.211.91.91 0 0 0-.127.31c-.027.118-.04.242-.04.373s.013.256.04.375a.93.93 0 0 0 .127.313.65.65 0 0 0 .227.215c.092.053.204.08.335.08a.655.655 0 0 0 .334-.08.65.65 0 0 0 .225-.215c.057-.09.1-.194.125-.313a1.75 1.75 0 0 0 .04-.375c0-.13-.014-.255-.04-.373a.931.931 0 0 0-.125-.31.658.658 0 0 0-.225-.21.667.667 0 0 0-.334-.08zm3.086 0a.675.675 0 0 0-.336.078.661.661 0 0 0-.226.211.907.907 0 0 0-.127.31 1.69 1.69 0 0 0-.04.373c0 .131.013.256.04.375a.928.928 0 0 0 .127.313c.058.09.134.162.226.215.093.053.205.08.336.08a.655.655 0 0 0 .334-.08.65.65 0 0 0 .224-.215c.058-.09.1-.194.126-.313a1.752 1.752 0 0 0 0-.748.94.94 0 0 0-.126-.31.657.657 0 0 0-.224-.21.667.667 0 0 0-.334-.08zm5.108 0a.675.675 0 0 0-.336.078.661.661 0 0 0-.226.211.91.91 0 0 0-.127.31c-.027.118-.04.242-.04.373s.013.256.04.375a.931.931 0 0 0 .127.313c.058.09.134.162.226.215.093.053.205.08.336.08.13 0 .243-.027.334-.08a.65.65 0 0 0 .224-.215c.058-.09.1-.194.126-.313a1.75 1.75 0 0 0 .04-.375c0-.13-.014-.255-.04-.373a.943.943 0 0 0-.126-.31.657.657 0 0 0-.224-.21.668.668 0 0 0-.334-.08zm-6.658.05l-.61.448.227.311.346-.266v1.362h.438v-1.856zm3.068 0l-.61.448.227.311.346-.266v1.362h.438v-1.856zm5.108 0l-.611.448.228.311.346-.266v1.362h.438v-1.856zm-9.712.322c.058 0 .105.02.14.062a.421.421 0 0 1 .083.151.96.96 0 0 1 .04.196 1.932 1.932 0 0 1 0 .386.954.954 0 0 1-.04.197.421.421 0 0 1-.083.152.176.176 0 0 1-.14.061.18.18 0 0 1-.141-.06.427.427 0 0 1-.085-.153.887.887 0 0 1-.041-.197 1.96 1.96 0 0 1 0-.386.893.893 0 0 1 .04-.196.42.42 0 0 1 .086-.151.181.181 0 0 1 .141-.062zm3.086 0c.058 0 .104.02.14.062a.421.421 0 0 1 .082.151.94.94 0 0 1 .04.196 1.906 1.906 0 0 1 0 .386.93.93 0 0 1-.04.197.421.421 0 0 1-.082.152.176.176 0 0 1-.14.061.18.18 0 0 1-.141-.06.42.42 0 0 1-.086-.153.846.846 0 0 1-.04-.197 1.965 1.965 0 0 1-.011-.195c0-.057.004-.121.01-.191a.849.849 0 0 1 .041-.196.42.42 0 0 1 .086-.151.182.182 0 0 1 .141-.062zm5.108 0c.058 0 .104.02.14.062a.421.421 0 0 1 .082.151.92.92 0 0 1 .04.196 1.963 1.963 0 0 1 0 .386.943.943 0 0 1-.04.197.421.421 0 0 1-.082.152.177.177 0 0 1-.14.061.18.18 0 0 1-.142-.06.437.437 0 0 1-.085-.153.95.95 0 0 1-.04-.197 1.965 1.965 0 0 1-.011-.195c0-.057.004-.121.01-.191a.959.959 0 0 1 .04-.196.47.47 0 0 1 .086-.151.181.181 0 0 1 .142-.062zm-1.684 1.814a.675.675 0 0 0-.336.079.66.66 0 0 0-.227.21.91.91 0 0 0-.127.31 1.731 1.731 0 0 0 0 .748.939.939 0 0 0 .127.314.65.65 0 0 0 .227.215c.059.09.134.162.227.215.093.053.205.08.336.08a.66.66 0 0 0 .334-.08.648.648 0 0 0 .224-.215c.058-.09.1-.195.126-.314a1.737 1.737 0 0 0-.001-.747.928.928 0 0 0-.125-.31.65.65 0 0 0-.224-.211.668.668 0 0 0-.334-.079zm3.063 0a.676.676 0 0 0-.336.079.664.664 0 0 0-.227.21.906.906 0 0 0-.127.31 1.74 1.74 0 0 0 0 .748.936.936 0 0 0 .127.314.66.66 0 0 0 .227.215c.092.053.204.08.336.08a.654.654 0 0 0 .334-.08.648.648 0 0 0 .223-.215c.058-.09.1-.195.126-.314a1.74 1.74 0 0 0 0-.747.928.928 0 0 0-.126-.31.65.65 0 0 0-.223-.211.666.666 0 0 0-.334-.079zm-1.545.05l-.611.448.228.312.346-.267v1.363h.438v-1.856zm-1.518.323c.057 0 .104.02.14.061a.42.42 0 0 1 .082.152.91.91 0 0 1 .04.195 1.966 1.966 0 0 1 0 .387.951.951 0 0 1-.04.197.421.421 0 0 1-.082.152.177.177 0 0 1-.14.06.18.18 0 0 1-.142-.06.428.428 0 0 1-.085-.152.914.914 0 0 1-.04-.197 1.96 1.96 0 0 1-.011-.195c0-.058.003-.122.01-.192a.923.923 0 0 1 .041-.195c.02-.06.048-.11.085-.152a.181.181 0 0 1 .142-.061zm3.063 0c.057 0 .104.02.14.061a.42.42 0 0 1 .082.152.94.94 0 0 1 .04.195 1.91 1.91 0 0 1 0 .387.93.93 0 0 1-.04.197.422.422 0 0 1-.083.152.175.175 0 0 1-.14.06.18.18 0 0 1-.141-.06.423.423 0 0 1-.085-.152.907.907 0 0 1-.04-.197 1.95 1.95 0 0 1 0-.387.915.915 0 0 1 .04-.195c.02-.06.048-.11.085-.152a.182.182 0 0 1 .142-.061zm-9.713.185a.465.465 0 0 0-.232.055.456.456 0 0 0-.157.146.627.627 0 0 0-.089.215 1.168 1.168 0 0 0-.027.259c0 .09.009.177.027.26a.648.648 0 0 0 .089.216c.04.063.093.112.157.149a.459.459 0 0 0 .232.056c.09 0 .168-.02.231-.056a.45.45 0 0 0 .156-.149.67.67 0 0 0 .087-.217 1.218 1.218 0 0 0 0-.518.647.647 0 0 0-.087-.215.448.448 0 0 0-.156-.146.458.458 0 0 0-.23-.055zm1.052.035l-.423.31.158.217.24-.185v.944h.303v-1.286zm-1.052.224c.04 0 .073.014.097.042a.284.284 0 0 1 .057.105.69.69 0 0 1 .028.136c.004.049.007.092.007.133 0 .04-.003.086-.007.135a.684.684 0 0 1-.028.136.285.285 0 0 1-.057.105.123.123 0 0 1-.097.043.125.125 0 0 1-.098-.043.298.298 0 0 1-.059-.105.612.612 0 0 1-.028-.136 1.39 1.39 0 0 1 0-.268.62.62 0 0 1 .028-.136.297.297 0 0 1 .06-.105.125.125 0 0 1 .097-.042zm3.775 1.394a.463.463 0 0 0-.232.054.452.452 0 0 0-.157.146.621.621 0 0 0-.088.214 1.19 1.19 0 0 0 0 .519.641.641 0 0 0 .088.217.46.46 0 0 0 .157.15.458.458 0 0 0 .232.054.454.454 0 0 0 .232-.055.45.45 0 0 0 .155-.149.664.664 0 0 0 .087-.217 1.189 1.189 0 0 0 0-.519.642.642 0 0 0-.087-.214.446.446 0 0 0-.155-.146.459.459 0 0 0-.232-.054zm1.052.034l-.423.31.158.216.24-.185v.945h.303V22.68zm-1.052.223c.04 0 .073.014.098.043a.3.3 0 0 1 .057.105.643.643 0 0 1 .027.135 1.31 1.31 0 0 1 0 .268.654.654 0 0 1-.027.137.307.307 0 0 1-.057.105.124.124 0 0 1-.098.042.125.125 0 0 1-.098-.042.293.293 0 0 1-.059-.105.618.618 0 0 1-.028-.137 1.364 1.364 0 0 1 0-.268.612.612 0 0 1 .028-.135.287.287 0 0 1 .06-.105.123.123 0 0 1 .097-.043z"/>
  </svg>
);


export default Home;