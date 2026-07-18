const VARIANTS = {
  primary: "bg-brand text-white hover:bg-brand-dark disabled:bg-taupe-light disabled:text-taupe",
  secondary: "bg-white text-ink border border-taupe-light hover:bg-brand-50 disabled:opacity-50",
  danger: "bg-danger text-white hover:opacity-90 disabled:opacity-50",
  ghost: "bg-transparent text-brand hover:bg-brand-50 disabled:opacity-50",
};

const SIZES = {
  sm: "text-sm px-3 py-1.5",
  md: "text-sm px-4 py-2",
  lg: "text-base px-5 py-2.5",
};

export default function Button({
  variant = "primary",
  size = "md",
  className = "",
  children,
  ...props
}) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors disabled:cursor-not-allowed ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
