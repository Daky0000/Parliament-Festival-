import type { Config } from "tailwindcss";

// Colours, type and radii follow the landing-page design system
// (cloudflare-pages-portal/assets/brand.css). The `parliament` key names are
// kept so existing class names keep working; their values are the new tokens.
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
          navy: "#091833",
          deepNavy: "#091833",
          gold: "#2563EB",
          goldLight: "#8FB2FF",
          goldDark: "#1D4ED8",
          ivory: "#ECEEF1",
          ivoryDark: "#F6F7F9",
          surface: "#FFFFFF",
          textPrimary: "#0D1526",
          textSecondary: "#5B6374",
          border: "#E3E6EB",
          success: "#3F6212",
          warning: "#A66A12",
          danger: "#B42318",
        },
        brand: {
          navy: "#091833",
          ink: "#0D1526",
          blue: "#2563EB",
          blueDark: "#1D4ED8",
          blueLight: "#8FB2FF",
          pale: "#EAF1FF",
          canvas: "#ECEEF1",
          soft: "#F6F7F9",
          line: "#E3E6EB",
          line2: "#D2D7DF",
          muted: "#5B6374",
          faint: "#8A91A0",
          positive: "#3F6212",
          positiveBg: "#EEF6DC",
          danger: "#B42318",
          dangerBg: "#FDECEA",
        },
        protocol: {
          blue: "#091833",
          gold: "#2563EB",
          green: "#3F6212",
          purple: "#1D4ED8",
          orange: "#A66A12",
        },
      },
      // Four radii and no more: control 10, card 14, panel 22, round.
      borderRadius: {
        DEFAULT: "10px",
        sm: "10px",
        md: "10px",
        lg: "14px",
        xl: "14px",
        "2xl": "22px",
        "3xl": "22px",
      },
      fontFamily: {
        serif: ["Outfit", "Segoe UI", "system-ui", "sans-serif"],
        sans: ["Outfit", "Segoe UI", "system-ui", "-apple-system", "sans-serif"],
      },
      boxShadow: {
        float: "0 20px 40px -20px rgba(13,21,38,.4)",
      },
    },
  },
  plugins: [],
};

export default config;
