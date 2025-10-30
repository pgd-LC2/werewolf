/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        gray: {
          50: '#f8f9fa',
          100: '#e9ecef',
          200: '#dee2e6',
          300: '#ced4da',
          500: '#6c757d',
          700: '#495057',
          800: '#343a40',
          900: '#212529'
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
        night: 'hsl(var(--color-night) / <alpha-value>)',
        day: 'hsl(var(--color-day) / <alpha-value>)',
        blood: '#dc2626',
        moon: '#818cf8',
        wolf: '#7c3aed',
        warn: '#dc2626'
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
