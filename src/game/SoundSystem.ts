/**
 * Procedural sound system using Web Audio API.
 * All sounds are synthesized — no audio files needed.
 */
export class SoundSystem {
  private ctx: AudioContext | null = null
  private masterGain!: GainNode
  // muteNode sits between masterGain and ctx.destination.
  // It is the ONLY node whose gain setMute() touches — nothing else ever modifies it.
  private muteNode!: GainNode

  // Engine
  private engOsc1!: OscillatorNode
  private engOsc2!: OscillatorNode
  private engOsc3!: OscillatorNode
  private engDistortion!: WaveShaperNode
  private engFilter!: BiquadFilterNode
  private engGain!: GainNode
  private engSubGain!: GainNode

  // Tire squeal
  private tireBuffer: AudioBuffer | null = null
  private tireSource: AudioBufferSourceNode | null = null
  private tireDistortion!: WaveShaperNode  // saved so sources can reconnect
  private tireFilter!: BiquadFilterNode
  private tireFilter2!: BiquadFilterNode
  private tireGain!: GainNode

  // Wind
  private windBuffer: AudioBuffer | null = null
  private windSource: AudioBufferSourceNode | null = null
  private windFilter!: BiquadFilterNode
  private windGain!: GainNode

  // Ambient city
  private cityBuffer: AudioBuffer | null = null
  private citySource: AudioBufferSourceNode | null = null
  private cityFilter!: BiquadFilterNode  // saved so sources can reconnect
  private cityGain!: GainNode

  private started = false
  private muteFlag = false
  private pauseFlag = false

  /** Must be called after a user gesture (click/keypress) */
  init() {
    if (this.started) return
    this.started = true

    this.ctx = new AudioContext()
    const ctx = this.ctx

    this.masterGain = ctx.createGain()
    this.masterGain.gain.value = 1

    // Dedicated mute node — only setMute() ever changes its gain
    this.muteNode = ctx.createGain()
    this.muteNode.gain.value = this.muteFlag ? 0 : 1

    this.masterGain.connect(this.muteNode)
    this.muteNode.connect(ctx.destination)

    this.setupEngine(ctx)
    this.setupTire(ctx)
    this.setupWind(ctx)
    this.setupCity(ctx)
  }

  // ─── Engine ────────────────────────────────────────────────────────────────

  private setupEngine(ctx: AudioContext) {
    this.engOsc1 = ctx.createOscillator()
    this.engOsc1.type = 'sawtooth'

    this.engOsc2 = ctx.createOscillator()
    this.engOsc2.type = 'sawtooth'

    this.engOsc3 = ctx.createOscillator()
    this.engOsc3.type = 'square'

    this.engDistortion = ctx.createWaveShaper()
    this.engDistortion.curve = this.makeDistortionCurve(300)
    this.engDistortion.oversample = '4x'

    this.engFilter = ctx.createBiquadFilter()
    this.engFilter.type = 'lowpass'
    this.engFilter.frequency.value = 600
    this.engFilter.Q.value = 0.8

    this.engGain = ctx.createGain()
    this.engGain.gain.value = 0

    this.engSubGain = ctx.createGain()
    this.engSubGain.gain.value = 0.4

    this.engOsc1.connect(this.engDistortion)
    this.engOsc2.connect(this.engDistortion)
    this.engOsc3.connect(this.engSubGain)
    this.engSubGain.connect(this.engDistortion)
    this.engDistortion.connect(this.engFilter)
    this.engFilter.connect(this.engGain)
    this.engGain.connect(this.masterGain)

    this.engOsc1.frequency.value = 70
    this.engOsc2.frequency.value = 140
    this.engOsc3.frequency.value = 35

    this.engOsc1.start()
    this.engOsc2.start()
    this.engOsc3.start()
  }

  /** Update engine sound each frame.
   * @param rpm 800..7500
   * @param throttle 0..1
   */
  updateEngine(rpm: number, throttle: number) {
    if (!this.ctx) return
    const t = this.ctx.currentTime
    // Use a slower time constant at idle so it doesn't oscillate
    const smooth = throttle > 0.05 ? 0.04 : 0.15

    // Map rpm to oscillator base frequency — idle ~800 = 40Hz, redline = 250Hz
    const rpmNorm = Math.max(0, (rpm - 800) / (7500 - 800))
    const base = 40 + rpmNorm * 210
    this.engOsc1.frequency.setTargetAtTime(base, t, smooth)
    this.engOsc2.frequency.setTargetAtTime(base * 2.02, t, smooth)
    this.engOsc3.frequency.setTargetAtTime(base * 0.5, t, smooth)

    // Volume: idling should be a steady, quiet rumble
    const vol = 0.06 + throttle * 0.22 + rpmNorm * 0.10
    this.engGain.gain.setTargetAtTime(vol, t, smooth)

    const cutoff = 300 + rpmNorm * 2800
    this.engFilter.frequency.setTargetAtTime(cutoff, t, smooth)
  }

  // ─── Tire Squeal ──────────────────────────────────────────────────────────

  private setupTire(ctx: AudioContext) {
    this.tireBuffer = this.createNoiseBuffer(ctx, 2)

    // Distortion turns white noise into gritty, harmonically-rich friction sound
    this.tireDistortion = ctx.createWaveShaper()
    this.tireDistortion.curve = this.makeDistortionCurve(200)
    this.tireDistortion.oversample = '2x'
    const dist = this.tireDistortion

    // Lower band: the thick "screech" body (~1400 Hz)
    this.tireFilter = ctx.createBiquadFilter()
    this.tireFilter.type = 'bandpass'
    this.tireFilter.frequency.value = 1400
    this.tireFilter.Q.value = 4

    // Upper band: the sharp "shriek" layer (~3000 Hz)
    this.tireFilter2 = ctx.createBiquadFilter()
    this.tireFilter2.type = 'bandpass'
    this.tireFilter2.frequency.value = 3000
    this.tireFilter2.Q.value = 3

    this.tireGain = ctx.createGain()
    this.tireGain.gain.value = 0

    // noise → distortion → both filters in parallel → master gain
    this.tireSource = ctx.createBufferSource()
    this.tireSource.buffer = this.tireBuffer
    this.tireSource.loop = true
    this.tireSource.connect(dist)
    dist.connect(this.tireFilter)
    dist.connect(this.tireFilter2)
    this.tireFilter.connect(this.tireGain)
    this.tireFilter2.connect(this.tireGain)
    this.tireGain.connect(this.masterGain)
    this.tireSource.start()
  }

  /** 0 = silent, 1 = full screech */
  updateTire(intensity: number) {
    if (!this.ctx) return
    const t = this.ctx.currentTime
    // Slightly higher pitch at higher speeds
    const f1 = 1200 + intensity * 500
    const f2 = 2800 + intensity * 400
    this.tireFilter.frequency.setTargetAtTime(f1, t, 0.05)
    this.tireFilter2.frequency.setTargetAtTime(f2, t, 0.05)
    this.tireGain.gain.setTargetAtTime(intensity * 0.55, t, 0.03)
  }

  // ─── Wind ─────────────────────────────────────────────────────────────────

  private setupWind(ctx: AudioContext) {
    this.windBuffer = this.createNoiseBuffer(ctx, 3)

    this.windFilter = ctx.createBiquadFilter()
    this.windFilter.type = 'lowpass'
    this.windFilter.frequency.value = 200
    this.windFilter.Q.value = 0.5

    this.windGain = ctx.createGain()
    this.windGain.gain.value = 0

    this.windFilter.connect(this.windGain)
    this.windGain.connect(this.masterGain)

    const src = ctx.createBufferSource()
    src.buffer = this.windBuffer
    src.loop = true
    src.connect(this.windFilter)
    src.start()
    this.windSource = src
  }

  /** speed in km/h */
  updateWind(speedKmh: number) {
    if (!this.ctx) return
    const t = this.ctx.currentTime
    const normalizedSpeed = Math.min(speedKmh / 180, 1)
    const freq = 80 + normalizedSpeed * 400
    this.windFilter.frequency.setTargetAtTime(freq, t, 0.1)
    this.windGain.gain.setTargetAtTime(normalizedSpeed * 0.08, t, 0.1)
  }

  // ─── City Ambient ─────────────────────────────────────────────────────────

  private setupCity(ctx: AudioContext) {
    // Distant city hum — low drone + occasional peaks
    this.cityBuffer = this.createNoiseBuffer(ctx, 4)

    this.cityFilter = ctx.createBiquadFilter()
    this.cityFilter.type = 'lowpass'
    this.cityFilter.frequency.value = 300

    this.cityGain = ctx.createGain()
    this.cityGain.gain.value = 0.04

    this.cityFilter.connect(this.cityGain)
    this.cityGain.connect(this.masterGain)

    const src = ctx.createBufferSource()
    src.buffer = this.cityBuffer
    src.loop = true
    src.connect(this.cityFilter)
    src.start()
    this.citySource = src
  }

  // ─── Crash ────────────────────────────────────────────────────────────────

  playCrash(intensity: number) {
    if (!this.ctx) return
    const ctx = this.ctx
    const clamped = Math.min(intensity, 1)

    // Impact thud — burst of white noise through lowpass
    const buf = this.createNoiseBuffer(ctx, 0.3)
    const src = ctx.createBufferSource()
    src.buffer = buf

    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = 400 + clamped * 800

    const gainNode = ctx.createGain()
    gainNode.gain.setValueAtTime(clamped * 1.2, ctx.currentTime)
    gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3)

    src.connect(filter)
    filter.connect(gainNode)
    gainNode.connect(this.masterGain)
    src.start()
    src.stop(ctx.currentTime + 0.4)

    // Metal crunch — shaped noise
    if (clamped > 0.2) {
      const buf2 = this.createNoiseBuffer(ctx, 0.5)
      const src2 = ctx.createBufferSource()
      src2.buffer = buf2

      const dist = ctx.createWaveShaper()
      dist.curve = this.makeDistortionCurve(400)

      const g2 = ctx.createGain()
      g2.gain.setValueAtTime(clamped * 0.5, ctx.currentTime)
      g2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5)

      src2.connect(dist)
      dist.connect(g2)
      g2.connect(this.masterGain)
      src2.start()
      src2.stop(ctx.currentTime + 0.6)
    }
  }

  // ─── Horn ─────────────────────────────────────────────────────────────────

  private hornOsc: OscillatorNode | null = null
  private hornGain: GainNode | null = null

  startHorn() {
    if (!this.ctx || this.hornOsc) return
    const ctx = this.ctx
    this.hornOsc = ctx.createOscillator()
    this.hornOsc.type = 'square'
    this.hornOsc.frequency.value = 440

    const osc2 = ctx.createOscillator()
    osc2.type = 'square'
    osc2.frequency.value = 550

    this.hornGain = ctx.createGain()
    this.hornGain.gain.value = 0.12

    const filter = ctx.createBiquadFilter()
    filter.type = 'bandpass'
    filter.frequency.value = 490

    this.hornOsc.connect(filter)
    osc2.connect(filter)
    filter.connect(this.hornGain)
    this.hornGain.connect(this.masterGain)

    this.hornOsc.start()
    osc2.start()
  }

  stopHorn() {
    if (!this.hornOsc || !this.ctx) return
    this.hornGain!.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05)
    setTimeout(() => {
      this.hornOsc?.stop()
      this.hornOsc = null
    }, 100)
  }

  // ─── Utilities ────────────────────────────────────────────────────────────

  private createNoiseBuffer(ctx: AudioContext, duration: number): AudioBuffer {
    const len = Math.floor(ctx.sampleRate * duration)
    const buf = ctx.createBuffer(1, len, ctx.sampleRate)
    const data = buf.getChannelData(0)
    for (let i = 0; i < len; i++) {
      data[i] = Math.random() * 2 - 1
    }
    return buf
  }

  private makeDistortionCurve(amount: number): Float32Array<ArrayBuffer> {
    const n = 512
    const curve = new Float32Array(n) as Float32Array<ArrayBuffer>
    for (let i = 0; i < n; i++) {
      const x = (i * 2) / n - 1
      curve[i] = ((Math.PI + amount) * x) / (Math.PI + amount * Math.abs(x))
    }
    return curve
  }

  /** Subtle gear-change click */
  playGearChange(isUpshift: boolean) {
    if (!this.ctx) return
    const ctx = this.ctx
    const t = ctx.currentTime

    // Subtle high-frequency click only — no thud, no pop
    const clickBuf = this.createNoiseBuffer(ctx, 0.018)
    const clickSrc = ctx.createBufferSource()
    clickSrc.buffer = clickBuf
    const clickHp = ctx.createBiquadFilter()
    clickHp.type = 'highpass'
    clickHp.frequency.value = 5000
    const clickGain = ctx.createGain()
    clickGain.gain.setValueAtTime(0.15, t)
    clickGain.gain.exponentialRampToValueAtTime(0.001, t + 0.018)
    clickSrc.connect(clickHp)
    clickHp.connect(clickGain)
    clickGain.connect(this.masterGain)
    clickSrc.start(t)
    clickSrc.stop(t + 0.02)

    // Soft sub-bass only on downshift
    if (!isUpshift) {
      const subOsc = ctx.createOscillator()
      subOsc.type = 'sine'
      subOsc.frequency.value = 55
      const subGain = ctx.createGain()
      subGain.gain.setValueAtTime(0.2, t)
      subGain.gain.exponentialRampToValueAtTime(0.001, t + 0.1)
      subOsc.connect(subGain)
      subGain.connect(this.masterGain)
      subOsc.start(t)
      subOsc.stop(t + 0.11)
    }
  }

  /** Suspend all audio instantly (pause) */
  pauseAll() {
    this.pauseFlag = true
    if (this.ctx?.state === 'running') this.ctx.suspend()
  }

  /** Resume all audio (unpause) — only actually resumes if not muted */
  resumeAll() {
    this.pauseFlag = false
    if (!this.muteFlag && this.ctx?.state === 'suspended') this.ctx.resume()
  }

  /** Fade engine and tire sounds to silence (call on crash/destroy) */
  stopEngine() {
    if (!this.ctx) return
    const t = this.ctx.currentTime
    this.engGain.gain.setTargetAtTime(0, t, 0.3)
    this.tireGain.gain.setTargetAtTime(0, t, 0.1)
    this.windGain.gain.setTargetAtTime(0, t, 0.5)
  }

  /** Quick engine cut when player exits car — includes a metallic clunk */
  stopEngineKey() {
    if (!this.ctx) return
    const ctx = this.ctx
    const t = ctx.currentTime
    // Fast fade
    this.engGain.gain.setTargetAtTime(0, t, 0.06)
    this.tireGain.gain.setTargetAtTime(0, t, 0.04)
    this.windGain.gain.setTargetAtTime(0, t, 0.1)
    // Metallic door-shut thud
    const buf = this.createNoiseBuffer(ctx, 0.1)
    const src = ctx.createBufferSource()
    src.buffer = buf
    const f = ctx.createBiquadFilter()
    f.type = 'lowpass'
    f.frequency.value = 220
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.5, t)
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.15)
    src.connect(f); f.connect(g); g.connect(this.masterGain)
    src.start(t); src.stop(t + 0.18)
  }

  /** Engine crank + start sequence when player enters car */
  startEngine() {
    if (!this.ctx) return
    const ctx = this.ctx
    const t = ctx.currentTime
    // Crank: rough burst (like starter motor)
    const crank = ctx.createOscillator()
    crank.type = 'sawtooth'
    crank.frequency.value = 38
    const crankFilter = ctx.createBiquadFilter()
    crankFilter.type = 'bandpass'
    crankFilter.frequency.value = 260
    crankFilter.Q.value = 1.2
    const crankGain = ctx.createGain()
    crankGain.gain.setValueAtTime(0, t)
    crankGain.gain.linearRampToValueAtTime(0.28, t + 0.08)
    crankGain.gain.linearRampToValueAtTime(0.22, t + 0.55)
    crankGain.gain.setTargetAtTime(0, t + 0.55, 0.12)
    crank.connect(crankFilter)
    crankFilter.connect(crankGain)
    crankGain.connect(this.masterGain)
    crank.start(t)
    crank.stop(t + 1.1)
    // Engine hum fades in after crank
    this.engGain.gain.cancelScheduledValues(t + 0.6)
    this.engGain.gain.setValueAtTime(0, t + 0.6)
    this.engGain.gain.setTargetAtTime(0.07, t + 0.65, 0.25)
  }

  setMute(muted: boolean) {
    this.muteFlag = muted
    if (!this.ctx) return

    if (muted) {
      // Physically sever the wire from the audio graph to the speakers.
      // No gain value, no suspend — just remove the connection entirely.
      try { this.muteNode.disconnect(this.ctx.destination) } catch { /* already disconnected */ }
      // Also stop all looping buffer sources — they produce 0 signal when stopped
      try { this.citySource?.stop();  this.citySource = null } catch { /* already stopped */ }
      try { this.windSource?.stop();  this.windSource = null } catch { /* already stopped */ }
      try { this.tireSource?.stop();  this.tireSource = null } catch { /* already stopped */ }
    } else {
      // Rewire the graph to destination and restart the noise sources
      try { this.muteNode.connect(this.ctx.destination) } catch { /* already connected */ }
      // Resume context if it was suspended by pause (and pause is now lifted)
      if (!this.pauseFlag && this.ctx.state === 'suspended') this.ctx.resume()
      this.restartNoiseSources(this.ctx)
    }
  }

  private restartNoiseSources(ctx: AudioContext) {
    if (this.cityBuffer && !this.citySource) {
      const src = ctx.createBufferSource()
      src.buffer = this.cityBuffer
      src.loop = true
      src.connect(this.cityFilter)
      src.start()
      this.citySource = src
    }
    if (this.windBuffer && !this.windSource) {
      const src = ctx.createBufferSource()
      src.buffer = this.windBuffer
      src.loop = true
      src.connect(this.windFilter)
      src.start()
      this.windSource = src
    }
    if (this.tireBuffer && !this.tireSource) {
      const src = ctx.createBufferSource()
      src.buffer = this.tireBuffer
      src.loop = true
      src.connect(this.tireDistortion)
      src.start()
      this.tireSource = src
    }
  }

  destroy() {
    // Explicitly stop all looping sources so they don't outlive the context close
    try { this.citySource?.stop() } catch { /* already stopped */ }
    try { this.windSource?.stop() } catch { /* already stopped */ }
    try { this.tireSource?.stop() } catch { /* already stopped */ }
    try { this.engOsc1?.stop() } catch { /* already stopped */ }
    try { this.engOsc2?.stop() } catch { /* already stopped */ }
    try { this.engOsc3?.stop() } catch { /* already stopped */ }
    this.ctx?.close()
    this.started = false
  }
}
