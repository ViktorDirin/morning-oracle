import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: 'class',
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        background: '#0a0a0a',
        foreground: '#f3f4f6',
        oracle: {
          dark: '#0a0a0a',
          card: '#121212',
          border: '#222222',
          cyan: '#00E5FF',
          'cyan-glow': 'rgba(0, 229, 255, 0.25)',
          magenta: '#FF0055',
          'magenta-glow': 'rgba(255, 0, 85, 0.25)',
          muted: '#888888',
        },
      },
      boxShadow: {
        'cyan-glow': '0 0 20px rgba(0, 229, 255, 0.4), 0 0 40px rgba(0, 229, 255, 0.1)',
        'magenta-glow': '0 0 20px rgba(255, 0, 85, 0.4), 0 0 40px rgba(255, 0, 85, 0.1)',
        'glass': '0 8px 32px 0 rgba(0, 0, 0, 0.5)',
      },
      animation: {
        'pulse-glow': 'pulseGlow 2s infinite ease-in-out',
        'ripple': 'ripple 1.5s cubic-bezier(0, 0.2, 0.8, 1) infinite',
      },
      keyframes: {
        pulseGlow: {
          '0%, 100%': { boxShadow: '0 0 15px rgba(0, 229, 255, 0.3)' },
          '50%': { boxShadow: '0 0 35px rgba(0, 229, 255, 0.8)' },
        },
        ripple: {
          '0%': { transform: 'scale(0.8)', opacity: '1' },
          '100%': { transform: 'scale(2.2)', opacity: '0' },
        },
      },
    },
  },
  plugins: [],
}

export default config
