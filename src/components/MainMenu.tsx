import React, { useState } from 'react'
import type { CarType } from '../game/GameEngine'

interface MainMenuProps {
  onStart: (carType: CarType) => void
}

const CAR_INFO = {
  bmw: {
    name: 'BMW M3 Competition',
    color: '#1a3a6a',
    colorHex: '1a3a6a',
    specs: {
      engine: 'S58 3.0L Twin-Turbo I6',
      power: '503 hp / 479 lb-ft',
      weight: '1,580 kg',
      '0-100': '3.9 sec',
      topSpeed: '290 km/h',
      drive: 'RWD',
    },
    description: 'The ultimate driving machine. Razor-sharp handling, iconic kidney grille, and a screaming inline-6.',
    accentColor: '#2563eb',
  },
  mercedes: {
    name: 'Mercedes-AMG C 63 S',
    color: '#c0c0c0',
    colorHex: 'c0c0c0',
    specs: {
      engine: 'AMG 2.0L Turbo + Hybrid',
      power: '503 hp / 627 lb-ft',
      weight: '1,955 kg',
      '0-100': '3.4 sec',
      topSpeed: '280 km/h',
      drive: 'AWD',
    },
    description: 'The beast in a suit. Panamericana grille, four exhaust tips, and AMG-tuned precision.',
    accentColor: '#6b7280',
  },
}

export default function MainMenu({ onStart }: MainMenuProps) {
  const [selected, setSelected] = useState<CarType>('bmw')

  const car = CAR_INFO[selected]

  return (
    <div className="absolute inset-0 overflow-hidden" style={{ background: 'linear-gradient(135deg, #0a0a0f 0%, #0f1520 50%, #0a0e1a 100%)' }}>
      {/* Animated background grid */}
      <div
        className="absolute inset-0 opacity-10"
        style={{
          backgroundImage: 'linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)',
          backgroundSize: '60px 60px',
        }}
      />

      {/* City silhouette backdrop */}
      <div
        className="absolute bottom-0 left-0 right-0 opacity-15"
        style={{ height: '45%' }}
      >
        {[
          [0, 70, 30, 220],
          [35, 50, 28, 180],
          [70, 90, 40, 260],
          [115, 35, 22, 120],
          [140, 60, 32, 200],
          [175, 45, 25, 150],
          [205, 80, 38, 240],
          [248, 55, 28, 180],
          [280, 40, 20, 130],
          [305, 70, 35, 220],
          [345, 50, 25, 160],
          [375, 85, 42, 260],
        ].map(([x, w, d, h], i) => (
          <div
            key={i}
            className="absolute bottom-0 bg-white/80"
            style={{ left: `${(x / 450) * 100}%`, width: `${(w / 450) * 100}%`, height: `${h}px` }}
          />
        ))}
      </div>

      <div className="relative z-10 h-full flex flex-col">
        {/* Header */}
        <div className="pt-10 pb-6 text-center fade-in">
          <div className="text-white/30 text-sm tracking-[0.4em] uppercase mb-2 font-mono">
            Welcome to
          </div>
          <h1 className="text-6xl font-bold tracking-tight text-white" style={{ fontFamily: 'Rajdhani, sans-serif' }}>
            TBILISI
            <span style={{ color: '#3b82f6' }}> DRIVE</span>
          </h1>
          <div className="mt-2 text-white/40 text-sm tracking-widest uppercase font-mono">
            Freedom Square · საქართველო
          </div>
        </div>

        {/* Main content */}
        <div className="flex-1 flex items-center justify-center px-8">
          <div className="w-full max-w-4xl">
            {/* Car Selection Header */}
            <div className="text-center mb-6 slide-in">
              <div className="text-white/40 text-xs tracking-[0.3em] uppercase font-mono">
                Select Your Vehicle
              </div>
            </div>

            {/* Car Cards */}
            <div className="grid grid-cols-2 gap-6 mb-8">
              {(Object.entries(CAR_INFO) as [CarType, typeof CAR_INFO.bmw][]).map(([type, info]) => (
                <button
                  key={type}
                  onClick={() => setSelected(type)}
                  className={`relative text-left rounded-xl p-6 transition-all duration-300 border cursor-pointer ${
                    selected === type
                      ? 'border-white/30 bg-white/8'
                      : 'border-white/8 bg-white/3 hover:bg-white/6 hover:border-white/15'
                  }`}
                  style={selected === type ? { boxShadow: `0 0 30px ${info.accentColor}22` } : {}}
                >
                  {/* Selected indicator */}
                  {selected === type && (
                    <div
                      className="absolute top-4 right-4 w-3 h-3 rounded-full"
                      style={{ backgroundColor: info.accentColor }}
                    />
                  )}

                  {/* Car silhouette (CSS-drawn) */}
                  <div className="mb-4 flex justify-center">
                    <CarSilhouette type={type} color={info.color} selected={selected === type} accentColor={info.accentColor} />
                  </div>

                  <div className="font-bold text-white text-lg mb-1" style={{ fontFamily: 'Rajdhani, sans-serif' }}>
                    {info.name}
                  </div>
                  <div className="text-white/45 text-xs mb-4 leading-relaxed">
                    {info.description}
                  </div>

                  {/* Specs grid */}
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                    {Object.entries(info.specs).map(([key, val]) => (
                      <div key={key} className="flex justify-between items-center">
                        <span className="text-white/30 text-[10px] uppercase tracking-wider font-mono">{key}</span>
                        <span className="text-white/75 text-[11px] font-mono">{val}</span>
                      </div>
                    ))}
                  </div>
                </button>
              ))}
            </div>

            {/* Start Button */}
            <div className="text-center">
              <button
                onClick={() => onStart(selected)}
                className="px-16 py-4 rounded-xl font-bold text-xl text-white tracking-widest uppercase transition-all duration-200 hover:scale-105 active:scale-95"
                style={{
                  fontFamily: 'Rajdhani, sans-serif',
                  background: `linear-gradient(135deg, ${car.accentColor}, ${car.accentColor}aa)`,
                  boxShadow: `0 8px 32px ${car.accentColor}44`,
                }}
              >
                START DRIVING
              </button>
              <div className="mt-3 text-white/25 text-xs font-mono tracking-wider">
                WASD / Arrow Keys to drive
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="pb-6 text-center">
          <div className="text-white/20 text-xs font-mono tracking-widest">
            Three.js · Cannon-es Physics · Web Audio API
          </div>
        </div>
      </div>
    </div>
  )
}

function CarSilhouette({
  type,
  color,
  selected,
  accentColor,
}: {
  type: CarType
  color: string
  selected: boolean
  accentColor: string
}) {
  const glowStyle = selected ? { filter: `drop-shadow(0 0 12px ${accentColor}88)` } : {}

  if (type === 'bmw') {
    return (
      <svg width="200" height="80" viewBox="0 0 200 80" style={glowStyle}>
        {/* BMW 3 series profile */}
        <g fill={`#${color.replace('#', '')}`}>
          {/* Main body */}
          <ellipse cx="100" cy="55" rx="85" ry="18" />
          {/* Cabin */}
          <path d="M 55 55 Q 65 28 85 26 L 130 26 Q 150 28 155 55 Z" />
          {/* Windshield */}
          <path d="M 87 27 L 100 27 L 112 27 L 100 46" fill={selected ? '#4488aa' : '#2a3a4a'} opacity="0.8" />
          {/* Rear window */}
          <path d="M 130 27 L 152 50 L 135 55 Z" fill={selected ? '#4488aa' : '#2a3a4a'} opacity="0.7" />
        </g>
        {/* Wheels */}
        <circle cx="62" cy="62" r="13" fill="#1a1a1a" />
        <circle cx="62" cy="62" r="8" fill="#888" />
        <circle cx="62" cy="62" r="3" fill={`#${color.replace('#', '')}`} />
        <circle cx="140" cy="62" r="13" fill="#1a1a1a" />
        <circle cx="140" cy="62" r="8" fill="#888" />
        <circle cx="140" cy="62" r="3" fill={`#${color.replace('#', '')}`} />
        {/* Headlight */}
        <rect x="178" y="44" width="10" height="5" rx="1" fill="#ffffff" opacity="0.9" />
        {/* Taillight */}
        <rect x="12" y="45" width="8" height="4" rx="1" fill="#ff2200" opacity="0.9" />
        {/* BMW kidney grilles */}
        <rect x="181" y="50" width="4" height="7" rx="1" fill={`#${color.replace('#', '')}`} opacity="0.6" />
        <rect x="186" y="50" width="4" height="7" rx="1" fill={`#${color.replace('#', '')}`} opacity="0.6" />
      </svg>
    )
  }

  return (
    <svg width="200" height="80" viewBox="0 0 200 80" style={glowStyle}>
      {/* Mercedes E-Class profile */}
      <g fill={`#${color.replace('#', '')}`} opacity={selected ? 1 : 0.85}>
        {/* Main body — longer, more elegant */}
        <ellipse cx="100" cy="55" rx="88" ry="17" />
        {/* Cabin — more upright */}
        <path d="M 52 55 Q 60 30 82 28 L 128 28 Q 148 30 150 55 Z" />
        {/* Windshield */}
        <path d="M 84 29 L 100 29 L 115 29 L 100 48" fill={selected ? '#4488bb' : '#2a3a4a'} opacity="0.8" />
        {/* Rear window */}
        <path d="M 128 29 L 148 52 L 132 55 Z" fill={selected ? '#4488bb' : '#2a3a4a'} opacity="0.7" />
      </g>
      {/* Wheels */}
      <circle cx="60" cy="62" r="13" fill="#1a1a1a" />
      <circle cx="60" cy="62" r="8" fill="#999" />
      <circle cx="60" cy="62" r="3" fill="#ddd" />
      <circle cx="142" cy="62" r="13" fill="#1a1a1a" />
      <circle cx="142" cy="62" r="8" fill="#999" />
      <circle cx="142" cy="62" r="3" fill="#ddd" />
      {/* Headlight — rounder */}
      <ellipse cx="180" cy="46" rx="6" ry="4" fill="#ffffff" opacity="0.9" />
      {/* Taillight */}
      <rect x="11" y="45" width="9" height="4" rx="2" fill="#ff1100" opacity="0.9" />
      {/* Mercedes star */}
      <circle cx="181" cy="54" r="3" fill="#ddd" opacity="0.7" />
      {/* AMG grille (vertical bars) */}
      {[183, 186, 189].map((bx) => (
        <rect key={bx} x={bx} y={49} width={1.5} height={8} rx={0.5} fill="#ddd" opacity="0.5" />
      ))}
    </svg>
  )
}
