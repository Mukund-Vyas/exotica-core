import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { subscribeNotice } from "../utils/notify";
import { useAuth } from "../context/AuthContext";

const NAV_SECTIONS = [
  {
    label: "Overview",
    items: [{ to: "/", label: "Dashboard", end: true }],
  },
  {
    label: "Master Data",
    items: [
      { to: "/skus", label: "SKUs", end: true },
      { to: "/skus/bulk-upload", label: "Bulk Upload" },
      { to: "/vendors", label: "Vendors" },
      { to: "/parties", label: "Parties" },
    ],
  },
  {
    label: "Inventory Intelligence",
    items: [
      { to: "/reports/inventory-aging", label: "Inventory Aging" },
      { to: "/reports/fast-movers", label: "Fast Movers" },
      { to: "/reports/purchase-triggers", label: "Purchase Triggers" },
    ],
  },
  {
    label: "Daily Entry",
    items: [
      { to: "/purchases", label: "Purchases" },
      { to: "/orders", label: "Orders", end: true },
      { to: "/orders/bulk", label: "Bulk Order Grid" },
      { to: "/returns", label: "Returns" },
    ],
  },
  {
    label: "Receivables",
    items: [
      { to: "/receivables", label: "Receivables", end: true },
      { to: "/receivables/aging", label: "Aging Report" },
    ],
  },
  {
    label: "Reports",
    items: [
      { to: "/reports/channel-pnl", label: "Channel P&L" },
      { to: "/reports/sku-pnl", label: "SKU P&L" },
      { to: "/reports/inventory-valuation", label: "Inventory Valuation" },
      { to: "/reports/dead-stock", label: "Dead Stock" },
      { to: "/reports/performance", label: "Performance" },
      { to: "/reports/audit-log", label: "Audit Log" },
    ],
  },
  {
    label: "Configuration",
    items: [{ to: "/settings", label: "Settings" }],
  },
];

function NavItem({ to, label, end }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `block rounded-sm px-3 py-1.5 text-sm transition-colors ${
          isActive ? "bg-brand text-white font-medium" : "text-taupe-light hover:bg-white/5 hover:text-white"
        }`
      }
    >
      {label}
    </NavLink>
  );
}

export default function AppLayout() {
  const { user, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [notice, setNotice] = useState(null);
  const location = useLocation();
  const queryClient = useQueryClient();

  // The drawer used to stay open after tapping a link, covering the page you'd
  // just navigated to.
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!mobileOpen) return undefined;
    const onKey = (e) => e.key === "Escape" && setMobileOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [mobileOpen]);

  // Failed data loads are announced here (see main.jsx) so a failure can't be
  // mistaken for "nothing to show". Clears itself when the user moves on.
  useEffect(() => subscribeNotice(setNotice), []);
  useEffect(() => setNotice(null), [location.pathname]);

  const Sidebar = (
    <nav aria-label="Main" className="flex h-full flex-col gap-6 overflow-y-auto px-4 py-6">
      <div className="flex items-center gap-2.5 px-1">
        <img src="/logo-mark.png" alt="" aria-hidden="true" className="h-9 w-9 shrink-0" />
        <div>
          <p className="font-display text-xl font-semibold text-white">Exotica</p>
          <p className="text-[10px] uppercase tracking-wide text-taupe-light">Core</p>
        </div>
      </div>
      {NAV_SECTIONS.map((section) => (
        <div key={section.label}>
          <p className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-wide text-taupe">
            {section.label}
          </p>
          <div className="flex flex-col gap-0.5">
            {section.items.map((item) => (
              <NavItem key={item.to} {...item} />
            ))}
          </div>
        </div>
      ))}
      <div className="mt-auto border-t border-white/10 pt-4 px-1">
        <p className="text-sm text-white">{user?.username}</p>
        <button type="button" onClick={logout} className="mt-1 text-xs text-taupe-light hover:text-white underline">
          Log out
        </button>
      </div>
    </nav>
  );

  return (
    <div className="flex min-h-screen bg-ivory">
      {/* Desktop sidebar */}
      <aside className="hidden w-60 shrink-0 bg-ink md:block">{Sidebar}</aside>

      {/* Mobile top bar + drawer */}
      <div className="md:hidden">
        {mobileOpen && (
          <div className="fixed inset-0 z-40 flex">
            <div className="w-64 bg-ink">{Sidebar}</div>
            <div className="flex-1 bg-ink/40" onClick={() => setMobileOpen(false)} />
          </div>
        )}
      </div>

      <div className="flex min-h-screen flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-taupe-light bg-white px-4 py-3 md:hidden">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
            aria-expanded={mobileOpen}
            className="rounded-sm p-1.5 text-ink hover:bg-ivory"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <path d="M3 6h14M3 10h14M3 14h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
          <div className="flex items-center gap-2">
            <img src="/logo-mark.png" alt="" aria-hidden="true" className="h-6 w-6" />
            <p className="font-display text-lg font-semibold text-ink">Exotica</p>
          </div>
          <div className="w-8" />
        </header>
        <main className="flex-1 px-4 py-6 md:px-8 md:py-8">
          {notice && (
            <div
              role="alert"
              className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-sm border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger"
            >
              <span>Some data couldn’t be loaded: {notice.message} What you see below may be incomplete.</span>
              <button
                type="button"
                className="rounded-sm border border-danger/40 px-3 py-1 font-medium hover:bg-danger/10"
                onClick={() => {
                  setNotice(null);
                  queryClient.refetchQueries({ type: "active", predicate: (q) => q.state.status === "error" });
                }}
              >
                Retry
              </button>
            </div>
          )}
          <Outlet />
        </main>
      </div>
    </div>
  );
}
