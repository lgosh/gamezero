/**
 * Tbilisi Drive — Server
 * - Local dev:  bun run server/index.ts  (WebSocket on :3001)
 * - Production: serves static dist/ + WebSocket at /ws on $PORT (Fly.io)
 */

type WSData = { id: string }

interface PlayerState {
  id: string
  nickname: string
  pos: [number, number, number]
  quat: [number, number, number, number]
  vel: [number, number, number]
  mode: 'driving' | 'onfoot'
  speedKmh: number
}

const players = new Map<string, PlayerState>()
const sockets = new Map<string, any>()

const PORT   = parseInt(process.env.PORT ?? '3001')
const IS_PROD = !!process.env.FLY_APP_NAME  // Fly.io sets this automatically

const server = Bun.serve<WSData>({
  port: PORT,

  async fetch(req, server) {
    const url = new URL(req.url)

    // ── WebSocket upgrade ───────────────────────────────────────────────────
    if (url.pathname === '/ws' || !IS_PROD) {
      if (req.headers.get('Upgrade') === 'websocket') {
        const id = crypto.randomUUID()
        if (server.upgrade(req, { data: { id } })) return
        return new Response('WebSocket upgrade failed', { status: 426 })
      }
    }

    // ── Static file serving (production only) ───────────────────────────────
    if (IS_PROD) {
      let filePath = url.pathname === '/' ? 'index.html' : url.pathname.replace(/^\//, '')
      const file = Bun.file(`./dist/${filePath}`)

      if (await file.exists()) {
        return new Response(file)
      }

      // SPA fallback — all unknown routes serve index.html
      return new Response(Bun.file('./dist/index.html'))
    }

    return new Response(
      JSON.stringify({ status: 'Tbilisi Drive WS Server', players: players.size }),
      { headers: { 'Content-Type': 'application/json' } }
    )
  },

  websocket: {
    open(ws) {
      console.log(`[+] ${ws.data.id.slice(0, 8)}`)
    },

    message(ws, raw) {
      const id = ws.data.id
      let msg: Record<string, unknown>
      try { msg = JSON.parse(raw as string) } catch { return }

      if (msg.type === 'join') {
        const nickname = String(msg.nickname ?? 'Player').trim().slice(0, 20) || 'Player'
        const state: PlayerState = {
          id, nickname,
          pos: [0, 2, 35], quat: [0, 0, 0, 1], vel: [0, 0, 0],
          mode: 'onfoot', speedKmh: 0,
        }
        players.set(id, state)
        sockets.set(id, ws)

        ws.send(JSON.stringify({
          type: 'welcome',
          id,
          players: [...players.values()].filter(p => p.id !== id),
        }))
        broadcast(id, { type: 'player_joined', id, nickname })
        console.log(`[join] ${nickname} — ${players.size} online`)
        return
      }

      if (msg.type === 'state') {
        const player = players.get(id)
        if (!player) return
        player.pos      = msg.pos      as PlayerState['pos']
        player.quat     = msg.quat     as PlayerState['quat']
        player.vel      = msg.vel      as PlayerState['vel']
        player.mode     = msg.mode     as PlayerState['mode']
        player.speedKmh = msg.speedKmh as number
        return
      }

      if (msg.type === 'chat') {
        const player = players.get(id)
        if (!player) return
        const text = String(msg.text ?? '').trim().slice(0, 200)
        if (!text) return
        broadcastAll({ type: 'chat', id, nickname: player.nickname, text })
        console.log(`[chat] ${player.nickname}: ${text}`)
        return
      }
    },

    close(ws) {
      const id = ws.data.id
      const player = players.get(id)
      players.delete(id)
      sockets.delete(id)
      if (player) {
        broadcastAll({ type: 'player_left', id })
        console.log(`[-] ${player.nickname} left — ${players.size} online`)
      }
    },
  },
})

function broadcast(excludeId: string, msg: object) {
  const data = JSON.stringify(msg)
  for (const [id, ws] of sockets) {
    if (id !== excludeId) ws.send(data)
  }
}

function broadcastAll(msg: object) {
  const data = JSON.stringify(msg)
  for (const ws of sockets.values()) ws.send(data)
}

// Broadcast all player states at 20 Hz
setInterval(() => {
  if (players.size < 2) return
  const data = JSON.stringify({ type: 'states', players: [...players.values()] })
  for (const ws of sockets.values()) ws.send(data)
}, 50)

const mode = IS_PROD ? `production (serving dist/ + ws on :${PORT})` : `dev (ws only on :${PORT})`
console.log(`\n🚗  Tbilisi Drive — ${mode}\n`)
