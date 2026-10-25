import { Field, Input } from "./Field";
import { dateRangeError, todayISO } from "../../utils/dates";

/** From/To date inputs with inline validation. Returns nothing else; callers use
 * `dateRangeError(from, to)` to decide whether to run their query. */
export default function DateRangeFields({ from, to, onFromChange, onToChange, allowFuture = false }) {
  const error = dateRangeError(from, to);
  const max = allowFuture ? undefined : todayISO();
  return (
    <>
      <Field label="From" error={error}>
        <Input type="date" value={from} max={max} onChange={(e) => onFromChange(e.target.value)} error={!!error} />
      </Field>
      <Field label="To">
        <Input type="date" value={to} max={max} onChange={(e) => onToChange(e.target.value)} error={!!error} />
      </Field>
    </>
  );
}
