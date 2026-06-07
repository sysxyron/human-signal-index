import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: [
    './app/**/*.{js,ts,jsx,tsx}',
    './components/**/*.{js,ts,jsx,tsx}',
    './lib/**/*.{js,ts,jsx,tsx}',
    '../../packages/ui/src/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        background: {
          DEFAULT: '#050714',
          deep: '#02040A',
        },
        surface: {
          DEFAULT: '#0A0F1F',
          2: '#111A2E',
          3: '#162033',
        },
        border: {
          DEFAULT: '#1F2A44',
          soft: 'rgba(148,163,184,0.16)',
        },
        primary: {
          DEFAULT: '#2563EB',
          blue: '#2563EB',
        },
        electric: '#3B82F6',
        risk: {
          DEFAULT: '#EF4444',
          soft: 'rgba(239,68,68,0.16)',
        },
        warning: {
          DEFAULT: '#F59E0B',
          soft: 'rgba(245,158,11,0.16)',
        },
        verified: {
          DEFAULT: '#10B981',
          soft: 'rgba(16,185,129,0.16)',
        },
        accent: {
          DEFAULT: '#8B5CF6',
          soft: 'rgba(139,92,246,0.16)',
        },
        text: {
          primary: '#F8FAFC',
          secondary: '#94A3B8',
          muted: '#64748B',
        },
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        h1: ['56px', { lineHeight: '1.05', fontWeight: '700', letterSpacing: '-0.02em' }],
        h2: ['40px', { lineHeight: '1.1', fontWeight: '700', letterSpacing: '-0.01em' }],
        h3: ['28px', { lineHeight: '1.2', fontWeight: '600' }],
        h4: ['22px', { lineHeight: '1.3', fontWeight: '600' }],
        h5: ['18px', { lineHeight: '1.4', fontWeight: '600' }],
        h6: ['16px', { lineHeight: '1.4', fontWeight: '600' }],
        'body-lg': ['18px', { lineHeight: '28px' }],
        body: ['16px', { lineHeight: '26px' }],
        'body-sm': ['14px', { lineHeight: '22px' }],
        caption: ['12px', { lineHeight: '18px' }],
        label: ['11px', { lineHeight: '16px', letterSpacing: '0.12em', fontWeight: '600' }],
      },
      borderRadius: {
        card: '16px',
        btn: '10px',
      },
      boxShadow: {
        glow: '0 18px 70px -20px rgba(37, 99, 235, 0.35)',
        'glow-sm': '0 8px 30px -12px rgba(37, 99, 235, 0.4)',
        'glow-purple': '0 18px 70px -20px rgba(139, 92, 246, 0.35)',
      },
      maxWidth: {
        page: '1440px',
        section: '1180px',
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'pulse-glow': {
          '0%, 100%': { opacity: '0.6' },
          '50%': { opacity: '1' },
        },
      },
      animation: {
        'fade-up': 'fade-up 0.6s ease-out both',
        'pulse-glow': 'pulse-glow 3s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};

export default config;
