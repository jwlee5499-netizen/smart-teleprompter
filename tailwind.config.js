/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        prompter: {
          dark: '#0a0a0c',
          card: '#141418',
          accent: '#3b82f6',
          highlight: '#eab308',
        }
      }
    },
  },
  plugins: [],
}
