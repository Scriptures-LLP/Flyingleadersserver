import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";

import logo from "../assets/flying-transparent-logo.png";
import { useAuth, type AdminRole } from "../lib/auth";
import { Icon, type IconName } from "./icons";

const SIDEBAR_KEY = "flying-leader-admin:sidebar-collapsed";

type NavItem = { to: string; label: string; icon: IconName; roles: AdminRole[] };

// Grouped into sections so the long list reads as an organised, premium nav
// rather than one flat column.
const NAV_SECTIONS: { heading: string; items: NavItem[] }[] = [
  {
    heading: "Operations",
    items: [
      { to: "/bookings", label: "Bookings", icon: "bookings", roles: ["admin"] },
      { to: "/customers", label: "Customers", icon: "customers", roles: ["admin"] },
    ],
  },
  {
    heading: "Catalog",
    items: [
      { to: "/tours", label: "Tours", icon: "tours", roles: ["admin"] },
      { to: "/tour-dates", label: "Tour Dates", icon: "tourDates", roles: ["admin"] },
      { to: "/tour-airport-prices", label: "Tour Airport Prices", icon: "airportPrices", roles: ["admin"] },
      { to: "/countries", label: "Countries", icon: "countries", roles: ["admin"] },
      { to: "/airports", label: "Airports", icon: "airports", roles: ["admin"] },
      { to: "/categories", label: "Categories", icon: "categories", roles: ["admin"] },
    ],
  },
  {
    heading: "Marketing",
    items: [
      { to: "/promo-codes", label: "Promo Codes", icon: "promoCodes", roles: ["admin"] },
      { to: "/reviews", label: "Reviews", icon: "reviews", roles: ["admin"] },
      { to: "/referrals", label: "Referrals", icon: "referrals", roles: ["admin"] },
    ],
  },
  {
    heading: "Content",
    items: [
      { to: "/gallery-images", label: "Past Trips", icon: "pastTrips", roles: ["admin"] },
      { to: "/home-covers", label: "Home Covers", icon: "homeCovers", roles: ["admin"] },
    ],
  },
  {
    heading: "System",
    items: [{ to: "/settings", label: "Settings", icon: "settings", roles: ["admin"] }],
  },
];

function initials(name?: string) {
  if (!name) return "?";
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

export function AppLayout() {
  const { admin, logout } = useAuth();
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(SIDEBAR_KEY) === "1");

  function toggleSidebar() {
    setCollapsed((c) => {
      const next = !c;
      localStorage.setItem(SIDEBAR_KEY, next ? "1" : "0");
      return next;
    });
  }

  return (
    <div className="flex min-h-screen bg-neutral-100 text-neutral-800">
      <aside
        className={`sticky top-0 flex h-screen shrink-0 flex-col border-r border-neutral-200/80 bg-gradient-to-b from-white to-neutral-50 transition-[width] duration-300 ${
          collapsed ? "w-[76px]" : "w-64"
        }`}
      >
        <div
          className={`flex shrink-0 flex-col items-center gap-2 border-b border-neutral-100 ${
            collapsed ? "px-2 py-4" : "px-4 py-5"
          }`}
        >
          {collapsed ? (
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-red-500 to-red-600 text-sm font-bold tracking-tight text-white shadow-sm shadow-red-600/30">
              FL
            </div>
          ) : (
            <>
              <img src={logo} alt="Flying Leader" className="h-14 w-auto" />
              {admin?.role && (
                <span className="rounded-full bg-red-50 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-red-600">
                  {admin.role}
                </span>
              )}
            </>
          )}
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4">
          {NAV_SECTIONS.map((section) => {
            const items = section.items.filter((item) => !admin || item.roles.includes(admin.role));
            if (items.length === 0) return null;
            return (
              <div key={section.heading} className="mb-5 last:mb-0">
                {collapsed ? (
                  <div className="mx-2 mb-1.5 border-t border-neutral-100 first:border-t-0" />
                ) : (
                  <p className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
                    {section.heading}
                  </p>
                )}
                <div className="flex flex-col gap-0.5">
                  {items.map((item) => (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      title={collapsed ? item.label : undefined}
                      className={({ isActive }) =>
                        `group relative flex items-center gap-3 rounded-lg py-2 text-sm font-medium transition-all ${
                          collapsed ? "justify-center px-0" : "px-3"
                        } ${
                          isActive
                            ? "bg-gradient-to-r from-red-600 to-red-500 text-white shadow-md shadow-red-600/25"
                            : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
                        }`
                      }
                    >
                      {({ isActive }) => (
                        <>
                          <Icon
                            name={item.icon}
                            className={`h-[18px] w-[18px] shrink-0 transition-colors ${
                              isActive ? "text-white" : "text-neutral-400 group-hover:text-neutral-600"
                            }`}
                          />
                          {!collapsed && <span>{item.label}</span>}
                        </>
                      )}
                    </NavLink>
                  ))}
                </div>
              </div>
            );
          })}
        </nav>

        <div className="border-t border-neutral-100 p-2">
          <button
            onClick={toggleSidebar}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-800 ${
              collapsed ? "justify-center" : ""
            }`}
          >
            <Icon
              name="chevronLeft"
              className={`h-4 w-4 shrink-0 transition-transform duration-300 ${collapsed ? "rotate-180" : ""}`}
            />
            {!collapsed && <span>Collapse</span>}
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col bg-[radial-gradient(50rem_34rem_at_100%_-8%,rgba(220,38,38,0.10),transparent),radial-gradient(38rem_30rem_at_-10%_110%,rgba(220,38,38,0.05),transparent)]">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-end border-b border-neutral-200/80 bg-white/70 px-6 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-red-500 to-red-600 text-sm font-semibold text-white shadow-sm shadow-red-600/30">
                {initials(admin?.name)}
              </div>
              <div className="leading-tight">
                <p className="text-sm font-medium text-neutral-800">{admin?.name}</p>
                <p className="text-xs capitalize text-neutral-400">{admin?.role}</p>
              </div>
            </div>
            <button
              onClick={logout}
              className="flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-sm font-medium text-neutral-600 transition-colors hover:border-neutral-300 hover:bg-neutral-50 hover:text-neutral-900"
            >
              <Icon name="logout" className="h-4 w-4" />
              Log out
            </button>
          </div>
        </header>
        <main className="flex-1 p-6 lg:p-8">
          <div className="page-enter mx-auto max-w-6xl">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
