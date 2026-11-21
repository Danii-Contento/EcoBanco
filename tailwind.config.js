/** @type {import('tailwindcss').Config} */
module.exports = {
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
      },
      fontFamily: {
        brand: ['"Cooper Black"', '"Fraunces"', '"Ultra"', 'Georgia', 'serif'],
        sans: ['"Montserrat"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        'wallet-inner': 'inset 0 4px 12px 0 rgba(0, 0, 0, 0.55), inset 0 1px 2px 0 rgba(255, 255, 255, 0.06)',
        'gold-glow': '0 10px 25px -5px rgba(224, 162, 48, 0.35), 0 4px 10px -4px rgba(254, 208, 83, 0.25)',
        'green-glow': '0 10px 25px -5px rgba(76, 175, 80, 0.3)',
      },
    },
  },
  plugins: [],
};
