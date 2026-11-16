'use strict';

/* ============================================================
   Catch Bird — safari photo
   Oiseaux dans un environnement naturel, photo virtuelle :
   zoom, mise au point, effroi lie aux mouvements de souris,
   graines, score (cadrage / focus / flou / rarete / pose).
   ============================================================ */

// ---------- Constantes ----------
const WORLD = { w: 2600, h: 1700 };   // monde en unites "world"
const GROUND_Y = 1120;                // ligne d'horizon / debut du sol
const BASE_VIEW_W = 1800;             // largeur monde visible au zoom 1
const PHOTO_W = 1200, PHOTO_H = 800;  // resolution de la photo (3:2)
const REF_Z = 8;                      // profondeur de reference
const MIN_ZOOM = 0.6, MAX_ZOOM = 6;
const DAY_LEN = 300;                  // duree d'un cycle jour/nuit (s)
const SCARE_SPEED = 950;              // vitesse souris px/s declenchant l'effroi
const SCARE_RADIUS = 430;             // rayon d'effroi (unites monde)

const POSE_MULT = {
  perche: 1.0, sol: 1.0, marche: 1.0, picore: 1.25,
  chante: 1.6, toilette: 1.35, alerte: 1.15, vol: 1.3, fuite: 0.4
};
const POSE_NOM = {
  perche: 'au perchoir', sol: 'au sol', marche: 'en marche', picore: 'en train de picorer',
  chante: 'en train de chanter', toilette: 'en toilette', alerte: 'aux aguets',
  vol: 'en vol', fuite: 'en fuite'
};

const SPECIES = [
  { id: 'moineau',   nom: 'Moineau domestique',  rarete: 1.0, proba: 0.22,  taille: 22, vitesse: 75,
    c: { corps: '#8a6f4d', ventre: '#cbb894', tete: '#6e5638', bec: '#333' } },
  { id: 'mesange',   nom: 'Mesange charbonniere', rarete: 1.3, proba: 0.18,  taille: 24, vitesse: 85,
    c: { corps: '#e8d44d', ventre: '#f5ee9a', tete: '#141414', joue: '#ffffff', bec: '#222' } },
  { id: 'rougegorge', nom: 'Rouge-gorge familier', rarete: 1.4, proba: 0.16, taille: 24, vitesse: 80,
    c: { corps: '#7a6a52', ventre: '#e2622b', tete: '#6b5a44', bec: '#222' } },
  { id: 'merle',     nom: 'Merle noir',           rarete: 1.1, proba: 0.14, taille: 34, vitesse: 90,
    c: { corps: '#1c1c22', ventre: '#2a2a33', tete: '#1c1c22', bec: '#e8a020' } },
  { id: 'pic',       nom: 'Pic epeiche',          rarete: 2.0, proba: 0.08,  taille: 32, vitesse: 60,
    c: { corps: '#f2f2f2', ventre: '#ffffff', tete: '#e03030', bec: '#333', dos: '#141414', aile: '#141414' } },
  { id: 'geai',      nom: 'Geai des chenes',      rarete: 2.4, proba: 0.07,  taille: 34, vitesse: 100,
    c: { corps: '#d8a08a', ventre: '#e8c0ae', tete: '#3a3a3a', bec: '#222', aile: '#5a8fd0' } },
  { id: 'chouette',  nom: 'Chouette hulotte',     rarete: 3.6, proba: 0.03,  taille: 44, vitesse: 70,
    c: { corps: '#9a8a78', ventre: '#b5a696', tete: '#8a7a68', bec: '#d8c060', yeux: '#f0a020', yeuxBig: true } },
  { id: 'martin',    nom: 'Martin-pecheur',       rarete: 4.2, proba: 0.025, taille: 22, vitesse: 170,
    c: { corps: '#2a6fd0', ventre: '#e8862a', tete: '#2a6fd0', bec: '#c03020', dos: '#20c8b0', aile: '#1f56a8' } },
  { id: 'buse',      nom: 'Buse variable',        rarete: 5.0, proba: 0.015, taille: 70, vitesse: 130,
    c: { corps: '#6b4a2a', ventre: '#c9a06a', tete: '#5a3a20', bec: '#222', aile: '#54371e', bout: '#f0e8d0' } }
];

// ---------- Canvas ----------
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
let CW = 0, CH = 0, DPR = 1;
function resize() {
  DPR = Math.min(2, window.devicePixelRatio || 1);
  CW = window.innerWidth; CH = window.innerHeight;
  canvas.width = CW * DPR; canvas.height = CH * DPR;
  canvas.style.width = CW + 'px'; canvas.style.height = CH + 'px';
}
window.addEventListener('resize', resize);
resize();

// ---------- Etat global ----------
const cam = { x: WORLD.w / 2, y: 880, zoom: 1.1 };
let focusDist = 8;                 // distance de mise au point (m)
let tod = 0.35;                    // heure 0..1 (0.15=lever, 0.5=midi, 0.85=coucher)
let running = false;
let shake = 0;
let seedMode = false;
let seedStock = 10;
let seedRegenT = 0;
let scareCooldown = 0;
let afT = 0, afBird = null;        // chasse autofocus
let birds = [];
let seeds = [];
let photos = [];
let best = null;
let spawnT = 0, rareT = 20;
const mouse = { x: CW / 2, y: CH / 2, lx: CW / 2, ly: CH / 2, speed: 0 };
const keys = {};

const POND = { x: 2050, y: 1430, rx: 340, ry: 120 };

// ---------- Utilitaires ----------
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
function lerpColor(c1, c2, t) {
  return 'rgb(' + Math.round(lerp(c1[0], c2[0], t)) + ',' + Math.round(lerp(c1[1], c2[1], t)) + ',' + Math.round(lerp(c1[2], c2[2], t)) + ')';
}
function viewRect() {
  let vh = Math.min(CH - 90, (CW - 40) * 2 / 3);
  let vw = vh * 3 / 2;
  if (vw > CW - 40) { vw = CW - 40; vh = vw * 2 / 3; }
  return { w: vw, h: vh, x: (CW - vw) / 2, y: (CH - vh) / 2 + 12 };
}
function screenToWorld(mx, my) {
  const v = viewRect();
  const ppu = v.w * cam.zoom / BASE_VIEW_W;
  return { x: cam.x + (mx - (v.x + v.w / 2)) / ppu, y: cam.y + (my - (v.y + v.h / 2)) / ppu };
}
function focalMM() { return Math.round(24 * Math.pow(cam.zoom / MIN_ZOOM, 1.3)); }
function isNight() { return tod < 0.15 || tod > 0.85; }
function dayFrac() { return clamp((tod - 0.15) / 0.7, 0, 1); }
function daylight() { return clamp(Math.sin(Math.PI * dayFrac()), 0, 1); }
function shutterSec() {
  const f = focalMM();
  const s = (1 / (f * 1.1)) / (0.3 + 0.7 * daylight());
  return clamp(s, 1 / 8000, 1 / 15);
}
function depthForY(y) { return clamp(12 - (y / WORLD.h) * 10, 1.5, 13); }

// ---------- Environnement (genere une fois) ----------
const trees = [], branches = [], clouds = [], starsArr = [];
const flowers = [], tufts = [], patches = [], ridgeFar = [], ridgeNear = [];

(function genWorld() {
  let x = 90;
  while (x < WORLD.w - 90) {
    const y = GROUND_Y + 50 + Math.random() * 180;
    const type = Math.random() < 0.55 ? 'oak' : 'pine';
    const s = 0.8 + Math.random() * 0.75;
    const t = { x, y, type, s, blobs: [] };
    if (type === 'oak') {
      for (let i = 0; i < 6; i++) t.blobs.push({ dx: (Math.random() * 150 - 75), dy: (Math.random() * 60 - 30), r: 38 + Math.random() * 30 });
      for (let i = 0; i < 3; i++) branches.push({ x: x + (Math.random() * 110 - 55) * s, y: y - (95 + Math.random() * 70) * s });
    }
    trees.push(t);
    x += 150 + Math.random() * 170;
  }
  for (let i = 0; i < 9; i++) clouds.push({ x: Math.random() * WORLD.w, y: 90 + Math.random() * 320, s: 0.7 + Math.random() * 1.1, v: 6 + Math.random() * 10 });
  for (let i = 0; i < 90; i++) starsArr.push({ x: Math.random(), y: Math.random() * 0.6, r: Math.random() * 1.4 + 0.4 });
  for (let i = 0; i < 130; i++) flowers.push({ x: 40 + Math.random() * (WORLD.w - 80), y: GROUND_Y + 40 + Math.random() * (WORLD.h - GROUND_Y - 70), col: ['#ff8fb0', '#ffd76a', '#c9a0ff', '#ff9a5a', '#ffffff'][(Math.random() * 5) | 0] });
  for (let i = 0; i < 240; i++) tufts.push({ x: 20 + Math.random() * (WORLD.w - 40), y: GROUND_Y + 30 + Math.random() * (WORLD.h - GROUND_Y - 40), s: 0.6 + Math.random() * 1.1 });
  for (let i = 0; i < 45; i++) patches.push({ x: Math.random() * WORLD.w, y: GROUND_Y + 20 + Math.random() * (WORLD.h - GROUND_Y - 30), rx: 60 + Math.random() * 160, ry: 14 + Math.random() * 30, dark: Math.random() < 0.5 });
  for (let xx = -1200, i = 0; xx <= WORLD.w + 1200; xx += 240, i++) {
    ridgeFar.push({ x: xx, h: 160 + 150 * Math.abs(Math.sin(i * 12.9898) * 43758.5453 % 1) });
    ridgeNear.push({ x: xx, h: 80 + 80 * Math.abs(Math.sin(i * 78.233) * 12543.123 % 1) });
  }
})();

// ---------- Audio (petits syntheses) ----------
let AC = null;
function audio() {
  if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { AC = null; } }
  if (AC && AC.state === 'suspended') AC.resume();
  return AC;
}
function tone(f0, f1, dur, type, vol) {
  if (!audio()) return;
  const t = AC.currentTime;
  const o = AC.createOscillator(), g = AC.createGain();
  o.type = type || 'sine';
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
  g.gain.setValueAtTime(vol || 0.12, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(AC.destination);
  o.start(t); o.stop(t + dur + 0.02);
}
function noiseBurst(dur, vol, freq) {
  if (!audio()) return;
  const t = AC.currentTime;
  const len = Math.floor(AC.sampleRate * dur);
  const buf = AC.createBuffer(1, len, AC.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = AC.createBufferSource(); src.buffer = buf;
  const f = AC.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = freq || 2000;
  const g = AC.createGain(); g.gain.value = vol;
  src.connect(f); f.connect(g); g.connect(AC.destination);
  src.start(t);
}
const chirp = () => { const n = 2 + ((Math.random() * 3) | 0); for (let i = 0; i < n; i++) setTimeout(() => tone(2200 + Math.random() * 1800, 1600 + Math.random() * 1200, 0.09, 'sine', 0.1), i * 110); };
const alarm = () => { tone(3200, 900, 0.18, 'sawtooth', 0.07); setTimeout(() => tone(3000, 800, 0.18, 'sawtooth', 0.06), 140); };
const shutterSnd = () => { noiseBurst(0.06, 0.45, 3000); tone(1200, 250, 0.05, 'square', 0.07); };
const whoosh = () => noiseBurst(0.35, 0.22, 700);
const plop = () => tone(320, 80, 0.12, 'sine', 0.2);

// ---------- Oiseaux ----------
function pickSpecies() {
  const night = isNight();
  let total = 0;
  const w = SPECIES.map(s => {
    let p = s.proba;
    if (s.id === 'chouette') p *= night ? 8 : 0.4;
    if (s.id === 'buse') p *= night ? 0.2 : 1;
    total += p; return p;
  });
  let r = Math.random() * total;
  for (let i = 0; i < SPECIES.length; i++) { r -= w[i]; if (r <= 0) return SPECIES[i]; }
  return SPECIES[0];
}

class Bird {
  constructor(sp) {
    this.sp = sp;
    this.x = 0; this.y = 0; this.z = 8; this.zOff = Math.random() * 1.2 - 0.6;
    this.vx = 0; this.vy = 0; this.dir = Math.random() < 0.5 ? -1 : 1;
    this.mode = 'sol'; this.pose = 'sol';
    this.poseT = 1 + Math.random() * 3; this.idleT = Math.random() * 3;
    this.wing = Math.random() * 6; this.bobT = Math.random() * 6;
    this.peck = 0; this.hunger = Math.random(); this.landT = 0; this.fleeT = 0;
    this.targetSeed = null; this.tx = 0; this.ty = 0; this.dead = false;
  }
  update(dt) {
    this.bobT += dt;
    this.hunger = Math.min(1, this.hunger + dt * 0.018);

    if (this.mode === 'fuite') {
      this.wing += dt * 22;
      this.x += this.vx * dt; this.y += this.vy * dt;
      this.fleeT -= dt;
      if (this.fleeT <= 0) {
        this.mode = 'vol'; this.landT = 2 + Math.random() * 3; this.targetSeed = null;
        this.vx = (Math.random() < 0.5 ? -1 : 1) * (40 + Math.random() * 60);
        this.vy = -30 + Math.random() * 50;
      }
      if (this.x < -500 || this.x > WORLD.w + 500 || this.y < -500 || this.y > WORLD.h + 500) this.dead = true;
      this.dir = this.vx >= 0 ? 1 : -1;
      this.pose = 'fuite';
      this.z = clamp(depthForY(this.y) + this.zOff, 1.5, 13);
      return;
    }

    if (this.mode === 'vol') {
      this.wing += dt * 14;
      if (this.targetSeed) {
        const s = this.targetSeed;
        if (s.amount <= 0) { this.targetSeed = null; this.landT = 1 + Math.random() * 2; }
        else {
          const dx = s.x - this.x, dy = s.y - this.y;
          const d = Math.hypot(dx, dy) || 1;
          const sp = this.sp.vitesse * 2.2;
          this.vx = dx / d * sp; this.vy = dy / d * sp;
          if (d < 70) { this.mode = 'picore'; this.peck = 0; this.vx = 0; this.vy = 0; }
        }
      } else {
        // vol plane : ramener doucement vers une altitude confortable
        const targetAlt = 380 + Math.sin(this.bobT * 0.3) * 120;
        this.vy += (targetAlt - this.y) * 0.5 * dt;
        this.vy = clamp(this.vy, -90, 90);
        this.landT -= dt;
        if (this.landT <= 0) {
          this.y = clamp(this.y, GROUND_Y + 60, WORLD.h - 80);
          this.x = clamp(this.x, 60, WORLD.w - 60);
          this.mode = 'sol'; this.vx = 0; this.vy = 0; this.pose = 'sol';
        }
      }
      this.x += this.vx * dt;
      this.y += this.vy * dt + Math.sin(this.bobT * 6) * 10 * dt;
      if (this.x < -300) this.x = WORLD.w + 200; else if (this.x > WORLD.w + 300) this.x = -200;
      this.y = clamp(this.y, 120, WORLD.h - 40);
      this.dir = this.vx >= 0 ? 1 : -1;
      this.pose = 'vol';
      this.z = clamp(depthForY(this.y) + this.zOff, 1.5, 13);
      return;
    }

    // quete de graines
    if (this.hunger > 0.55 && (this.mode === 'sol' || this.mode === 'perche' || this.mode === 'marche')) {
      const s = nearestSeed(this.x, this.y, 1300);
      if (s) {
        this.targetSeed = s;
        const d = Math.hypot(s.x - this.x, s.y - this.y);
        if (d > 380) { this.mode = 'vol'; this.landT = 999; }
        else { this.mode = 'marche'; }
      }
    }

    if (this.mode === 'marche') {
      const tx = this.targetSeed ? this.targetSeed.x : this.tx;
      const ty = this.targetSeed ? this.targetSeed.y : this.ty;
      if (this.targetSeed && this.targetSeed.amount <= 0) { this.targetSeed = null; this.mode = 'sol'; this.pose = 'sol'; return; }
      const dx = tx - this.x, dy = ty - this.y;
      const d = Math.hypot(dx, dy);
      if (d < 14) {
        if (this.targetSeed) { this.mode = 'picore'; this.peck = 0; }
        else { this.mode = 'sol'; this.pose = 'sol'; }
      } else {
        const sp = this.sp.vitesse * 0.55;
        this.x += dx / d * sp * dt;
        this.y += dy / d * sp * dt;
        this.dir = dx >= 0 ? 1 : -1;
        this.pose = 'marche';
      }
      this.z = clamp(depthForY(this.y) + this.zOff, 1.5, 13);
      return;
    }

    if (this.mode === 'picore') {
      this.peck += dt * 5;
      const s = this.targetSeed;
      if (!s || s.amount <= 0) { this.targetSeed = null; this.mode = 'sol'; this.pose = 'sol'; return; }
      s.amount -= dt * 0.5;
      this.hunger = Math.max(0, this.hunger - dt * 0.3);
      if (this.hunger <= 0.05) { this.targetSeed = null; this.mode = 'sol'; this.pose = 'sol'; return; }
      this.pose = 'picore';
      this.z = clamp(depthForY(this.y) + this.zOff, 1.5, 13);
      return;
    }

    if (this.mode === 'perche') {
      this.poseT -= dt;
      if (this.poseT <= 0) {
        const r = Math.random();
        if (r < 0.3) { this.pose = 'chante'; chirp(); }
        else if (r < 0.5) this.pose = 'toilette';
        else if (r < 0.65) this.pose = 'alerte';
        else this.pose = 'perche';
        this.poseT = 2 + Math.random() * 4;
      }
      return;
    }

    // sol : errance
    this.idleT -= dt;
    if (this.idleT <= 0) {
      this.idleT = 2 + Math.random() * 5;
      if (Math.random() < 0.6 && !this.targetSeed) {
        this.mode = 'marche';
        this.tx = clamp(this.x + (Math.random() * 420 - 210), 60, WORLD.w - 60);
        this.ty = GROUND_Y + 50 + Math.random() * (WORLD.h - GROUND_Y - 120);
      }
    }
    if (this.mode === 'sol') this.pose = 'sol';
    this.z = clamp(depthForY(this.y) + this.zOff, 1.5, 13);
  }
}

function spawnBird(force) {
  const sp = force || pickSpecies();
  const b = new Bird(sp);
  const roll = Math.random();
  if (sp.id === 'buse' || roll < 0.12) {
    b.mode = 'vol'; b.landT = 6 + Math.random() * 8;
    b.x = Math.random() * WORLD.w; b.y = 220 + Math.random() * 420;
    b.vx = (Math.random() < 0.5 ? -1 : 1) * (50 + Math.random() * 60); b.vy = 0;
  } else if (sp.id === 'martin' || roll < 0.42) {
    if (sp.id === 'martin') {
      b.mode = 'sol';
      b.x = POND.x - POND.rx - 40 + Math.random() * 160;
      b.y = GROUND_Y + 40 + Math.random() * 120;
    } else if (branches.length) {
      const br = branches[(Math.random() * branches.length) | 0];
      b.mode = 'perche'; b.x = br.x; b.y = br.y;
    } else {
      b.mode = 'sol'; b.x = 100 + Math.random() * (WORLD.w - 200); b.y = GROUND_Y + 80 + Math.random() * 300;
    }
  } else {
    b.mode = 'sol';
    b.x = 100 + Math.random() * (WORLD.w - 200);
    b.y = GROUND_Y + 60 + Math.random() * (WORLD.h - GROUND_Y - 140);
  }
  b.z = clamp(depthForY(b.y) + b.zOff, 1.5, 13);
  birds.push(b);
}

function nearestSeed(x, y, maxD) {
  let bestS = null, bestD = maxD;
  for (const s of seeds) {
    if (s.amount <= 0 || s.ttl <= 0) continue;
    const d = Math.hypot(s.x - x, s.y - y);
    if (d < bestD) { bestD = d; bestS = s; }
  }
  return bestS;
}

function scareAt(wx, wy) {
  let n = 0;
  for (const b of birds) {
    const d = Math.hypot(b.x - wx, (b.y - wy) * 1.2);
    if (d < SCARE_RADIUS) {
      n++;
      const a = Math.atan2(b.y - wy, b.x - wx) + (Math.random() * 0.8 - 0.4);
      const sp = 250 + Math.random() * 170;
      b.mode = 'fuite'; b.fleeT = 2.5 + Math.random() * 1.5; b.targetSeed = null;
      b.vx = Math.cos(a) * sp; b.vy = Math.sin(a) * sp - 130;
      b.pose = 'fuite';
    }
  }
  if (n > 0) { shake = Math.min(1.2, shake + 0.7); whoosh(); alarm(); }
}

// ---------- Rendu du monde ----------
function drawSky(c, x, y, w, h) {
  const dl = daylight();
  let top, hor;
  if (dl > 0.5) { const t = (dl - 0.5) / 0.5; top = lerpColor([90, 90, 154], [110, 195, 242], t); hor = lerpColor([242, 163, 90], [207, 238, 251], t); }
  else { const t = (0.5 - dl) / 0.5; top = lerpColor([90, 90, 154], [10, 16, 48], t); hor = lerpColor([242, 163, 90], [26, 42, 74], t); }
  const g = c.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, top); g.addColorStop(1, hor);
  c.fillStyle = g; c.fillRect(x, y, w, h);
  // etoiles la nuit
  if (dl < 0.25) {
    c.fillStyle = 'rgba(255,255,255,' + ((0.25 - dl) / 0.25 * 0.9) + ')';
    for (const s of starsArr) { c.beginPath(); c.arc(x + s.x * w, y + s.y * h, s.r, 0, 7); c.fill(); }
  }
  // soleil / lune
  const df = dayFrac();
  if (dl > 0.02) {
    const sx = x + w * (0.08 + 0.84 * df);
    const sy = y + h * 0.85 - dl * h * 0.62;
    const rg = c.createRadialGradient(sx, sy, 2, sx, sy, 60);
    rg.addColorStop(0, 'rgba(255,240,180,0.95)'); rg.addColorStop(0.25, 'rgba(255,220,120,0.55)'); rg.addColorStop(1, 'rgba(255,220,120,0)');
    c.fillStyle = rg; c.beginPath(); c.arc(sx, sy, 60, 0, 7); c.fill();
    c.fillStyle = '#fff3c4'; c.beginPath(); c.arc(sx, sy, 16, 0, 7); c.fill();
  } else {
    const nf = tod < 0.15 ? (tod + 1 - 0.85) / 0.3 : (tod - 0.85) / 0.3;
    const mx = x + w * (0.1 + 0.8 * nf), my = y + h * 0.3;
    c.fillStyle = '#e8ecf4'; c.beginPath(); c.arc(mx, my, 14, 0, 7); c.fill();
    c.fillStyle = 'rgba(10,16,48,0.9)'; c.beginPath(); c.arc(mx + 6, my - 3, 12, 0, 7); c.fill();
  }
}

function drawWorld(c) {
  // nuages
  c.fillStyle = 'rgba(255,255,255,0.85)';
  for (const cl of clouds) {
    c.beginPath();
    c.ellipse(cl.x, cl.y, 70 * cl.s, 20 * cl.s, 0, 0, 7);
    c.ellipse(cl.x + 45 * cl.s, cl.y + 6 * cl.s, 50 * cl.s, 16 * cl.s, 0, 0, 7);
    c.ellipse(cl.x - 45 * cl.s, cl.y + 8 * cl.s, 44 * cl.s, 14 * cl.s, 0, 0, 7);
    c.fill();
  }
  // montagnes
  c.fillStyle = '#9db8cc';
  c.beginPath(); c.moveTo(-1200, GROUND_Y);
  for (const p of ridgeFar) c.lineTo(p.x, GROUND_Y - p.h);
  c.lineTo(WORLD.w + 1200, GROUND_Y); c.closePath(); c.fill();
  // collines proches
  c.fillStyle = '#79a862';
  c.beginPath(); c.moveTo(-1200, GROUND_Y + 40);
  for (const p of ridgeNear) c.lineTo(p.x, GROUND_Y - p.h * 0.7);
  c.lineTo(WORLD.w + 1200, GROUND_Y + 40); c.closePath(); c.fill();
  // sol
  const gg = c.createLinearGradient(0, GROUND_Y, 0, WORLD.h + 600);
  gg.addColorStop(0, '#5d9b4a'); gg.addColorStop(1, '#3c6e33');
  c.fillStyle = gg; c.fillRect(-1200, GROUND_Y, WORLD.w + 2400, WORLD.h - GROUND_Y + 1200);
  for (const p of patches) {
    c.fillStyle = p.dark ? 'rgba(30,70,28,0.25)' : 'rgba(140,200,110,0.2)';
    c.beginPath(); c.ellipse(p.x, p.y, p.rx, p.ry, 0, 0, 7); c.fill();
  }
  // etang
  const pg = c.createRadialGradient(POND.x, POND.y, 10, POND.x, POND.y, POND.rx);
  pg.addColorStop(0, '#7ec8e8'); pg.addColorStop(1, '#2a6a9a');
  c.fillStyle = pg;
  c.beginPath(); c.ellipse(POND.x, POND.y, POND.rx, POND.ry, 0, 0, 7); c.fill();
  c.strokeStyle = 'rgba(20,60,80,0.6)'; c.lineWidth = 6;
  c.beginPath(); c.ellipse(POND.x, POND.y, POND.rx, POND.ry, 0, 0, 7); c.stroke();
  // roseaux
  c.strokeStyle = '#3f7a34'; c.lineWidth = 4;
  for (let i = 0; i < 10; i++) {
    const rx = POND.x - POND.rx + (i / 9) * POND.rx * 2;
    const ry = POND.y - POND.ry * 0.7;
    c.beginPath(); c.moveTo(rx, ry + 14);
    c.quadraticCurveTo(rx + 8, ry - 30, rx + (i % 2 ? 14 : -10), ry - 48 - (i % 3) * 12);
    c.stroke();
  }
  // fleurs
  for (const f of flowers) {
    c.fillStyle = f.col; c.beginPath(); c.arc(f.x, f.y, 3.2, 0, 7); c.fill();
    c.fillStyle = '#fff'; c.beginPath(); c.arc(f.x, f.y, 1.2, 0, 7); c.fill();
  }
  // arbres
  for (const t of trees) drawTree(c, t);
  // graines
  for (const s of seeds) {
    c.fillStyle = '#6b4a26';
    c.beginPath(); c.ellipse(s.x, s.y, 16, 6, 0, 0, 7); c.fill();
    c.fillStyle = '#a8814a';
    for (let i = 0; i < 7; i++) {
      const a = i * 2.4;
      c.beginPath(); c.arc(s.x + Math.cos(a) * 10, s.y - 2 + Math.sin(a) * 4, 2.2, 0, 7); c.fill();
    }
  }
  // oiseaux (tries par profondeur)
  const sorted = [...birds].sort((a, b) => a.y - b.y);
  for (const b of sorted) drawBird(c, b);
  // herbes hautes devant
  c.strokeStyle = 'rgba(40,90,35,0.8)'; c.lineWidth = 2;
  for (const t of tufts) {
    c.beginPath();
    for (let i = -1; i <= 1; i++) {
      c.moveTo(t.x + i * 4 * t.s, t.y);
      c.quadraticCurveTo(t.x + i * 7 * t.s, t.y - 12 * t.s, t.x + i * 10 * t.s, t.y - 20 * t.s);
    }
    c.stroke();
  }
}

function drawTree(c, t) {
  c.save(); c.translate(t.x, t.y); c.scale(t.s, t.s);
  c.fillStyle = '#5a4028';
  c.fillRect(-9, -120, 18, 122);
  if (t.type === 'oak') {
    c.fillStyle = '#3f7a34';
    for (const b of t.blobs) { c.beginPath(); c.arc(b.dx, -140 + b.dy, b.r, 0, 7); c.fill(); }
    c.fillStyle = '#549a45';
    for (const b of t.blobs) { c.beginPath(); c.arc(b.dx - b.r * 0.25, -140 + b.dy - b.r * 0.25, b.r * 0.6, 0, 7); c.fill(); }
  } else {
    c.fillStyle = '#2f6b3a';
    for (let i = 0; i < 3; i++) {
      const w = 90 - i * 22, yy = -70 - i * 45;
      c.beginPath(); c.moveTo(-w / 2, yy); c.lineTo(0, yy - 70); c.lineTo(w / 2, yy); c.closePath(); c.fill();
    }
  }
  c.restore();
}

function drawBird(c, b) {
  const s = b.sp.taille * (REF_Z / b.z) * 0.85;
  const col = b.sp.c;
  c.save();
  c.translate(b.x, b.y + (b.mode === 'vol' || b.mode === 'fuite' ? Math.sin(b.bobT * 6) * 3 : 0));
  c.scale(b.dir * s, s);
  const flying = b.mode === 'vol' || b.mode === 'fuite';
  const flap = flying ? Math.sin(b.wing) * 0.95 : 0;
  const peckBob = b.pose === 'picore' ? Math.abs(Math.sin(b.peck * Math.PI)) * 0.1 : 0;

  // queue
  c.fillStyle = col.dos || col.corps;
  c.beginPath(); c.moveTo(-0.4, -0.04); c.lineTo(-0.98, -0.22); c.lineTo(-0.9, 0.1); c.closePath(); c.fill();
  // corps
  c.fillStyle = col.corps;
  c.beginPath(); c.ellipse(0, 0, 0.5, 0.33, 0, 0, 7); c.fill();
  // ventre
  c.fillStyle = col.ventre;
  c.beginPath(); c.ellipse(0.1, 0.13, 0.32, 0.18, 0, 0, 7); c.fill();
  // aile
  c.save();
  c.translate(-0.05, -0.05); c.rotate(-0.25 - flap);
  c.fillStyle = col.aile || col.corps;
  c.beginPath(); c.ellipse(-0.04, -0.02, 0.36, 0.17, 0, 0, 7); c.fill();
  c.restore();
  // tete
  let hx = 0.46, hy = -0.28 + peckBob;
  if (b.pose === 'picore') { hx = 0.55; hy = -0.02 + peckBob; }
  c.fillStyle = col.tete;
  c.beginPath(); c.arc(hx, hy, 0.23, 0, 7); c.fill();
  if (col.joue) { c.fillStyle = col.joue; c.beginPath(); c.arc(hx - 0.05, hy + 0.02, 0.11, 0, 7); c.fill(); }
  // yeux
  if (col.yeuxBig) {
    c.fillStyle = col.yeux || '#f0a020';
    c.beginPath(); c.arc(hx - 0.08, hy - 0.05, 0.09, 0, 7); c.fill();
    c.beginPath(); c.arc(hx + 0.08, hy - 0.05, 0.09, 0, 7); c.fill();
    c.fillStyle = '#111';
    c.beginPath(); c.arc(hx - 0.08, hy - 0.05, 0.04, 0, 7); c.fill();
    c.beginPath(); c.arc(hx + 0.08, hy - 0.05, 0.04, 0, 7); c.fill();
  } else {
    c.fillStyle = '#0a0a0a';
    c.beginPath(); c.arc(hx + 0.07, hy - 0.05, 0.05, 0, 7); c.fill();
    c.fillStyle = '#fff';
    c.beginPath(); c.arc(hx + 0.09, hy - 0.07, 0.017, 0, 7); c.fill();
  }
  // bec
  c.fillStyle = col.bec;
  if (b.pose === 'chante') {
    c.beginPath(); c.moveTo(hx + 0.2, hy - 0.03); c.lineTo(hx + 0.5, hy + 0.02); c.lineTo(hx + 0.2, hy + 0.03); c.closePath(); c.fill();
    c.beginPath(); c.moveTo(hx + 0.2, hy + 0.04); c.lineTo(hx + 0.44, hy + 0.16); c.lineTo(hx + 0.18, hy + 0.1); c.closePath(); c.fill();
  } else if (b.sp.id === 'martin') {
    c.beginPath(); c.moveTo(hx + 0.18, hy - 0.03); c.lineTo(hx + 0.62, hy + 0.01); c.lineTo(hx + 0.18, hy + 0.05); c.closePath(); c.fill();
  } else if (b.pose === 'picore') {
    c.beginPath(); c.moveTo(hx + 0.2, hy - 0.02); c.lineTo(hx + 0.34, hy + 0.22); c.lineTo(hx + 0.1, hy + 0.08); c.closePath(); c.fill();
  } else {
    c.beginPath(); c.moveTo(hx + 0.2, hy - 0.04); c.lineTo(hx + 0.46, hy + 0.01); c.lineTo(hx + 0.2, hy + 0.05); c.closePath(); c.fill();
  }
  // crete si alerte
  if (b.pose === 'alerte') {
    c.fillStyle = col.tete;
    c.beginPath(); c.moveTo(hx - 0.1, hy - 0.2); c.lineTo(hx - 0.02, hy - 0.38); c.lineTo(hx + 0.08, hy - 0.19); c.closePath(); c.fill();
  }
  // pattes
  if (!flying) {
    c.strokeStyle = '#3a2a18'; c.lineWidth = 0.05;
    c.beginPath();
    c.moveTo(-0.1, 0.3); c.lineTo(-0.1, 0.55);
    c.moveTo(0.15, 0.3); c.lineTo(0.15, 0.55);
    c.stroke();
  }
  c.restore();
}

// ---------- Viseur ----------
function focusScoreOf(b) {
  const blurM = Math.abs(b.z - focusDist) * (focalMM() / 50);
  return 1 / (1 + Math.pow(blurM / 1.6, 2));
}
function trackedBird() {
  const v = viewRect();
  const ppu = v.w * cam.zoom / BASE_VIEW_W;
  let bestB = null, bestD = 1e9;
  for (const b of birds) {
    const sx = v.x + v.w / 2 + (b.x - cam.x) * ppu;
    const sy = v.y + v.h / 2 + (b.y - cam.y) * ppu;
    if (sx < v.x || sx > v.x + v.w || sy < v.y || sy > v.y + v.h) continue;
    const d = Math.hypot(sx - (v.x + v.w / 2), sy - (v.y + v.h / 2));
    if (d < bestD) { bestD = d; bestB = b; }
  }
  return bestB;
}

function drawViewfinder(v) {
  const ppu = v.w * cam.zoom / BASE_VIEW_W;
  // assombrir hors du viseur
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(0, 0, CW, v.y);
  ctx.fillRect(0, v.y + v.h, CW, CH - v.y - v.h);
  ctx.fillRect(0, v.y, v.x, v.h);
  ctx.fillRect(v.x + v.w, v.y, CW - v.x - v.w, v.h);
  // coins
  ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 2;
  const L = 26;
  ctx.beginPath();
  for (const [cx, cy, dx, dy] of [[v.x, v.y, 1, 1], [v.x + v.w, v.y, -1, 1], [v.x, v.y + v.h, 1, -1], [v.x + v.w, v.y + v.h, -1, -1]]) {
    ctx.moveTo(cx + dx * L, cy); ctx.lineTo(cx, cy); ctx.lineTo(cx, cy + dy * L);
  }
  ctx.stroke();
  // grille des tiers
  ctx.strokeStyle = 'rgba(255,255,255,0.14)'; ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 1; i < 3; i++) {
    ctx.moveTo(v.x + v.w * i / 3, v.y); ctx.lineTo(v.x + v.w * i / 3, v.y + v.h);
    ctx.moveTo(v.x, v.y + v.h * i / 3); ctx.lineTo(v.x + v.w, v.y + v.h * i / 3);
  }
  ctx.stroke();
  // reticule
  const cx = v.x + v.w / 2, cy = v.y + v.h / 2;
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.beginPath(); ctx.arc(cx, cy, 20, 0, 7); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx - 30, cy); ctx.lineTo(cx - 12, cy); ctx.moveTo(cx + 12, cy); ctx.lineTo(cx + 30, cy);
  ctx.moveTo(cx, cy - 30); ctx.lineTo(cx, cy - 12); ctx.moveTo(cx, cy + 12); ctx.lineTo(cx, cy + 30);
  ctx.stroke();
  // cadre de focus sur la cible
  const tb = trackedBird();
  if (tb) {
    const sx = cx + (tb.x - cam.x) * ppu, sy = cy + (tb.y - cam.y) * ppu;
    const side = tb.sp.taille * (REF_Z / tb.z) * 2.4 * ppu;
    const ok = focusScoreOf(tb) > 0.72;
    ctx.strokeStyle = afT > 0 ? '#ffd76a' : (ok ? '#7dff8a' : '#ff7d6a');
    ctx.lineWidth = 2;
    ctx.strokeRect(sx - side / 2, sy - side / 2, side, side);
    if (afT > 0) {
      ctx.fillStyle = '#ffd76a'; ctx.font = 'bold 13px monospace';
      ctx.fillText('AF...', sx + side / 2 + 6, sy - side / 2);
    }
  }
  // infos en bas du viseur
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.font = '13px monospace';
  const sh = shutterSec();
  ctx.fillText(focalMM() + ' mm   f/' + (2.8 + (MAX_ZOOM - cam.zoom) * 0.4).toFixed(1) + '   ' +
    focusDist.toFixed(1) + ' m   1/' + Math.round(1 / sh) + ' s', v.x + 12, v.y + v.h - 12);
  if (seedMode) {
    ctx.fillStyle = '#ffd76a'; ctx.font = 'bold 15px sans-serif';
    const msg = 'MODE GRAINES — cliquez sur l\'herbe pour poser des graines (G ou Echap pour annuler)';
    ctx.fillText(msg, cx - ctx.measureText(msg).width / 2, v.y + 26);
  }
}

// ---------- Photo & score ----------
function renderPhoto(oc) {
  drawSky(oc, 0, 0, PHOTO_W, PHOTO_H);
  const ppu = PHOTO_W * cam.zoom / BASE_VIEW_W;
  oc.save();
  oc.translate(PHOTO_W / 2, PHOTO_H / 2);
  oc.scale(ppu, ppu);
  oc.translate(-cam.x, -cam.y);
  drawWorld(oc);
  oc.restore();
}

function scorePhoto() {
  const ppu = PHOTO_W * cam.zoom / BASE_VIEW_W;
  const sh = shutterSec();
  const res = [];
  for (const b of birds) {
    const px = PHOTO_W / 2 + (b.x - cam.x) * ppu;
    const py = PHOTO_H / 2 + (b.y - cam.y) * ppu;
    if (px < -60 || px > PHOTO_W + 60 || py < -60 || py > PHOTO_H + 60) continue;
    const sizeWorld = b.sp.taille * (REF_Z / b.z);
    const hFrac = sizeWorld * ppu / PHOTO_H;
    const dx = (px - PHOTO_W / 2) / (PHOTO_W / 2);
    const dy = (py - PHOTO_H / 2) / (PHOTO_H / 2);
    const d = Math.hypot(dx, dy) / Math.SQRT2; // 0 centre, 1 coin
    const sizeScore = Math.exp(-Math.pow((hFrac - 0.24) / 0.17, 2));
    const cadrage = 0.72 * Math.exp(-Math.pow(d / 0.42, 2)) + 0.28 * sizeScore;
    const focusScore = focusScoreOf(b);
    const speed = Math.hypot(b.vx, b.vy);
    const blurPx = speed * ppu * sh + shake * 30 * sh * 60;
    const motionScore = clamp(1 - blurPx / 26, 0, 1);
    const poseM = POSE_MULT[b.pose] || 1;
    const sc = 100 * (0.38 * cadrage + 0.34 * focusScore + 0.28 * motionScore) * b.sp.rarete * poseM;
    res.push({ b, sc, cadrage, focusScore, motionScore, poseM });
  }
  res.sort((a, b2) => b2.sc - a.sc);
  let total = 0;
  if (res[0]) total += res[0].sc;
  if (res[1]) total += res[1].sc * 0.15;
  return { total: Math.round(total), best: res[0] || null, all: res };
}

const flashEl = document.getElementById('flash');
const thumbsEl = document.getElementById('thumbs');
const galEmpty = document.getElementById('galEmpty');

function takePhoto() {
  if (!running) return;
  const off = document.createElement('canvas');
  off.width = PHOTO_W; off.height = PHOTO_H;
  const oc = off.getContext('2d');
  renderPhoto(oc);
  const res = scorePhoto();
  shutterSnd();
  flashEl.style.transition = 'none'; flashEl.style.opacity = '0.9';
  requestAnimationFrame(() => { flashEl.style.transition = 'opacity 0.45s ease-out'; flashEl.style.opacity = '0'; });
  const entry = { data: off.toDataURL('image/jpeg', 0.9), score: res.total, detail: res.best, when: new Date() };
  photos.push(entry);
  if (!best || res.total > best.score) best = entry;
  addThumb(entry);
  updateHUD();
}

function addThumb(entry) {
  galEmpty.style.display = 'none';
  const div = document.createElement('div');
  div.className = 'thumb' + (entry === best ? ' best' : '');
  const img = document.createElement('img');
  img.src = entry.data; img.alt = 'photo ' + entry.score;
  const sc = document.createElement('div');
  sc.className = 'sc'; sc.textContent = entry.score + ' pts';
  div.appendChild(img); div.appendChild(sc);
  div.addEventListener('click', () => openModal(entry));
  thumbsEl.prepend(div);
  while (thumbsEl.children.length > 60) thumbsEl.removeChild(thumbsEl.lastChild);
  // met a jour les badges "record"
  for (const t of thumbsEl.children) t.classList.remove('best');
  if (best) {
    for (const t of thumbsEl.children) {
      if (t.querySelector('.sc').textContent === best.score + ' pts' && t.querySelector('img').src === best.data) { t.classList.add('best'); break; }
    }
  }
}

const modal = document.getElementById('modal');
const modalImg = document.getElementById('modalImg');
const modalInfo = document.getElementById('modalInfo');
function openModal(entry) {
  modalImg.src = entry.data;
  let html = '<b>Score : ' + entry.score + ' pts</b>';
  if (entry.detail) {
    const d = entry.detail;
    html += '<table>' +
      '<tr><td>Espece</td><td>' + d.b.sp.nom + ' (rarete x' + d.b.sp.rarete + ')</td></tr>' +
      '<tr><td>Pose</td><td>' + (POSE_NOM[d.b.pose] || d.b.pose) + ' (x' + d.poseM + ')</td></tr>' +
      '<tr><td>Cadrage</td><td>' + Math.round(d.cadrage * 100) + ' %</td></tr>' +
      '<tr><td>Mise au point</td><td>' + Math.round(d.focusScore * 100) + ' %</td></tr>' +
      '<tr><td>Nettete (flou de mouvement)</td><td>' + Math.round(d.motionScore * 100) + ' %</td></tr>' +
      '<tr class="total"><td>Total</td><td>' + Math.round(d.sc) + ' pts</td></tr>' +
      '</table>';
  } else {
    html += '<p>Aucun oiseau dans le cadre.</p>';
  }
  modalInfo.innerHTML = html;
  modal.classList.add('open');
}
document.getElementById('modalClose').addEventListener('click', () => modal.classList.remove('open'));
modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.remove('open'); });

// ---------- HUD ----------
const el = {
  focal: document.getElementById('hFocal'), focus: document.getElementById('hFocus'),
  shutter: document.getElementById('hShutter'), seeds: document.getElementById('hSeeds'),
  count: document.getElementById('hCount'), best: document.getElementById('hBest')
};
const hudCache = {};
function setText(node, key, val) { if (hudCache[key] !== val) { hudCache[key] = val; node.textContent = val; } }
function updateHUD() {
  setText(el.focal, 'f', focalMM() + ' mm');
  setText(el.focus, 'fo', focusDist.toFixed(1) + ' m');
  setText(el.shutter, 's', '1/' + Math.round(1 / shutterSec()) + ' s');
  setText(el.seeds, 'se', String(seedStock));
  setText(el.count, 'c', String(photos.length));
  setText(el.best, 'b', best ? best.score + ' pts' : '—');
}

// ---------- Mise a jour ----------
function update(dt) {
  tod = (tod + dt / DAY_LEN) % 1;
  for (const cl of clouds) { cl.x += cl.v * dt; if (cl.x > WORLD.w + 300) cl.x = -300; }

  // vitesse de la souris -> effroi
  const dxm = mouse.x - mouse.lx, dym = mouse.y - mouse.ly;
  const inst = Math.hypot(dxm, dym) / Math.max(dt, 1e-4);
  mouse.speed += (inst - mouse.speed) * 0.25;
  mouse.lx = mouse.x; mouse.ly = mouse.y;
  scareCooldown -= dt;
  if (running && mouse.speed > SCARE_SPEED && scareCooldown <= 0) {
    const aim = screenToWorld(mouse.x, mouse.y);
    scareAt(aim.x, aim.y);
    scareCooldown = 0.6;
  }
  shake += (clamp((mouse.speed - 250) / 1400, 0, 0.22) - shake) * Math.min(1, dt * 6);
  shake = Math.max(0, shake - dt * 1.5);

  if (!running) return;

  // camera suit la souris
  const aim = screenToWorld(mouse.x, mouse.y);
  cam.x += (aim.x - cam.x) * Math.min(1, dt * 4.5);
  cam.y += (aim.y - cam.y) * Math.min(1, dt * 4.5);
  const viewW = BASE_VIEW_W / cam.zoom, viewH = viewW * 2 / 3;
  cam.x = viewW >= WORLD.w ? WORLD.w / 2 : clamp(cam.x, viewW / 2, WORLD.w - viewW / 2);
  cam.y = viewH >= WORLD.h ? WORLD.h / 2 : clamp(cam.y, viewH / 2, WORLD.h - viewH / 2);

  // focus manuel
  if (keys['w'] || keys['arrowup']) focusDist *= Math.exp(-dt * 1.4);
  if (keys['s'] || keys['arrowdown']) focusDist *= Math.exp(dt * 1.4);
  focusDist = clamp(focusDist, 0.5, 40);
  // autofocus en cours
  if (afT > 0 && afBird) {
    afT -= dt;
    focusDist += (afBird.z - focusDist) * Math.min(1, dt * 9);
  }

  // graines
  seedRegenT += dt;
  if (seedRegenT > 15 && seedStock < 12) { seedStock++; seedRegenT = 0; }
  for (const s of seeds) s.ttl -= dt;
  seeds = seeds.filter(s => s.ttl > 0 && s.amount > 0);

  // oiseaux
  for (const b of birds) b.update(dt);
  birds = birds.filter(b => !b.dead);
  spawnT -= dt;
  if (spawnT <= 0 && birds.length < 11) { spawnBird(); spawnT = 1.5 + Math.random() * 3; }
  rareT -= dt;
  if (rareT <= 0) {
    rareT = 18 + Math.random() * 20;
    const rares = SPECIES.filter(s => s.rarete >= 2);
    spawnBird(rares[(Math.random() * rares.length) | 0]);
  }
}

// ---------- Rendu principal ----------
function render() {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.fillStyle = '#05070a'; ctx.fillRect(0, 0, CW, CH);
  const v = viewRect();
  const ppu = v.w * cam.zoom / BASE_VIEW_W;
  const shx = (Math.random() * 2 - 1) * shake * 9;
  const shy = (Math.random() * 2 - 1) * shake * 9;
  ctx.save();
  ctx.beginPath(); ctx.rect(v.x, v.y, v.w, v.h); ctx.clip();
  drawSky(ctx, v.x, v.y, v.w, v.h);
  ctx.translate(v.x + v.w / 2 + shx, v.y + v.h / 2 + shy);
  ctx.scale(ppu, ppu);
  ctx.translate(-cam.x, -cam.y);
  drawWorld(ctx);
  ctx.restore();
  drawViewfinder(v);
}

// ---------- Boucle ----------
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - last) / 1000;
  last = now;
  dt = Math.min(dt, 0.05);
  update(dt);
  render();
  updateHUD();
}

// ---------- Entrees ----------
window.addEventListener('mousemove', (e) => { mouse.x = e.clientX; mouse.y = e.clientY; });
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  if (!running) return;
  const before = screenToWorld(mouse.x, mouse.y);
  cam.zoom = clamp(cam.zoom * Math.exp(-e.deltaY * 0.0012), MIN_ZOOM, MAX_ZOOM);
  const after = screenToWorld(mouse.x, mouse.y);
  cam.x += before.x - after.x;
  cam.y += before.y - after.y;
}, { passive: false });
canvas.addEventListener('click', () => {
  if (!running) return;
  if (seedMode) {
    const aim = screenToWorld(mouse.x, mouse.y);
    if (aim.y > GROUND_Y + 30 && aim.y < WORLD.h - 30 && seedStock > 0) {
      seeds.push({ x: aim.x, y: aim.y, amount: 6, ttl: 120 });
      seedStock--; plop();
    }
    seedMode = false;
    document.body.classList.remove('seedMode');
  } else {
    takePhoto();
  }
});
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
window.addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  if ([' ', 'tab', 'arrowup', 'arrowdown'].includes(k === ' ' ? ' ' : k)) e.preventDefault();
  keys[k] = true;
  if (!running) return;
  if (k === ' ') takePhoto();
  else if (k === 'g') {
    seedMode = !seedMode;
    document.body.classList.toggle('seedMode', seedMode);
  } else if (k === 'tab') {
    document.getElementById('gallery').classList.toggle('open');
  } else if (k === 'a') {
    const tb = trackedBird();
    if (tb) { afBird = tb; afT = 0.4; }
  } else if (k === 'escape') {
    seedMode = false; document.body.classList.remove('seedMode');
    document.getElementById('gallery').classList.remove('open');
    modal.classList.remove('open');
  }
});
window.addEventListener('keyup', (e) => { keys[e.key.toLowerCase()] = false; });
document.getElementById('galBtn').addEventListener('click', () => document.getElementById('gallery').classList.toggle('open'));

document.getElementById('startBtn').addEventListener('click', () => {
  document.getElementById('start').classList.add('hidden');
  audio();
  running = true;
  for (let i = 0; i < 9; i++) spawnBird();
});

requestAnimationFrame(frame);
