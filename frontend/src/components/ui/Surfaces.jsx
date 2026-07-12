export function Card({ title, action, children, className = "" }) {
  return (
    <div className={`rounded-md border border-taupe-light bg-white shadow-card ${className}`}>
      {(title || action) && (
        <div className="flex items-center justify-between border-b border-taupe-light px-5 py-3">
          {title && <h3 className="font-display text-lg font-semibold text-ink">{title}</h3>}
          {action}
        </div>
      )}
      <div className="p-5">{children}</div>
    </div>
  );
}

const BADGE_TONES = {
  neutral: "bg-taupe-light text-ink",
  success: "bg-success-bg text-success",
  danger: "bg-danger-bg text-danger",
  warning: "bg-warning-bg text-warning",
  plum: "bg-plum-50 text-plum-dark",
};

export function Badge({ tone = "neutral", icon, children, className = "" }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-sm px-2 py-0.5 text-xs font-medium ${BADGE_TONES[tone]} ${className}`}
    >
      {icon}
      {children}
    </span>
  );
}

export function Loader({ label = "Loading…" }) {
  return (
    <div className="flex items-center justify-center gap-2 py-12 text-sm text-taupe" role="status">
      <svg className="h-4 w-4 animate-spin text-plum" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
      </svg>
      {label}
    </div>
  );
}

export function EmptyState({ title, message, action }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-14 text-center">
      <div className="mb-1 h-10 w-10 rounded-full bg-plum-50 flex items-center justify-center">
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
          <rect x="2" y="4" width="14" height="10" rx="1.5" stroke="#6B2D5C" strokeWidth="1.4" />
          <path d="M2 7h14" stroke="#6B2D5C" strokeWidth="1.4" />
        </svg>
      </div>
      <p className="font-display text-base font-semibold text-ink">{title}</p>
      {message && <p className="max-w-sm text-sm text-taupe">{message}</p>}
      {action}
    </div>
  );
}

export function ErrorBanner({ message }) {
  if (!message) return null;
  return (
    <div className="mb-4 flex items-start gap-2 rounded-sm border border-danger/30 bg-danger-bg px-4 py-3 text-sm text-danger" role="alert">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="mt-0.5 shrink-0" aria-hidden="true">
        <circle cx="8" cy="8" r="7" stroke="currentColor" />
        <path d="M8 4.5v4M8 11v.1" stroke="currentColor" strokeLinecap="round" />
      </svg>
      <span>{message}</span>
    </div>
  );
}
