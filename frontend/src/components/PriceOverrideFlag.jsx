import { Badge } from "./ui/Surfaces";

export default function PriceOverrideFlag() {
  return (
    <Badge tone="plum" title="Selling price was manually overridden for this line">
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
        <path d="M1 6l2.5 2.5L9 2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      Overridden
    </Badge>
  );
}
