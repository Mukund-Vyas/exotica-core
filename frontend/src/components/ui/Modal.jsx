import { useEffect, useRef } from "react";

export default function Modal({ open, onClose, title, children, footer, width = "max-w-md" }) {
  const ref = useRef(null);
  // Callers pass an inline `onClose={() => ...}` — a brand-new function on every
  // render. If the effect depended on it, every keystroke in a field inside the
  // dialog would re-run the effect and pull focus back to the dialog container,
  // so you could only type one character at a time. Keep the latest handler in a
  // ref and make the effect depend on `open` alone.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!open) return undefined;
    const previouslyFocused = document.activeElement;
    const onKey = (e) => e.key === "Escape" && onCloseRef.current?.();
    document.addEventListener("keydown", onKey);
    // Focus the first form control if there is one, otherwise the dialog itself.
    const firstField = ref.current?.querySelector("input, select, textarea");
    (firstField || ref.current)?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      previouslyFocused?.focus?.(); // hand focus back to what opened the dialog
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 px-4 py-6"
      role="presentation"
      onClick={onClose}
    >
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`flex max-h-full w-full ${width} flex-col rounded-md bg-white shadow-card`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-taupe-light px-5 py-3">
          <h3 className="font-display text-lg font-semibold text-ink">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-sm p-1 text-taupe hover:bg-ivory hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-taupe-light px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}
