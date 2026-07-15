import { useState, useRef, useEffect } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import "./Navbar.css";

const NAV_LINKS = [
  { to: "/dashboard", label: "Dashboard" },
  { to: "/activity",  label: "Activity"  },
  { to: "/settings",  label: "Settings"  },
];

const Navbar = () => {
  const { user, isAuthenticated, logout, loginWithGitHub } = useAuth();
  const navigate = useNavigate();

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  // close dropdown when clicking outside
  useEffect(() => {
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleLogout = async () => {
    setMenuOpen(false);
    await logout();
    navigate("/");
  };

  return (
    <header className="navbar">
      <div className="navbar__inner page">
        <NavLink to="/" className="navbar__brand">DashX</NavLink>

        {isAuthenticated && (
          <nav className="navbar__links">
            {NAV_LINKS.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                className={({ isActive }) =>
                  isActive ? "navbar__link navbar__link--active" : "navbar__link"
                }
              >
                {link.label}
              </NavLink>
            ))}
          </nav>
        )}

        <div className="navbar__actions">
          {isAuthenticated ? (
            <>
              <button className="navbar__icon-btn" aria-label="Notifications" type="button">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M13.73 21a2 2 0 0 1-3.46 0" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>

              {/* Avatar with dropdown — clicking opens menu, NOT logout */}
              <div className="navbar__avatar-wrap" ref={menuRef}>
                <button
                  className="navbar__avatar"
                  onClick={() => setMenuOpen((o) => !o)}
                  aria-label="Account menu"
                  aria-expanded={menuOpen}
                  type="button"
                >
                  {user?.avatar
                    ? <img src={user.avatar} alt={user.githubUsername} />
                    : <span>{user?.githubUsername?.[0]?.toUpperCase() || "?"}</span>
                  }
                </button>

                {menuOpen && (
                  <div className="navbar__dropdown">
                    <div className="navbar__dropdown-header">
                      <p className="navbar__dropdown-name">@{user?.githubUsername}</p>
                      {user?.email && <p className="navbar__dropdown-email">{user.email}</p>}
                    </div>

                    <div className="navbar__dropdown-divider" />

                    <button
                      className="navbar__dropdown-item"
                      onClick={() => { setMenuOpen(false); navigate("/settings"); }}
                      type="button"
                    >
                      <SettingsIcon /> Settings
                    </button>

                    <button
                      className="navbar__dropdown-item"
                      onClick={() => { setMenuOpen(false); navigate("/dashboard"); }}
                      type="button"
                    >
                      <DashboardIcon /> Dashboard
                    </button>

                    <div className="navbar__dropdown-divider" />

                    <button
                      className="navbar__dropdown-item navbar__dropdown-item--danger"
                      onClick={handleLogout}
                      type="button"
                    >
                      <LogoutIcon /> Log out
                    </button>
                  </div>
                )}
              </div>
            </>
          ) : (
            <button className="btn btn--primary" onClick={loginWithGitHub}>
              Get Started
            </button>
          )}
        </div>
      </div>
    </header>
  );
};

const SettingsIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const DashboardIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
  </svg>
);

const LogoutIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" strokeLinecap="round" strokeLinejoin="round"/>
    <polyline points="16 17 21 12 16 7" strokeLinecap="round" strokeLinejoin="round"/>
    <line x1="21" y1="12" x2="9" y2="12" strokeLinecap="round"/>
  </svg>
);

export default Navbar;