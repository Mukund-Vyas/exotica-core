import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Card } from "../components/ui/Surfaces";
import { Field, Input } from "../components/ui/Field";
import Button from "../components/ui/Button";
import { ErrorBanner } from "../components/ui/Surfaces";
import { getErrorInfo } from "../utils/errorCodes";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await login(username, password);
      navigate("/", { replace: true });
    } catch (err) {
      const info = getErrorInfo(err);
      setError(err?.response?.status === 401 ? "Incorrect username or password." : info.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <h1 className="mb-1 font-display text-xl font-semibold text-ink">Log in</h1>
      <p className="mb-5 text-sm text-taupe">Access your Exotica business data securely.</p>
      <ErrorBanner message={error} />
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Field label="Username" required>
          <Input
            autoFocus
            required
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
          />
        </Field>
        <Field label="Password" required>
          <Input
            required
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
        </Field>
        <Button type="submit" disabled={submitting} className="mt-2 w-full">
          {submitting ? "Logging in…" : "Log in"}
        </Button>
      </form>
    </Card>
  );
}
