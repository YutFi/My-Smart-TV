/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{html,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: { 950: '#05060d', 900: '#080a16', 800: '#0c1024', 700: '#131938', 600: '#1b2250' },
        accent: { purple: '#8b5cf6', blue: '#3b82f6', cyan: '#22d3ee', pink: '#ec4899' },
      },
      fontFamily: { sans: ['"Segoe UI Variable Display"', '"Segoe UI"', 'Inter', 'system-ui', 'sans-serif'] },
    },
  },
  plugins: [],
};
