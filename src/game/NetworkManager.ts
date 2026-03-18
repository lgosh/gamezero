/// <reference types="vite/client" />

export interface LocalState {
  pos: [number, number, number]
  quat: [number, number, number, number]
  vel: [number, number, number]
  mode: 'driving' | 'onfoot'
  speedKmh: number
  carId: string | null   // 'bmw' | 'mercedes' | 'toyota' | null
  ping: number
  weapon?: 'fist' | 'glock'
  shooting?: boolean
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
  ping: number
  kills: number
  deaths: number
  weapon?: 'fist' | 'glock'
  shooting?: boolean
}

export interface ChatMessage {
  id: string
  nickname: string
  text: string
}

export class NetworkManager {
  private ws: WebSocket | null = null
  private localId: string | null = null
  private nickname = ''
  private url = ''
  private destroyed = false
  private _lastStates: RemotePlayerData[] = []

  // Auto-reconnect state
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private reconnectDelay = 1000  // starts at 1s, doubles up to 16s
  private readonly MAX_RECONNECT_DELAY = 16000

  // Heartbeat
  private pingInterval: ReturnType<typeof setInterval> | null = null
  private pingMs = 0

  onPlayerJoined?: (data: RemotePlayerData) => void
  onPlayerLeft?: (id: string) => void
  onStates?: (players: RemotePlayerData[]) => void
  onChat?: (msg: ChatMessage) => void
  onConnected?: (id: string, existing: RemotePlayerData[]) => void
  onCarjack?: (carId: string) => void
  onRestart?: () => void
  onVoice?: (id: string, nickname: string, data: ArrayBuffer) => void
  onVoiceSpeaking?: (id: string, nickname: string, speaking: boolean) => void
  onHit?: (damage: number, hitZone: string, shooterId: string, shooterNickname: string) => void
  onKillFeed?: (killerNickname: string, victimNickname: string, weapon: string) => void
  onDisconnected?: () => void

  connect(nickname: string) {
    this.nickname = nickname
    const proto = location.protocol === 'https:' ? 'wss' : 'ws'
    this.url = (import.meta.env.VITE_WS_URL as string | undefined)
      ?? (import.meta.env.DEV
        ? `ws://${location.hostname}:3001`
        : `${proto}://${location.host}/ws`)

    this._connect()
  }

  private _connect() {
    if (this.destroyed) return

    console.log(`[Network] Connecting to ${this.url}`)
    try {
      this.ws = new WebSocket(this.url)
    } catch {
      this._scheduleReconnect()
      return
    }

    this.ws.onopen = () => {
      console.log('[Network] Connected')
      this.reconnectDelay = 1000 // reset backoff on success
      this.ws!.send(JSON.stringify({ type: 'join', nickname: this.nickname }))

      // Start heartbeat — keeps the connection alive and detects dead sockets
      this._startHeartbeat()
    }

    this.ws.binaryType = 'arraybuffer'

    this.ws.onmessage = (e) => {
      // Binary = voice audio data
      if (e.data instanceof ArrayBuffer) {
        // First 36 bytes = sender UUID, rest = audio
        const decoder = new TextDecoder()
        const idBytes = new Uint8Array(e.data, 0, 36)
        const senderId = decoder.decode(idBytes)
        if (senderId === this.localId) return
        const audioData = e.data.slice(36)
        const player = this._lastStates?.find(p => p.id === senderId)
        this.onVoice?.(senderId, player?.nickname ?? 'Unknown', audioData)
        return
      }

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
        this._lastStates = all
        this.onStates?.(all.filter(p => p.id !== this.localId))
      } else if (msg.type === 'chat') {
        this.onChat?.(msg as unknown as ChatMessage)
      } else if (msg.type === 'carjack') {
        this.onCarjack?.(msg.carId as string)
      } else if (msg.type === 'restart') {
        this.onRestart?.()
      } else if (msg.type === 'voice_start') {
        this.onVoiceSpeaking?.(msg.id as string, msg.nickname as string, true)
      } else if (msg.type === 'voice_stop') {
        this.onVoiceSpeaking?.(msg.id as string, msg.nickname as string, false)
      } else if (msg.type === 'hit') {
        this.onHit?.(msg.damage as number, msg.hitZone as string, msg.shooterId as string, msg.shooterNickname as string)
      } else if (msg.type === 'kill_feed') {
        this.onKillFeed?.(msg.killerNickname as string, msg.victimNickname as string, msg.weapon as string)
      } else if (msg.type === 'pong') {
        const sentAt = Number(msg.clientTime)
        if (Number.isFinite(sentAt)) {
          this.pingMs = Math.max(0, Math.round(performance.now() - sentAt))
        }
      }
      // pong is silently consumed
    }

    this.ws.onerror = () => {
      console.warn('[Network] Connection error')
    }

    this.ws.onclose = () => {
      console.log('[Network] Disconnected')
      this._stopHeartbeat()
      this.pingMs = 0
      this._lastStates = []
      this.localId = null
      this.onDisconnected?.()
      this._scheduleReconnect()
    }
  }

  private _scheduleReconnect() {
    if (this.destroyed || this.reconnectTimer) return
    console.log(`[Network] Reconnecting in ${this.reconnectDelay / 1000}s...`)
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this._connect()
    }, this.reconnectDelay)
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.MAX_RECONNECT_DELAY)
  }

  private _startHeartbeat() {
    this._stopHeartbeat()
    const sendPing = () => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'ping', clientTime: performance.now() }))
      }
    }
    sendPing()
    this.pingInterval = setInterval(() => {
      sendPing()
    }, 5000)
  }

  private _stopHeartbeat() {
    if (this.pingInterval) { clearInterval(this.pingInterval); this.pingInterval = null }
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

  sendRestart() {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'restart' }))
    }
  }

  sendVoice(blob: Blob) {
    if (this.ws?.readyState !== WebSocket.OPEN || !this.localId) return
    // Prepend our ID (36 bytes) so server can broadcast with sender info
    const idBytes = new TextEncoder().encode(this.localId)
    blob.arrayBuffer().then(audio => {
      const combined = new Uint8Array(36 + audio.byteLength)
      combined.set(idBytes)
      combined.set(new Uint8Array(audio), 36)
      this.ws!.send(combined.buffer)
    })
  }

  sendHit(targetId: string, damage: number, hitZone: string) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'hit', targetId, damage, hitZone }))
    }
  }

  sendKilled(killerId: string, killerNickname: string, weapon: string) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'killed', killerId, killerNickname, weapon }))
    }
  }

  sendVoiceStart() {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'voice_start' }))
    }
  }

  sendVoiceStop() {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'voice_stop' }))
    }
  }

  get id() { return this.localId }
  get connected() { return this.ws?.readyState === WebSocket.OPEN }
  getPingMs() { return this.pingMs }
  getRoster() { return this._lastStates }

  destroy() {
    this.destroyed = true
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null }
    this._stopHeartbeat()
    this.pingMs = 0
    this._lastStates = []
    this.localId = null
    this.ws?.close()
    this.ws = null
  }
}
