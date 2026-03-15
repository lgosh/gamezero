import React, { useState } from 'react'
import MainMenu from '../components/MainMenu'
import GameCanvas from '../components/GameCanvas'

type Screen = 'menu' | 'game'

export default function GamePage() {
  const [screen, setScreen] = useState<Screen>('menu')

  return (
    <div className="relative w-full h-full">
      {screen === 'menu' && <MainMenu onStart={() => setScreen('game')} />}
      {screen === 'game' && (
        <GameCanvas onBack={() => setScreen('menu')} />
      )}
    </div>
  )
}
