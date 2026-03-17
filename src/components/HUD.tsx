import React, { useEffect, useRef } from 'react'
import type { HUDState } from '../game/GameEngine'

interface HUDProps {
  state: HUDState
  onReset: () => void
  onPause: () => void
  onMuteToggle: () => void
  onTimeToggle: () => void
  onBack: () => void
  muted: boolean
}

function FPSCounter() {
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    let last = performance.now()
    let frames = 0
    let raf: number
    const tick = (now: number) => {
      frames++
      if (now - last >= 500) {
        const fps = Math.round(frames * 1000 / (now - last))
        if (ref.current) {
          ref.current.textContent = `${fps} FPS`
          ref.current.style.color = fps >= 50 ? '#4ade80' : fps >= 30 ? '#facc15' : '#f87171'
        }
        frames = 0
        last = now
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])
  return (
    <span
      ref={ref}
      className="font-mono text-xs"
      style={{ textShadow: '0 1px 3px #000' }}
    />
  )
}

function Minimap({ playerPos, playerHeading, minimapCanvas }: {
  playerPos?: { x: number; z: number }
  playerHeading?: number
  minimapCanvas?: HTMLCanvasElement
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !playerPos) return
    const ctx = canvas.getContext('2d')!
    const W = canvas.width
    const H = canvas.height

    ctx.clearRect(0, 0, W, H)

    // Circular background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.75)'
    ctx.beginPath()
    ctx.arc(W/2, H/2, W/2 - 2, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = 'rgba(255,255,255,0.6)'
    ctx.lineWidth = 2
    ctx.stroke()

    // Clip to circle
    ctx.save()
    ctx.beginPath()
    ctx.arc(W/2, H/2, W/2 - 3, 0, Math.PI * 2)
    ctx.clip()

    if (minimapCanvas) {
      // ── Real OSM minimap ────────────────────────────────────────────────
      // MAP_RANGE=900, MAP_SIZE=512 → mapScale px/m
      const MAP_RANGE = 900, MAP_SIZE = 512
      const mapScale = MAP_SIZE / (2 * MAP_RANGE)   // ≈ 0.2844 px/m

      // Player centre in map-canvas pixels
      const pcx = (playerPos.x + MAP_RANGE) * mapScale
      const pcz = (playerPos.z + MAP_RANGE) * mapScale

      // We want VIEW_RADIUS meters to fill W/2 display pixels
      const VIEW_RADIUS = 200  // meters visible to each side
      const drawScale   = (W / 2) / (VIEW_RADIUS * mapScale)

      ctx.translate(W/2, H/2)
      // heading = atan2(fwd.x, fwd.z); north(-Z)=π, south(+Z)=0, east(+X)=π/2
      // We need map rotation = heading - π so the player's facing direction points UP
      ctx.rotate((playerHeading ?? 0) - Math.PI)
      ctx.scale(drawScale, drawScale)
      ctx.drawImage(minimapCanvas, -pcx, -pcz)
    }

    ctx.restore()

    // Player marker — white triangle pointing up, always at center
    ctx.save()
    ctx.translate(W/2, H/2)
    ctx.fillStyle = '#ffffff'
    ctx.strokeStyle = '#000000'
    ctx.lineWidth = 1.5
    ctx.shadowBlur = 4
    ctx.shadowColor = '#000000'
    ctx.beginPath()
    ctx.moveTo(0, -10)
    ctx.lineTo(7, 8)
    ctx.lineTo(-7, 8)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
    ctx.restore()

  }, [playerPos, playerHeading, minimapCanvas])

  return <canvas ref={canvasRef} width={160} height={160} className="shadow-2xl" style={{ borderRadius: '50%' }} />
}

function Speedometer({ speedKmh, maxSpeed = 260 }: { speedKmh: number; maxSpeed?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    const W = canvas.width
    const H = canvas.height
    const cx = W / 2
    const cy = H / 2 + 10
    const r = W / 2 - 12

    ctx.clearRect(0, 0, W, H)

    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(0,0,0,0.75)'
    ctx.fill()

    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.strokeStyle = 'rgba(255,255,255,0.12)'
    ctx.lineWidth = 2
    ctx.stroke()

    const startAngle = (210 * Math.PI) / 180
    const endAngle = (330 * Math.PI) / 180
    const speedFraction = Math.min(speedKmh / maxSpeed, 1)

    ctx.beginPath()
    ctx.arc(cx, cy, r - 8, startAngle, endAngle + Math.PI * 2)
    ctx.strokeStyle = 'rgba(255,255,255,0.1)'
    ctx.lineWidth = 6
    ctx.stroke()

    const speedColor = speedKmh > 180 ? '#ef4444' : speedKmh > 100 ? '#f59e0b' : '#22c55e'
    ctx.beginPath()
    ctx.arc(cx, cy, r - 8, startAngle, startAngle + speedFraction * ((Math.PI * 2 - startAngle + endAngle) % (Math.PI * 2)))
    ctx.strokeStyle = speedColor
    ctx.lineWidth = 6
    ctx.lineCap = 'round'
    ctx.stroke()

    const tickCount = 13
    for (let i = 0; i <= tickCount; i++) {
      const frac = i / tickCount
      const angle = startAngle + frac * ((Math.PI * 2 - startAngle + endAngle) % (Math.PI * 2))
      const isMajor = i % 2 === 0
      const inner = r - (isMajor ? 20 : 14)
      const outer = r - 4
      ctx.beginPath()
      ctx.moveTo(cx + Math.cos(angle) * inner, cy + Math.sin(angle) * inner)
      ctx.lineTo(cx + Math.cos(angle) * outer, cy + Math.sin(angle) * outer)
      ctx.strokeStyle = isMajor ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.3)'
      ctx.lineWidth = isMajor ? 2 : 1
      ctx.stroke()

      if (isMajor) {
        const labelSpeed = Math.round((frac * maxSpeed) / 20) * 20
        const lx = cx + Math.cos(angle) * (r - 30)
        const ly = cy + Math.sin(angle) * (r - 30)
        ctx.fillStyle = 'rgba(255,255,255,0.5)'
        ctx.font = '9px "Share Tech Mono", monospace'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(String(labelSpeed), lx, ly)
      }
    }

    ctx.fillStyle = '#ffffff'
    ctx.font = `bold ${speedKmh >= 100 ? '28' : '32'}px "Share Tech Mono", monospace`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(String(Math.round(speedKmh)), cx, cy - 4)

    ctx.fillStyle = 'rgba(255,255,255,0.45)'
    ctx.font = '11px "Rajdhani", sans-serif'
    ctx.fillText('km/h', cx, cy + 20)
  }, [speedKmh, maxSpeed])

  return <canvas ref={canvasRef} width={140} height={140} />
}

function RPMBar({ rpm, maxRpm = 7500 }: { rpm: number; maxRpm?: number }) {
  const fraction = rpm / maxRpm
  const redline = rpm > maxRpm * 0.88
  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] text-white/40 font-mono uppercase tracking-wider">RPM</span>
        <span className={`text-xs font-mono ${redline ? 'text-red-400 blink' : 'text-white/70'}`}>
          {(rpm / 1000).toFixed(1)}k
        </span>
      </div>
      <div className="h-2 bg-white/10 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-75"
          style={{
            width: `${fraction * 100}%`,
            background: redline
              ? 'linear-gradient(90deg, #ef4444, #ff0000)'
              : fraction > 0.7
              ? 'linear-gradient(90deg, #22c55e, #f59e0b)'
              : 'linear-gradient(90deg, #22c55e, #4ade80)',
          }}
        />
      </div>
    </div>
  )
}

function DamageIndicator({ damage }: { damage: number }) {
  const pct = Math.round(damage * 100)
  const color = damage > 0.7 ? 'text-red-400' : damage > 0.4 ? 'text-yellow-400' : 'text-green-400'
  const barColor = damage > 0.7 ? '#ef4444' : damage > 0.4 ? '#f59e0b' : '#22c55e'
  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] text-white/40 font-mono uppercase tracking-wider">DMG</span>
        <span className={`text-xs font-mono ${color}`}>{pct}%</span>
      </div>
      <div className="h-2 bg-white/10 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-150" style={{ width: `${pct}%`, backgroundColor: barColor }} />
      </div>
    </div>
  )
}

/** GTA San Andreas style stats */
function GTAStats() {
  return (
    <div className="flex flex-col items-end gap-1 font-sans font-black italic text-right uppercase" style={{ textShadow: '2px 2px 0px #000' }}>
      {/* Time */}
      <div className="text-2xl text-[#ffffff] tracking-tighter">14:30</div>
      
      {/* Money */}
      <div className="text-3xl text-[#2d7d32] tracking-tighter">$00005000</div>

      {/* Health/Armor bars */}
      <div className="w-32 flex flex-col gap-1.5 mt-1">
        {/* Armor (Blue) */}
        <div className="h-2.5 bg-[#000000] border-2 border-[#000000] overflow-hidden">
          <div className="h-full bg-[#cbd1d4]" style={{ width: '100%' }} />
        </div>
        {/* Health (Red) */}
        <div className="h-2.5 bg-[#000000] border-2 border-[#000000] overflow-hidden">
          <div className="h-full bg-[#b22222]" style={{ width: '100%' }} />
        </div>
      </div>

      {/* Weapon Icon */}
      <div className="mt-2 w-16 h-16 bg-black/40 border-2 border-white/20 flex items-center justify-center text-4xl">
        👊
      </div>
    </div>
  )
}

export default function HUD({ state, onReset, onPause, onMuteToggle, onTimeToggle, onBack, muted }: HUDProps) {
  const gearLabels: Record<number, string> = { 0: 'R', 1: 'N', 2: '1', 3: '2', 4: '3', 5: '4', 6: '5', 7: '6' }
  const gearDisplay = gearLabels[state.gear] ?? String(state.gear)

  return (
    <div className="absolute inset-0 pointer-events-none select-none">

      {/* ── Game title ────────────────────────────────────────────────────────── */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 pointer-events-none select-none">
        <div
          className="text-white/50 font-bold tracking-[0.18em] text-xs uppercase text-center"
          style={{ fontFamily: 'Rajdhani, sans-serif', textShadow: '0 0 12px rgba(0,120,255,0.5)' }}
        >
          ჯეტია საქართველო
        </div>
      </div>

      {/* ── Top-left: Car name ────────────────────────────────────────────────── */}
      <div className="absolute top-6 left-6 pointer-events-none">
        <div className="hud-panel px-4 py-2 flex flex-col gap-0.5">
          <div className="flex items-center justify-between gap-4">
            <div className="text-white/90 font-bold text-sm tracking-wider uppercase">
              {state.onFoot ? '👟 On Foot' :
                state.carType === 'bmw' ? '🚗 BMW M5 E34' :
                state.carType === 'bmwcs' ? '🚗 BMW M5 CS' :
                state.carType === 'toyota' ? '🚗 Toyota RAV4 Hybrid' :
                '🚗 Mercedes-AMG E63 S'}
            </div>
            <FPSCounter />
          </div>
          <div className="text-white/45 text-[11px] font-mono">
            📍 Freedom Square · Tbilisi
          </div>
        </div>
      </div>

      {/* ── Top-right: GTA Stats ────────────────────────────────────────────── */}
      <div className="absolute top-6 right-6 pointer-events-none">
        <GTAStats />
      </div>

      {/* ── Bottom-right: Speedometer + RPM + Gear ───────────────────────────── */}
      {!state.onFoot && (
        <>
          <div className="absolute bottom-6 right-6 pointer-events-none">
            <div className="hud-panel p-3 flex flex-col items-center gap-2" style={{ width: 160 }}>
              <Speedometer speedKmh={state.speed} />
              <div className="w-full px-1">
                <RPMBar rpm={state.rpm} />
              </div>
            </div>
          </div>
          <div className="absolute bottom-6 right-[186px] pointer-events-none">
            <div className="hud-panel w-16 h-16 flex items-center justify-center">
              <span
                className="font-mono text-3xl font-bold"
                style={{ color: gearDisplay === 'R' ? '#f87171' : gearDisplay === 'N' ? '#facc15' : '#ffffff' }}
              >
                {gearDisplay}
              </span>
            </div>
          </div>
        </>
      )}

      {/* ── Bottom-left: Minimap & Controls hint ─────────────────────────────── */}
      <div className="absolute bottom-6 left-6 pointer-events-none flex flex-col gap-4">
        <Minimap playerPos={state.playerPos} playerHeading={state.playerHeading} minimapCanvas={state.minimapCanvas} />
        {state.onFoot ? (
          <div className="hud-panel px-3 py-2 text-[11px] text-white/35 font-mono leading-5">
            <div>W / ↑ — Walk forward</div>
            <div>S / ↓ — Walk back</div>
            <div>Mouse — Look / turn</div>
            <div>Space — Sprint</div>
            <div>Shift — Jump</div>
            <div>F — Enter car</div>
            <div className="border-t border-white/10 mt-1 pt-1">T — Chat</div>
            <div className="text-white/50">P / ESC — Pause</div>
          </div>
        ) : (
          <div className="hud-panel px-3 py-2 text-[11px] text-white/35 font-mono leading-5">
            <div>W / ↑ — Accelerate</div>
            <div>S / ↓ — Brake / Reverse</div>
            <div>A D / ← → — Steer</div>
            <div>Space — Handbrake</div>
            <div>H — Horn &nbsp; B — Look back</div>
            <div>C — Camera &nbsp; F — Exit car</div>
            <div className="border-t border-white/10 mt-1 pt-1">T — Chat</div>
            <div className="text-white/50">P / ESC — Pause</div>
          </div>
        )}
      </div>

      {/* ── Pause overlay ─────────────────────────────────────────────────────── */}
      {state.state === 'paused' && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-auto" style={{ background: 'rgba(100,100,100,0.45)', backdropFilter: 'blur(4px)' }}>
          <div className="hud-panel p-8 text-center" style={{ minWidth: 280 }}>
            <div className="text-white text-4xl font-bold mb-2 tracking-widest" style={{ fontFamily: 'Rajdhani, sans-serif' }}>PAUSED</div>
            <div className="text-white/50 text-sm mb-6">Press ESC to resume</div>
            <div className="flex flex-col gap-2">
              <button onClick={onPause} className="w-full px-6 py-3 bg-white/15 hover:bg-white/25 text-white font-bold rounded tracking-wider transition-colors">▶ RESUME</button>
              <button onClick={onReset} className="w-full px-6 py-3 bg-white/10 hover:bg-white/20 text-white/80 font-bold rounded tracking-wider transition-colors">↺ RESTART</button>
              <div className="border-t border-white/10 my-1" />
              <button onClick={onMuteToggle} className="w-full px-6 py-2.5 bg-white/07 hover:bg-white/15 text-white/70 font-bold rounded tracking-wider transition-colors text-sm">
                {muted ? '🔇 Unmute Sound' : '🔊 Sound On'}
              </button>
              <button onClick={onTimeToggle} className="w-full px-6 py-2.5 bg-white/07 hover:bg-white/15 text-white/70 font-bold rounded tracking-wider transition-colors text-sm">
                🕒 Toggle Time of Day
              </button>
              <div className="border-t border-white/10 my-1" />
              <button onClick={onBack} className="w-full px-6 py-2.5 bg-white/05 hover:bg-white/15 text-white/50 hover:text-white font-bold rounded tracking-wider transition-colors text-sm">
                ← Back to Menu
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Crash overlay ─────────────────────────────────────────────────────── */}
      {state.state === 'crashed' && (
        <div className="absolute inset-0 bg-red-950/70 flex items-center justify-center pointer-events-auto">
          <div className="hud-panel p-8 text-center border border-red-500/30">
            <div className="text-red-400 text-5xl font-bold mb-2 tracking-widest">TOTALED</div>
            <div className="text-white/60 text-base mb-2">Your car is destroyed</div>
            <div className="text-white/40 text-sm mb-6">Freedom Square, Tbilisi</div>
            <button onClick={onReset} className="px-8 py-3 bg-red-600 hover:bg-red-500 text-white font-bold rounded tracking-wider transition-colors">RESTART</button>
          </div>
        </div>
      )}

      {/* ── Speed vignette ────────────────────────────────────────────────────── */}
      {state.speed > 160 && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: `radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,${Math.min((state.speed - 160) / 100 * 0.5, 0.4)}) 100%)` }}
        />
      )}
    </div>
  )
}
