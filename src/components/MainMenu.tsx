import React, { useState } from 'react'

interface MainMenuProps {
  onStart: (nickname: string) => void
}

export default function MainMenu({ onStart }: MainMenuProps) {
  const [nickname, setNickname] = useState('')

  const handleStart = () => {
    onStart(nickname.trim())
  }

  return (
    <div
      className="absolute inset-0 overflow-hidden flex flex-col items-center justify-center"
      style={{ background: 'linear-gradient(160deg, #07090f 0%, #0d1525 55%, #080c18 100%)' }}
    >
      {/* Background grid */}
      <div
        className="absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.8) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.8) 1px, transparent 1px)',
          backgroundSize: '64px 64px',
        }}
      />

      {/* Radial glow */}
      <div
        className="absolute inset-0 opacity-20"
        style={{ background: 'radial-gradient(ellipse 60% 40% at 50% 60%, #1a3a6e 0%, transparent 70%)' }}
      />

      {/* City silhouette */}
      <div className="absolute bottom-0 left-0 right-0 opacity-10" style={{ height: '40%' }}>
        {[
          [0,8,220],[9,6,160],[16,10,280],[28,5,130],[34,8,200],[43,7,175],
          [51,9,250],[61,6,160],[68,5,130],[74,8,220],[83,6,155],[90,10,270],
        ].map(([xp, wp, h], i) => (
          <div
            key={i}
            className="absolute bottom-0 bg-white"
            style={{ left: `${xp}%`, width: `${wp}%`, height: `${h}px` }}
          />
        ))}
      </div>

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center gap-6 text-center px-8 select-none">
        {/* Eyebrow */}
        <div className="text-white/30 text-xs tracking-[0.5em] uppercase font-mono">
          Welcome to
        </div>

        {/* Title */}
        <div>
          <h1
            className="text-7xl font-black tracking-tight text-white leading-none"
            style={{ fontFamily: 'Rajdhani, sans-serif', textShadow: '0 0 60px rgba(59,130,246,0.4)' }}
          >
            TBILISI
          </h1>
          <h1
            className="text-7xl font-black tracking-tight leading-none"
            style={{ fontFamily: 'Rajdhani, sans-serif', color: '#3b82f6', textShadow: '0 0 60px rgba(59,130,246,0.6)' }}
          >
            DRIVE
          </h1>
        </div>

        {/* Subtitle */}
        <div className="text-white/35 text-sm tracking-[0.25em] uppercase font-mono">
          Freedom Square &nbsp;·&nbsp; საქართველო
        </div>

        {/* Nickname input */}
        <div className="flex flex-col items-center gap-2 w-64">
          <label className="text-white/40 text-xs font-mono tracking-widest uppercase">
            Your Nickname
          </label>
          <input
            type="text"
            value={nickname}
            onChange={e => setNickname(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleStart() }}
            placeholder="Enter name…"
            maxLength={20}
            autoFocus
            className="w-full px-4 py-3 text-center text-white font-mono text-sm rounded-lg outline-none border border-white/15 focus:border-blue-500/60 transition-colors"
            style={{ background: 'rgba(255,255,255,0.05)', backdropFilter: 'blur(8px)' }}
          />
        </div>

        {/* Start button */}
        <button
          onClick={handleStart}
          className="mt-2 px-20 py-5 rounded-xl font-black text-xl text-white tracking-[0.2em] uppercase transition-all duration-200 hover:scale-105 active:scale-95"
          style={{
            fontFamily: 'Rajdhani, sans-serif',
            background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
            boxShadow: '0 0 40px rgba(37,99,235,0.5), 0 4px 20px rgba(0,0,0,0.5)',
          }}
        >
          START GAME
        </button>

        <div className="text-white/15 text-[11px] font-mono tracking-wider">
          WASD to drive &nbsp;·&nbsp; F to enter / exit car &nbsp;·&nbsp; T to chat &nbsp;·&nbsp; P to pause
        </div>
      </div>

      {/* Footer */}
      <div className="absolute bottom-5 text-white/15 text-[10px] font-mono tracking-widest">
        Three.js &nbsp;·&nbsp; Cannon-es Physics &nbsp;·&nbsp; Web Audio API
      </div>
    </div>
  )
}
