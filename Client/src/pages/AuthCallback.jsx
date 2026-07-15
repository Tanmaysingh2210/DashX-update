import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import Loader from "../components/Loader";
import "./AuthCallback.css";
import { trackEvent } from "../utils/analyticsHelper";

/**
 * AuthCallback
 *
 * Landed here after GitHub OAuth redirect.
 * The JWT cookie has already been set by the backend.
 *
 * Steps:
 *   1. Call refreshUser() to fetch /auth/me with the new cookie
 *   2. If user is set → navigate to /setup or /dashboard
 *   3. If it fails → redirect home with error param
 *
 * Why a dedicated page instead of relying on AuthContext's initial load:
 *   When the browser follows the OAuth redirect, React mounts fresh and
 *   AuthContext fires /auth/me — but ProtectedRoute evaluates at the same
 *   time and may see user=null before the response arrives, bouncing the
 *   user back to "/". This page explicitly awaits refreshUser() before
 *   navigating, eliminating that race condition entirely.
 */
const AuthCallback = () => {
    const { refreshUser } = useAuth();
    const navigate = useNavigate();
    const attempted = useRef(false);

    useEffect(() => {
        // guard against React StrictMode double-firing
        if (attempted.current) return;
        attempted.current = true;

        const handleCallback = async () => {
            try {
                const user = await refreshUser();

                if (!user) {
                    // cookie was set but /auth/me returned null
                    navigate("/?error=session_failed", { replace: true });
                    return;
                }

                // Successful login
                trackEvent("login", {
                    method: "github",
                    user_type: user.isSetupComplete ? "returning" : "new",
                });


                navigate("/dashboard", { replace: true });
            } catch (err) {
                console.error("[AuthCallback] error:", err);
                navigate("/?error=auth_failed", { replace: true });
            }
        };

        handleCallback();
    }, [refreshUser, navigate]);

    return (
        <div className="auth-callback">
            <Loader label="Completing sign in..." />
        </div>
    );
};

export default AuthCallback;