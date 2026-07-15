import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import Loader from "./Loader";

/**
 * ProtectedRoute
 *
 * Redirects to "/" if the user isn't authenticated.
 * If authenticated but hasn't completed setup (no leetcodeUsername),
 * redirects to "/setup" — except when already on /setup.
 */
const ProtectedRoute = () => {
  const { isAuthenticated, loading, user } = useAuth();

  if (loading) {
    return (
      <div className="page" style={{ paddingTop: "120px" }}>
        <Loader label="Checking your session..." />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  if (!user.isSetupComplete && window.location.pathname !== "/setup") {
    return <Navigate to="/setup" replace />;
  }

  return <Outlet />;
};

export default ProtectedRoute;