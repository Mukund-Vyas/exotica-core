import { useEffect, useId, useRef, useState } from "react";
import { Input } from "./Field";

/**
 * Generic type-ahead picker. SkuPicker / PartyPicker / VendorPicker wrap this.
 *
 * Behaviour that matters for data integrity:
 *  - Editing the text after choosing an item CLEARS the selection. (Previously the
 *    box could show "Lace Bra" while the form still held the old SKU, so the
 *    wrong product could be logged.)
 *  - When the parent resets `value` to null the text clears too.
 *  - Fully keyboard-operable: ↓/↑ move, Enter picks, Esc closes.
 *
 * Props
 *   value, onChange(item|null)
 *   useSearch(query) -> { items, isFetching }
 *   getText(item)    -> string shown in the box once selected
 *   renderItem(item) -> node for each option
 *   emptyText        -> shown when there are no results
 *   create           -> optional { label(query), isPending, onCreate(query), exists(items, query), error }
 */
export default function SearchPicker({
  value,
  onChange,
  useSearch,
  getText,
  renderItem,
  placeholder,
  emptyText = "No matches.",
  autoFocus,
  create,
  ariaLabel,
}) {
  const listId = useId();
  const [text, setText] = useState(value ? getText(value) : "");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const boxRef = useRef(null);
  const selectedText = useRef(value ? getText(value) : "");
  // With an item chosen, list everything rather than searching for its own label.
  const { items, isFetching } = useSearch(value && text === getText(value) ? "" : text);

  // Keep the visible text in step with `value` when the parent changes it.
  useEffect(() => {
    if (value) {
      const t = getText(value);
      selectedText.current = t;
      setText(t);
    } else if (selectedText.current) {
      // Capture first: the updater below runs later, after the ref is cleared.
      const previous = selectedText.current;
      selectedText.current = "";
      setText((current) => (current === previous ? "" : current));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  useEffect(() => {
    function onClickOutside(e) {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const trimmed = text.trim();
  const showCreate = !!create && !!trimmed && !isFetching && !create.exists(items, trimmed);
  const optionCount = items.length + (showCreate ? 1 : 0);

  function choose(item) {
    selectedText.current = getText(item);
    onChange?.(item);
    setText(getText(item));
    setOpen(false);
    setActive(-1);
  }

  function onKeyDown(e) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setOpen(true);
      if (optionCount === 0) return;
      const delta = e.key === "ArrowDown" ? 1 : -1;
      setActive((i) => (i + delta + optionCount) % optionCount);
    } else if (e.key === "Enter" && open) {
      // Inside a form, Enter would otherwise submit it with nothing chosen.
      e.preventDefault();
      if (active >= 0 && active < items.length) choose(items[active]);
      else if (active === items.length && showCreate) create.onCreate(trimmed, choose);
      else if (items.length === 1 && !showCreate) choose(items[0]);
    } else if (e.key === "Escape" && open) {
      e.stopPropagation();
      setOpen(false);
    }
  }

  return (
    <div className="relative" ref={boxRef}>
      <Input
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
        aria-label={ariaLabel || placeholder}
        autoComplete="off"
        autoFocus={autoFocus}
        value={text}
        placeholder={placeholder}
        onKeyDown={onKeyDown}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          const next = e.target.value;
          setText(next);
          setOpen(true);
          setActive(-1);
          // Typing something different from the chosen item un-chooses it.
          if (value && next !== getText(value)) onChange?.(null);
          if (!next) onChange?.(null);
        }}
      />
      {create?.error && <p className="mt-1 text-xs text-danger">{create.error}</p>}
      {open && (
        <div
          id={listId}
          role="listbox"
          className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-sm border border-taupe-light bg-white shadow-card"
        >
          {isFetching && items.length === 0 && <div className="px-3 py-2 text-sm text-taupe">Searching…</div>}
          {!isFetching && items.length === 0 && !showCreate && (
            <div className="px-3 py-2 text-sm text-taupe">{emptyText}</div>
          )}
          {items.map((item, i) => (
            <button
              type="button"
              role="option"
              aria-selected={i === active}
              id={`${listId}-${i}`}
              key={item.id}
              className={`block w-full px-3 py-2 text-left text-sm hover:bg-brand-50 ${i === active ? "bg-brand-50" : ""}`}
              onMouseDown={(e) => e.preventDefault() /* keep focus in the input */}
              onClick={() => choose(item)}
            >
              {renderItem(item)}
            </button>
          ))}
          {showCreate && (
            <button
              type="button"
              role="option"
              aria-selected={active === items.length}
              id={`${listId}-${items.length}`}
              disabled={create.isPending}
              className={`flex w-full items-center gap-1.5 border-t border-taupe-light px-3 py-2 text-left text-sm text-brand hover:bg-brand-50 disabled:opacity-60 ${
                active === items.length ? "bg-brand-50" : ""
              }`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => create.onCreate(trimmed, choose)}
            >
              <span aria-hidden="true">+</span>
              {create.isPending ? "Adding…" : create.label(trimmed)}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
