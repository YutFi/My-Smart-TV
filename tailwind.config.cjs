/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{html,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: { 950: 'var(--ink95)', 900: 'var(--ink9)', 800: 'var(--ink8)', 700: 'var(--ink7)', 600: 'var(--ink6)' },
        accent: { purple: 'rgb(var(--ap) / <alpha-value>)', blue: 'rgb(var(--ab) / <alpha-value>)', cyan: 'rgb(var(--ac) / <alpha-value>)', pink: '#ec4899' },
      },
      fontFamily: { sans: ['"Segoe UI Variable Display"', '"Segoe UI"', 'Inter', 'system-ui', 'sans-serif'] },
    },
  },
  plugins: [],
};