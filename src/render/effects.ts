/**
 * Short-lived visual effects fed by game events: coin sparkles, flap puffs, feathers on a
 * crash, fireworks over the castle, the crash flash and screen shake. World coordinates
 * (x along the course, y in the band); real time, so they do not affect the simulation.
 */
export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  g: number;
  life: number;
  age: number;
  kind: 'px' | 'sparkle' | 'puff';
  color: string;
  size: number;
}

export class Effects {
  list: Particle[] = [];
  /** Seconds of white flash left. */
  flash = 0;
  /** Seconds of screen shake left. */
  shake = 0;
  private seed = 1;

  private rand(): number {
    this.seed = (this.seed * 16807) % 2147483647;
    return this.seed / 2147483647;
  }

  private add(p: Partial<Particle> & Pick<Particle, 'x' | 'y'>): void {
    if (this.list.length > 400) this.list.shift();
    this.list.push({ vx: 0, vy: 0, g: 0, life: 0.5, age: 0, kind: 'px', color: '#fcfcfc', size: 1, ...p });
  }

  coin(x: number, y: number): void {
    this.add({ x, y, kind: 'sparkle', life: 0.32 });
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      this.add({ x, y, vx: Math.cos(a) * 40, vy: Math.sin(a) * 40, life: 0.3, color: i % 2 ? '#fce0a8' : '#f8b800' });
    }
  }

  flap(x: number, y: number): void {
    for (let i = 0; i < 3; i++) this.add({ x: x - 6, y: y + 2 + i, vx: -30 - this.rand() * 20, vy: 10 + this.rand() * 20, life: 0.25, kind: 'puff', color: '#fcfcfc' });
  }

  crash(x: number, y: number, colors: readonly string[]): void {
    this.flash = 0.09;
    this.shake = 0.25;
    for (let i = 0; i < 14; i++) {
      const a = this.rand() * Math.PI * 2;
      const s = 40 + this.rand() * 80;
      this.add({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 40, g: 160, life: 0.9 + this.rand() * 0.5, color: colors[i % colors.length]!, size: this.rand() < 0.4 ? 2 : 1 });
    }
  }

  fireworks(x: number, y: number): void {
    const colors = ['#f83800', '#fcfcfc', '#f8b800', '#58d854', '#3cbcfc'];
    const c = colors[Math.floor(this.rand() * colors.length)]!;
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2;
      this.add({ x, y, vx: Math.cos(a) * 55, vy: Math.sin(a) * 55, g: 40, life: 0.8, color: c, size: 1 });
    }
    this.add({ x, y, kind: 'sparkle', life: 0.3 });
  }

  update(dt: number): void {
    this.flash = Math.max(0, this.flash - dt);
    this.shake = Math.max(0, this.shake - dt);
    for (const p of this.list) {
      p.age += dt;
      p.vy += p.g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    this.list = this.list.filter((p) => p.age < p.life);
  }

  clear(): void {
    this.list = [];
    this.flash = 0;
    this.shake = 0;
  }
}
