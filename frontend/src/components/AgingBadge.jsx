import { Badge } from "./ui/Surfaces";

const BUCKET_TONE = {
  "Not Due": "success",
  "1-30 Days": "warning",
  "31-60 Days": "warning",
  "60+ Days": "danger",
};

// Reused on both the Receivables List and the Aging Report so "60+ days
// overdue" always carries the same shade of urgency everywhere it appears.
// Always pairs color with the bucket's own text label — never color alone.
export default function AgingBadge({ bucket }) {
  return <Badge tone={BUCKET_TONE[bucket] || "neutral"}>{bucket}</Badge>;
}
