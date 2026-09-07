/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // AP brand palette
        bg: {
          primary: "#0c0d09",
          secondary: "#111210",
          surface: "#161714",
          elevated: "#1c1d19",
        },
        border: {
          DEFAULT: "#252620",
          bright: "#33342c",
        },
        text: {
          primary: "#e8e8e0",
          secondary: "#8a8b7e",
          dim: "#555649",
        },
        accent: {
          DEFAULT: "#C6F24E",
          bright: "#d4f872",
          dim: "#9abf3d",
        },
        success: "#C6F24E",
        warning: "#e8a820",
        danger: "#e04040",
      },
      fontFamily: {
        display: ["'Archivo Black'", "system-ui", "sans-serif"],
        sans: ["'Space Grotesk'", "system-ui", "sans-serif"],
        mono: ["'JetBrains Mono'", "SF Mono", "Menlo", "monospace"],
      },
    },
  },
  plugins: [],
};
