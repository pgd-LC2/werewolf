/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        gray: {
          50: '#f7f7f4',
          100: '#efefe7',
          200: '#dedfd2',
          300: '#c8cabb',
          500: '#8f9185',
          700: '#4d4f45',
          800: '#2b2d25',
          900: '#161711'
        },
        base: {
          DEFAULT: 'hsl(var(--color-base) / <alpha-value>)',
          foreground: 'hsl(var(--color-base-foreground) / <alpha-value>)'
        },
        surface: {
          DEFAULT: 'hsl(var(--color-surface) / <alpha-value>)',
          muted: 'hsl(var(--color-surface-muted) / <alpha-value>)',
          highlight: 'hsl(var(--color-surface-highlight) / <alpha-value>)'
        },
        accent: {
          DEFAULT: 'hsl(var(--color-accent) / <alpha-value>)',
          foreground: 'hsl(var(--color-accent-foreground) / <alpha-value>)'
        },
        warn: '#d64545'
      },
      fontFamily: {
        sans: ['"SF Pro Display"', 'Inter', 'HarmonyOS Sans', 'system-ui', 'sans-serif']
      },
      borderRadius: {
        pill: '999px',
        '4xl': '2.5rem',
        xl: '1.5rem',
        lg: '1rem',
        md: '0.75rem',
        sm: '0.375rem'
      },
      boxShadow: {
        soft: '0 20px 60px -35px rgba(15, 16, 12, 0.6)',
        subtle: '0 12px 30px -20px rgba(15, 16, 12, 0.4)'
      },
      backdropBlur: {
        xs: '4px'
      }
    }
  },
  plugins: []
}
