/**
 * Tbilisi Drive — Multiplayer WebSocket Server
 * Run with: bun run server/index.ts
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
const sockets = new Map<string, ReturnType<typeof Bun.serve>['upgrade'] extends (...a: any[]) => infer R ? any : any>()

const server = Bun.serve<WSData>({
  port: 3001,

  fetch(req, server) {
    const id = crypto.randomUUID()
    const upgraded = server.upgrade(req, { data: { id } })
    if (upgraded) return
    return new Response(
      JSON.stringify({ status: 'Tbilisi Drive WebSocket Server', players: players.size }),
      { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
    )
  },

  websocket: {
    open(ws) {
      console.log(`[+] Connection ${ws.data.id}`)
    },

    message(ws, raw) {
      const id = ws.data.id
      let msg: Record<string, unknown>
      try { msg = JSON.parse(raw as string) } catch { return }

      if (msg.type === 'join') {
        const nickname = String(msg.nickname ?? 'Player').trim().slice(0, 20) || 'Player'
        const state: PlayerState = {
          id, nickname,
          pos: [0, 2, 35],
          quat: [0, 0, 0, 1],
          vel: [0, 0, 0],
          mode: 'onfoot',
          speedKmh: 0,
        }
        players.set(id, state)
        sockets.set(id, ws)

        // Welcome: send this client their ID + all currently online players
        ws.send(JSON.stringify({
          type: 'welcome',
          id,
          players: [...players.values()].filter(p => p.id !== id),
        }))

        // Notify everyone else
        broadcast(id, { type: 'player_joined', id, nickname })
        console.log(`[join] ${nickname} (${id.slice(0, 8)}) — ${players.size} online`)
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
    if (id !== excludeId) (ws as any).send(data)
  }
}

function broadcastAll(msg: object) {
  const data = JSON.stringify(msg)
  for (const ws of sockets.values()) {
    (ws as any).send(data)
  }
}

// Broadcast all player states to all clients at 20 Hz
setInterval(() => {
  if (players.size < 2) return
  const data = JSON.stringify({ type: 'states', players: [...players.values()] })
  for (const ws of sockets.values()) {
    (ws as any).send(data)
  }
}, 50)

console.log(`\n🚗  Tbilisi Drive server running on ws://localhost:${server.port}`)
console.log(`    Share your IP:3001 with friends to play together\n`)
