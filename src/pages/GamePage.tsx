import React, { useState } from 'react'
import MainMenu from '../components/MainMenu'
import GameCanvas from '../components/GameCanvas'
import type { CarType } from '../game/GameEngine'

type Screen = 'menu' | 'game'

export default function GamePage() {
  const [screen, setScreen] = useState<Screen>('menu')
  const [carType, setCarType] = useState<CarType>('bmw')

  function handleStart(type: CarType) {
    setCarType(type)
    setScreen('game')
  }

  function handleBack() {
    setScreen('menu')
  }

  return (
    <div className="relative w-full h-full">
      {screen === 'menu' && <MainMenu onStart={handleStart} />}
      {screen === 'game' && (
        <GameCanvas key={carType} carType={carType} onBack={handleBack} />
      )}
    </div>
  )
}
