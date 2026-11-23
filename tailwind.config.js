module.exports = {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: { extend: { colors: {
    charcoal: '#0a0a12',
    primary: 'rgb(var(--p) / <alpha-value>)',
    secondary: 'rgb(var(--s) / <alpha-value>)',
  } } },
  plugins: [],
}
