import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["selector", '[data-theme="dark"]'],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: Object.fromEntries(
        [
          "canvas", "surface", "subtle", "inset", "content", "secondary", "muted", "faint",
          "line", "border", "primary", "selected", "selected-pressed",
          "success", "success-surface", "success-border",
          "warning", "warning-surface", "warning-border",
          "danger", "danger-surface", "danger-border",
          "info", "info-surface", "info-border", "action", "action-hover", "action-content",
        ].map((name) => [name, `rgb(var(--color-${name}) / <alpha-value>)`]),
      ),
      fontFamily: {
        sans: ["var(--font-sans)"],
      },
    },
  },
  plugins: [],
};

export default config;
