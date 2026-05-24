/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        orbitron: ['Orbitron', 'sans-serif'],
        inter: ['Inter', 'sans-serif'],
      },
      colors: {
        axia: {
          50:  '#F5FAFD',
          100: '#EAF4FA',
          200: '#D0E9F5',
          300: '#ADD8F0',
          400: '#8BC5DE',
          500: '#6AAFC8',
          600: '#4E96AF',
          700: '#3A7A90',
          800: '#2B5E70',
          900: '#1E4454',
        },
      },
      animation: {
        'pulse-slow':   'pulse 2.5s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'spin-slow':    'spin 3s linear infinite',
        'fade-in':      'fadeIn 0.6s ease-out both',
        'slide-up':     'slideUp 0.5s ease-out both',
        'loading-bar':  'loadingBar 1.8s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: {
          from: { opacity: '0' },
          to:   { opacity: '1' },
        },
        slideUp: {
          from: { opacity: '0', transform: 'translateY(20px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
        loadingBar: {
          '0%':   { width: '0%',   marginLeft: '0%' },
          '50%':  { width: '60%',  marginLeft: '20%' },
          '100%': { width: '0%',   marginLeft: '100%' },
        },
      },
    },
  },
  plugins: [],
}
