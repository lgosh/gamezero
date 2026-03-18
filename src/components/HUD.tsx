import React, { useEffect, useRef, useState } from 'react'
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

function Minimap({ playerPos, playerHeading, minimapCanvas, remotePlayers }: {
  playerPos?: { x: number; z: number }
  playerHeading?: number
  minimapCanvas?: HTMLCanvasElement
  remotePlayers?: { x: number; z: number }[]
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

    // Remote player blips — GTA-style colored dots
    if (remotePlayers && remotePlayers.length > 0 && playerPos) {
      const MAP_RANGE = 900, MAP_SIZE = 512
      const mapScale = MAP_SIZE / (2 * MAP_RANGE)
      const VIEW_RADIUS = 200
      const drawScale = (W / 2) / (VIEW_RADIUS * mapScale)
      const heading = (playerHeading ?? 0) - Math.PI

      for (const rp of remotePlayers) {
        // Offset from local player in world coords
        const dx = rp.x - playerPos.x
        const dz = rp.z - playerPos.z

        // Rotate by map heading
        const cos = Math.cos(heading)
        const sin = Math.sin(heading)
        const rx = (dx * cos - dz * sin) * mapScale * drawScale
        const ry = (dx * sin + dz * cos) * mapScale * drawScale

        // Clamp to minimap circle edge if too far
        const dist = Math.sqrt(rx * rx + ry * ry)
        const maxR = W / 2 - 8
        const scale = dist > maxR ? maxR / dist : 1
        const sx = W / 2 + rx * scale
        const sy = H / 2 + ry * scale

        ctx.save()
        ctx.fillStyle = '#38bdf8' // sky blue blip
        ctx.strokeStyle = '#000000'
        ctx.lineWidth = 1.5
        ctx.shadowBlur = 3
        ctx.shadowColor = '#000000'
        ctx.beginPath()
        ctx.arc(sx, sy, 5, 0, Math.PI * 2)
        ctx.fill()
        ctx.stroke()
        ctx.restore()
      }
    }

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

  }, [playerPos, playerHeading, minimapCanvas, remotePlayers])

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
function GTAStats({ weapon, magazineAmmo, reserveAmmo, armor, health }: {
  weapon?: 'fist' | 'glock'
  magazineAmmo?: number
  reserveAmmo?: number
  armor?: number
  health?: number
}) {
  const armorPct = armor ?? 100
  const healthPct = health ?? 100
  return (
    <div className="flex flex-col items-end gap-1 font-sans font-black italic text-right uppercase" style={{ textShadow: '2px 2px 0px #000' }}>
      {/* Time */}
      <div className="text-2xl text-[#ffffff] tracking-tighter">14:30</div>

      {/* Money */}
      <div className="text-3xl text-[#2d7d32] tracking-tighter">$00005000</div>

      {/* Health/Armor bars */}
      <div className="w-32 flex flex-col gap-1.5 mt-1">
        {/* Armor */}
        <div className="h-2.5 bg-[#000000] border-2 border-[#000000] overflow-hidden">
          <div className="h-full bg-[#cbd1d4] transition-all duration-150" style={{ width: `${armorPct}%` }} />
        </div>
        {/* Health */}
        <div className="h-2.5 bg-[#000000] border-2 border-[#000000] overflow-hidden">
          <div
            className="h-full transition-all duration-150"
            style={{
              width: `${healthPct}%`,
              backgroundColor: healthPct > 50 ? '#b22222' : healthPct > 25 ? '#cc4400' : '#ff0000',
            }}
          />
        </div>
      </div>

      {/* Weapon Icon */}
      <div className="mt-2 w-16 h-16 bg-black/40 border-2 border-white/20 flex flex-col items-center justify-center">
        {weapon === 'glock' ? (
          <>
            <span className="text-2xl leading-none">🔫</span>
            <span className="text-[10px] text-white/80 font-mono not-italic mt-0.5">
              {magazineAmmo}/{reserveAmmo}
            </span>
          </>
        ) : (
          <span className="text-4xl leading-none">👊</span>
        )}
      </div>
    </div>
  )
}

export default function HUD({ state, onReset, onPause, onMuteToggle, onTimeToggle, onBack, muted }: HUDProps) {
  const gearLabels: Record<number, string> = { 0: 'R', 1: 'N', 2: '1', 3: '2', 4: '3', 5: '4', 6: '5', 7: '6' }
  const gearDisplay = gearLabels[state.gear] ?? String(state.gear)
  const [showScoreboard, setShowScoreboard] = useState(false)

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== 'Tab') return
      e.preventDefault()
      setShowScoreboard(true)
    }
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code !== 'Tab') return
      e.preventDefault()
      setShowScoreboard(false)
    }
    window.addEventListener('keydown', onKeyDown, true)
    window.addEventListener('keyup', onKeyUp, true)
    return () => {
      window.removeEventListener('keydown', onKeyDown, true)
      window.removeEventListener('keyup', onKeyUp, true)
    }
  }, [])

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
        <GTAStats weapon={state.weapon} magazineAmmo={state.magazineAmmo} reserveAmmo={state.reserveAmmo} armor={state.armor} health={state.health} />
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
        <Minimap playerPos={state.playerPos} playerHeading={state.playerHeading} minimapCanvas={state.minimapCanvas} remotePlayers={state.remotePlayers} />
        {state.onFoot ? (
          <div className="hud-panel px-3 py-2 text-[11px] text-white/35 font-mono leading-5">
            <div>W / ↑ — Walk forward</div>
            <div>S / ↓ — Walk back</div>
            <div>Mouse — Look / turn</div>
            <div>Space — Sprint</div>
            <div>Shift — Jump</div>
            <div>F — Enter car &nbsp; Q — Weapon</div>
            <div>LMB — Shoot &nbsp; R — Reload</div>
            <div className="border-t border-white/10 mt-1 pt-1">T — Chat &nbsp; K — Voice</div>
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
            <div className="border-t border-white/10 mt-1 pt-1">T — Chat &nbsp; K — Voice</div>
            <div className="text-white/50">P / ESC — Pause</div>
          </div>
        )}
      </div>

      {/* ── Voice chat speakers (CS 1.6 style) ──────────────────────────────── */}
      {state.voiceSpeakers && state.voiceSpeakers.length > 0 && (
        <div className="absolute right-6 top-1/2 -translate-y-1/2 flex flex-col gap-1.5 pointer-events-none">
          {state.voiceSpeakers.map((name) => (
            <div
              key={name}
              className="flex items-center gap-2 px-3 py-1.5 rounded"
              style={{ background: 'rgba(0,0,0,0.6)' }}
            >
              <div className="w-3 h-3 rounded-full bg-yellow-400 animate-pulse" />
              <span className="text-white text-sm font-bold tracking-wide" style={{ fontFamily: 'Rajdhani, sans-serif' }}>
                {name}
              </span>
            </div>
          ))}
        </div>
      )}

      {showScoreboard && state.scoreboard && (
        <div className="absolute inset-0 flex items-start justify-center pt-16 pointer-events-none">
          <div className="hud-panel w-[min(92vw,820px)] px-5 py-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="text-white font-bold tracking-[0.24em] text-sm uppercase" style={{ fontFamily: 'Rajdhani, sans-serif' }}>
                  Online Players
                </div>
                <div className="text-white/45 text-[11px] font-mono mt-1">
                  Hold TAB to view roster
                </div>
              </div>
              <div className="text-right">
                <div className="text-[11px] font-mono uppercase tracking-wider text-white/45">Connection</div>
                <div className="flex items-center gap-2 justify-end mt-1">
                  <span
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ background: state.connectionStatus === 'online' ? '#22c55e' : state.connectionStatus === 'connecting' ? '#f59e0b' : '#9ca3af' }}
                  />
                  <span className="text-white/90 text-sm font-mono">
                    {state.connectionStatus === 'online' ? `ONLINE ${state.localPing ?? 0}ms` : state.connectionStatus === 'connecting' ? 'CONNECTING' : 'OFFLINE'}
                  </span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-[1.3fr_2fr_1fr_0.8fr_0.8fr_0.6fr] gap-3 px-3 py-2 text-[11px] font-mono uppercase tracking-wider text-white/40 border-b border-white/10">
              <div>ID</div>
              <div>Name</div>
              <div>Ping</div>
              <div>Kills</div>
              <div>Deaths</div>
              <div>VC</div>
            </div>

            <div className="flex flex-col">
              {state.scoreboard.map((player) => (
                <div
                  key={player.id}
                  className="grid grid-cols-[1.3fr_2fr_1fr_0.8fr_0.8fr_0.6fr] gap-3 px-3 py-2.5 text-sm border-b border-white/5"
                  style={{ background: player.local ? 'rgba(59,130,246,0.10)' : 'transparent' }}
                >
                  <div className="text-white/70 font-mono text-xs">{player.id.slice(0, 12)}</div>
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`font-bold truncate ${player.local ? 'text-sky-300' : 'text-white'}`}>{player.nickname}</span>
                    {player.local && <span className="text-[10px] font-mono text-sky-300/70">YOU</span>}
                  </div>
                  <div className="text-white/80 font-mono">{player.ping}ms</div>
                  <div className="text-white/90 font-mono">{player.kills}</div>
                  <div className="text-white/70 font-mono">{player.deaths}</div>
                  <div className="flex items-center">
                    {player.speaking ? <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.8)]" /> : <span className="w-2.5 h-2.5 rounded-full bg-white/15" />}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Crosshair (GTA-style, only with gun on foot) ──────────────────────── */}
      {state.weapon === 'glock' && state.onFoot && state.state === 'playing' && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <svg width="24" height="24" viewBox="0 0 24 24" className="opacity-80">
            <circle cx="12" cy="12" r="3" fill="none" stroke="white" strokeWidth="1.5" />
            <line x1="12" y1="0" x2="12" y2="7" stroke="white" strokeWidth="1.5" />
            <line x1="12" y1="17" x2="12" y2="24" stroke="white" strokeWidth="1.5" />
            <line x1="0" y1="12" x2="7" y2="12" stroke="white" strokeWidth="1.5" />
            <line x1="17" y1="12" x2="24" y2="12" stroke="white" strokeWidth="1.5" />
          </svg>
        </div>
      )}

      {/* ── Reloading indicator ─────────────────────────────────────────────── */}
      {state.reloading && state.state === 'playing' && (
        <div className="absolute left-1/2 -translate-x-1/2 pointer-events-none" style={{ top: '55%' }}>
          <div className="text-white/60 text-xs font-mono tracking-widest uppercase animate-pulse">
            Reloading...
          </div>
        </div>
      )}

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

      {/* ── Kill feed (right side, GTA style) ──────────────────────────────── */}
      {state.killFeed && state.killFeed.length > 0 && (
        <div className="absolute right-6 bottom-1/3 flex flex-col gap-1 pointer-events-none items-end">
          {state.killFeed.slice(-5).map((k, i) => (
            <div
              key={i}
              className="flex items-center gap-2 px-3 py-1 rounded"
              style={{ background: 'rgba(0,0,0,0.6)' }}
            >
              <span className="text-white text-xs font-bold">{k.killer}</span>
              <span className="text-red-400 text-xs">🔫</span>
              <span className="text-gray-300 text-xs font-bold">{k.victim}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── WASTED overlay (GTA style) ─────────────────────────────────────── */}
      {state.dead && (
        <div
          className="absolute inset-0 flex items-center justify-center pointer-events-none"
          style={{
            background: 'rgba(120, 0, 0, 0.55)',
            animation: 'wastedFadeIn 0.5s ease-out',
          }}
        >
          <div className="text-center">
            <div
              className="text-red-500 font-black italic tracking-[0.3em] uppercase"
              style={{
                fontSize: '5rem',
                textShadow: '4px 4px 0px #000, 0 0 40px rgba(255,0,0,0.5)',
                fontFamily: 'Impact, sans-serif',
                letterSpacing: '0.15em',
                animation: 'wastedTextIn 0.8s ease-out',
              }}
            >
              WASTED
            </div>
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
