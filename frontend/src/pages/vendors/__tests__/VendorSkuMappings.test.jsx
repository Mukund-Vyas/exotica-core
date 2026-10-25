// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("../../../api/vendors", () => ({
  getVendor: vi.fn().mockResolvedValue({ id: "v1", name: "Vimal Textiles", is_active: true }),
}));
vi.mock("../../../api/vendorMappings", () => ({
  listVendorMappings: vi.fn(),
  createVendorMapping: vi.fn(),
  updateVendorMapping: vi.fn(),
  deleteVendorMapping: vi.fn(),
  uploadVendorMappings: vi.fn(),
  downloadVendorMappingTemplate: vi.fn(),
}));
vi.mock("../../../api/products", () => ({
  listSkus: vi.fn(),
}));

import * as mappings from "../../../api/vendorMappings";
import * as products from "../../../api/products";
import VendorSkuMappings from "../VendorSkuMappings";
import SkuPicker from "../../../components/SkuPicker";

const SKU = { id: "s1", code: "BR-1", name: "Lace Bra", category: "Bras", size_variant: "34B", current_stock_qty: 7, vendor_sku_code: "VT-2210", vendor_product_name: "Vimal Black Lace" };
const EXISTING = { id: "m1", vendor_id: "v1", vendor_name: "Vimal Textiles", sku_id: "s2", sku_code: "BR-2", sku_name: "Silk Slip", vendor_sku_code: "VT-9", vendor_product_name: "Slip" };

function renderPage(ui, path = "/vendors/v1/sku-mapping") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/vendors/:vendorId/sku-mapping" element={ui} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mappings.listVendorMappings.mockResolvedValue({ items: [EXISTING], total: 1, limit: 100, offset: 0 });
  products.listSkus.mockResolvedValue({ items: [SKU], total: 1, limit: 25, offset: 0 });
});

describe("VendorSkuMappings page", () => {
  it("shows the vendor and its existing mappings", async () => {
    renderPage(<VendorSkuMappings />);
    expect(await screen.findByRole("heading", { name: /Vimal Textiles — SKU mapping/ })).toBeInTheDocument();
    expect(await screen.findByText("VT-9")).toBeInTheDocument();
    expect(screen.getByText("BR-2")).toBeInTheDocument();
  });

  it("adds a mapping with the vendor code and the chosen Exotica SKU", async () => {
    mappings.createVendorMapping.mockResolvedValue({ ...EXISTING, vendor_sku_code: "VT-2210", sku_code: "BR-1" });
    const user = userEvent.setup();
    renderPage(<VendorSkuMappings />);
    await screen.findByText("VT-9");
    await user.type(screen.getByPlaceholderText(/VT-2210-BLK-34B/), "  VT-2210  ");
    await user.click(screen.getByRole("combobox", { name: /Search SKU/ }));
    await user.click(await screen.findByRole("option", { name: /BR-1/ }));
    await user.click(screen.getByRole("button", { name: "Add mapping" }));
    await waitFor(() => expect(mappings.createVendorMapping).toHaveBeenCalled());
    expect(mappings.createVendorMapping.mock.calls[0][0]).toEqual({
      vendor_id: "v1",
      sku_id: "s1",
      vendor_sku_code: "VT-2210",
      vendor_product_name: null,
    });
    expect(await screen.findByText(/Added VT-2210 → BR-1/)).toBeInTheDocument();
  });

  it("refuses to submit without a SKU and shows the server's duplicate message", async () => {
    const user = userEvent.setup();
    renderPage(<VendorSkuMappings />);
    await screen.findByText("VT-9");
    await user.type(screen.getByPlaceholderText(/VT-2210-BLK-34B/), "VT-9");
    await user.click(screen.getByRole("button", { name: "Add mapping" }));
    expect(await screen.findByText(/Choose the Exotica SKU/)).toBeInTheDocument();
    expect(mappings.createVendorMapping).not.toHaveBeenCalled();

    mappings.createVendorMapping.mockRejectedValue({
      response: { status: 409, data: { code: "duplicate_vendor_sku_code", detail: "Vimal Textiles's code 'VT-9' is already mapped to BR-2." } },
    });
    await user.click(screen.getByRole("combobox", { name: /Search SKU/ }));
    await user.click(await screen.findByRole("option", { name: /BR-1/ }));
    await user.click(screen.getByRole("button", { name: "Add mapping" }));
    expect(await screen.findByText(/already mapped to BR-2/)).toBeInTheDocument();
  });

  it("confirms before removing and calls delete", async () => {
    mappings.deleteVendorMapping.mockResolvedValue();
    const user = userEvent.setup();
    renderPage(<VendorSkuMappings />);
    await user.click(await screen.findByRole("button", { name: "Remove" }));
    expect(screen.getByText(/Past purchases keep the code/)).toBeInTheDocument();
    expect(mappings.deleteVendorMapping).not.toHaveBeenCalled();
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(mappings.deleteVendorMapping).toHaveBeenCalledWith("m1"));
  });

  it("reports per-row CSV problems", async () => {
    mappings.uploadVendorMappings.mockResolvedValue({
      created_count: 2,
      failed_count: 1,
      errors: [{ row_number: 3, vendor_sku_code: "VT-5", error_code: "sku_not_found", detail: "No Exotica SKU with code 'NOPE'" }],
    });
    const user = userEvent.setup();
    renderPage(<VendorSkuMappings />);
    await screen.findByText("VT-9");
    await user.upload(screen.getByLabelText("CSV file to import"), new File(["x"], "m.csv", { type: "text/csv" }));
    await user.click(screen.getByRole("button", { name: "Import" }));
    expect(await screen.findByText("2 added")).toBeInTheDocument();
    expect(screen.getByText(/Row 3/)).toBeInTheDocument();
    expect(screen.getByText(/No Exotica SKU with code 'NOPE'/)).toBeInTheDocument();
    expect(mappings.uploadVendorMappings).toHaveBeenCalledWith("v1", expect.any(File));
  });
});

describe("SkuPicker with a vendor", () => {
  function renderPicker(vendorId) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
      <QueryClientProvider client={client}>
        <SkuPicker value={null} onChange={() => {}} vendorId={vendorId} />
      </QueryClientProvider>
    );
  }

  it("searches by vendor and shows the vendor's code", async () => {
    const user = userEvent.setup();
    renderPicker("v1");
    await user.click(screen.getByRole("combobox"));
    expect(await screen.findByText("VT-2210")).toBeInTheDocument();
    expect(products.listSkus).toHaveBeenCalledWith(expect.objectContaining({ vendorId: "v1" }));
  });

  it("does not mention vendor codes when no vendor is chosen", async () => {
    const user = userEvent.setup();
    renderPicker(undefined);
    await user.click(screen.getByRole("combobox"));
    await screen.findByRole("option", { name: /BR-1/ });
    expect(screen.queryByText(/Vendor code/)).toBeNull();
  });
});
