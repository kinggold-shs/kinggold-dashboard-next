import tailwindcssAnimate from 'tailwindcss-animate';

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./app/**/*.{js,ts,jsx,tsx}', './components/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        background:  'var(--background)',
        foreground:  'var(--foreground)',
        card:        { DEFAULT: 'var(--card)',     foreground: 'var(--card-foreground)'     },
        popover:     { DEFAULT: 'var(--popover)',  foreground: 'var(--popover-foreground)'  },
        primary:     { DEFAULT: 'var(--primary)',  foreground: 'var(--primary-foreground)'  },
        secondary:   { DEFAULT: 'var(--secondary)',foreground: 'var(--secondary-foreground)'},
        muted:       { DEFAULT: 'var(--muted)',    foreground: 'var(--muted-foreground)'    },
        accent:      { DEFAULT: 'var(--accent)',   foreground: 'var(--accent-foreground)'   },
        destructive: { DEFAULT: 'var(--destructive)', foreground: 'var(--destructive-foreground)' },
        border: { DEFAULT: 'var(--border)', ring: 'var(--ring)' },
        input:  'var(--input)',
        ring:   { DEFAULT: 'var(--ring)', 50: 'oklch(64% 0.165 65 / 0.5)' },
        outline: { ring: 'var(--ring)', 'ring/50': 'oklch(64% 0.165 65 / 0.5)' },
        gold: {
          50: 'var(--gold-50)',   100: 'var(--gold-100)', 200: 'var(--gold-200)',
          300: 'var(--gold-300)', 400: 'var(--gold-400)', 500: 'var(--gold-500)',
          600: 'var(--gold-600)', 700: 'var(--gold-700)', 800: 'var(--gold-800)',
          900: 'var(--gold-900)',
        },
        neutral: {
          50:  'var(--neutral-50)',  100: 'var(--neutral-100)', 200: 'var(--neutral-200)',
          300: 'var(--neutral-300)', 400: 'var(--neutral-400)', 500: 'var(--neutral-500)',
          600: 'var(--neutral-600)', 700: 'var(--neutral-700)', 800: 'var(--neutral-800)',
          900: 'var(--neutral-900)', 950: 'var(--neutral-950)',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      fontFamily: {
        sans: ['var(--font-sans)', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'system-ui', 'sans-serif'],
        mono: ['ui-monospace', '"SF Mono"', '"Cascadia Code"', 'Consolas', 'monospace'],
      },
      transitionTimingFunction: {
        'expo-out':    'cubic-bezier(0.16, 1, 0.3, 1)',
        'expo-in':     'cubic-bezier(0.7, 0, 0.84, 0)',
        'expo-in-out': 'cubic-bezier(0.65, 0, 0.35, 1)',
      },
      keyframes: {
        shimmer:    { 'from': { backgroundPosition: '-400px 0' }, 'to': { backgroundPosition: '400px 0' } },
        fadeIn:     { 'from': { opacity: '0', transform: 'translateY(6px)' },  'to': { opacity: '1', transform: 'translateY(0)' }   },
        slideDown:  { 'from': { opacity: '0', transform: 'translateY(-8px)' }, 'to': { opacity: '1', transform: 'translateY(0)' }   },
        scaleIn:    { 'from': { opacity: '0', transform: 'scale(0.96)' },      'to': { opacity: '1', transform: 'scale(1)' }        },
        pulseGlow:  {
          '0%, 100%': { boxShadow: '0 0 0 0 oklch(64% 0.165 65 / 0.4)' },
          '50%':      { boxShadow: '0 0 0 8px oklch(64% 0.165 65 / 0)'  },
        },
        fadeInRow:  { 'from': { opacity: '0', transform: 'translateX(-6px)' }, 'to': { opacity: '1', transform: 'translateX(0)' }   },
        float: {
          '0%, 100%': { transform: 'translate(0, 0) scale(1)' },
          '50%':      { transform: 'translate(16px, -16px) scale(1.04)' },
        },
      },
      animation: {
        shimmer:    'shimmer 1.5s linear infinite',
        fadeIn:     'fadeIn 0.32s cubic-bezier(0.16, 1, 0.3, 1) both',
        slideDown:  'slideDown 0.22s cubic-bezier(0.16, 1, 0.3, 1) both',
        scaleIn:    'scaleIn 0.32s cubic-bezier(0.16, 1, 0.3, 1) both',
        pulseGlow:  'pulseGlow 3.5s ease-in-out infinite',
        fadeInRow:  'fadeInRow 0.3s cubic-bezier(0.16, 1, 0.3, 1) both',
        float:      'float 10s ease-in-out infinite',
      },
    },
  },
  plugins: [tailwindcssAnimate],
  corePlugins: { preflight: false },
};
