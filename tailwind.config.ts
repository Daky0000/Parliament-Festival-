import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        parliament: {
          navy: "#102343",
          deepNavy: "#0A1830",
          gold: "#C6A65B",
          goldLight: "#DFCA95",
          goldDark: "#9A7E38",
          ivory: "#F7F5F0",
          ivoryDark: "#EFECE4",
          surface: "#FFFFFF",
          textPrimary: "#202A38",
          textSecondary: "#667085",
          border: "#E4E7EC",
          success: "#18794E",
          warning: "#A66A12",
          danger: "#B42318",
        },
        protocol: {
          blue: "#102343",
          gold: "#C6A65B",
          green: "#18794E",
          purple: "#6B21A8",
          orange: "#EA580C",
        },
      },
      fontFamily: {
        serif: ["Georgia", "Cambria", "Times New Roman", "serif"],
        sans: ["Inter", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "Roboto", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
