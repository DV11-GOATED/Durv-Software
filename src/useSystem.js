import { useCallback, useEffect, useRef, useState } from 'react'

const EMPTY = { volume: null, muted: false, wifi: { supported: false }, bluetooth: { supported: false }, controller: null, brightness: { supported: false } }
const clamp = (v) => Math.max(0, Math.min(100, Math.round(v)))

// Live system status (volume, Wi-Fi, Bluetooth, controller battery) + optimistic setters.
export function useSystem() {
  const [status, setStatus] = useState(EMPTY)
  const [pad, setPad] = useState(null)      // connected Bluetooth controller with a battery reading
  const ref = useRef(EMPTY)
  ref.current = status
  const volTimer = useRef(), briTimer = useRef()

  const refresh = useCallback(async () => { try { setStatus(await window.shell.sysStatus()) } catch {} }, [])
  useEffect(() => { refresh(); const t = setInterval(refresh, 15000); return () => clearInterval(t) }, [refresh])

  // Controller battery from the Bluetooth device properties (slower query, so it has its own timer)
  const refreshPad = useCallback(async () => {
    try {
      const r = await window.shell.btBattery()
      const list = (r.devices || []).filter((d) => d.battery != null && d.connected !== false)
      list.sort((a, b) => Number(b.connected === true) - Number(a.connected === true))
      setPad(list[0] ? { name: list[0].name, battery: list[0].battery } : null)
    } catch {}
  }, [])
  useEffect(() => { refreshPad(); const t = setInterval(refreshPad, 60000); return () => clearInterval(t) }, [refreshPad])

  const setVolume = (v) => {
    v = clamp(v)
    setStatus((s) => ({ ...s, volume: v, muted: v > 0 ? false : s.muted }))
    clearTimeout(volTimer.current)
    volTimer.current = setTimeout(() => window.shell.sysVolume(v).catch(() => {}), 80)
  }
  const toggleMute = async () => {
    const next = !ref.current.muted
    setStatus((s) => ({ ...s, muted: next }))
    try { await window.shell.sysMute(next) } catch {}
  }
  const volKey = async (key, times = 2) => { try { await window.shell.sysVolKey(key, times) } catch {} }   // fallback when the volume level can't be read
  const setBrightness = (v) => {
    v = clamp(v)
    setStatus((s) => ({ ...s, brightness: { ...s.brightness, value: v } }))
    clearTimeout(briTimer.current)
    briTimer.current = setTimeout(() => window.shell.sysBrightness(v).catch(() => {}), 120)
  }
  const setRadio = async (kind, on) => {
    const key = kind === 'wifi' ? 'wifi' : 'bluetooth'
    setStatus((s) => ({ ...s, [key]: { ...s[key], radio: on ? 'On' : 'Off' } }))
    try { await window.shell.sysRadio(kind, on) } catch {}
    setTimeout(refresh, 1500)
  }
  return { status, pad, refreshPad, refresh, setVolume, toggleMute, volKey, setBrightness, setRadio }
}
