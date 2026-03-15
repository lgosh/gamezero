import React, { useState } from 'react'
import type { CarType } from '../game/GameEngine'

interface MainMenuProps {
  onStart: (carType: CarType) => void
}

const CAR_INFO = {
  bmw: {
    name: 'BMW M5 Competition',
    photo: '/images/bmw_m5_f90.jpg',
    specs: {
      engine: 'S63 4.4L Twin-Turbo V8',
      power: '625 hp / 750 Nm',
      weight: '1,730 kg',
      '0-100': '3.3 sec',
      topSpeed: '305 km/h',
      drive: 'AWD (M xDrive)',
    },
    description: 'F90 generation M5 Competition. The most powerful M5 ever — a luxury super-sedan that devours circuits.',
    accentColor: '#2563eb',
  },
  mercedes: {
    name: 'Mercedes-AMG E63 S',
    photo: '/images/mercedes_e63_w213.jpg',
    specs: {
      engine: 'AMG 4.0L Biturbo V8',
      power: '612 hp / 850 Nm',
      weight: '2,045 kg',
      '0-100': '3.4 sec',
      topSpeed: '300 km/h',
      drive: 'AWD (4MATIC+)',
    },
    description: 'W213 AMG E63 S. Drifts on command with RWD mode. 850 Nm of torque in a business suit.',
    accentColor: '#b0a090',
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
                  className="relative text-left rounded-xl p-6 transition-all duration-300 cursor-pointer"
                  style={
                    selected === type
                      ? { border: '2px solid rgba(255,255,255,0.55)', background: 'rgba(255,255,255,0.06)', boxShadow: `0 0 30px ${info.accentColor}33` }
                      : { border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.02)' }
                  }
                >
                  {/* Selected indicator */}
                  {selected === type && (
                    <div
                      className="absolute top-4 right-4 w-3 h-3 rounded-full"
                      style={{ backgroundColor: info.accentColor }}
                    />
                  )}

                  {/* Car photo */}
                  <div
                    className="mb-4 w-full rounded-lg overflow-hidden"
                    style={{ height: '130px', background: '#0a0a12' }}
                  >
                    <img
                      src={info.photo}
                      alt={info.name}
                      className="w-full h-full object-cover object-center transition-transform duration-300"
                      style={{
                        filter: selected === type ? 'brightness(1.05)' : 'brightness(0.7) saturate(0.7)',
                        transform: selected === type ? 'scale(1.04)' : 'scale(1)',
                      }}
                    />
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

