// Tiny synthesized UI sounds (no audio files). Toggle with "sounds" in theme.json.
let ctx
const tone = (freq, dur, vol = 0.035, type = 'sine', delay = 0) => {
  if (!sfx.enabled) return
  try {
    ctx = ctx || new AudioContext()
    const t = ctx.currentTime + delay
    const o = ctx.createOscillator(), g = ctx.createGain()
    o.type = type; o.frequency.value = freq
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(vol, t + 0.008)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + dur + 0.02)
  } catch {}
}
export const sfx = {
  enabled: true,
  move: () => tone(1100, 0.045, 0.02, 'triangle'),
  ok: () => { tone(620, 0.08, 0.035); tone(930, 0.12, 0.03, 'sine', 0.06) },
  back: () => tone(420, 0.09, 0.03, 'triangle'),
  error: () => { tone(300, 0.12, 0.04, 'square'); tone(240, 0.16, 0.035, 'square', 0.1) },
}
