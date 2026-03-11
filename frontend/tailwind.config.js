/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Poppins', 'sans-serif'],
      },
      colors: {
        'brand-dark': '#0f0928',
        'brand-teal': '#00e5ff',
        'brand-purple': '#a855f7',
        'brand-pink': '#ec4899',
      }
    },
  },
  plugins: [],
};
