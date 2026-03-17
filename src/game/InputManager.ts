export interface InputState {
  throttle: number   // 0..1
  brake: number      // 0..1
  steering: number   // -1..1 (left negative)
  handbrake: boolean
  honk: boolean
  lookBack: boolean
  cameraToggle: boolean   // true only on the frame C is pressed
  pauseToggle: boolean    // true only on the frame ESC is pressed
  exitEnterToggle: boolean // true only on the frame F is pressed
  sprint: boolean
  jump: boolean
  voiceChat: boolean       // true while K is held
  shoot: boolean           // true while left mouse button is held
  weaponSwitch: boolean    // true only on the frame Q is pressed
  reload: boolean          // true only on the frame R is pressed
  mouseDx: number
  mouseDy: number
}

export class InputManager {
  private keys: Set<string> = new Set()
  private prevKeys: Set<string> = new Set()
  private steeringSmooth = 0
  private readonly STEER_SPEED = 2.5
  private readonly STEER_RETURN = 3.5
  private mouseDx = 0
  private mouseDy = 0
  private mouseDown = false

  private onKeyDown = (e: KeyboardEvent) => {
    // Let the chat input (or any other text field) handle its own keys
    if (document.activeElement?.tagName === 'INPUT') return
    this.keys.add(e.code)
    e.preventDefault()
  }
  private onKeyUp = (e: KeyboardEvent) => { this.keys.delete(e.code) }
  private onMouseMove = (e: MouseEvent)    => { this.mouseDx += e.movementX; this.mouseDy += e.movementY }
  private onMouseDown = (e: MouseEvent)    => { if (e.button === 0) this.mouseDown = true }
  private onMouseUp   = (e: MouseEvent)    => { if (e.button === 0) this.mouseDown = false }
  private onBlur      = () => { this.keys.clear(); this.mouseDown = false }

  constructor() {
    document.addEventListener('keydown', this.onKeyDown)
    document.addEventListener('keyup',   this.onKeyUp)
    document.addEventListener('mousemove', this.onMouseMove)
    document.addEventListener('mousedown', this.onMouseDown)
    document.addEventListener('mouseup',   this.onMouseUp)
    window.addEventListener('blur', this.onBlur)
  }

  private key(...codes: string[]): boolean {
    return codes.some((c) => this.keys.has(c))
  }

  /** True only on the frame the key transitions from up → down */
  private justPressed(...codes: string[]): boolean {
    return codes.some((c) => this.keys.has(c) && !this.prevKeys.has(c))
  }

  getState(dt: number): InputState {
    // If a text input is focused (chat box), return a zeroed state so the
    // game doesn't react to keystrokes the player is typing into chat.
    if (document.activeElement?.tagName === 'INPUT') {
      this.prevKeys = new Set(this.keys)
      this.mouseDx = 0
      this.mouseDy = 0
      return {
        throttle: 0, brake: 0, steering: 0, handbrake: false, honk: false,
        lookBack: false, cameraToggle: false, pauseToggle: false,
        exitEnterToggle: false, sprint: false, jump: false, voiceChat: false,
        shoot: false, weaponSwitch: false, reload: false, mouseDx: 0, mouseDy: 0,
      }
    }

    const left = this.key('ArrowLeft', 'KeyA')
    const right = this.key('ArrowRight', 'KeyD')

    const targetSteering = left ? -1 : right ? 1 : 0
    if (targetSteering !== 0) {
      this.steeringSmooth += Math.sign(targetSteering) * this.STEER_SPEED * dt
    } else {
      if (Math.abs(this.steeringSmooth) < this.STEER_RETURN * dt) {
        this.steeringSmooth = 0
      } else {
        this.steeringSmooth -= Math.sign(this.steeringSmooth) * this.STEER_RETURN * dt
      }
    }
    this.steeringSmooth = Math.max(-1, Math.min(1, this.steeringSmooth))

    const throttle = this.key('ArrowUp', 'KeyW') ? 1 : 0
    const brake = this.key('ArrowDown', 'KeyS') ? 1 : 0
    const handbrake = this.key('Space')
    const honk = this.key('KeyH')
    const lookBack = this.key('KeyB')
    const cameraToggle = this.justPressed('KeyC')
    const pauseToggle = this.justPressed('Escape') || this.justPressed('KeyP')
    const exitEnterToggle = this.justPressed('KeyF')
    const sprint = this.key('Space')
    const jump   = this.key('ShiftLeft', 'ShiftRight')
    const voiceChat = this.key('KeyK')
    const shoot = this.mouseDown
    const weaponSwitch = this.justPressed('KeyQ')
    const reload = this.justPressed('KeyR')

    // Snapshot keys for next frame's justPressed check
    this.prevKeys = new Set(this.keys)

    // Consume accumulated mouse delta
    const mouseDx = this.mouseDx
    const mouseDy = this.mouseDy
    this.mouseDx = 0
    this.mouseDy = 0

    return {
      throttle,
      brake,
      steering: this.steeringSmooth,
      handbrake,
      honk,
      lookBack,
      cameraToggle,
      pauseToggle,
      exitEnterToggle,
      sprint,
      jump,
      voiceChat,
      shoot,
      weaponSwitch,
      reload,
      mouseDx,
      mouseDy,
    }
  }

  destroy() {
    document.removeEventListener('keydown', this.onKeyDown)
    document.removeEventListener('keyup',   this.onKeyUp)
    document.removeEventListener('mousemove', this.onMouseMove)
    document.removeEventListener('mousedown', this.onMouseDown)
    document.removeEventListener('mouseup',   this.onMouseUp)
    window.removeEventListener('blur', this.onBlur)
  }
}
