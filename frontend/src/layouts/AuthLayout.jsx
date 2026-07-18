export default function AuthLayout({ children }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-ink px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <img src="/logo-mark.png" alt="Exotica Lingerie" className="h-16 w-16" />
          <div>
            <p className="font-display text-2xl font-semibold text-white">Exotica</p>
            <p className="text-xs uppercase tracking-wide text-taupe-light">Inventory &amp; Profitability</p>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}
