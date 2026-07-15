import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import Loader from "./Loader";

/**
 * ProtectedRoute
 *
 * Redirects to "/" if not authenticated.
 *
 * Previously redirected to "/setup" if leetcodeUsername wasn't set.
 * Now: all secondary platforms are optional — users go straight to
 * the dashboard and connect platforms from there or from Settings.
 */
const ProtectedRoute = () => {
  const { isAuthenticated, loading } = useAuth();

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

  return <Outlet />;
};

export default ProtectedRoute;