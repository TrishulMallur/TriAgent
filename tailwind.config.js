/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // TriAgent editorial palette — OKLCH-tuned, warm-tinted neutrals.
        // Token names retained (ws-*) so the rest of the app inherits the
        // upgrade without a 46-file rename. The values are the design.
        ws: {
          // Ink: near-black with a quiet blue undertone. Single accent, used
          // for primary action, current state, and emphasis. Not "the blue."
          accent:        'oklch(0.32 0.04 265)',
          'accent-light':'oklch(0.45 0.05 265)',
          'accent-dark': 'oklch(0.22 0.04 265)',

          // Type colors. ws-black is the highest-contrast text (never #000).
          // ws-dark is body. ws-muted is secondary/captions. ws-faint is
          // tertiary metadata. All carry the same warm hue family.
          black:         'oklch(0.22 0.008 75)',
          dark:          'oklch(0.36 0.008 75)',
          muted:         'oklch(0.58 0.008 75)',
          faint:         'oklch(0.72 0.008 75)',

          // Surfaces. Paper is the page; surface is panels and modals; sunken
          // is for inputs and well-treatments. Border is a hair under
          // ws-faint, hairline-thin in practice.
          paper:         'oklch(0.985 0.004 75)',
          light:         'oklch(0.975 0.004 75)',
          surface:       'oklch(1.000 0 0)',
          sunken:        'oklch(0.965 0.004 75)',
          border:        'oklch(0.915 0.006 75)',
          'border-strong':'oklch(0.84 0.008 75)',
        },
        // Verdict colors are tuned to sit on the warm surface without
        // shouting. Saturation is restrained; legibility is the bar.
        verdict: {
          pass:         'oklch(0.46 0.10 155)',
          'pass-bg':    'oklch(0.965 0.020 155)',
          review:       'oklch(0.55 0.13 65)',
          'review-bg':  'oklch(0.965 0.030 75)',
          fail:         'oklch(0.50 0.16 25)',
          'fail-bg':    'oklch(0.965 0.025 25)',
        },
        confidence: {
          high:         'oklch(0.46 0.10 155)',
          medium:       'oklch(0.55 0.13 65)',
          low:          'oklch(0.50 0.16 25)',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem', letterSpacing: '0.02em' }],
        'eyebrow': ['0.6875rem', { lineHeight: '1rem', letterSpacing: '0.12em' }],
        'display': ['2.5rem',   { lineHeight: '1.05', letterSpacing: '-0.025em' }],
        'display-lg': ['3.5rem',{ lineHeight: '1.02', letterSpacing: '-0.03em' }],
      },
      letterSpacing: {
        'tightest': '-0.03em',
        'caps':     '0.12em',
      },
      borderRadius: {
        'xs': '0.25rem',
      },
      boxShadow: {
        // Tinted, almost-imperceptible elevation. Real depth comes from
        // border + a hair of color shift, not a stack of grey shadows.
        'ws':       '0 1px 0 0 oklch(0.92 0.006 75 / 0.6), 0 1px 2px -1px oklch(0.30 0.008 75 / 0.06)',
        'ws-md':    '0 1px 0 0 oklch(0.92 0.006 75 / 0.7), 0 6px 16px -6px oklch(0.30 0.008 75 / 0.08)',
        'ws-lg':    '0 1px 0 0 oklch(0.92 0.006 75 / 0.7), 0 18px 40px -16px oklch(0.30 0.008 75 / 0.14)',
        'ws-focus': '0 0 0 3px oklch(0.32 0.04 265 / 0.12)',
      },
      transitionTimingFunction: {
        'out-quart': 'cubic-bezier(0.25, 1, 0.5, 1)',
        'out-expo':  'cubic-bezier(0.16, 1, 0.3, 1)',
      },
      animation: {
        'pulse-slow': 'pulse 3s ease-in-out infinite',
        'slide-in': 'slideIn 0.2s cubic-bezier(0.25, 1, 0.5, 1)',
      },
      keyframes: {
        slideIn: {
          '0%': { transform: 'translateY(-4px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
      },
    },
  },
  plugins: [],
}
