import { NavLink, Outlet } from "react-router-dom";

import { useAuth, type AdminRole } from "../lib/auth";

const NAV_ITEMS: { to: string; label: string; roles: AdminRole[] }[] = [
  { to: "/bookings", label: "Bookings", roles: ["admin"] },
  { to: "/customers", label: "Customers", roles: ["admin"] },
  { to: "/tours", label: "Tours", roles: ["admin"] },
  { to: "/tour-dates", label: "Tour Dates", roles: ["admin"] },
  { to: "/tour-airport-prices", label: "Tour Airport Prices", roles: ["admin"] },
  { to: "/countries", label: "Countries", roles: ["admin"] },
  { to: "/airports", label: "Airports", roles: ["admin"] },
  { to: "/categories", label: "Categories", roles: ["admin"] },
  { to: "/promo-codes", label: "Promo Codes", roles: ["admin"] },
  { to: "/reviews", label: "Reviews", roles: ["admin"] },
  { to: "/referrals", label: "Referrals", roles: ["admin"] },
  { to: "/gallery-images", label: "Gallery", roles: ["admin"] },
  { to: "/home-covers", label: "Home Covers", roles: ["admin"] },
  { to: "/settings", label: "Settings", roles: ["admin"] },
];

export function AppLayout() {
  const { admin, logout } = useAuth();

  return (
    <div className="flex min-h-screen">
      <aside className="w-60 shrink-0 border-r border-slate-200 bg-white p-4">
        <div className="mb-6 px-2">
          <p className="text-lg font-semibold text-slate-900">Flying Leader</p>
          <p className="text-xs text-slate-500">Admin panel</p>
        </div>
        <nav className="flex flex-col gap-1">
          {NAV_ITEMS.filter((item) => !admin || item.roles.includes(admin.role)).map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `rounded-md px-3 py-2 text-sm font-medium ${
                  isActive ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="flex-1">
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3">
          <div />
          <div className="flex items-center gap-3 text-sm">
            <span className="text-slate-600">
              {admin?.name} <span className="text-slate-400">({admin?.role})</span>
            </span>
            <button
              onClick={logout}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-slate-700 hover:bg-slate-50"
            >
              Log out
            </button>
          </div>
        </header>
        <main className="p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
