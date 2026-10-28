module.exports = {
  content: ['./src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: { sans: ['Inter', 'Son Devanagari', 'sans-serif'] },
      fontSize: {
        xs: ['var(--text-support-small)', { lineHeight: '1.6' }],
        sm: ['var(--text-support)', { lineHeight: '1.6' }],
        base: ['var(--text-body)', { lineHeight: '1.7' }],
      },
    },
  },
  plugins: [],
};
