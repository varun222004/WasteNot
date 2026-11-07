/** @type {import('tailwindcss').Config} */
module.exports = {
  blocklist: ["overline"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        soft: "#E8E9DF",
        cream: "#F7F4EC",
        olive: { DEFAULT: "#2E3D28", 700: "#3B4D33", 900: "#222D1D" },
        sage: { DEFAULT: "#A9B887", 100: "#EEF1E4" },
        amber: { DEFAULT: "#E39B2D", 100: "#FBEBD2" },
        walnut: "#5A3E2B",
        danger: { DEFAULT: "#B3412E", 100: "#F6E1DC" },
        ink: "#282923",
        muted: "#77786E",
        line: "#E5E0D5",
      },
      fontFamily: {
        display: ["Fraunces", "Georgia", "serif"],
        sans: ["Inter", "system-ui", "sans-serif"],
      },
      borderRadius: { xl2: "1.25rem", xl3: "1.75rem" },
      keyframes: {
        rise: { from: { opacity: "0", transform: "translateY(10px)" }, to: { opacity: "1", transform: "none" } },
        shimmer: { "0%": { backgroundPosition: "-400px 0" }, "100%": { backgroundPosition: "400px 0" } },
      },
      animation: { rise: "rise .5s ease-out both", shimmer: "shimmer 1.4s linear infinite" },
    },
  },
  plugins: [],
};
