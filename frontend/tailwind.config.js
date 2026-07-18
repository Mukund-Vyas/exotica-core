/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#1C1523",
        brand: {
          DEFAULT: "#A80E58",
          light: "#FF197D",
          dark: "#7A0A40",
          50: "#FDECF3",
        },
        ivory: "#FAF7F4",
        taupe: {
          DEFAULT: "#8A7E88",
          light: "#D9D2D6",
          dark: "#5C5260",
        },
        gold: "#C08A3E",
        success: { DEFAULT: "#1F7A5C", bg: "#E7F3EE" },
        danger: { DEFAULT: "#B23A48", bg: "#FBEAEC" },
        warning: { DEFAULT: "#B8792A", bg: "#FBF1E2" },
      },
      fontFamily: {
        display: ["Fraunces", "Georgia", "serif"],
        sans: ["Inter", "system-ui", "sans-serif"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(28,21,35,0.06), 0 1px 12px rgba(28,21,35,0.04)",
      },
      borderRadius: {
        sm: "4px",
        md: "8px",
      },
    },
  },
  plugins: [],
};
