/** @type {import('tailwindcss').Config} */
export default {
    content: [
      "./index.html",
      "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
      extend: {
        colors: {
          brand: {
            50: '#e8f2ec',
            100: '#d0e5d8',
            200: '#a3cbb3',
            300: '#76b18e',
            600: '#1a3d2b',
            700: '#122b1e',
          }
        }
      },
    },
    plugins: [],
  }