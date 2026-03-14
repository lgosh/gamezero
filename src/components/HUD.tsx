import React, { useEffect, useRef } from 'react'
import type { HUDState } from '../game/GameEngine'

interface HUDProps {
  state: HUDState
  onReset: () => void
  onPause: () => void
  onMuteToggle: () => void
  muted: boolean
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

    // Background disc
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(0,0,0,0.75)'
    ctx.fill()

    // Outer ring
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.strokeStyle = 'rgba(255,255,255,0.12)'
    ctx.lineWidth = 2
    ctx.stroke()

    // Speed arc — from 210° to 330° = 120° total = full range
    const startAngle = (210 * Math.PI) / 180
    const endAngle = (330 * Math.PI) / 180

    const speedFraction = Math.min(speedKmh / maxSpeed, 1)
    const currentAngle = startAngle + speedFraction * (Math.PI * 2 - startAngle + endAngle - Math.PI * 2 + Math.PI)

    // Background arc
    ctx.beginPath()
    ctx.arc(cx, cy, r - 8, startAngle, endAngle + Math.PI * 2)
    ctx.strokeStyle = 'rgba(255,255,255,0.1)'
    ctx.lineWidth = 6
    ctx.stroke()

    // Speed arc color
    const speedColor = speedKmh > 180 ? '#ef4444' : speedKmh > 100 ? '#f59e0b' : '#22c55e'
    ctx.beginPath()
    ctx.arc(cx, cy, r - 8, startAngle, startAngle + speedFraction * ((Math.PI * 2 - startAngle + endAngle) % (Math.PI * 2)))
    ctx.strokeStyle = speedColor
    ctx.lineWidth = 6
    ctx.lineCap = 'round'
    ctx.stroke()

    // Tick marks
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

      // Speed labels on major ticks
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

    // Center speed text
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
        <div
          className="h-full rounded-full transition-all duration-150"
          style={{ width: `${pct}%`, backgroundColor: barColor }}
        />
      </div>
    </div>
  )
}

export default function HUD({ state, onReset, onPause, onMuteToggle, muted }: HUDProps) {
  const gearLabels: Record<number, string> = {
    0: 'R',
    1: 'N',
    2: '1',
    3: '2',
    4: '3',
    5: '4',
    6: '5',
    7: '6',
  }
  const gearDisplay = gearLabels[state.gear] ?? String(state.gear)
  const isPlaying = state.state === 'playing'

  return (
    <div className="absolute inset-0 pointer-events-none select-none">
      {/* Bottom-right: Speedometer + RPM + Gear (hidden on foot) */}
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
                style={{
                  color: gearDisplay === 'R' ? '#f87171' : gearDisplay === 'N' ? '#facc15' : '#ffffff',
                }}
              >
                {gearDisplay}
              </span>
            </div>
          </div>
        </>
      )}

      {/* Top-right: Damage */}
      <div className="absolute top-6 right-6 pointer-events-none">
        <div className="hud-panel p-3" style={{ width: 160 }}>
          <DamageIndicator damage={state.damage} />
        </div>
      </div>

      {/* Top-left: Car name + location */}
      <div className="absolute top-6 left-6 pointer-events-none">
        <div className="hud-panel px-4 py-2 flex flex-col gap-0.5">
          <div className="text-white/90 font-bold text-sm tracking-wider uppercase">
            {state.carType === 'bmw' ? '🚗 BMW M3' : '🚗 MERCEDES C63 AMG'}
          </div>
          <div className="text-white/45 text-[11px] font-mono">
            📍 Freedom Square · Tbilisi
          </div>
        </div>
      </div>

      {/* Bottom-left: Controls hint */}
      <div className="absolute bottom-6 left-6 pointer-events-none">
        {state.onFoot ? (
          <div className="hud-panel px-3 py-2 text-[11px] text-white/35 font-mono leading-5">
            <div>W / ↑ — Walk forward</div>
            <div>S / ↓ — Walk back</div>
            <div>A D / ← → — Turn</div>
            <div>F — Enter car</div>
          </div>
        ) : (
          <div className="hud-panel px-3 py-2 text-[11px] text-white/35 font-mono leading-5">
            <div>W / ↑ — Accelerate</div>
            <div>S / ↓ — Brake / Reverse</div>
            <div>A D / ← → — Steer</div>
            <div>Space — Handbrake</div>
            <div>H — Horn &nbsp; B — Look back</div>
            <div>C — Camera &nbsp; F — Exit car</div>
          </div>
        )}
      </div>

      {/* Game title — top center */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 pointer-events-none select-none text-center">
        <div
          className="text-white/70 font-bold tracking-[0.18em] text-sm uppercase"
          style={{ fontFamily: 'Rajdhani, sans-serif', textShadow: '0 0 12px rgba(0,120,255,0.5)' }}
        >
          ჯეტია საქართველო
        </div>
      </div>

      {/* Mute button (top-right corner) */}
      <div className="absolute top-6 right-6 mt-[72px] pointer-events-auto">
        <button
          onClick={onMuteToggle}
          className="hud-panel px-3 py-1 text-[11px] text-white/60 hover:text-white uppercase tracking-wider font-mono cursor-pointer hover:bg-white/10 transition-colors"
          title={muted ? 'Unmute' : 'Mute'}
        >
          {muted ? '🔇 Muted' : '🔊 Sound'}
        </button>
      </div>

      {/* Pause button (top-center) */}
      <div className="absolute top-10 left-1/2 -translate-x-1/2 pointer-events-auto">
        <button
          onClick={onPause}
          className="hud-panel px-3 py-1 text-[11px] text-white/60 hover:text-white uppercase tracking-wider font-mono cursor-pointer hover:bg-white/10 transition-colors"
        >
          {state.state === 'paused' ? '▶ Resume' : '⏸ Pause'}
        </button>
      </div>

      {/* Pause overlay */}
      {state.state === 'paused' && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-auto" style={{ background: 'rgba(100,100,100,0.45)', backdropFilter: 'blur(4px)' }}>
          <div className="hud-panel p-8 text-center">
            <div className="text-white text-4xl font-bold mb-2 tracking-widest" style={{ fontFamily: 'Rajdhani, sans-serif' }}>PAUSED</div>
            <div className="text-white/50 text-sm mb-6">ESC to resume</div>
            <div className="flex gap-3 justify-center">
              <button
                onClick={onPause}
                className="px-6 py-3 bg-white/15 hover:bg-white/25 text-white font-bold rounded tracking-wider transition-colors"
              >
                ▶ RESUME
              </button>
              <button
                onClick={onReset}
                className="px-6 py-3 bg-white/10 hover:bg-white/20 text-white/80 font-bold rounded tracking-wider transition-colors"
              >
                ↺ RESPAWN
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Crash overlay */}
      {state.state === 'crashed' && (
        <div className="absolute inset-0 bg-red-950/70 flex items-center justify-center pointer-events-auto">
          <div className="hud-panel p-8 text-center border border-red-500/30">
            <div className="text-red-400 text-5xl font-bold mb-2 tracking-widest">TOTALED</div>
            <div className="text-white/60 text-base mb-2">Your car is destroyed</div>
            <div className="text-white/40 text-sm mb-6">Freedom Square, Tbilisi</div>
            <button
              onClick={onReset}
              className="px-8 py-3 bg-red-600 hover:bg-red-500 text-white font-bold rounded tracking-wider transition-colors"
            >
              RESPAWN
            </button>
          </div>
        </div>
      )}

      {/* Speed flash effect when going fast */}
      {state.speed > 160 && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: `radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,${Math.min((state.speed - 160) / 100 * 0.5, 0.4)}) 100%)`,
          }}
        />
      )}
    </div>
  )
}
