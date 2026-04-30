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
        /** Boutique homepage palette (exact brand tokens). */
        'boutique-ivory': '#FFF9F4',
        'boutique-blush': '#F3D6D8',
        'boutique-rose': '#C98F94',
        'boutique-cocoa': '#5C4642',
        'boutique-champagne': '#D9B98F',
      },
      keyframes: {
        'float-soft': {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-10px)' },
        },
        'float-soft-alt': {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-7px)' },
        },
      },
      animation: {
        'float-soft': 'float-soft 5.5s ease-in-out infinite',
        'float-soft-delay': 'float-soft 5.5s ease-in-out 1.8s infinite',
        'float-soft-alt': 'float-soft-alt 6s ease-in-out 0.8s infinite',
      },
      boxShadow: {
        'boutique': '0 28px 70px -18px rgba(92, 70, 66, 0.22)',
        'boutique-rose': '0 22px 55px -14px rgba(201, 143, 148, 0.38)',
        'boutique-inner': 'inset 0 2px 16px rgba(243, 214, 216, 0.45)',
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

