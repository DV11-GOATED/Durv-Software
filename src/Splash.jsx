import React, { useEffect, useRef, useState } from "react";

/* ───────────── helpers ───────────── */
const DURATION = 6;
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, v) => { const x = clamp((v - a) / (b - a)); return x * x * (3 - 2 * x); };
const easeOutCubic = (x) => 1 - Math.pow(1 - clamp(x), 3);
const easeInOutCubic = (x) => { x = clamp(x); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
const rng = (seed) => () => {
  seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const PINK = "240,110,210", VIOLET = "139,92,246", PERI = "104,138,255", LAV = "233,228,255";
const PALETTE = [PINK, PERI, VIOLET, LAV];

function makeSprite(rgb, hard) {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d");
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  if (hard) {
    gr.addColorStop(0, `rgba(${rgb},.35)`); gr.addColorStop(0.7, `rgba(${rgb},.3)`);
    gr.addColorStop(0.9, `rgba(${rgb},.75)`); gr.addColorStop(1, `rgba(${rgb},0)`);
  } else {
    gr.addColorStop(0, `rgba(${rgb},1)`); gr.addColorStop(0.3, `rgba(${rgb},.4)`); gr.addColorStop(1, `rgba(${rgb},0)`);
  }
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return c;
}

/* ───────────── procedural audio ───────────── */
function createAudio(getMuted) {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  let ctx;
  try { ctx = new AC(); } catch (e) { return null; }
  const srcs = [];
  const out = ctx.createGain(); out.gain.value = getMuted() ? 0 : 1;
  const fader = ctx.createGain(); fader.gain.value = 0;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -16; comp.ratio.value = 3; comp.attack.value = 0.01; comp.release.value = 0.3;
  const bus = ctx.createGain();
  const dry = ctx.createGain(); dry.gain.value = 0.75;
  const wet = ctx.createGain(); wet.gain.value = 0.8;
  const conv = ctx.createConvolver();
  { // stereo glassy impulse response
    const len = Math.floor(ctx.sampleRate * 3.6);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch); let lp = 0;
      for (let i = 0; i < len; i++) {
        lp += ((Math.random() * 2 - 1) - lp) * 0.6;
        d[i] = lp * Math.pow(1 - i / len, 2.6) * (i < ctx.sampleRate * 0.02 ? i / (ctx.sampleRate * 0.02) : 1);
      }
    }
    conv.buffer = buf;
  }
  bus.connect(dry); dry.connect(comp);
  bus.connect(conv); conv.connect(wet); wet.connect(comp);
  comp.connect(fader); fader.connect(out); out.connect(ctx.destination);

  const osc = (type, f, detune = 0) => {
    const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; o.detune.value = detune;
    srcs.push(o); return o;
  };
  const panner = (p) => { const n = ctx.createStereoPanner ? ctx.createStereoPanner() : ctx.createGain(); if (n.pan) n.pan.value = p; return n; };

  function schedule(offset) {
    const now = ctx.currentTime, base = now - offset;
    const at = (t) => Math.max(base + t, now + 0.005);
    const stopAt = Math.max(base + DURATION + 0.15, now + 0.2);

    fader.gain.cancelScheduledValues(now);
    fader.gain.setValueAtTime(0, now);
    fader.gain.linearRampToValueAtTime(1, now + 0.12);
    fader.gain.setValueAtTime(1, at(5.3));
    fader.gain.linearRampToValueAtTime(0, at(6.0));

    // 0–2.5s: ambient pad swell
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.Q.value = 0.6;
    lp.frequency.setValueAtTime(420, now);
    lp.frequency.linearRampToValueAtTime(1700, at(2.5));
    lp.frequency.linearRampToValueAtTime(2600, at(3.8));
    lp.frequency.linearRampToValueAtTime(900, at(5.9));
    const padG = ctx.createGain();
    padG.gain.setValueAtTime(0.0001, now);
    padG.gain.exponentialRampToValueAtTime(0.12, at(2.5));
    padG.gain.linearRampToValueAtTime(0.1, at(3.6));
    padG.gain.linearRampToValueAtTime(0.05, at(4.4));
    padG.gain.linearRampToValueAtTime(0.0001, at(5.9));
    lp.connect(padG); padG.connect(bus);
    [110, 164.81, 220, 246.94, 329.63].forEach((f, i) => {
      [-7, 7].forEach((det) => {
        const o = osc(det < 0 ? "sine" : "triangle", f, det);
        const g = ctx.createGain(); g.gain.value = 0.32;
        const p = panner((i - 2) * 0.22 + det * 0.02);
        o.connect(g); g.connect(p); p.connect(lp);
        o.start(now); o.stop(stopAt);
      });
    });

    // 1.4–3.6s: crystalline FM sparkles
    const rnd = rng(7);
    const notes = [1318.5, 1480, 1760, 1975.5, 2217.5, 2637, 2960];
    for (let i = 0; i < 30; i++) {
      const t = 1.4 + i * (2.2 / 30) + (rnd() - 0.5) * 0.05;
      if (base + t < now - 0.02) continue;
      const f = notes[Math.floor(rnd() * notes.length)], pan = (rnd() * 2 - 1) * 0.8;
      const amp = 0.012 + 0.03 * Math.sin(Math.PI * (i / 30)) * (0.5 + rnd() * 0.5);
      const s = at(t);
      const c = osc("sine", f), m = osc("sine", f * 2.005);
      const mg = ctx.createGain(); mg.gain.setValueAtTime(f * 0.7, s); mg.gain.exponentialRampToValueAtTime(1, s + 0.5);
      m.connect(mg); mg.connect(c.frequency);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, s); g.gain.linearRampToValueAtTime(amp, s + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, s + 0.9);
      const p = panner(pan);
      c.connect(g); g.connect(p); p.connect(bus);
      c.start(s); m.start(s); c.stop(s + 1); m.stop(s + 1);
    }

    // 3.7s: the reveal hit — Amaj9-sus chord, bell, 55Hz sub
    if (base + 3.7 > now - 0.3) {
      const s = at(3.7), end = at(5.85);
      [220, 329.63, 415.3, 493.88, 554.37, 659.25, 880].forEach((f, i) => {
        const d = i * 0.025;
        ["sine", "triangle"].forEach((type, j) => {
          const o = osc(type, f, j ? 4 : 0);
          const g = ctx.createGain(), peak = (0.085 - i * 0.007) * (j ? 0.35 : 1);
          g.gain.setValueAtTime(0.0001, s + d);
          g.gain.linearRampToValueAtTime(peak, s + d + 0.06);
          g.gain.exponentialRampToValueAtTime(0.0003, Math.max(end, s + d + 0.3));
          const p = panner(((i % 4) - 1.5) * 0.35);
          o.connect(g); g.connect(p); p.connect(bus);
          o.start(s + d); o.stop(stopAt);
        });
      });
      const bell = osc("sine", 1760), bm = osc("sine", 1760 * 3.5);
      const bmg = ctx.createGain(); bmg.gain.setValueAtTime(900, s); bmg.gain.exponentialRampToValueAtTime(1, s + 2.4);
      bm.connect(bmg); bmg.connect(bell.frequency);
      const bg = ctx.createGain();
      bg.gain.setValueAtTime(0.0001, s); bg.gain.linearRampToValueAtTime(0.03, s + 0.01);
      bg.gain.exponentialRampToValueAtTime(0.0002, s + 3);
      bell.connect(bg); bg.connect(bus);
      bell.start(s); bm.start(s); bell.stop(s + 3.2); bm.stop(s + 3.2);

      const sub = osc("sine", 55), sg = ctx.createGain();
      sg.gain.setValueAtTime(0.0001, at(3.45));
      sg.gain.linearRampToValueAtTime(0.3, at(3.75));
      sg.gain.exponentialRampToValueAtTime(0.0005, at(5.4));
      sub.connect(sg); sg.connect(dry);
      sub.start(at(3.45)); sub.stop(stopAt);
    }
  }

  function close() {
    srcs.forEach((o) => { try { o.stop(); } catch (e) {} try { o.disconnect(); } catch (e) {} });
    [bus, dry, wet, conv, comp, fader, out].forEach((n) => { try { n.disconnect(); } catch (e) {} });
    ctx.close && ctx.close().catch(() => {});
  }
  return { ctx, out, fader, schedule, close };
}

/* ───────────── component ───────────── */
const FONT = 'Lexend, Outfit, Inter, "SF Pro Display", "Segoe UI", system-ui, sans-serif';
const TITLE = "Console shell";
const srOnly = { position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap" };

const glow = (g2, x, y, rad, stops) => {
  const g = g2.createRadialGradient(x, y, 0, x, y, rad);
  stops.forEach(([o, col]) => g.addColorStop(o, col));
  g2.fillStyle = g; g2.fillRect(x - rad, y - rad, rad * 2, rad * 2);
};

export default function StartupAnimation({ onComplete, children }) {
  const [done, setDone] = useState(false);
  const layerRef = useRef(null), canvasRef = useRef(null), hintRef = useRef(null);
  const cbRef = useRef(onComplete);
  cbRef.current = onComplete;

  useEffect(() => {
    const layer = layerRef.current, canvas = canvasRef.current, hint = hintRef.current;
    const c = canvas.getContext("2d", { alpha: false });
    // half-cost tricks: soft lighting lives on a quarter-res buffer, the title on its own small canvas
    const bg = document.createElement("canvas"), bc = bg.getContext("2d");
    const tx = document.createElement("canvas"), tc = tx.getContext("2d");
    let W = 0, H = 0, cx = 0, cy = 0, minD = 0, lineY = 0, dpr = 1, fs = 60, tcw = 0, tch = 0, advs = [], advSum = 0;
    let raf = 0, start = null, skipAt = null, finished = false, stopped = false, scheduled = false;
    let lowQ = false, dustN = 300, bokehN = 44, STR = 8, NP = 56, prev = 0, slow = 0;

    const sprites = { soft: PALETTE.map((p) => makeSprite(p, false)), hard: PALETTE.map((p) => makeSprite(p, true)) };
    const r = rng(1234);
    const bokeh = Array.from({ length: 44 }, () => {
      const z = 0.1 + 0.9 * r();
      return { x: r(), y: r(), z, ph: r() * 6.28, col: Math.floor(r() * 4), a: 0.1 + 0.18 * r(),
        vx: (r() - 0.5) * 0.012 * (0.4 + z), vy: -(0.004 + 0.012 * z) };
    });
    const dust = Array.from({ length: 300 }, () => ({
      u: r(), k: r(), l: Math.floor(r() * 3), ph: r() * 6.28, a1: 0.6 + r() * 1.6, a2: 0.5 + r() * 1.6,
      rad: 4 + Math.pow(r(), 2) * 46, sz: 0.5 + r() * 1.5, col: [0, 0, 1, 3, 2][Math.floor(r() * 5)], d: r(),
    }));
    const elapsed = () => (start == null ? 0 : Math.max(0, (performance.now() - start) / 1000));

    /* audio */
    const audio = createAudio(() => false);
    const tryStart = () => {
      if (!audio || scheduled || stopped || audio.ctx.state !== "running") return;
      scheduled = true; audio.schedule(elapsed());
    };
    const resume = () => {
      if (!audio) return;
      try { const p = audio.ctx.resume(); p && p.then && p.then(tryStart).catch(() => {}); } catch (e) {}
    };
    if (audio) { audio.ctx.addEventListener("statechange", tryStart); resume(); }

    /* layout */
    const resize = () => {
      if (finished) return;
      dpr = Math.min(window.devicePixelRatio || 1, lowQ ? 1 : 1.5);
      W = layer.clientWidth; H = layer.clientHeight;
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      canvas.style.width = W + "px"; canvas.style.height = H + "px";
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      bg.width = Math.ceil(W / 4); bg.height = Math.ceil(H / 4);
      bc.setTransform(bg.width / W, 0, 0, bg.height / H, 0, 0);
      cx = W / 2; cy = H / 2; minD = Math.min(W, H);
      fs = clamp(W * 0.056, 30, 76);
      tcw = Math.ceil(fs * 17); tch = Math.ceil(fs * 2.6);
      tx.width = Math.round(tcw * dpr); tx.height = Math.round(tch * dpr);
      tc.setTransform(dpr, 0, 0, dpr, 0, 0);
      tc.font = `400 ${fs}px ${FONT}`; tc.textBaseline = "middle";
      advs = [...TITLE].map((ch) => tc.measureText(ch).width);
      advSum = advs.reduce((a, b) => a + b, 0);
      lineY = cy + fs * 0.95;
    };
    resize();
    window.addEventListener("resize", resize);

    /* skip */
    const skip = () => {
      if (skipAt != null) return;
      skipAt = elapsed();
      if (audio) { const n = audio.ctx.currentTime; audio.fader.gain.cancelScheduledValues(n); audio.fader.gain.setTargetAtTime(0, n, 0.08); }
    };
    const onInput = (e) => {
      resume();
      if (e.target && e.target.closest && e.target.closest("[data-ss-ui]")) return;
      if (elapsed() > 1.0) skip();
    };
    window.addEventListener("keydown", onInput);
    window.addEventListener("pointerdown", onInput);

    const finish = () => {
      if (finished) return; finished = true;
      setDone(true);
      if (typeof cbRef.current === "function") cbRef.current();
    };

    /* title: per-glyph on its own canvas (no DOM layout), with a diagonal glass sheen */
    const drawTitle = (t) => {
      const tt = t - 3.7;
      if (tt < -0.01) return;
      const ls = lerp(0.38, 0.22, easeOutCubic(tt / 1.4)) * fs;
      const total = advSum + ls * (advs.length - 1), x0 = tcw / 2 - total / 2;
      tc.globalCompositeOperation = "source-over";
      tc.clearRect(0, 0, tcw, tch);
      tc.shadowColor = `rgba(${VIOLET},.6)`; tc.shadowBlur = fs * 0.35; tc.fillStyle = "#f8fafc";
      let x = x0;
      for (let i = 0; i < advs.length; i++) { tc.fillText(TITLE[i], x, tch / 2); x += advs[i] + ls; }
      tc.shadowBlur = 0;
      const p = lerp(-0.3, 1.3, easeInOutCubic((t - 4.0) / 1.0)), bx = x0 + total * p;
      if (p > -0.29 && p < 1.29) {
        const g = tc.createLinearGradient(bx - fs * 0.7, tch * 0.1, bx + fs * 0.7, tch * 0.9);
        g.addColorStop(0, `rgba(${PINK},0)`); g.addColorStop(0.5, "rgba(255,240,252,.95)"); g.addColorStop(1, `rgba(${PERI},0)`);
        tc.globalCompositeOperation = "source-atop"; tc.fillStyle = g; tc.fillRect(0, 0, tcw, tch);
      }
      const op = smooth(3.7, 4.5, t) * (t > 4.8 ? 0.93 + 0.07 * Math.sin((t - 4.8) * 2.6) : 1);
      c.globalCompositeOperation = "source-over"; c.globalAlpha = op;
      c.drawImage(tx, cx - tcw / 2, cy - tch / 2 + lerp(12, 0, easeOutCubic(tt / 1.2)), tcw, tch);
      c.globalAlpha = 1;
    };

    const draw = (t) => {
      const cc = easeOutCubic((t - 3.4) / 1.4), env = 1 - cc, sq = 1 - 0.82 * cc;
      const h = 1.12 * easeInOutCubic((t - 1.2) / 1.6);
      const ribFade = 1 - smooth(4.3, 4.9, t);
      const mid = smooth(1.4, 2.2, t) * (1 - smooth(3.4, 4.2, t));
      const nv = smooth(0.8, 2.6, t) * (1 - smooth(3.8, 5.8, t));
      const P = Math.exp(-Math.pow((t - 3.78) / (t < 3.78 ? 0.22 : 0.75), 2));
      const F = P + 0.22 * smooth(3.8, 4.6, t) * (1 - smooth(5.4, 6, t)) * (0.85 + 0.15 * Math.sin(t * 2.2));
      const tg = smooth(3.7, 4.6, t) * (0.85 + 0.15 * Math.sin(t * 2.2));
      const amb = smooth(0, 0.6, t) * (1 - smooth(2.2, 3.4, t)) * (0.55 + 0.45 * Math.sin(t * 3.1));

      /* soft lighting on the quarter-res buffer */
      bc.globalCompositeOperation = "source-over";
      bc.fillStyle = "#05061c"; bc.fillRect(0, 0, W, H);
      if (nv > 0.001) glow(bc, cx, cy, Math.max(W, H) * 0.75, [[0, `rgba(18,24,118,${nv})`], [1, "rgba(5,6,28,0)"]]);
      bc.globalCompositeOperation = "lighter";
      if (amb > 0.001) glow(bc, cx, cy, minD * 0.38, [[0, `rgba(${LAV},${0.12 * amb})`], [0.35, `rgba(${VIOLET},${0.1 * amb})`], [1, `rgba(${VIOLET},0)`]]);
      if (mid > 0.001) {
        [[PINK, 0.9, 0], [VIOLET, 0.7, 2.1], [PERI, 0.5, 4]].forEach(([col, k, ph], i) =>
          glow(bc, cx + Math.sin(t * 0.5 * k + ph) * W * 0.28, cy + Math.cos(t * 0.4 * k + ph) * H * 0.2, minD * (0.4 + i * 0.08),
            [[0, `rgba(${col},${0.1 * mid})`], [1, `rgba(${col},0)`]]));
        bc.save(); bc.translate(cx, cy); bc.rotate(-0.32);
        for (let i = 0; i < 4; i++) {
          const w = 130 + i * 55, x = Math.sin(t * 0.25 + i * 1.7) * W * 0.4, col = i % 2 ? PERI : PINK;
          const g = bc.createLinearGradient(x - w / 2, 0, x + w / 2, 0);
          g.addColorStop(0, `rgba(${col},0)`); g.addColorStop(0.5, `rgba(${col},${0.05 * mid})`); g.addColorStop(1, `rgba(${col},0)`);
          bc.fillStyle = g; bc.fillRect(x - w / 2, -H, w, H * 2);
        }
        bc.restore();
      }
      if (F > 0.002) glow(bc, cx, cy, minD * (0.22 + 0.22 * P), [[0, `rgba(255,236,252,${0.85 * Math.min(F, 1)})`], [0.25, `rgba(${PINK},${0.32 * F})`], [0.6, `rgba(${VIOLET},${0.14 * F})`], [1, `rgba(${VIOLET},0)`]]);
      if (tg > 0.001) glow(bc, cx, cy, minD * 0.3, [[0, `rgba(${PINK},${0.09 * tg})`], [0.5, `rgba(${PERI},${0.07 * tg})`], [1, `rgba(${PERI},0)`]]);

      c.globalCompositeOperation = "source-over"; c.globalAlpha = 1;
      c.drawImage(bg, 0, 0, W, H);
      c.globalCompositeOperation = "lighter";

      /* bokeh (3D parallax) */
      const pullB = Math.sin(Math.PI * clamp((t - 3.4) / 1.6)), fadeIn = smooth(0.1, 1.0, t);
      for (let i = 0; i < bokehN; i++) {
        const p = bokeh[i];
        const x = ((((p.x + p.vx * t) % 1.2) + 1.2) % 1.2 - 0.1) * W + Math.sin(t * 0.25 + p.ph) * p.z * 18;
        const y = ((((p.y + p.vy * t) % 1.2) + 1.2) % 1.2 - 0.1) * H;
        const k = pullB * 0.4 * p.z, s = (6 + 80 * p.z * p.z) * (minD / 900) + 3;
        const sparse = i % 3 === 0 ? 1 : 1 - 0.65 * smooth(4.4, 5.4, t);
        c.globalAlpha = p.a * fadeIn * sparse * (0.75 + 0.25 * Math.sin(t * 0.8 + p.ph));
        c.drawImage((p.z > 0.55 ? sprites.soft : sprites.hard)[p.col], lerp(x, cx, k) - s, lerp(y, cy, k) - s, s * 2, s * 2);
      }
      c.globalAlpha = 1;

      /* silk ribbon: one stroke per layer */
      const rp = (x01, L, k) => {
        const x = cx + (lerp(-0.05 * W, 1.05 * W, x01) - cx) * sq;
        const taper = 0.4 + 0.6 * Math.sin(Math.PI * x01);
        const wave = H * 0.16 * env * taper * (0.9 * Math.sin(x01 * 5.2 + t * 1.25 + L * 1.7) + 0.4 * Math.sin(x01 * 11.3 - t * 0.9 + L * 0.6));
        return [x, cy + wave + (k - 0.5) * (H * 0.07 * env + 1.5) * Math.sin(x01 * 4 + t * 0.7 + L * 2.1)];
      };
      if (h > 0.07 && ribFade > 0.002) {
        const hx = Math.min(h, 1), tail = h >= 1;
        const gx0 = cx + (-0.05 * W - cx) * sq, gx1 = cx + (1.05 * W - cx) * sq;
        const mk = (col, A) => {
          const g = c.createLinearGradient(gx0, 0, gx1, 0), z = `rgba(${col},0)`, a = `rgba(${col},${A})`;
          g.addColorStop(0, z); g.addColorStop(0.06, a);
          if (tail) { g.addColorStop(0.94, a); g.addColorStop(1, z); }
          else { g.addColorStop(Math.max(0.061, hx - 0.14), a); g.addColorStop(Math.max(0.062, hx), z); g.addColorStop(1, z); }
          return g;
        };
        c.lineCap = "round"; c.lineJoin = "round";
        for (let L = 0; L < 3; L++) {
          const col = [PINK, LAV, VIOLET][L], A = [0.2, 0.16, 0.26][L] * ribFade;
          c.strokeStyle = mk(col, A * 0.4); c.lineWidth = 9;
          c.beginPath();
          for (let i = 0; i <= NP; i++) { const [x, y] = rp(i / NP, L, 0.5); i ? c.lineTo(x, y) : c.moveTo(x, y); }
          c.stroke();
          c.strokeStyle = mk(col, A); c.lineWidth = 1; c.beginPath();
          for (let s = 0; s < STR; s++) for (let i = 0; i <= NP; i++) { const [x, y] = rp(i / NP, L, s / (STR - 1)); i ? c.lineTo(x, y) : c.moveTo(x, y); }
          c.stroke();
        }
      }

      /* dust: curl/sine turbulence, then converge */
      for (let n = 0; n < dustN; n++) {
        const p = dust[n], age = (h - p.u) * 1.6;
        if (age <= 0) continue;
        const cpi = easeOutCubic((t - 3.4 - p.d * 0.5) / 1.3);
        const fade = (1 - smooth(0.82, 1, cpi)) * (1 - smooth(4.3, 4.9, t));
        if (fade < 0.01) continue;
        const [bx, by] = rp(p.u, p.l, p.k), sp = p.rad * (0.4 + Math.min(age, 1.2));
        let x = bx + sp * Math.sin(t * p.a1 + p.ph + by * 0.012);
        let y = by + sp * Math.cos(t * p.a2 + p.ph * 1.3 + bx * 0.012) - Math.min(age, 1.5) * 8;
        const ang = Math.sin(cpi * Math.PI) * 0.9 * (p.d + 0.4), co = Math.cos(ang), si = Math.sin(ang), vx = x - cx, vy = y - cy;
        x = cx + (vx * co - vy * si) * (1 - cpi); y = cy + (vx * si + vy * co) * (1 - cpi);
        c.globalAlpha = smooth(0, 0.3, age) * (0.25 + 0.75 * (0.5 + 0.5 * Math.sin(t * (3 + p.a2 * 3) + p.ph))) * fade * 0.9;
        const s = p.sz * 3;
        c.drawImage(sprites.soft[p.col], x - s, y - s, s * 2, s * 2);
      }
      c.globalAlpha = 1;

      /* flare streak + ring */
      if (P > 0.01) {
        c.save(); c.translate(cx, cy); c.scale(1, 0.035);
        const sr = W * 0.5, g = c.createRadialGradient(0, 0, 0, 0, 0, sr);
        g.addColorStop(0, `rgba(${LAV},${0.75 * P})`); g.addColorStop(0.3, `rgba(${PINK},${0.28 * P})`); g.addColorStop(1, `rgba(${PINK},0)`);
        c.fillStyle = g; c.fillRect(-sr, -sr, sr * 2, sr * 2); c.restore();
      }
      const tf = (t - 3.7) / 1.0;
      if (tf > 0 && tf < 1) {
        c.strokeStyle = `rgba(${LAV},${0.22 * (1 - tf)})`; c.lineWidth = 1;
        c.beginPath(); c.arc(cx, cy, minD * 0.4 * easeOutCubic(tf), 0, 6.2832); c.stroke();
      }

      /* hairline */
      const hw = Math.min(W * 0.34, 420) * easeOutCubic((t - 3.9) / 1.0);
      if (hw > 1) {
        const a = smooth(3.9, 4.3, t);
        let g = c.createLinearGradient(cx - hw, 0, cx + hw, 0);
        g.addColorStop(0, `rgba(${LAV},0)`); g.addColorStop(0.5, `rgba(${LAV},${0.85 * a})`); g.addColorStop(1, `rgba(${LAV},0)`);
        c.strokeStyle = g; c.lineWidth = 1;
        c.beginPath(); c.moveTo(cx - hw, lineY); c.lineTo(cx + hw, lineY); c.stroke();
        g = c.createLinearGradient(cx - hw, 0, cx + hw, 0);
        g.addColorStop(0, `rgba(${PINK},0)`); g.addColorStop(0.5, `rgba(${PINK},${0.22 * a})`); g.addColorStop(1, `rgba(${PINK},0)`);
        c.strokeStyle = g; c.lineWidth = 4;
        c.beginPath(); c.moveTo(cx - hw, lineY); c.lineTo(cx + hw, lineY); c.stroke();
      }
      drawTitle(t);
    };

    const updateDom = (t) => {
      hint.style.opacity = skipAt != null ? "0" : String(smooth(1, 1.3, t) * (1 - smooth(2.5, 3, t)));
      let f = smooth(5.4, 6.0, t);
      if (skipAt != null) f = Math.max(f, clamp((t - skipAt) / 0.35));
      layer.style.opacity = String(1 - f);
      layer.style.transform = `scale(${(1 + 0.03 * f).toFixed(4)})`;
    };

    const frame = (now) => {
      if (stopped) return;
      if (start == null) start = now;
      const sec = (now - start) / 1000, t = Math.min(sec, DURATION);
      // adaptive quality: if the device struggles, drop resolution and particle counts once
      if (prev && sec < 2.6 && sec > 0.3 && !lowQ) {
        if (now - prev > 26) slow++;
        if (slow >= 12) { lowQ = true; dustN = 140; bokehN = 24; STR = 5; NP = 40; resize(); }
      }
      prev = now;
      draw(t); updateDom(t);
      if (sec >= DURATION || (skipAt != null && sec >= skipAt + 0.35)) finish();
      else raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("keydown", onInput);
      window.removeEventListener("pointerdown", onInput);
      if (audio) { audio.ctx.removeEventListener("statechange", tryStart); audio.close(); }
    };
  }, []);

  return (
    <>
      {/* the home screen lives underneath; the intro fades out to reveal it */}
      {children}

      {!done && (
        <div style={{ position: "fixed", inset: 0, zIndex: 9999, overflow: "hidden", fontFamily: FONT }}>
          <div ref={layerRef} style={{ position: "absolute", inset: 0, background: "#05061c", willChange: "opacity, transform" }}>
            <h1 style={srOnly}>{TITLE}</h1>
            <canvas ref={canvasRef} aria-hidden="true" style={{ position: "absolute", inset: 0, display: "block" }} />
            <div ref={hintRef} style={{ position: "absolute", left: 0, right: 0, bottom: 28, textAlign: "center", fontSize: 12, letterSpacing: "0.06em", color: "rgba(233,228,255,.5)", opacity: 0, pointerEvents: "none" }}>
              Press any key or click to skip
            </div>
          </div>
        </div>
      )}

    </>
  );
}
