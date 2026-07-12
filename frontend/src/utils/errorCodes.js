export const ERROR_MESSAGES = {
  insufficient_stock: "Not enough stock for this SKU.",
  price_not_set: "No channel price is set for this SKU yet. Set one in Settings before continuing.",
  over_return: "Return quantity exceeds what was sold on this order.",
  overpayment: "Payment exceeds the outstanding receivable amount.",
  due_date_required: "Due date is required for credit orders.",
  party_required: "Select or add a party for this credit order.",
  duplicate_party_name: "A party with this name already exists — select it instead of adding a new one.",
  duplicate_vendor_name: "A vendor with this name already exists — select it instead of adding a new one.",
  duplicate_sku_code: "A SKU with this code already exists.",
  permission_denied: "You don't have permission to do this.",
  not_found: "This item couldn't be found — it may have been removed.",
  validation_error: "Please check the highlighted fields.",
  conflict: "This couldn't be completed due to a conflict with existing data.",
  http_error: "Something went wrong with that request.",
  internal_error: "An unexpected error occurred. Please try again.",
};

// Every error from this API arrives as { code, detail }. Use this to turn
// that into a message worth showing someone, without reimplementing the
// mapping in every form.
export function getErrorInfo(error) {
  const code = error?.response?.data?.code;
  const detail = error?.response?.data?.detail;
  const status = error?.response?.status;
  return {
    code: code || "unknown",
    message: (code && ERROR_MESSAGES[code]) || detail || "Something went wrong.",
    detail,
    status,
  };
}
