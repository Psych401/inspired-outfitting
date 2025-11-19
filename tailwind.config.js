/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        'soft-blush': '#F8E8E8',
        'warm-cream': '#FFF9F5',
        'dusty-rose': '#E4A4A0',
        'gold-beige': '#DCC7A1',
        'charcoal-grey': '#4B4B4B',
      },
      fontFamily: {
        'sans': ['Inter', 'sans-serif'],
        'heading': ['Poppins', 'sans-serif'],
        'accent': ['Playfair Display', 'serif'],
      }
    },
  },
  plugins: [],
};

