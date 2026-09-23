/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        canvas: '#F3F4FA',
        ink: '#1B2350',
        muted: '#8A90AA',
        line: '#E3E6F2',
        brand: '#6144E4',
        'brand-dark': '#4B32C3',
        success: '#22A76D',
        warning: '#F59E0B',
      },
      boxShadow: {
        card: '0 14px 40px rgba(27, 35, 80, 0.06)',
        brand: '0 8px 20px rgba(97, 68, 228, 0.28)',
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
