// @vitest-environment jsdom
import { useState } from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Modal from "../ui/Modal";
import SearchPicker from "../ui/SearchPicker";
import DataTable from "../ui/DataTable";

describe("Modal", () => {
  it("keeps focus in a field while the user types (inline onClose must not steal focus)", async () => {
    function Host() {
      const [amount, setAmount] = useState("");
      // inline arrow => new identity on every render, exactly like the real pages
      return (
        <Modal open onClose={() => {}} title="Record payment">
          <input aria-label="Amount" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Modal>
      );
    }
    const user = userEvent.setup();
    render(<Host />);
    const input = screen.getByLabelText("Amount");
    await user.type(input, "12345");
    expect(input).toHaveValue("12345");
    expect(document.activeElement).toBe(input);
  });

  it("closes on Escape using the latest handler", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<Modal open onClose={onClose} title="T">x</Modal>);
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

const SKUS = [
  { id: "1", name: "Lace Bra", code: "BR-1" },
  { id: "2", name: "Silk Slip", code: "SL-2" },
];
const text = (s) => `${s.code} — ${s.name}`;
function Picker({ initial = null, onSubmit = () => {} }) {
  const [value, setValue] = useState(initial);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(value);
      }}
    >
      <SearchPicker
        value={value}
        onChange={setValue}
        placeholder="Find SKU"
        getText={text}
        renderItem={text}
        useSearch={(q) => ({
          items: SKUS.filter((s) => text(s).toLowerCase().includes(q.toLowerCase())),
          isFetching: false,
        })}
      />
      <button type="button" onClick={() => setValue(null)}>reset</button>
      <output data-testid="value">{value ? value.code : "none"}</output>
    </form>
  );
}

describe("SearchPicker", () => {
  it("selecting then editing the text un-selects (never submits a stale SKU)", async () => {
    const user = userEvent.setup();
    render(<Picker />);
    const box = screen.getByRole("combobox");
    await user.click(box);
    await user.click(screen.getByRole("option", { name: /BR-1/ }));
    expect(screen.getByTestId("value")).toHaveTextContent("BR-1");
    await user.type(box, "x");
    expect(screen.getByTestId("value")).toHaveTextContent("none");
  });

  it("clears its text when the parent resets the value", async () => {
    const user = userEvent.setup();
    render(<Picker initial={SKUS[0]} />);
    const box = screen.getByRole("combobox");
    expect(box).toHaveValue("BR-1 — Lace Bra");
    await user.click(screen.getByText("reset"));
    expect(box).toHaveValue("");
  });

  it("is keyboard operable and Enter does not submit the surrounding form", async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(<Picker onSubmit={onSubmit} />);
    await user.click(screen.getByRole("combobox"));
    await user.keyboard("{ArrowDown}{ArrowDown}{Enter}");
    expect(screen.getByTestId("value")).toHaveTextContent("SL-2");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("offers a create option when nothing matches exactly", async () => {
    const onCreate = vi.fn();
    const user = userEvent.setup();
    function WithCreate() {
      const [v, setV] = useState(null);
      return (
        <SearchPicker
          value={v}
          onChange={setV}
          getText={(s) => s.name}
          renderItem={(s) => s.name}
          useSearch={() => ({ items: [], isFetching: false })}
          create={{ label: (q) => `Add "${q}"`, exists: () => false, onCreate }}
        />
      );
    }
    render(<WithCreate />);
    await user.type(screen.getByRole("combobox"), "Acme");
    await user.click(screen.getByRole("option", { name: /Add "Acme"/ }));
    expect(onCreate).toHaveBeenCalledWith("Acme", expect.any(Function));
  });
});

describe("DataTable", () => {
  const data = [
    { id: "a", profit: "1500.00" },
    { id: "b", profit: "-250.00" },
    { id: "c", profit: "200.00" },
    { id: "d", profit: null },
    { id: "e", profit: "-1000.00" },
  ];
  const columns = [
    { accessorKey: "id", header: "ID" },
    { accessorKey: "profit", header: "Profit" },
  ];
  const order = () => within(screen.getAllByRole("rowgroup")[1]).getAllByRole("row").map((r) => r.cells[0].textContent);

  it("sorts money strings numerically (losses first), empties last, via keyboard too", async () => {
    const user = userEvent.setup();
    render(<DataTable columns={columns} data={data} />);
    const header = screen.getByRole("columnheader", { name: /Profit/ });
    header.focus();
    await user.keyboard("{Enter}");
    expect(order()).toEqual(["e", "b", "c", "a", "d"]);
    expect(header).toHaveAttribute("aria-sort", "ascending");
  });

  it("explains when a search matches nothing", async () => {
    const user = userEvent.setup();
    render(<DataTable columns={columns} data={data} searchable searchPlaceholder="Search" />);
    await user.type(screen.getByLabelText("Search"), "zzz");
    expect(screen.getByText(/No rows match/)).toBeInTheDocument();
  });

  it("offers Load more for server-paged lists", async () => {
    const onLoadMore = vi.fn();
    const user = userEvent.setup();
    render(<DataTable columns={columns} data={data} totalCount={450} hasMore onLoadMore={onLoadMore} />);
    expect(screen.getByText("Showing 5 of 450")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Load more" }));
    expect(onLoadMore).toHaveBeenCalled();
  });
});
