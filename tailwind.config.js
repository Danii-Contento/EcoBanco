/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "class",
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        bosque: "#14201C",
        madera: "#73441F",
        arena: "#F7EBD2",
        oro: "#E0A230",
        brillo: "#FED053",
        brote: "#4CAF50",
        canvas: "rgb(var(--eco-bg-rgb) / <alpha-value>)",
        surface: "rgb(var(--eco-surface-rgb) / <alpha-value>)",
        "surface-soft": "rgb(var(--eco-surface-soft-rgb) / <alpha-value>)",
        "earth-border": "rgb(var(--eco-border-rgb) / <alpha-value>)",
        primary: "rgb(var(--eco-primary-rgb) / <alpha-value>)",
        "primary-hover": "rgb(var(--eco-primary-hover-rgb) / <alpha-value>)",
        aji: "rgb(var(--eco-accent-rgb) / <alpha-value>)",
        "aji-hover": "rgb(var(--eco-accent-hover-rgb) / <alpha-value>)",
        sol: "rgb(var(--eco-sol-rgb) / <alpha-value>)",
        "aguayo-fucsia": "#C81D66",
        ink: "rgb(var(--eco-text-rgb) / <alpha-value>)",
        "ink-muted": "rgb(var(--eco-text-muted-rgb) / <alpha-value>)",
      },
      fontFamily: {
        brand: ['"Cooper Black"', '"Fraunces"', '"Ultra"', 'Georgia', 'serif'],
        sans: ['"Montserrat"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        'wallet-inner': 'inset 0 4px 12px 0 rgba(0, 0, 0, 0.55), inset 0 1px 2px 0 rgba(255, 255, 255, 0.06)',
        'gold-glow': '0 10px 25px -5px rgba(224, 162, 48, 0.35), 0 4px 10px -4px rgba(254, 208, 83, 0.25)',
        'green-glow': '0 10px 25px -5px rgba(76, 175, 80, 0.3)',
        'warm-card': '0 10px 28px -10px rgba(115, 68, 31, 0.14), 0 2px 6px rgba(28, 27, 26, 0.05)',
        'warm-lg': '0 18px 36px -12px rgba(115, 68, 31, 0.18), 0 4px 12px rgba(28, 27, 26, 0.06)',
      },
    },
  },
  plugins: [],
};
