/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Untrace brand palette — matched from web app
        bg: {
          primary: "#0a0a0f",
          secondary: "#0d0d14",
          surface: "#111119",
          elevated: "#16161f",
        },
        border: {
          DEFAULT: "#1a1a28",
          bright: "#252538",
        },
        text: {
          primary: "#e0e0ec",
          secondary: "#6b6b80",
          dim: "#3a3a50",
        },
        accent: {
          DEFAULT: "#00d4aa",
          bright: "#00f0c0",
        },
        success: "#00d4aa",
        warning: "#e8a820",
        danger: "#e04040",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "SF Mono", "Menlo", "monospace"],
      },
    },
  },
  plugins: [],
};
