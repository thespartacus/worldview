import type { Config } from 'tailwindcss'

export default {
  content: ['./app/**/*.{js,ts,jsx,tsx,mdx}', './components/**/*.{js,ts,jsx,tsx,mdx}', './content/**/*.{md,mdx}'],
  theme: {
    extend: {
      boxShadow: {
        glow: '0 0 40px rgba(56,189,248,0.12)',
      },
      backgroundImage: {
        'hero-gradient': 'radial-gradient(circle at top, rgba(56,189,248,0.18), transparent 45%), radial-gradient(circle at 30% 20%, rgba(99,102,241,0.16), transparent 32%), linear-gradient(135deg, rgba(15,23,42,1) 0%, rgba(15,23,42,0.96) 100%)',
      },
    },
  },
  plugins: [],
} satisfies Config
