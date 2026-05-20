import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: {
          DEFAULT: "#0a192f",   // page background
          light: "#112240",     // card / panel background
          lighter: "#233554",   // hover panel
        },
        slate: {
          DEFAULT: "#8892b0",   // secondary text
          light: "#a8b2d1",     // tertiary text
          lightest: "#ccd6f6",  // primary text
        },
        accent: {
          DEFAULT: "#64ffda",   // teal highlight
          dim: "#64ffda19",     // teal at 10% opacity for hover backgrounds
        },
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-jetbrains)', 'ui-monospace', 'SFMono-Regular', 'Consolas', 'monospace'],
      },
      fontSize: {
        xxs: '0.6875rem',
      },
    },
  },
  plugins: [],
};
export default config;
