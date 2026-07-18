import { Link, useNavigate } from "react-router-dom";
import Button from "../components/ui/Button";

export default function NotFound() {
  const navigate = useNavigate();

  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-4 py-16 text-center">
      <img
        src="/logo-mark.png"
        alt="Exotica Lingerie"
        className="mb-6 h-20 w-20 opacity-90 md:h-24 md:w-24"
      />

      <p className="font-display text-6xl font-semibold text-brand md:text-7xl">404</p>
      <h1 className="mt-3 font-display text-xl font-semibold text-ink md:text-2xl">
        This page doesn't exist
      </h1>
      <p className="mt-2 max-w-sm text-sm text-taupe">
        The page you're looking for may have been moved, renamed, or never existed. Check the
        address or head back to your dashboard.
      </p>

      <div className="mt-7 flex items-center gap-3">
        <Button variant="secondary" onClick={() => navigate(-1)}>
          Go back
        </Button>
        <Link to="/">
          <Button variant="primary">Go to dashboard</Button>
        </Link>
      </div>
    </div>
  );
}
