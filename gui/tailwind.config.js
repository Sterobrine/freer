/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: '#12151c',
          raised: '#1a1f2b',
          border: '#232936',
        },
        accent: {
          DEFAULT: '#5b8def',
          muted: '#3d5a8a',
        },
      },
    },
  },
  plugins: [],
};
