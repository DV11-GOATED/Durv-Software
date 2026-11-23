export const PRESETS = [
  { id: 'nebula', name: 'Nebula', primary: '#8b5cff', secondary: '#ff4fb8' },  // violet + magenta
  { id: 'ocean', name: 'Ocean', primary: '#3d7bff', secondary: '#22e6ff' },   // blue + cyan
  { id: 'ember', name: 'Ember', primary: '#ff7a3c', secondary: '#ffc93c' },   // orange + gold
]
export const DEFAULT_THEME = { preset: 'nebula', primary: '#8b5cff', secondary: '#ff4fb8', hints: 'auto', sounds: true }

export const hexToRgb = (hex) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '')
  const n = parseInt(m ? m[1] : '8b5cff', 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
export function hexToHsl(hex) {
  const [r, g, b] = hexToRgb(hex).map((v) => v / 255)
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2
  const d = max - min
  if (!d) return [0, 0, l]
  const s = d / (1 - Math.abs(2 * l - 1))
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return [(h * 60 + 360) % 360, s, l]
}
export function hslToHex(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x]
  return '#' + [r, g, b].map((v) => Math.round((v + m) * 255).toString(16).padStart(2, '0')).join('')
}
export const shiftHue = (hex, deg) => { const [h, s, l] = hexToHsl(hex); return hslToHex((h + deg + 360) % 360, s, l) }

// Sets --p / --s (space-separated RGB) so Tailwind and inline styles can do rgb(var(--p) / alpha).
export function applyTheme(t) {
  const st = document.documentElement.style
  st.setProperty('--p', hexToRgb(t.primary).join(' '))
  st.setProperty('--s', hexToRgb(t.secondary).join(' '))
}
