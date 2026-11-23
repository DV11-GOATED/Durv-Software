import { motion } from 'framer-motion'
import { solid, grad, a } from './ui'
import { PRESETS, hexToHsl } from './theme'

const Section = ({ active, title, children }) => (
  <motion.div animate={{ opacity: active ? 1 : 0.65 }} className="rounded-2xl p-5"
    style={active ? { background: 'rgba(255,255,255,.1)', boxShadow: `inset 0 0 0 2px rgba(255,255,255,.7), 0 0 40px ${a('p', 0.3)}` } : { background: 'rgba(255,255,255,.04)' }}>
    <div className="mb-3 text-[13px] font-medium uppercase tracking-[0.2em] text-white/55">{title}</div>
    {children}
  </motion.div>
)

const HueSlider = ({ hex }) => {
  const [h] = hexToHsl(hex)
  return (
    <div className="flex items-center gap-5">
      <div className="relative h-3 flex-1 rounded-full" style={{ background: 'linear-gradient(90deg,#f33,#ff3,#3f3,#3ff,#33f,#f3f,#f33)' }}>
        <div className="absolute top-1/2 h-7 w-7 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-white"
          style={{ left: `${(h / 360) * 100}%`, background: hex, boxShadow: `0 0 20px ${hex}` }} />
      </div>
      <span className="w-24 text-right font-mono text-lg text-white/65">{hex.toUpperCase()}</span>
    </div>
  )
}

export default function Appearance({ theme, sel }) {
  return (
    <motion.div initial={{ x: 560, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 560, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 34 }}
      className={`absolute bottom-8 right-8 top-8 z-30 flex w-[520px] flex-col gap-3.5 rounded-[32px] p-8 ${solid}`}>
      <div>
        <h2 className="text-4xl font-semibold">Appearance</h2>
        <p className="mt-1 text-lg text-white/50">Changes apply live and are saved automatically.</p>
      </div>

      <Section active={sel === 0} title="Preset">
        <div className="flex gap-3">
          {PRESETS.map((p) => (
            <div key={p.id} className="flex-1 rounded-2xl p-3 text-center" style={{ background: 'rgba(255,255,255,.06)', boxShadow: theme.preset === p.id ? `inset 0 0 0 2px ${p.primary}` : 'none' }}>
              <div className="relative mx-auto mb-2 h-10 w-16">
                <i className="absolute left-0 h-10 w-10 rounded-full" style={{ background: p.primary }} />
                <i className="absolute right-0 h-10 w-10 rounded-full" style={{ background: p.secondary, mixBlendMode: 'screen' }} />
              </div>
              <div className="text-lg">{p.name}</div>
            </div>
          ))}
        </div>
      </Section>

      <Section active={sel === 1} title="Primary colour"><HueSlider hex={theme.primary} /></Section>
      <Section active={sel === 2} title="Secondary colour"><HueSlider hex={theme.secondary} /></Section>

      <Section active={sel === 3} title="Button hints">
        <div className="flex gap-3 text-xl">
          {[['auto', 'Auto-hide'], ['always', 'Always show']].map(([v, t]) => (
            <div key={v} className="flex-1 rounded-xl py-3 text-center" style={theme.hints === v ? { background: grad(100), boxShadow: `0 8px 24px ${a('p', 0.4)}` } : { background: 'rgba(255,255,255,.07)' }}>{t}</div>
          ))}
        </div>
      </Section>

      <Section active={sel === 4} title="Interface sounds">
        <div className="flex gap-3 text-xl">
          {[[true, 'On'], [false, 'Off']].map(([v, t]) => (
            <div key={t} className="flex-1 rounded-xl py-3 text-center" style={(theme.sounds !== false) === v ? { background: grad(100), boxShadow: `0 8px 24px ${a('p', 0.4)}` } : { background: 'rgba(255,255,255,.07)' }}>{t}</div>
          ))}
        </div>
      </Section>

      <div className="mt-auto">
        <motion.div animate={{ scale: sel === 5 ? 1.03 : 1 }} className="rounded-2xl py-4 text-center text-2xl font-semibold"
          style={sel === 5 ? { background: grad(100), boxShadow: `0 10px 34px ${a('p', 0.5)}` } : { background: 'rgba(255,255,255,.08)' }}>Done</motion.div>
        <div className="mt-4 text-center text-base text-white/40">Up / Down choose  ·  Left / Right adjust  ·  B close</div>
      </div>
    </motion.div>
  )
}
