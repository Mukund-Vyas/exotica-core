import { NavLink, Outlet } from "react-router-dom";
import { useState } from "react";
import { useAuth } from "../context/AuthContext";

const NAV_SECTIONS = [
  {
    label: "Overview",
    items: [{ to: "/", label: "Dashboard", end: true }],
  },
  {
    label: "Master Data",
    items: [
      { to: "/skus", label: "SKUs" },
      { to: "/vendors", label: "Vendors" },
      { to: "/parties", label: "Parties" },
    ],
  },
  {
    label: "Daily Entry",
    items: [
      { to: "/purchases", label: "Purchases" },
      { to: "/orders", label: "Orders" },
      { to: "/orders/bulk", label: "Bulk Order Grid" },
      { to: "/returns", label: "Returns" },
    ],
  },
  {
    label: "Receivables",
    items: [
      { to: "/receivables", label: "Receivables" },
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
          isActive ? "bg-plum text-white font-medium" : "text-taupe-light hover:bg-white/5 hover:text-white"
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

  const Sidebar = (
    <nav className="flex h-full flex-col gap-6 overflow-y-auto px-4 py-6">
      <div className="flex items-center gap-3 px-1">
        <div className="ledger-rule h-7" />
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
        <button onClick={logout} className="mt-1 text-xs text-taupe-light hover:text-white underline">
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
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
            className="rounded-sm p-1.5 text-ink hover:bg-ivory"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <path d="M3 6h14M3 10h14M3 14h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
          <p className="font-display text-lg font-semibold text-ink">Exotica</p>
          <div className="w-8" />
        </header>
        <main className="flex-1 px-4 py-6 md:px-8 md:py-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
