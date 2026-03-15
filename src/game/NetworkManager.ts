/// <reference types="vite/client" />

export interface LocalState {
  pos: [number, number, number]
  quat: [number, number, number, number]
  vel: [number, number, number]
  mode: 'driving' | 'onfoot'
  speedKmh: number
  carId: string | null   // 'bmw' | 'mercedes' | null
}

export interface RemotePlayerData {
  id: string
  nickname: string
  pos: [number, number, number]
  quat: [number, number, number, number]
  vel: [number, number, number]
  mode: 'driving' | 'onfoot'
  speedKmh: number
  carId: string | null
}

export interface ChatMessage {
  id: string
  nickname: string
  text: string
}

export class NetworkManager {
  private ws: WebSocket | null = null
  private localId: string | null = null

  onPlayerJoined?: (data: RemotePlayerData) => void
  onPlayerLeft?: (id: string) => void
  onStates?: (players: RemotePlayerData[]) => void
  onChat?: (msg: ChatMessage) => void
  onConnected?: (id: string, existing: RemotePlayerData[]) => void
  onCarjack?: (carId: string) => void

  connect(nickname: string) {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws'
    const url = (import.meta.env.VITE_WS_URL as string | undefined)
      ?? (import.meta.env.DEV
        ? `ws://${location.hostname}:3001`
        : `${proto}://${location.host}/ws`)

    console.log(`[Network] Connecting to ${url}`)
    this.ws = new WebSocket(url)

    this.ws.onopen = () => {
      this.ws!.send(JSON.stringify({ type: 'join', nickname }))
    }

    this.ws.onmessage = (e) => {
      let msg: Record<string, unknown>
      try { msg = JSON.parse(e.data) } catch { return }

      if (msg.type === 'welcome') {
        this.localId = msg.id as string
        this.onConnected?.(msg.id as string, msg.players as RemotePlayerData[])
      } else if (msg.type === 'player_joined') {
        this.onPlayerJoined?.(msg as unknown as RemotePlayerData)
      } else if (msg.type === 'player_left') {
        this.onPlayerLeft?.(msg.id as string)
      } else if (msg.type === 'states') {
        const all = msg.players as RemotePlayerData[]
        this.onStates?.(all.filter(p => p.id !== this.localId))
      } else if (msg.type === 'chat') {
        this.onChat?.(msg as unknown as ChatMessage)
      } else if (msg.type === 'carjack') {
        this.onCarjack?.(msg.carId as string)
      }
    }

    this.ws.onerror = () => console.warn('[Network] Connection failed — running offline')
    this.ws.onclose = () => console.log('[Network] Disconnected')
  }

  sendState(state: LocalState) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'state', ...state }))
    }
  }

  sendChat(text: string) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'chat', text }))
    }
  }

  sendCarjack(targetId: string, carId: string) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'carjack', targetId, carId }))
    }
  }

  get id() { return this.localId }
  get connected() { return this.ws?.readyState === WebSocket.OPEN }

  destroy() {
    this.ws?.close()
    this.ws = null
  }
}
