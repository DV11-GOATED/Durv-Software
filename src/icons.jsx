const base = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' }

export const WifiIcon = ({ level = 3, off, size = 24 }) => {
  const on = (n) => (!off && level >= n ? 1 : 0.28)
  return (
    <svg {...base} width={size} height={size}>
      <path d="M2.5 9a15 15 0 0 1 19 0" opacity={on(3)} />
      <path d="M5.5 12.5a10.5 10.5 0 0 1 13 0" opacity={on(2)} />
      <path d="M8.7 16a5.5 5.5 0 0 1 6.6 0" opacity={on(1)} />
      <circle cx="12" cy="19.5" r="1" fill="currentColor" opacity={off ? 0.28 : 1} />
      {off && <path d="M4 4l16 16" />}
    </svg>
  )
}

export const BtIcon = ({ off, size = 24 }) => (
  <svg {...base} width={size} height={size} opacity={off ? 0.4 : 1}>
    <path d="M7 7l10 10-5 5V2l5 5L7 17" />
    {off && <path d="M4 4l16 16" />}
  </svg>
)

export const VolIcon = ({ level = 50, muted, size = 24 }) => (
  <svg {...base} width={size} height={size}>
    <path d="M4 9v6h4l5 4V5L8 9H4z" />
    {muted ? <path d="M17 9l5 6M22 9l-5 6" /> : (<>
      {level > 0 && <path d="M16.5 9.2a4 4 0 0 1 0 5.6" />}
      {level > 45 && <path d="M19 6.7a7.5 7.5 0 0 1 0 10.6" />}
    </>)}
  </svg>
)

export const PadIcon = ({ size = 24 }) => (
  <svg {...base} width={size} height={size}>
    <path d="M6.5 7.5h11a4.5 4.5 0 0 1 4.4 5.4l-.7 3.2a2.6 2.6 0 0 1-4.5 1.1L15 15.5H9l-1.7 1.7a2.6 2.6 0 0 1-4.5-1.1l-.7-3.2a4.5 4.5 0 0 1 4.4-5.4z" />
    <path d="M7.5 10.5v3M6 12h3" /><circle cx="16" cy="11" r=".6" fill="currentColor" /><circle cx="18" cy="13" r=".6" fill="currentColor" />
  </svg>
)

export const SunIcon = ({ size = 24 }) => (
  <svg {...base} width={size} height={size}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
)

export const StarIcon = ({ size = 18 }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor"><path d="M12 2.5l2.9 6.2 6.6.8-4.9 4.6 1.3 6.7L12 17.5l-5.9 3.3 1.3-6.7L2.5 9.5l6.6-.8z" /></svg>
)

export const MusicIcon = ({ size = 24 }) => (
  <svg {...base} width={size} height={size}><path d="M9 18V6l11-2v12" /><circle cx="6.5" cy="18" r="2.5" /><circle cx="17.5" cy="16" r="2.5" /></svg>
)
export const LockIcon = ({ size = 24 }) => (
  <svg {...base} width={size} height={size}><rect x="5" y="11" width="14" height="9" rx="2.5" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>
)
export const PlayIcon = ({ size = 24 }) => <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor"><path d="M8 5.5v13l11-6.5z" /></svg>
export const PauseIcon = ({ size = 24 }) => <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor"><rect x="6.5" y="5" width="4" height="14" rx="1" /><rect x="13.5" y="5" width="4" height="14" rx="1" /></svg>
export const PrevIcon = ({ size = 24 }) => <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor"><rect x="5" y="5" width="2.6" height="14" rx="1" /><path d="M19 5.5v13L9 12z" /></svg>
export const NextIcon = ({ size = 24 }) => <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor"><rect x="16.4" y="5" width="2.6" height="14" rx="1" /><path d="M5 5.5v13L15 12z" /></svg>
