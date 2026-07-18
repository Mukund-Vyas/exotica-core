import { forwardRef } from "react";

export function Field({ label, error, hint, required, children, className = "" }) {
  return (
    <label className={`block ${className}`}>
      {label && (
        <span className="mb-1 block text-sm font-medium text-ink">
          {label}
          {required && <span className="text-danger"> *</span>}
        </span>
      )}
      {children}
      {hint && !error && <span className="mt-1 block text-xs text-taupe">{hint}</span>}
      {error && (
        <span className="mt-1 flex items-center gap-1 text-xs text-danger" role="alert">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
            <circle cx="6" cy="6" r="5.5" stroke="currentColor" />
            <path d="M6 3.5v3M6 8.2v.1" stroke="currentColor" strokeLinecap="round" />
          </svg>
          {error}
        </span>
      )}
    </label>
  );
}

const baseInput =
  "w-full rounded-sm border bg-white px-3 py-2 text-sm text-ink placeholder:text-taupe focus:outline-none focus:ring-2 focus:ring-brand/40 disabled:bg-ivory disabled:text-taupe";

export const Input = forwardRef(function Input({ error, className = "", ...props }, ref) {
  return (
    <input
      ref={ref}
      className={`${baseInput} ${error ? "border-danger" : "border-taupe-light"} ${className}`}
      {...props}
    />
  );
});

export const Select = forwardRef(function Select({ error, className = "", children, ...props }, ref) {
  return (
    <select
      ref={ref}
      className={`${baseInput} ${error ? "border-danger" : "border-taupe-light"} ${className}`}
      {...props}
    >
      {children}
    </select>
  );
});

export function Textarea({ error, className = "", ...props }) {
  return (
    <textarea
      className={`${baseInput} ${error ? "border-danger" : "border-taupe-light"} ${className}`}
      {...props}
    />
  );
}

export function Checkbox({ label, className = "", ...props }) {
  return (
    <label className={`flex items-center gap-2 text-sm text-ink ${className}`}>
      <input type="checkbox" className="h-4 w-4 rounded border-taupe-light text-brand focus:ring-brand/40" {...props} />
      {label}
    </label>
  );
}
