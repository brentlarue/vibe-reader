/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'Helvetica Neue', 'Arial', 'sans-serif'],
      },
      typography: {
        DEFAULT: {
          css: {
            maxWidth: '65ch',
            color: '#24292e',
            lineHeight: '1.7',
            fontSize: '18px',
            'h1, h2, h3, h4': {
              fontWeight: '600',
              letterSpacing: '-0.02em',
            },
          },
        },
      },
    },
  },
  plugins: [],
}
