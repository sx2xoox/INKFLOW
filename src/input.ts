import type { InputFrame } from './game/game';

export class Input {
  private keys = new Set<string>();
  private pressed = new Set<string>();
  mouseX = 0;
  mouseY = 0;
  private mouseDown = false;
  private mouseClicked = false;
  autoAttack = false;

  constructor(target: HTMLElement) {
    window.addEventListener('keydown', (e) => {
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.mouseDown = false;
    });
    window.addEventListener('mousemove', (e) => {
      this.mouseX = e.clientX;
      this.mouseY = e.clientY;
    });
    target.addEventListener('mousedown', (e) => {
      if (e.button === 0) {
        this.mouseDown = true;
        this.mouseClicked = true;
      }
      if (e.button === 2) this.pressed.add('MouseRight');
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouseDown = false;
    });
    target.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  down(code: string): boolean {
    return this.keys.has(code);
  }

  /** 이번 프레임에 막 눌렸는지 — 한 번 읽으면 사라진다 */
  hit(code: string): boolean {
    const had = this.pressed.has(code);
    this.pressed.delete(code);
    return had;
  }

  frame(toWorld: (x: number, y: number) => { x: number; y: number }): InputFrame {
    if (this.hit('KeyF')) this.autoAttack = !this.autoAttack;
    let mx = 0;
    let my = 0;
    if (this.down('KeyA') || this.down('ArrowLeft')) mx -= 1;
    if (this.down('KeyD') || this.down('ArrowRight')) mx += 1;
    if (this.down('KeyW') || this.down('ArrowUp')) my -= 1;
    if (this.down('KeyS') || this.down('ArrowDown')) my += 1;
    const aim = toWorld(this.mouseX, this.mouseY);
    const attack = this.mouseDown || this.mouseClicked || this.down('KeyJ') || this.autoAttack;
    const dash = this.hit('Space') || this.hit('ShiftLeft') || this.hit('ShiftRight') || this.hit('MouseRight') || this.hit('KeyK');
    this.mouseClicked = false;
    return { moveX: mx, moveY: my, aimX: aim.x, aimY: aim.y, attack, dash };
  }

  endFrame(): void {
    this.pressed.clear();
  }
}
