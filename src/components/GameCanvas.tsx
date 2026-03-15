import React, { useEffect, useRef, useState, useCallback } from 'react'
import { GameEngine, type HUDState } from '../game/GameEngine'
import HUD from './HUD'
import ChatOverlay, { type ChatMsg } from './ChatOverlay'

interface GameCanvasProps {
  nickname: string
  onBack: () => void
}

const DEFAULT_HUD: HUDState = {
  speed: 0,
  rpm: 800,
  gear: 1,
  damage: 0,
  state: 'loading',
  carType: 'bmw',
}

export default function GameCanvas({ nickname, onBack }: GameCanvasProps) {
  const canvasRef  = useRef<HTMLCanvasElement>(null)
  const engineRef  = useRef<GameEngine | null>(null)
  const [hudState, setHudState]         = useState<HUDState>({ ...DEFAULT_HUD })
  const [loading, setLoading]           = useState(true)
  const [muted, setMuted]               = useState(false)
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([])
  const [noclipActive, setNoclipActive] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const engine = new GameEngine()
    engineRef.current = engine

    engine.onChatMessage  = (msg) => setChatMessages(prev => [...prev, { ...msg, ts: Date.now() }])
    engine.onNoclipChange = (active) => setNoclipActive(active)

    engine.init(canvas, 'bmw', nickname, (state) => {
      setHudState(state)
    }).then(() => {
      setLoading(false)
      engine.start()
    }).catch((err) => {
      console.error('GameEngine init failed:', err)
    })

    return () => {
      engine.destroy()
      engineRef.current = null
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleReset      = useCallback(() => { engineRef.current?.resetCar() }, [])
  const handlePause      = useCallback(() => { engineRef.current?.togglePause() }, [])
  const handleMuteToggle = useCallback(() => {
    setMuted(prev => { const next = !prev; engineRef.current?.setMute(next); return next })
  }, [])
  const handleTimeToggle = useCallback(() => { engineRef.current?.toggleTimeOfDay() }, [])
  const handleSendChat = useCallback((text: string) => {
    if (text.trim().toLowerCase() === '/noclip') {
      engineRef.current?.toggleNoclip()
    } else {
      engineRef.current?.sendChat(text)
    }
  }, [])

  // Pointer lock — grab on click OR keydown so user doesn't need to click first
  useEffect(() => {
    const tryLock = () => {
      if (hudState.state === 'playing' && !document.pointerLockElement) {
        canvasRef.current?.requestPointerLock()
      }
    }
    document.addEventListener('click', tryLock)
    document.addEventListener('keydown', tryLock)
    return () => {
      document.removeEventListener('click', tryLock)
      document.removeEventListener('keydown', tryLock)
    }
  }, [hudState.state])

  useEffect(() => {
    if (hudState.state === 'paused' || hudState.state === 'crashed') {
      if (document.pointerLockElement) document.exitPointerLock()
    } else if (hudState.state === 'playing') {
      if (!document.pointerLockElement) canvasRef.current?.requestPointerLock()
    }
  }, [hudState.state])

  const chatDisabled = hudState.state === 'paused' || hudState.state === 'crashed'

  return (
    <div className={`absolute inset-0 bg-black ${hudState.state === 'paused' || hudState.state === 'crashed' ? 'cursor-auto' : 'cursor-none'}`}>
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
        style={{ display: 'block' }}
      />

      {/* Loading overlay */}
      {loading && (
        <div className="absolute inset-0 bg-black flex items-center justify-center z-20">
          <div className="text-center">
            <div className="text-white text-2xl font-bold tracking-widest mb-4" style={{ fontFamily: 'Rajdhani, sans-serif' }}>
              LOADING TBILISI...
            </div>
            <div className="w-48 h-1 bg-white/10 rounded-full mx-auto overflow-hidden">
              <div className="h-full bg-blue-500 rounded-full animate-pulse" style={{ width: '60%' }} />
            </div>
            <div className="mt-3 text-white/40 text-xs font-mono">Building Freedom Square</div>
          </div>
        </div>
      )}

      {/* Game HUD */}
      {!loading && (
        <HUD
          state={hudState}
          onReset={handleReset}
          onPause={handlePause}
          onMuteToggle={handleMuteToggle}
          onTimeToggle={handleTimeToggle}
          onBack={onBack}
          muted={muted}
        />
      )}

      {/* Noclip indicator */}
      {noclipActive && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 pointer-events-none select-none">
          <div
            className="px-4 py-1.5 rounded text-sm font-mono tracking-widest"
            style={{ background: 'rgba(0,255,100,0.15)', border: '1px solid rgba(0,255,100,0.4)', color: '#00ff64', textShadow: '0 0 8px #00ff64' }}
          >
            NOCLIP  ·  W/S forward  ·  A/D strafe  ·  Mouse look  ·  ESC or /noclip to exit
          </div>
        </div>
      )}

      {/* Chat */}
      {!loading && (
        <ChatOverlay
          messages={chatMessages}
          onSend={handleSendChat}
          disabled={chatDisabled}
        />
      )}
    </div>
  )
}
