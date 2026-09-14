import { Navigate, Outlet, useLocation } from "react-router-dom";

import { useAuth } from "../lib/auth";

export function RequireAdmin({ roles }: { roles?: ("admin" | "manager")[] }) {
  const { admin, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) return <div className="p-8 text-slate-500">Loading…</div>;
  if (!admin) return <Navigate to="/login" state={{ from: location }} replace />;
  if (roles && !roles.includes(admin.role)) {
    return (
      <div className="flex min-h-screen items-center justify-center p-8 text-center text-slate-500">
        Your account ({admin.role}) doesn't have access to any pages here yet.
      </div>
    );
  }

  return <Outlet />;
}
