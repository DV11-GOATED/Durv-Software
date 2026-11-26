import { motion } from 'framer-motion'
import { solid, grad, a } from './ui'
import { WifiIcon, BtIcon, VolIcon, PadIcon, SunIcon, MusicIcon } from './icons'

const Section = ({ active, title, hint, children }) => (
  <motion.div animate={{ opacity: active ? 1 : 0.7 }} className="rounded-2xl p-3"
    style={active ? { background: 'rgba(255,255,255,.1)', boxShadow: `inset 0 0 0 2px rgba(255,255,255,.7), 0 0 40px ${a('p', 0.3)}` } : { background: 'rgba(255,255,255,.04)' }}>
    <div className="mb-2 flex items-center justify-between text-[13px] font-medium uppercase tracking-[0.2em] text-white/55">
      <span>{title}</span>{active && hint && <span className="normal-case tracking-normal text-white/50">{hint}</span>}
    </div>
    {children}
  </motion.div>
)

const CursorIcon = ({ size = 28 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"><path d="M5 3l14 8-6 2-3 6z" /></svg>
)

const Bar = ({ v, dim }) => (
  <div className="relative h-3 flex-1 rounded-full bg-white/15">
    <div className="h-full rounded-full" style={{ width: `${v}%`, background: dim ? 'rgba(255,255,255,.35)' : grad(90) }} />
    <div className="absolute top-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-white bg-charcoal" style={{ left: `${v}%` }} />
  </div>
)

const LEVELS = ['Empty', 'Low', 'Medium', 'Full']
function batteryInfo(c, pad) {
  if (pad) return { text: `${pad.battery}% battery`, seg: Math.max(1, Math.ceil(pad.battery / 25)) }
  if (!c || c.type === 0 || c.type === undefined) return { text: 'Battery info not available for this controller', seg: null }
  if (c.type === 1) return { text: 'Wired', seg: null }
  if (c.type === 255 || c.level === undefined) return { text: 'Wireless', seg: null }
  return { text: LEVELS[c.level] || 'Wireless', seg: c.level + 1 }
}

export default function QuickMenu({ status, rows, sel, sc, padName, padIds, pad, media, mouse, shortcuts = ['Appearance', 'Settings', 'Power'], footer = 'Up / Down choose  ·  B close' }) {
  const act = rows[sel]
  const vol = status.volume
  const w = status.wifi || {}
  const bt = status.bluetooth || {}
  const wifiText = !w.supported ? 'Not available' : w.radio === 'Off' ? 'Off' : w.connected ? `Connected  ·  ${w.ssid}` : 'On  ·  Not connected'
  const btText = !bt.supported ? 'Not available' : bt.radio === 'On' ? 'On' : 'Off'
  const bat = batteryInfo(status.controller, pad)
  const name = padName || pad?.name

  return (
    <motion.div initial={{ x: 560, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 560, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 34 }}
      className={`absolute bottom-8 right-8 top-8 z-30 flex w-[520px] flex-col gap-2 overflow-hidden rounded-[32px] p-6 ${solid}`}>
      <div>
        <h2 className="text-4xl font-semibold">Quick menu</h2>
        <p className="mt-1 text-lg text-white/50">Sound, connections and shortcuts.</p>
      </div>

      <Section active={act === 'volume'} title="Volume" hint="◀ ▶ adjust  ·  A mute">
        {vol === null ? (
          <div className="flex items-center gap-5">
            <VolIcon size={30} level={0} />
            <div className="min-w-0 flex-1">
              <div className="text-xl">Level can't be read</div>
              <div className="truncate text-sm text-white/45">{status.audioError || 'Waiting for the audio service'}</div>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-5">
            <VolIcon size={30} level={vol} muted={status.muted} />
            <Bar v={vol} dim={status.muted} />
            <span className="w-14 text-right text-xl tabular-nums">{status.muted ? 'Mute' : `${vol}%`}</span>
          </div>
        )}
      </Section>

      <Section active={act === 'music'} title="Music" hint={media?.active ? '◀ ▶ skip  ·  A play/pause' : 'A  open music'}>
        <div className="flex items-center gap-4">
          <MusicIcon size={28} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-xl">{media?.active ? media.title || 'Unknown track' : 'Nothing playing'}</div>
            <div className="truncate text-sm text-white/45">{media?.active ? `${media.artist || ''}${media.artist ? '  ·  ' : ''}${media.status === 'Playing' ? 'Playing' : 'Paused'}` : 'Open Spotify or Apple Music'}</div>
          </div>
        </div>
      </Section>

      {mouse !== undefined && (
        <Section active={act === 'mouse'} title="Controller Mouse" hint="A  toggle  ·  Select + LB">
          <div className="flex items-center gap-4 text-xl">
            <CursorIcon />
            <span className="min-w-0 flex-1 truncate">{mouse ? 'Sticks move the cursor' : 'Use the pad as a mouse'}</span>
            <span className="rounded-full px-4 py-0.5 text-lg" style={mouse ? { background: grad(100) } : { background: 'rgba(255,255,255,.12)' }}>{mouse ? 'On' : 'Off'}</span>
          </div>
        </Section>
      )}

      <Section active={act === 'wifi'} title="Wi-Fi" hint="A  networks">
        <div className="flex items-center gap-4 text-xl"><WifiIcon size={28} level={Math.ceil((w.signal || 0) / 34)} off={w.radio === 'Off' || !w.supported} /><span className="truncate">{wifiText}</span></div>
      </Section>

      <Section active={act === 'bluetooth'} title="Bluetooth" hint="A  devices">
        <div className="flex items-center gap-4 text-xl"><BtIcon size={28} off={bt.radio !== 'On'} /><span>{btText}</span></div>
      </Section>

      {status.brightness?.supported && (
        <Section active={act === 'brightness'} title="Brightness" hint="◀ ▶ adjust">
          <div className="flex items-center gap-5"><SunIcon size={30} /><Bar v={status.brightness.value} /><span className="w-14 text-right text-xl tabular-nums">{status.brightness.value}%</span></div>
        </Section>
      )}

      <div className="rounded-2xl bg-white/[0.04] p-3">
        <div className="mb-2 text-[13px] font-medium uppercase tracking-[0.2em] text-white/55">Controller</div>
        <div className="flex items-center gap-4">
          <PadIcon size={30} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-xl">{name || 'No controller found'}</div>
            <div className="text-base text-white/50">{name ? bat.text : 'Press any button on your pad'}</div>
            {padIds && <div className="text-xs text-white/30">Vendor:Product {padIds}</div>}
          </div>
          {bat.seg && <div className="flex gap-1">{[1, 2, 3, 4].map((n) => <i key={n} className="h-5 w-3 rounded-sm" style={{ background: n <= bat.seg ? grad(0) : 'rgba(255,255,255,.15)' }} />)}</div>}
        </div>
      </div>

      <Section active={act === 'shortcuts'} title="Shortcuts" hint="◀ ▶ choose  ·  A open">
        <div className="flex gap-3 text-xl">
          {shortcuts.map((t, i) => (
            <div key={t} className="flex-1 rounded-xl py-2.5 text-center" style={act === 'shortcuts' && sc === i ? { background: grad(100), boxShadow: `0 8px 24px ${a('p', 0.4)}` } : { background: 'rgba(255,255,255,.07)' }}>{t}</div>
          ))}
        </div>
      </Section>

      <div className="mt-auto text-center text-base text-white/40">{footer}</div>
    </motion.div>
  )
}
