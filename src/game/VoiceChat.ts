/**
 * Push-to-talk voice chat over WebSocket.
 * Hold K to transmit; audio is sent as opus/webm chunks.
 */

import type { NetworkManager } from './NetworkManager'

export class VoiceChat {
  private stream: MediaStream | null = null
  private mediaRecorder: MediaRecorder | null = null
  private network: NetworkManager
  private recording = false

  // Per-sender playback state using MediaSource for streaming
  private playbackSessions = new Map<string, {
    audio: HTMLAudioElement
    mediaSource: MediaSource
    sourceBuffer: SourceBuffer | null
    queue: ArrayBuffer[]
    ready: boolean
  }>()

  /** Fires when local player starts/stops speaking */
  onLocalSpeaking?: (speaking: boolean) => void

  constructor(network: NetworkManager) {
    this.network = network
  }

  /** Call every frame with the current voiceChat key state */
  update(pressed: boolean) {
    if (pressed && !this.recording) {
      this.startRecording()
    } else if (!pressed && this.recording) {
      this.stopRecording()
    }
  }

  private async startRecording() {
    this.recording = true
    this.onLocalSpeaking?.(true)

    // Request mic each time (stream is released on stop so the red dot disappears)
    if (!this.stream) {
      try {
        this.stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        })
      } catch (e) {
        console.warn('[VoiceChat] Mic access denied:', e)
        this.recording = false
        this.onLocalSpeaking?.(false)
        return
      }
    }
    if (!this.stream) {
      this.recording = false
      this.onLocalSpeaking?.(false)
      return
    }

    // Create a new MediaRecorder each time K is pressed
    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : 'audio/webm'

    const recorder = new MediaRecorder(this.stream, { mimeType, audioBitsPerSecond: 24000 })
    this.mediaRecorder = recorder

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        this.network.sendVoice(e.data)
      }
    }

    // Notify others we started speaking
    this.network.sendVoiceStart()

    // Send chunks every 200ms for reasonable latency vs chunk-decodability
    recorder.start(200)
  }

  private stopRecording() {
    this.recording = false
    this.onLocalSpeaking?.(false)

    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop()
    }
    this.mediaRecorder = null

    // Release the mic so the browser tab red dot disappears
    if (this.stream) {
      this.stream.getTracks().forEach(t => t.stop())
      this.stream = null
    }

    // Tell others we stopped
    this.network.sendVoiceStop()
  }

  /** Called when a remote player starts speaking — set up a fresh MediaSource */
  startRemoteSession(senderId: string) {
    // Clean up any existing session
    this.endRemoteSession(senderId)

    const mimeType = 'audio/webm;codecs=opus'
    if (!MediaSource.isTypeSupported(mimeType)) {
      console.warn('[VoiceChat] MediaSource does not support', mimeType)
      return
    }

    const mediaSource = new MediaSource()
    const audio = new Audio()
    audio.src = URL.createObjectURL(mediaSource)

    const session = {
      audio,
      mediaSource,
      sourceBuffer: null as SourceBuffer | null,
      queue: [] as ArrayBuffer[],
      ready: false,
    }
    this.playbackSessions.set(senderId, session)

    mediaSource.addEventListener('sourceopen', () => {
      try {
        session.sourceBuffer = mediaSource.addSourceBuffer(mimeType)
        session.ready = true

        session.sourceBuffer.addEventListener('updateend', () => {
          // Flush queued chunks
          if (session.queue.length > 0 && session.sourceBuffer && !session.sourceBuffer.updating) {
            session.sourceBuffer.appendBuffer(session.queue.shift()!)
          }
        })

        // Flush any chunks that arrived before sourceopen
        if (session.queue.length > 0 && !session.sourceBuffer.updating) {
          session.sourceBuffer.appendBuffer(session.queue.shift()!)
        }
      } catch (e) {
        console.warn('[VoiceChat] Failed to add source buffer:', e)
      }
    })

    audio.play().catch(() => {
      // Autoplay blocked — user interaction needed. Browser will usually allow after first interaction.
    })
  }

  /** Feed received audio chunk for a remote player */
  playRemoteAudio(senderId: string, data: ArrayBuffer) {
    const session = this.playbackSessions.get(senderId)
    if (!session) {
      // No session yet — start one and queue the chunk
      this.startRemoteSession(senderId)
      const newSession = this.playbackSessions.get(senderId)
      if (newSession) newSession.queue.push(data)
      return
    }

    if (!session.ready || !session.sourceBuffer) {
      session.queue.push(data)
      return
    }

    if (session.sourceBuffer.updating) {
      session.queue.push(data)
    } else {
      try {
        session.sourceBuffer.appendBuffer(data)
      } catch {
        // Buffer full or error — skip
      }
    }
  }

  /** Clean up a remote player's playback session */
  endRemoteSession(senderId: string) {
    const session = this.playbackSessions.get(senderId)
    if (!session) return

    session.audio.pause()
    URL.revokeObjectURL(session.audio.src)
    if (session.mediaSource.readyState === 'open') {
      try { session.mediaSource.endOfStream() } catch { /* already ended */ }
    }
    this.playbackSessions.delete(senderId)
  }

  destroy() {
    this.stopRecording()
    if (this.stream) {
      this.stream.getTracks().forEach(t => t.stop())
      this.stream = null
    }
    for (const [id] of this.playbackSessions) {
      this.endRemoteSession(id)
    }
  }
}
