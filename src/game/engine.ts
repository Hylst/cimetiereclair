// Le Cimetière Lumineux  :  moteur de jeu (canvas 2D)

export const W = 960;
export const H = 640;

export type Phase = 'menu' | 'playing' | 'levelup' | 'paused' | 'gameover';

export type UpgradeId =
  | 'dmg'
  | 'rate'
  | 'multi'
  | 'pierce'
  | 'speed'
  | 'hp'
  | 'lantern'
  | 'nova'
  | 'magnet'
  | 'light'
  | 'regen';

export interface UpgradeDef {
  id: UpgradeId;
  name: string;
  desc: string;
  icon: string;
  max: number;
}

export const UPGRADES: UpgradeDef[] = [
  { id: 'dmg', name: 'Lumière ardente', desc: '+25 % de dégâts', icon: '🔥', max: 8 },
  { id: 'rate', name: 'Éclats rapides', desc: '+20 % de cadence de tir', icon: '⚡', max: 8 },
  { id: 'multi', name: 'Gerbe d’étoiles', desc: '+1 projectile par tir', icon: '✨', max: 5 },
  { id: 'pierce', name: 'Rayon perçant', desc: 'Les tirs traversent +1 ennemi', icon: '🏹', max: 4 },
  { id: 'speed', name: 'Bottes spectrales', desc: '+12 % de vitesse', icon: '👟', max: 5 },
  { id: 'hp', name: 'Cœur de citrouille', desc: '+25 PV max et soin complet', icon: '🎃', max: 6 },
  { id: 'lantern', name: 'Lanternes errantes', desc: '+1 lanterne qui tourne autour de toi', icon: '🏮', max: 5 },
  { id: 'nova', name: 'Nova lunaire', desc: 'Onde de choc périodique qui repousse tout', icon: '🌙', max: 5 },
  { id: 'magnet', name: 'Aimant d’âmes', desc: '+45 % de portée de ramassage', icon: '🧲', max: 4 },
  { id: 'light', name: 'Halo sacré', desc: 'Lumière +18 % : les squelettes y sont ralentis', icon: '🕯️', max: 5 },
  { id: 'regen', name: 'Flamme vitale', desc: 'Régénère 0,8 PV par seconde', icon: '💚', max: 4 },
];

export interface UpgradeChoice {
  def: UpgradeDef;
  level: number;
}

export interface EndStats {
  score: number;
  kills: number;
  wave: number;
  time: number;
  level: number;
  best: number;
  isBest: boolean;
}

interface Callbacks {
  onPhase: (p: Phase) => void;
  onChoices: (c: UpgradeChoice[]) => void;
  onEnd: (s: EndStats) => void;
}

type Kind = 'skeleton' | 'runner' | 'brute' | 'boss';

interface Enemy {
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  speed: number;
  r: number;
  kind: Kind;
  dmg: number;
  xp: number;
  flash: number;
  phase: number;
  lanternCd: number;
  kx: number;
  ky: number;
  ang: number;
}

interface Bullet {
  x: number;
  y: number;
  vx: number;
  vy: number;
  dmg: number;
  pierce: number;
  life: number;
  hit: Set<Enemy>;
}

interface Gem {
  x: number;
  y: number;
  v: number;
  t: number;
  pulled: boolean;
  speed: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
  glow: boolean;
}

interface Ring {
  x: number;
  y: number;
  r: number;
  max: number;
  dmg: number;
  hit: Set<Enemy>;
}

interface Wisp {
  x: number;
  y: number;
  vx: number;
  vy: number;
  ph: number;
  s: number;
}

const BEST_KEY = 'cimetiere-lumineux-best';

function mulberry32(a: number) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = (a: number, b: number) => a + Math.random() * (b - a);

// ---------- Audio ----------
class Sfx {
  private ctx: AudioContext | null = null;
  muted = false;
  private last: Record<string, number> = {};

  ensure() {
    try {
      if (!this.ctx) {
        const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        this.ctx = new AC();
      }
      if (this.ctx.state === 'suspended') void this.ctx.resume();
    } catch {
      /* pas d'audio */
    }
  }

  private tone(freq: number, dur: number, type: OscillatorType, vol: number, slideTo?: number, delay = 0) {
    if (this.muted || !this.ctx) return;
    const c = this.ctx;
    const t0 = c.currentTime + delay;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(c.destination);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  }

  play(name: 'shoot' | 'hit' | 'kill' | 'hurt' | 'gem' | 'level' | 'nova' | 'wave' | 'over') {
    const now = performance.now();
    const gap: Record<string, number> = { shoot: 90, hit: 45, kill: 40, gem: 50 };
    if (gap[name] && now - (this.last[name] ?? 0) < gap[name]) return;
    this.last[name] = now;
    switch (name) {
      case 'shoot':
        this.tone(880, 0.09, 'triangle', 0.035, 1500);
        break;
      case 'hit':
        this.tone(220, 0.05, 'square', 0.025, 120);
        break;
      case 'kill':
        this.tone(160, 0.14, 'sawtooth', 0.04, 50);
        break;
      case 'hurt':
        this.tone(140, 0.25, 'sawtooth', 0.09, 50);
        break;
      case 'gem':
        this.tone(1200 + Math.random() * 300, 0.07, 'sine', 0.03, 1900);
        break;
      case 'level':
        [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.22, 'triangle', 0.06, undefined, i * 0.08));
        break;
      case 'nova':
        this.tone(300, 0.5, 'sine', 0.1, 60);
        break;
      case 'wave':
        this.tone(110, 0.6, 'sawtooth', 0.05, 90);
        this.tone(165, 0.6, 'triangle', 0.04, 140, 0.05);
        break;
      case 'over':
        [392, 330, 262, 196].forEach((f, i) => this.tone(f, 0.45, 'triangle', 0.07, undefined, i * 0.22));
        break;
    }
  }
}

// ---------- Moteur ----------
export class Game {
  phase: Phase = 'menu';
  sfx = new Sfx();

  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private dark: HTMLCanvasElement;
  private dctx: CanvasRenderingContext2D;
  private bg: HTMLCanvasElement;
  private S: number;
  private cb: Callbacks;

  private keys = new Set<string>();
  private joy = { active: false, id: -1, ox: 0, oy: 0, x: 0, y: 0 };

  private raf = 0;
  private lastT = 0;
  private clock = 0;

  // sprites
  private lightSprite: HTMLCanvasElement;
  private glowYellow: HTMLCanvasElement;
  private glowRed: HTMLCanvasElement;
  private glowOrange: HTMLCanvasElement;
  private glowGreen: HTMLCanvasElement;

  // état de partie
  private p = { x: W / 2, y: H / 2, hp: 100, maxHp: 100, invuln: 0, aim: -Math.PI / 2, step: 0 };
  private up: Record<UpgradeId, number> = this.freshUpgrades();
  private enemies: Enemy[] = [];
  private bullets: Bullet[] = [];
  private gems: Gem[] = [];
  private parts: Particle[] = [];
  private rings: Ring[] = [];
  private wisps: Wisp[] = [];
  private fireCd = 0;
  private novaCd = 4;
  private lanternAng = 0;
  private level = 1;
  private xp = 0;
  private kills = 0;
  private time = 0;
  private wave = 0;
  private wState: 'break' | 'spawn' = 'break';
  private breakT = 2;
  private toSpawn = 0;
  private spawnT = 0;
  private spawnInt = 1;
  private banner = { text: '', sub: '', t: 0 };
  private shake = 0;
  private hurtFlash = 0;
  private best = 0;
  private pendingLevels = 0;

  constructor(canvas: HTMLCanvasElement, cb: Callbacks) {
    this.canvas = canvas;
    this.cb = cb;
    this.S = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
    canvas.width = W * this.S;
    canvas.height = H * this.S;
    this.ctx = canvas.getContext('2d')!;
    this.dark = document.createElement('canvas');
    this.dark.width = W * this.S;
    this.dark.height = H * this.S;
    this.dctx = this.dark.getContext('2d')!;
    this.lightSprite = this.makeGlow('rgba(255,255,255,1)', 'rgba(255,255,255,0.85)', 128);
    this.glowYellow = this.makeGlow('rgba(255,244,190,1)', 'rgba(255,190,60,0.45)', 64);
    this.glowRed = this.makeGlow('rgba(255,70,50,1)', 'rgba(255,30,20,0.4)', 32);
    this.glowOrange = this.makeGlow('rgba(255,170,60,0.55)', 'rgba(255,120,30,0.2)', 128);
    this.glowGreen = this.makeGlow('rgba(170,255,200,0.9)', 'rgba(90,255,170,0.3)', 48);
    this.bg = this.buildBg();
    try {
      this.best = Number(localStorage.getItem(BEST_KEY) || 0);
    } catch {
      this.best = 0;
    }
    for (let i = 0; i < 26; i++) {
      this.wisps.push({
        x: rand(0, W),
        y: rand(0, H),
        vx: rand(-8, 8),
        vy: rand(-12, -3),
        ph: rand(0, 6.28),
        s: rand(1.5, 3.2),
      });
    }
  }

  getBest() {
    return this.best;
  }

  private freshUpgrades(): Record<UpgradeId, number> {
    return { dmg: 0, rate: 0, multi: 0, pierce: 0, speed: 0, hp: 0, lantern: 0, nova: 0, magnet: 0, light: 0, regen: 0 };
  }

  // ---------- Cycle de vie ----------
  attach() {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    this.lastT = performance.now();
    const loop = (t: number) => {
      const dt = Math.min(0.05, (t - this.lastT) / 1000);
      this.lastT = t;
      this.clock += dt;
      this.tick(dt);
      this.render();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
  }

  private setPhase(p: Phase) {
    this.phase = p;
    this.cb.onPhase(p);
  }

  start() {
    this.sfx.ensure();
    this.p = { x: W / 2, y: H / 2, hp: 100, maxHp: 100, invuln: 0, aim: -Math.PI / 2, step: 0 };
    this.up = this.freshUpgrades();
    this.enemies = [];
    this.bullets = [];
    this.gems = [];
    this.parts = [];
    this.rings = [];
    this.fireCd = 0.3;
    this.novaCd = 4;
    this.level = 1;
    this.xp = 0;
    this.kills = 0;
    this.time = 0;
    this.wave = 0;
    this.wState = 'break';
    this.breakT = 1.8;
    this.toSpawn = 0;
    this.pendingLevels = 0;
    this.banner = { text: 'Le cimetière s’éveille…', sub: 'Garde la lumière allumée', t: 2.4 };
    this.shake = 0;
    this.hurtFlash = 0;
    this.setPhase('playing');
  }

  togglePause() {
    if (this.phase === 'playing') this.setPhase('paused');
    else if (this.phase === 'paused') this.setPhase('playing');
  }

  toMenu() {
    this.enemies = [];
    this.bullets = [];
    this.gems = [];
    this.rings = [];
    this.setPhase('menu');
  }

  toggleMute() {
    this.sfx.muted = !this.sfx.muted;
    return this.sfx.muted;
  }

  // ---------- Entrées ----------
  private onKeyDown = (e: KeyboardEvent) => {
    const k = e.key.toLowerCase();
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
    if (k === 'p' || k === 'escape') {
      if (!e.repeat) this.togglePause();
      return;
    }
    this.keys.add(k);
  };
  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.key.toLowerCase());
  };
  private onBlur = () => {
    this.keys.clear();
    if (this.phase === 'playing') this.setPhase('paused');
  };

  private toLogical(clientX: number, clientY: number) {
    const r = this.canvas.getBoundingClientRect();
    return { x: ((clientX - r.left) / r.width) * W, y: ((clientY - r.top) / r.height) * H };
  }

  pointerDown(e: PointerEvent) {
    if (this.joy.active) return;
    const l = this.toLogical(e.clientX, e.clientY);
    this.joy = { active: true, id: e.pointerId, ox: l.x, oy: l.y, x: l.x, y: l.y };
  }
  pointerMove(e: PointerEvent) {
    if (!this.joy.active || e.pointerId !== this.joy.id) return;
    const l = this.toLogical(e.clientX, e.clientY);
    this.joy.x = l.x;
    this.joy.y = l.y;
  }
  pointerUp(e: PointerEvent) {
    if (e.pointerId === this.joy.id) this.joy.active = false;
  }

  // ---------- Stats dérivées ----------
  private get dmg() {
    return 10 * (1 + 0.25 * this.up.dmg);
  }
  private get fireDelay() {
    return 0.55 / (1 + 0.2 * this.up.rate);
  }
  private get speed() {
    return 175 * (1 + 0.12 * this.up.speed);
  }
  private get lightR() {
    return 165 * (1 + 0.18 * this.up.light);
  }
  private get magnetR() {
    return 70 * (1 + 0.45 * this.up.magnet);
  }
  private xpNeed() {
    return Math.floor(5 + this.level * 4 + this.level * this.level * 0.35);
  }

  // ---------- Mise à jour ----------
  private tick(dt: number) {
    // les feux follets vivent toujours
    for (const w of this.wisps) {
      w.x += w.vx * dt + Math.sin(this.clock + w.ph) * 6 * dt;
      w.y += w.vy * dt;
      if (w.y < -10) {
        w.y = H + 10;
        w.x = rand(0, W);
      }
      if (w.x < -10) w.x = W + 10;
      if (w.x > W + 10) w.x = -10;
    }
    if (this.phase !== 'playing') return;
    this.update(dt);
  }

  private update(dt: number) {
    const p = this.p;
    this.time += dt;
    this.shake = Math.max(0, this.shake - dt * 30);
    this.hurtFlash = Math.max(0, this.hurtFlash - dt * 2.5);
    this.banner.t = Math.max(0, this.banner.t - dt);

    // --- déplacement
    const k = this.keys;
    let ix = (k.has('arrowright') || k.has('d') ? 1 : 0) - (k.has('arrowleft') || k.has('q') || k.has('a') ? 1 : 0);
    let iy = (k.has('arrowdown') || k.has('s') ? 1 : 0) - (k.has('arrowup') || k.has('z') || k.has('w') ? 1 : 0);
    if (this.joy.active) {
      const dx = this.joy.x - this.joy.ox;
      const dy = this.joy.y - this.joy.oy;
      const d = Math.hypot(dx, dy);
      if (d > 6) {
        const m = Math.min(1, d / 60);
        ix += (dx / d) * m;
        iy += (dy / d) * m;
      }
    }
    const il = Math.hypot(ix, iy);
    if (il > 1) {
      ix /= il;
      iy /= il;
    }
    p.x = Math.max(24, Math.min(W - 24, p.x + ix * this.speed * dt));
    p.y = Math.max(24, Math.min(H - 24, p.y + iy * this.speed * dt));
    if (il > 0.05) p.step += dt * 12;
    p.invuln = Math.max(0, p.invuln - dt);
    if (this.up.regen > 0) p.hp = Math.min(p.maxHp, p.hp + 0.8 * this.up.regen * dt);

    // --- tir automatique
    this.fireCd -= dt;
    if (this.fireCd <= 0 && this.enemies.length) {
      let best: Enemy | null = null;
      let bd = 640 * 640;
      for (const e of this.enemies) {
        const d = (e.x - p.x) ** 2 + (e.y - p.y) ** 2;
        if (d < bd) {
          bd = d;
          best = e;
        }
      }
      if (best) {
        const a = Math.atan2(best.y - p.y, best.x - p.x);
        p.aim = a;
        const n = 1 + this.up.multi;
        const spread = 0.17;
        for (let i = 0; i < n; i++) {
          const ang = a + (i - (n - 1) / 2) * spread;
          this.bullets.push({
            x: p.x + Math.cos(ang) * 18,
            y: p.y + Math.sin(ang) * 18,
            vx: Math.cos(ang) * 560,
            vy: Math.sin(ang) * 560,
            dmg: this.dmg,
            pierce: 1 + this.up.pierce,
            life: 1.15,
            hit: new Set(),
          });
        }
        this.sfx.play('shoot');
        this.fireCd = this.fireDelay;
      } else {
        this.fireCd = 0.1;
      }
    }

    // --- projectiles
    for (const b of this.bullets) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      if (b.x < -20 || b.x > W + 20 || b.y < -20 || b.y > H + 20) b.life = 0;
      if (b.life <= 0) continue;
      for (const e of this.enemies) {
        if (e.hp <= 0 || b.hit.has(e)) continue;
        const rr = e.r + 6;
        if ((e.x - b.x) ** 2 + (e.y - b.y) ** 2 < rr * rr) {
          b.hit.add(e);
          this.damage(e, b.dmg, b.vx, b.vy, 70);
          this.spark(b.x, b.y, 4, '#ffe9a0');
          b.pierce--;
          if (b.pierce <= 0) {
            b.life = 0;
            break;
          }
        }
      }
    }
    this.bullets = this.bullets.filter((b) => b.life > 0);

    // --- lanternes
    const nl = this.up.lantern;
    if (nl > 0) {
      this.lanternAng += dt * (2.4 + nl * 0.2);
      for (let i = 0; i < nl; i++) {
        const a = this.lanternAng + (i * Math.PI * 2) / nl;
        const lx = p.x + Math.cos(a) * 78;
        const ly = p.y + Math.sin(a) * 78;
        for (const e of this.enemies) {
          if (e.hp <= 0 || e.lanternCd > 0) continue;
          const rr = e.r + 11;
          if ((e.x - lx) ** 2 + (e.y - ly) ** 2 < rr * rr) {
            e.lanternCd = 0.45;
            this.damage(e, this.dmg * 0.8, e.x - p.x, e.y - p.y, 180);
            this.spark(lx, ly, 5, '#ffb347');
          }
        }
      }
    }

    // --- nova lunaire
    if (this.up.nova > 0) {
      this.novaCd -= dt;
      if (this.novaCd <= 0 && this.enemies.length) {
        this.novaCd = 7.5 - this.up.nova * 0.9;
        this.rings.push({
          x: p.x,
          y: p.y,
          r: 10,
          max: 150 + this.up.nova * 28,
          dmg: 18 + this.up.nova * 9,
          hit: new Set(),
        });
        this.sfx.play('nova');
      }
    }
    for (const r of this.rings) {
      r.r += 420 * dt;
      for (const e of this.enemies) {
        if (e.hp <= 0 || r.hit.has(e)) continue;
        if (Math.hypot(e.x - r.x, e.y - r.y) < r.r + e.r) {
          r.hit.add(e);
          this.damage(e, r.dmg, e.x - r.x, e.y - r.y, 380);
        }
      }
    }
    this.rings = this.rings.filter((r) => r.r < r.max);

    // --- vagues
    this.updateWaves(dt);

    // --- ennemis
    const lr = this.lightR;
    for (const e of this.enemies) {
      e.flash = Math.max(0, e.flash - dt * 6);
      e.lanternCd -= dt;
      e.phase += dt * (e.speed / 12);
      const dx = p.x - e.x;
      const dy = p.y - e.y;
      const d = Math.hypot(dx, dy) || 1;
      e.ang = Math.atan2(dy, dx);
      const inLight = d < lr * 0.92;
      const sp = e.speed * (inLight ? 0.72 : 1.18);
      e.x += (dx / d) * sp * dt + e.kx * dt;
      e.y += (dy / d) * sp * dt + e.ky * dt;
      e.kx *= Math.pow(0.002, dt);
      e.ky *= Math.pow(0.002, dt);
    }
    // séparation
    const es = this.enemies;
    for (let i = 0; i < es.length; i++) {
      const a = es[i];
      for (let j = i + 1; j < es.length; j++) {
        const b = es[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const min = (a.r + b.r) * 0.85;
        const d2 = dx * dx + dy * dy;
        if (d2 < min * min && d2 > 0.01) {
          const d = Math.sqrt(d2);
          const push = ((min - d) / d) * 0.5;
          a.x -= dx * push;
          a.y -= dy * push;
          b.x += dx * push;
          b.y += dy * push;
        }
      }
    }
    // contact avec le joueur
    for (const e of es) {
      if (e.hp <= 0) continue;
      const rr = e.r + 14;
      if (p.invuln <= 0 && (e.x - p.x) ** 2 + (e.y - p.y) ** 2 < rr * rr) {
        p.hp -= e.dmg;
        p.invuln = 0.75;
        this.shake = 9;
        this.hurtFlash = 1;
        this.sfx.play('hurt');
        this.spark(p.x, p.y, 10, '#ff7a3c');
        const dx = e.x - p.x;
        const dy = e.y - p.y;
        const d = Math.hypot(dx, dy) || 1;
        e.kx += (dx / d) * 260;
        e.ky += (dy / d) * 260;
        if (p.hp <= 0) {
          p.hp = 0;
          this.gameOver();
          return;
        }
      }
    }
    this.enemies = es.filter((e) => e.hp > 0);

    // --- gemmes d'âme
    const mr = this.magnetR;
    for (const g of this.gems) {
      g.t += dt;
      const dx = p.x - g.x;
      const dy = p.y - g.y;
      const d = Math.hypot(dx, dy) || 1;
      if (d < mr) g.pulled = true;
      if (g.pulled) {
        g.speed = Math.min(900, g.speed + 1400 * dt);
        g.x += (dx / d) * g.speed * dt;
        g.y += (dy / d) * g.speed * dt;
      }
      if (d < 18) {
        this.xp += g.v;
        g.v = 0;
        this.sfx.play('gem');
      }
    }
    this.gems = this.gems.filter((g) => g.v > 0);
    while (this.xp >= this.xpNeed()) {
      this.xp -= this.xpNeed();
      this.level++;
      this.pendingLevels++;
    }
    if (this.pendingLevels > 0) this.openLevelUp();

    // --- particules
    for (const q of this.parts) {
      q.x += q.vx * dt;
      q.y += q.vy * dt;
      q.vx *= Math.pow(0.05, dt);
      q.vy *= Math.pow(0.05, dt);
      q.life -= dt;
    }
    this.parts = this.parts.filter((q) => q.life > 0);
    if (this.parts.length > 500) this.parts.splice(0, this.parts.length - 500);
  }

  private updateWaves(dt: number) {
    const p = this.p;
    if (this.wState === 'break') {
      this.breakT -= dt;
      if (this.breakT <= 0) {
        this.wave++;
        this.wState = 'spawn';
        const boss = this.wave % 5 === 0;
        this.toSpawn = 7 + this.wave * 3;
        this.spawnInt = Math.max(0.22, 0.95 - this.wave * 0.04);
        this.spawnT = 0.4;
        this.banner = {
          text: `Vague ${this.wave}`,
          sub: boss ? 'Le Roi Squelette approche !' : this.wave === 1 ? 'Ils sortent de terre…' : 'Encore plus nombreux…',
          t: 2.6,
        };
        this.sfx.play('wave');
        if (boss) this.spawnEnemy('boss');
      }
    } else {
      this.spawnT -= dt;
      while (this.spawnT <= 0 && this.toSpawn > 0) {
        const group = 1 + Math.floor(this.wave / 4);
        for (let i = 0; i < group && this.toSpawn > 0; i++) {
          this.spawnEnemy(this.pickKind());
          this.toSpawn--;
        }
        this.spawnT += this.spawnInt;
      }
      if (this.toSpawn <= 0 && this.enemies.length === 0) {
        this.wState = 'break';
        this.breakT = 3.2;
        p.hp = Math.min(p.maxHp, p.hp + 12);
        this.banner = { text: 'Vague repoussée', sub: 'La lumière vous protège… +12 PV', t: 2.4 };
      }
    }
  }

  private pickKind(): Kind {
    const r = Math.random();
    const w = this.wave;
    if (w >= 4 && r < 0.14 + Math.min(0.12, w * 0.01)) return 'brute';
    if (w >= 2 && r < 0.45) return 'runner';
    return 'skeleton';
  }

  private spawnEnemy(kind: Kind) {
    const side = Math.floor(Math.random() * 4);
    const m = 36;
    let x = 0;
    let y = 0;
    if (side === 0) {
      x = rand(0, W);
      y = -m;
    } else if (side === 1) {
      x = W + m;
      y = rand(0, H);
    } else if (side === 2) {
      x = rand(0, W);
      y = H + m;
    } else {
      x = -m;
      y = rand(0, H);
    }
    const hpMult = 1 + (this.wave - 1) * 0.16;
    const spMult = 1 + Math.min(0.5, this.wave * 0.012);
    const base = {
      skeleton: { hp: 18, speed: 56, r: 13, dmg: 8, xp: 1 },
      runner: { hp: 10, speed: 108, r: 10, dmg: 6, xp: 1 },
      brute: { hp: 75, speed: 40, r: 20, dmg: 18, xp: 4 },
      boss: { hp: 480, speed: 36, r: 36, dmg: 30, xp: 30 },
    }[kind];
    const hp = base.hp * hpMult;
    this.enemies.push({
      x,
      y,
      hp,
      maxHp: hp,
      speed: base.speed * spMult * rand(0.92, 1.08),
      r: base.r,
      kind,
      dmg: base.dmg,
      xp: base.xp,
      flash: 0,
      phase: rand(0, 6),
      lanternCd: 0,
      kx: 0,
      ky: 0,
      ang: 0,
    });
  }

  private damage(e: Enemy, amount: number, dirx: number, diry: number, kb: number) {
    e.hp -= amount;
    e.flash = 1;
    const d = Math.hypot(dirx, diry) || 1;
    const resist = e.kind === 'boss' ? 0.15 : e.kind === 'brute' ? 0.5 : 1;
    e.kx += (dirx / d) * kb * resist;
    e.ky += (diry / d) * kb * resist;
    this.sfx.play('hit');
    if (e.hp <= 0) this.kill(e);
  }

  private kill(e: Enemy) {
    this.kills++;
    this.sfx.play('kill');
    const n = e.kind === 'boss' ? 40 : e.kind === 'brute' ? 16 : 9;
    for (let i = 0; i < n; i++) {
      const a = rand(0, 6.28);
      const s = rand(40, e.kind === 'boss' ? 320 : 200);
      this.parts.push({
        x: e.x,
        y: e.y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: rand(0.4, 0.9),
        max: 0.9,
        size: rand(1.5, 3.5),
        color: Math.random() < 0.7 ? '#e9e4cf' : '#9a9580',
        glow: false,
      });
    }
    const gemCount = e.kind === 'boss' ? 8 : 1;
    for (let i = 0; i < gemCount; i++) {
      this.gems.push({
        x: e.x + (gemCount > 1 ? rand(-30, 30) : 0),
        y: e.y + (gemCount > 1 ? rand(-30, 30) : 0),
        v: e.kind === 'boss' ? 4 : e.xp,
        t: rand(0, 6),
        pulled: false,
        speed: 0,
      });
    }
    if (e.kind === 'boss') {
      this.shake = 14;
      this.rings.push({ x: e.x, y: e.y, r: 10, max: 260, dmg: 0, hit: new Set() });
    }
  }

  private spark(x: number, y: number, n: number, color: string) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, 6.28);
      const s = rand(30, 160);
      this.parts.push({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: rand(0.15, 0.4),
        max: 0.4,
        size: rand(1.2, 2.6),
        color,
        glow: true,
      });
    }
  }

  // ---------- Niveau / fin ----------
  private openLevelUp() {
    this.pendingLevels--;
    this.sfx.play('level');
    const pool = UPGRADES.filter((u) => this.up[u.id] < u.max);
    const choices: UpgradeChoice[] = [];
    while (choices.length < 3 && pool.length) {
      const i = Math.floor(Math.random() * pool.length);
      const [def] = pool.splice(i, 1);
      choices.push({ def, level: this.up[def.id] });
    }
    if (!choices.length) {
      this.p.hp = this.p.maxHp;
      return;
    }
    this.cb.onChoices(choices);
    this.setPhase('levelup');
  }

  choose(id: UpgradeId) {
    if (this.phase !== 'levelup') return;
    this.up[id]++;
    if (id === 'hp') {
      this.p.maxHp += 25;
      this.p.hp = this.p.maxHp;
    }
    this.p.invuln = 1.2;
    this.setPhase('playing');
  }

  private gameOver() {
    const score = this.kills * 10 + this.wave * 100 + this.level * 25;
    const isBest = score > this.best;
    if (isBest) {
      this.best = score;
      try {
        localStorage.setItem(BEST_KEY, String(score));
      } catch {
        /* ignore */
      }
    }
    this.sfx.play('over');
    this.cb.onEnd({
      score,
      kills: this.kills,
      wave: this.wave,
      time: this.time,
      level: this.level,
      best: this.best,
      isBest,
    });
    this.setPhase('gameover');
  }

  // ---------- Sprites pré-rendus ----------
  private makeGlow(inner: string, mid: string, size: number) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d')!;
    const gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gr.addColorStop(0, inner);
    gr.addColorStop(0.45, mid);
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, size, size);
    return c;
  }

  private buildBg() {
    const S = this.S;
    const c = document.createElement('canvas');
    c.width = W * S;
    c.height = H * S;
    const g = c.getContext('2d')!;
    g.scale(S, S);
    const rnd = mulberry32(20241031);
    const rr = (a: number, b: number) => a + rnd() * (b - a);

    const grd = g.createRadialGradient(W / 2, H / 2, 40, W / 2, H / 2, 620);
    grd.addColorStop(0, '#34493a');
    grd.addColorStop(1, '#161f22');
    g.fillStyle = grd;
    g.fillRect(0, 0, W, H);

    // plaques d'herbe / terre
    for (let i = 0; i < 700; i++) {
      const x = rr(0, W);
      const y = rr(0, H);
      g.fillStyle = rnd() < 0.5 ? `rgba(20,40,25,${rr(0.06, 0.16)})` : `rgba(70,55,40,${rr(0.05, 0.12)})`;
      g.beginPath();
      g.ellipse(x, y, rr(8, 36), rr(5, 22), rr(0, 3), 0, 6.3);
      g.fill();
    }

    // sentier en terre
    g.save();
    g.strokeStyle = 'rgba(86,68,50,0.45)';
    g.lineCap = 'round';
    g.lineWidth = 58;
    g.beginPath();
    g.moveTo(-20, H * 0.62);
    g.bezierCurveTo(W * 0.3, H * 0.45, W * 0.55, H * 0.8, W + 20, H * 0.4);
    g.stroke();
    g.lineWidth = 46;
    g.beginPath();
    g.moveTo(W * 0.42, -20);
    g.bezierCurveTo(W * 0.5, H * 0.3, W * 0.4, H * 0.7, W * 0.5, H + 20);
    g.stroke();
    g.restore();

    // brins d'herbe
    for (let i = 0; i < 900; i++) {
      const x = rr(0, W);
      const y = rr(0, H);
      g.strokeStyle = `rgba(${Math.floor(rr(60, 110))},${Math.floor(rr(95, 150))},${Math.floor(rr(60, 90))},${rr(0.2, 0.5)})`;
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + rr(-2, 2), y - rr(3, 8));
      g.stroke();
    }

    // tombes
    const placed: { x: number; y: number }[] = [];
    let tries = 0;
    while (placed.length < 24 && tries++ < 400) {
      const x = rr(50, W - 50);
      const y = rr(60, H - 40);
      if (Math.hypot(x - W / 2, y - H / 2) < 150) continue;
      if (placed.some((q) => Math.hypot(q.x - x, q.y - y) < 80)) continue;
      placed.push({ x, y });
      this.drawGrave(g, x, y, rnd);
    }

    // arbres morts dans les coins
    [
      [40, 40],
      [W - 40, 48],
      [46, H - 44],
      [W - 44, H - 40],
    ].forEach(([x, y]) => this.drawDeadTree(g, x, y, rnd));

    // clôture
    g.fillStyle = '#10151a';
    for (let x = 6; x < W; x += 24) {
      for (const y of [4, H - 14]) {
        g.beginPath();
        g.moveTo(x, y + 10);
        g.lineTo(x + 3, y);
        g.lineTo(x + 6, y + 10);
        g.fill();
      }
    }
    for (let y = 6; y < H; y += 24) {
      for (const x of [4, W - 14]) {
        g.beginPath();
        g.moveTo(x + 10, y);
        g.lineTo(x, y + 3);
        g.lineTo(x + 10, y + 6);
        g.fill();
      }
    }

    // vignette
    const v = g.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, W * 0.65);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(0,0,0,0.55)');
    g.fillStyle = v;
    g.fillRect(0, 0, W, H);
    return c;
  }

  private drawGrave(g: CanvasRenderingContext2D, x: number, y: number, rnd: () => number) {
    const kind = rnd();
    g.save();
    g.translate(x, y);
    // ombre
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.beginPath();
    g.ellipse(6, 16, 20, 8, 0, 0, 6.3);
    g.fill();
    if (kind < 0.25) {
      // croix
      g.fillStyle = '#6a6f6a';
      g.strokeStyle = '#30353a';
      g.lineWidth = 2;
      g.fillRect(-4, -26, 8, 46);
      g.strokeRect(-4, -26, 8, 46);
      g.fillRect(-15, -14, 30, 8);
      g.strokeRect(-15, -14, 30, 8);
    } else {
      const w = 15 + rnd() * 6;
      const h = 22 + rnd() * 10;
      g.fillStyle = '#6b7378';
      g.strokeStyle = '#2f3438';
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(-w, 16);
      g.lineTo(-w, -h + w);
      g.arc(0, -h + w, w, Math.PI, 0);
      g.lineTo(w, 16);
      g.closePath();
      g.fill();
      g.stroke();
      g.fillStyle = 'rgba(255,255,255,0.08)';
      g.fillRect(-w + 2, -h + w, 5, h + 10);
      // gravure
      g.strokeStyle = 'rgba(30,34,38,0.7)';
      g.lineWidth = 2;
      g.beginPath();
      if (kind < 0.6) {
        g.moveTo(0, -h + w - 6);
        g.lineTo(0, -h + w + 8);
        g.moveTo(-6, -h + w);
        g.lineTo(6, -h + w);
      } else {
        g.moveTo(-7, -4);
        g.lineTo(7, -4);
        g.moveTo(-5, 2);
        g.lineTo(5, 2);
      }
      g.stroke();
      // mousse
      g.fillStyle = 'rgba(70,120,60,0.55)';
      g.beginPath();
      g.ellipse(-w * 0.4, 14, w * 0.7, 5, 0, 0, 6.3);
      g.fill();
    }
    g.restore();
  }

  private drawDeadTree(g: CanvasRenderingContext2D, x: number, y: number, rnd: () => number) {
    g.save();
    g.translate(x, y);
    g.fillStyle = 'rgba(0,0,0,0.3)';
    g.beginPath();
    g.ellipse(0, 4, 38, 26, 0, 0, 6.3);
    g.fill();
    g.strokeStyle = '#1a1512';
    g.lineCap = 'round';
    const branch = (len: number, ang: number, w: number, d: number) => {
      g.lineWidth = w;
      g.beginPath();
      g.moveTo(0, 0);
      const ex = Math.cos(ang) * len;
      const ey = Math.sin(ang) * len;
      g.lineTo(ex, ey);
      g.stroke();
      if (d > 0) {
        g.save();
        g.translate(ex, ey);
        branch(len * 0.65, ang + 0.6 + rnd() * 0.4, w * 0.6, d - 1);
        branch(len * 0.65, ang - 0.6 - rnd() * 0.4, w * 0.6, d - 1);
        g.restore();
      }
    };
    for (let i = 0; i < 5; i++) branch(22, (i / 5) * Math.PI * 2 + rnd(), 5, 2);
    g.fillStyle = '#241c17';
    g.beginPath();
    g.arc(0, 0, 7, 0, 6.3);
    g.fill();
    g.restore();
  }

  // ---------- Rendu ----------
  private render() {
    const ctx = this.ctx;
    const S = this.S;
    ctx.setTransform(S, 0, 0, S, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, W, H);

    ctx.save();
    if (this.shake > 0) ctx.translate(rand(-1, 1) * this.shake * 0.5, rand(-1, 1) * this.shake * 0.5);
    ctx.drawImage(this.bg, 0, 0, W, H);

    // gemmes
    ctx.globalCompositeOperation = 'lighter';
    for (const g of this.gems) {
      const s = 26 + Math.sin(g.t * 6) * 4;
      ctx.drawImage(this.glowGreen, g.x - s / 2, g.y - s / 2, s, s);
    }
    ctx.globalCompositeOperation = 'source-over';
    for (const g of this.gems) {
      ctx.fillStyle = '#c8ffe0';
      ctx.beginPath();
      ctx.moveTo(g.x, g.y - 5);
      ctx.lineTo(g.x + 3.5, g.y);
      ctx.lineTo(g.x, g.y + 5);
      ctx.lineTo(g.x - 3.5, g.y);
      ctx.closePath();
      ctx.fill();
    }

    // ennemis (triés par y)
    const sorted = [...this.enemies].sort((a, b) => a.y - b.y);
    for (const e of sorted) this.drawEnemy(ctx, e);

    // joueur
    this.drawPlayer(ctx);

    // lanternes
    const nl = this.up.lantern;
    const lanterns: { x: number; y: number }[] = [];
    for (let i = 0; i < nl; i++) {
      const a = this.lanternAng + (i * Math.PI * 2) / nl;
      lanterns.push({ x: this.p.x + Math.cos(a) * 78, y: this.p.y + Math.sin(a) * 78 });
    }
    for (const l of lanterns) this.drawLantern(ctx, l.x, l.y);

    // projectiles + nova (additifs)
    ctx.globalCompositeOperation = 'lighter';
    for (const b of this.bullets) {
      ctx.drawImage(this.glowYellow, b.x - 20, b.y - 20, 40, 40);
    }
    for (const r of this.rings) {
      const a = 1 - r.r / r.max;
      ctx.strokeStyle = `rgba(190,210,255,${0.8 * a})`;
      ctx.lineWidth = 6 * a + 1;
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.r, 0, 6.3);
      ctx.stroke();
      ctx.strokeStyle = `rgba(255,255,255,${0.5 * a})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.r - 3, 0, 6.3);
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
    for (const b of this.bullets) {
      ctx.fillStyle = '#fffbe6';
      ctx.beginPath();
      ctx.arc(b.x, b.y, 3.6, 0, 6.3);
      ctx.fill();
    }
    // particules
    for (const q of this.parts) {
      const a = Math.max(0, q.life / q.max);
      ctx.globalAlpha = a;
      ctx.fillStyle = q.color;
      if (q.glow) ctx.globalCompositeOperation = 'lighter';
      ctx.beginPath();
      ctx.arc(q.x, q.y, q.size, 0, 6.3);
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.globalAlpha = 1;

    // ----- obscurité -----
    this.renderDarkness(lanterns);
    ctx.drawImage(this.dark, 0, 0, W, H);

    // lueur chaude
    const lr = this.lightR;
    const flick = 1 + Math.sin(this.clock * 9) * 0.02 + Math.sin(this.clock * 23) * 0.015;
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.5;
    ctx.drawImage(this.glowOrange, this.p.x - lr * flick, this.p.y - lr * flick, lr * 2 * flick, lr * 2 * flick);
    ctx.globalAlpha = 1;

    // yeux brillants des squelettes (visibles dans le noir)
    for (const e of this.enemies) {
      const sc = e.kind === 'boss' ? 1.8 : e.kind === 'brute' ? 1.3 : 1;
      const fx = Math.cos(e.ang);
      const fy = Math.sin(e.ang);
      const ox = e.x + fx * e.r * 0.45;
      const oy = e.y + fy * e.r * 0.45;
      for (const s of [-1, 1]) {
        const ex = ox - fy * s * e.r * 0.22;
        const ey = oy + fx * s * e.r * 0.22;
        const sz = 13 * sc;
        ctx.drawImage(e.kind === 'runner' ? this.glowGreen : this.glowRed, ex - sz / 2, ey - sz / 2, sz, sz);
      }
    }
    // feux follets
    for (const w of this.wisps) {
      const a = 0.35 + 0.3 * Math.sin(this.clock * 2 + w.ph);
      ctx.globalAlpha = a;
      const s = w.s * 6;
      ctx.drawImage(this.glowGreen, w.x - s, w.y - s, s * 2, s * 2);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.restore();

    // flash de dégâts
    if (this.hurtFlash > 0) {
      const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, W * 0.6);
      g.addColorStop(0, 'rgba(180,0,0,0)');
      g.addColorStop(1, `rgba(200,0,0,${0.5 * this.hurtFlash})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }

    if (this.phase !== 'menu') this.drawHud(ctx);
  }

  private renderDarkness(lanterns: { x: number; y: number }[]) {
    const d = this.dctx;
    const S = this.S;
    d.setTransform(S, 0, 0, S, 0, 0);
    d.globalCompositeOperation = 'source-over';
    d.globalAlpha = 1;
    d.clearRect(0, 0, W, H);
    d.fillStyle = 'rgba(3,4,16,0.86)';
    d.fillRect(0, 0, W, H);
    d.globalCompositeOperation = 'destination-out';
    const flick = 1 + Math.sin(this.clock * 9) * 0.02 + Math.sin(this.clock * 23) * 0.015;
    const R = this.lightR * flick;
    d.drawImage(this.lightSprite, this.p.x - R, this.p.y - R, R * 2, R * 2);
    for (const b of this.bullets) d.drawImage(this.lightSprite, b.x - 55, b.y - 55, 110, 110);
    for (const l of lanterns) d.drawImage(this.lightSprite, l.x - 85, l.y - 85, 170, 170);
    d.globalAlpha = 0.8;
    for (const g of this.gems) d.drawImage(this.lightSprite, g.x - 32, g.y - 32, 64, 64);
    d.globalAlpha = 0.9;
    for (const r of this.rings) {
      const s = 70;
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        d.drawImage(this.lightSprite, r.x + Math.cos(a) * r.r - s / 2, r.y + Math.sin(a) * r.r - s / 2, s, s);
      }
    }
    d.globalAlpha = 0.5;
    for (const w of this.wisps) d.drawImage(this.lightSprite, w.x - 22, w.y - 22, 44, 44);
    d.globalAlpha = 1;
    d.globalCompositeOperation = 'source-over';
  }

  private drawLantern(ctx: CanvasRenderingContext2D, x: number, y: number) {
    ctx.save();
    ctx.translate(x, y);
    ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(this.glowOrange, -30, -30, 60, 60);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#2a2420';
    ctx.fillRect(-6, -9, 12, 3);
    ctx.fillRect(-6, 7, 12, 3);
    ctx.fillStyle = '#ffd36b';
    ctx.strokeStyle = '#3a2f26';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(-5.5, -7, 11, 14, 3);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#fff6cf';
    ctx.beginPath();
    ctx.arc(0, 0, 2.6, 0, 6.3);
    ctx.fill();
    ctx.restore();
  }

  private drawPlayer(ctx: CanvasRenderingContext2D) {
    const p = this.p;
    ctx.save();
    ctx.translate(p.x, p.y);
    if (p.invuln > 0 && Math.floor(this.clock * 20) % 2 === 0) ctx.globalAlpha = 0.45;
    // ombre
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(0, 14, 20, 8, 0, 0, 6.3);
    ctx.fill();
    const bob = Math.sin(p.step) * 1.6;
    ctx.translate(0, bob);
    // corps
    const gr = ctx.createRadialGradient(-5, -6, 3, 0, 0, 22);
    gr.addColorStop(0, '#ffb347');
    gr.addColorStop(1, '#d9560b');
    ctx.fillStyle = gr;
    ctx.strokeStyle = '#7a2c05';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(0, 0, 21, 18, 0, 0, 6.3);
    ctx.fill();
    ctx.stroke();
    // sillons
    ctx.strokeStyle = 'rgba(122,44,5,0.55)';
    ctx.lineWidth = 1.6;
    for (const k of [-11, -5.5, 5.5, 11]) {
      ctx.beginPath();
      ctx.ellipse(0, 0, Math.abs(k), 17, 0, -Math.PI / 2 - 0.1, Math.PI / 2 + 0.1, k > 0);
      ctx.stroke();
    }
    // chapeau de mage
    ctx.fillStyle = '#4b2a8a';
    ctx.strokeStyle = '#25124d';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-13, -11);
    ctx.quadraticCurveTo(0, -17, 13, -11);
    ctx.lineTo(7, -17);
    ctx.lineTo(1, -33);
    ctx.lineTo(-7, -17);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#ffd36b';
    ctx.fillRect(-7, -17.5, 14, 2.5);
    // étoile du chapeau
    ctx.fillStyle = '#ffe9a0';
    ctx.beginPath();
    ctx.arc(0, -24, 1.8, 0, 6.3);
    ctx.fill();
    // visage lumineux
    const fx = Math.cos(p.aim) * 2.5;
    const fy = Math.sin(p.aim) * 1.5;
    ctx.save();
    ctx.translate(fx, fy + 3);
    ctx.fillStyle = '#2b0f00';
    ctx.beginPath();
    ctx.moveTo(-10, -2);
    ctx.lineTo(-3, -2);
    ctx.lineTo(-6.5, -8);
    ctx.closePath();
    ctx.moveTo(10, -2);
    ctx.lineTo(3, -2);
    ctx.lineTo(6.5, -8);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#fff3a8';
    ctx.beginPath();
    ctx.moveTo(-8.5, -3);
    ctx.lineTo(-4.5, -3);
    ctx.lineTo(-6.5, -6.5);
    ctx.closePath();
    ctx.moveTo(8.5, -3);
    ctx.lineTo(4.5, -3);
    ctx.lineTo(6.5, -6.5);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#2b0f00';
    ctx.beginPath();
    ctx.moveTo(-9, 4);
    for (let i = 0; i <= 6; i++) ctx.lineTo(-9 + i * 3, i % 2 ? 9 : 5);
    ctx.lineTo(9, 4);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.restore();
  }

  private drawEnemy(ctx: CanvasRenderingContext2D, e: Enemy) {
    const r = e.r;
    const bone = e.kind === 'runner' ? '#c4d9b4' : e.kind === 'brute' ? '#cbb9a3' : e.kind === 'boss' ? '#e8d9a6' : '#ddd8c4';
    const shade = e.kind === 'runner' ? '#7f9770' : e.kind === 'brute' ? '#85705c' : e.kind === 'boss' ? '#a8935a' : '#8f8a76';
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(0, r * 0.65, r * 0.95, r * 0.4, 0, 0, 6.3);
    ctx.fill();
    ctx.rotate(e.ang);
    const sw = Math.sin(e.phase) * r * 0.35;
    // bras
    ctx.strokeStyle = e.flash > 0.4 ? '#fff' : shade;
    ctx.lineWidth = Math.max(2, r * 0.18);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, -r * 0.7);
    ctx.lineTo(r * 0.9 + sw, -r * 0.95);
    ctx.moveTo(0, r * 0.7);
    ctx.lineTo(r * 0.9 - sw, r * 0.95);
    ctx.stroke();
    // cage thoracique
    ctx.fillStyle = e.flash > 0.4 ? '#fff' : shade;
    ctx.beginPath();
    ctx.ellipse(-r * 0.2, 0, r * 0.7, r * 0.95, 0, 0, 6.3);
    ctx.fill();
    ctx.strokeStyle = e.flash > 0.4 ? '#ddd' : bone;
    ctx.lineWidth = Math.max(1.4, r * 0.1);
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath();
      ctx.moveTo(-r * 0.7 + Math.abs(i) * r * 0.1, i * r * 0.32);
      ctx.lineTo(r * 0.25 - Math.abs(i) * r * 0.1, i * r * 0.32);
      ctx.stroke();
    }
    // crâne
    ctx.fillStyle = e.flash > 0.4 ? '#fff' : bone;
    ctx.strokeStyle = e.flash > 0.4 ? '#fff' : shade;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(r * 0.28, 0, r * 0.58, 0, 6.3);
    ctx.fill();
    ctx.stroke();
    // orbites
    ctx.fillStyle = '#12100e';
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(r * 0.5, s * r * 0.22, r * 0.15, 0, 6.3);
      ctx.fill();
    }
    // couronne du roi
    if (e.kind === 'boss') {
      ctx.fillStyle = '#ffcf40';
      ctx.strokeStyle = '#8a5a00';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        ctx.lineTo(r * 0.1 + Math.cos(a) * r * 0.55, Math.sin(a) * r * 0.55);
        const a2 = a + Math.PI / 6;
        ctx.lineTo(r * 0.1 + Math.cos(a2) * r * 0.78, Math.sin(a2) * r * 0.78);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#d02a2a';
      ctx.beginPath();
      ctx.arc(r * 0.1, 0, r * 0.15, 0, 6.3);
      ctx.fill();
    }
    // casque du brute
    if (e.kind === 'brute') {
      ctx.fillStyle = '#5a5f66';
      ctx.strokeStyle = '#2b2e33';
      ctx.beginPath();
      ctx.arc(r * 0.15, 0, r * 0.6, Math.PI * 0.55, Math.PI * 1.45);
      ctx.lineTo(r * 0.15, 0);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();

    // barre de vie (ennemis blessés)
    if (e.hp < e.maxHp && (e.kind === 'boss' || e.kind === 'brute' || e.hp < e.maxHp * 0.99)) {
      const w = r * 1.8;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(e.x - w / 2, e.y - r - 10, w, 4);
      ctx.fillStyle = e.kind === 'boss' ? '#ffcf40' : '#e24a3b';
      ctx.fillRect(e.x - w / 2, e.y - r - 10, w * Math.max(0, e.hp / e.maxHp), 4);
    }
  }

  // ---------- HUD ----------
  private drawHud(ctx: CanvasRenderingContext2D) {
    const p = this.p;
    const font = (s: number, w = 'bold') => `${w} ${s}px Cinzel, Georgia, serif`;

    // XP
    const need = this.xpNeed();
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, W, 12);
    const xg = ctx.createLinearGradient(0, 0, W, 0);
    xg.addColorStop(0, '#7affc0');
    xg.addColorStop(1, '#c5a3ff');
    ctx.fillStyle = xg;
    ctx.fillRect(0, 0, W * Math.min(1, this.xp / need), 12);
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.font = font(10);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`NIVEAU ${this.level}`, W / 2, 6.5);

    // PV
    const bx = 16;
    const by = 26;
    const bw = 230;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.beginPath();
    ctx.roundRect(bx - 3, by - 3, bw + 6, 24, 8);
    ctx.fill();
    const hr = Math.max(0, p.hp / p.maxHp);
    const hg = ctx.createLinearGradient(bx, 0, bx + bw, 0);
    hg.addColorStop(0, '#ff5a2c');
    hg.addColorStop(1, '#ffb347');
    ctx.fillStyle = hr < 0.3 ? '#e02424' : hg;
    ctx.beginPath();
    ctx.roundRect(bx, by, bw * hr, 18, 6);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = font(12);
    ctx.textAlign = 'left';
    ctx.fillText(`🎃 ${Math.ceil(p.hp)} / ${p.maxHp}`, bx + 8, by + 10);

    // infos
    ctx.textAlign = 'right';
    ctx.fillStyle = '#ffe9a0';
    ctx.font = font(18);
    ctx.shadowColor = 'rgba(0,0,0,0.9)';
    ctx.shadowBlur = 4;
    ctx.fillText(`Vague ${Math.max(1, this.wave)}`, W - 16, 36);
    ctx.fillStyle = '#e9e4cf';
    ctx.font = font(13, '600');
    const left = this.toSpawn + this.enemies.length;
    ctx.fillText(`💀 ${this.kills}   ·   Restants : ${left}`, W - 16, 58);
    const m = Math.floor(this.time / 60);
    const s = Math.floor(this.time % 60);
    ctx.fillText(`⏱ ${m}:${s.toString().padStart(2, '0')}`, W - 16, 78);
    ctx.shadowBlur = 0;

    // bannière
    if (this.banner.t > 0 && this.phase !== 'gameover') {
      const t = this.banner.t;
      const a = Math.min(1, t * 2, (2.4 - t) * 3 + 0.2);
      ctx.globalAlpha = Math.max(0, Math.min(1, a));
      ctx.textAlign = 'center';
      ctx.shadowColor = 'rgba(255,120,30,0.9)';
      ctx.shadowBlur = 24;
      ctx.fillStyle = '#ffcf80';
      ctx.font = `bold 54px Creepster, Cinzel, Georgia, serif`;
      ctx.fillText(this.banner.text, W / 2, H * 0.2);
      ctx.shadowBlur = 8;
      ctx.fillStyle = '#e9e4cf';
      ctx.font = font(18, '600');
      ctx.fillText(this.banner.sub, W / 2, H * 0.2 + 40);
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
    }

    // joystick tactile
    if (this.joy.active) {
      const j = this.joy;
      ctx.strokeStyle = 'rgba(255,230,160,0.45)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(j.ox, j.oy, 60, 0, 6.3);
      ctx.stroke();
      const dx = j.x - j.ox;
      const dy = j.y - j.oy;
      const d = Math.min(60, Math.hypot(dx, dy));
      const a = Math.atan2(dy, dx);
      ctx.fillStyle = 'rgba(255,230,160,0.5)';
      ctx.beginPath();
      ctx.arc(j.ox + Math.cos(a) * d, j.oy + Math.sin(a) * d, 22, 0, 6.3);
      ctx.fill();
    }
    ctx.textBaseline = 'alphabetic';
  }
}
