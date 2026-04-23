/* ═══════════════════════════════════════════════════════════
   activity_slp.js  —  SLP Force-Directed Simulator
   ═══════════════════════════════════════════════════════════ */
'use strict';

/* ════════════════════════════════════════════════════════════
   1. DATA
   ════════════════════════════════════════════════════════════ */

const SLP_DATA = window.SLP_DATA || {};
const AREAS = SLP_DATA.AREAS || [];
const ZONES = SLP_DATA.ZONES || {};
const TRIANGLE = SLP_DATA.TRIANGLE || [];

/* Look up relation for any pair (order-independent) */
function getRelation(i, j) {
  if (i === j) return '-';
  if (i > j) { const t = i; i = j; j = t; }
  return TRIANGLE[i * 17 - (i * (i + 1) >> 1) + j - i - 1];
}

/* Build edge list — all relations including U (k=0, w=0 → no spring/score effect) */
const EDGES = [];
for (let i = 0; i < 17; i++)
  for (let j = i + 1; j < 17; j++) {
    const c = getRelation(i, j);
    if (c !== '-') EDGES.push({ a: i, b: j, code: c });
  }

/* ════════════════════════════════════════════════════════════
   1b. ROUTE DATA  (node indices are 0-based, matching AREAS)
   ════════════════════════════════════════════════════════════ */
/* Each segment: [fromIdx, toIdx, badgeLabel]
   badgeLabel '' = no badge (evacuation arrows are unlabelled;
   assembly points get pulsing rings instead)                  */
const ROUTES = {
  mat:   { color:'#C97C2A', glow:'rgba(201,124,42,.50)',
           segs:[[16,5,'1'],[5,6,'2'],[6,2,'3'],[2,3,'4'],[3,4,'5'],[4,5,'↩']] },
  maint: { color:'#5294C8', glow:'rgba(82,148,200,.50)',
           segs:[[0,9,'1'],[9,1,'2'],[9,2,'2'],[9,3,'2']] },
  admin: { color:'#4A9860', glow:'rgba(74,152,96,.50)',
           segs:[[13,10,'1'],[13,11,'1'],[13,8,'1'],[10,15,'2'],[11,15,'2'],[8,15,'2']] },
  evac:  { color:'#C84848', glow:'rgba(200,72,72,.50)',
           assembly:[7,12],
           segs:[[0,7,''],[1,7,''],[2,7,''],[3,7,''],[4,7,''],[6,7,''],[9,7,''],
                 [8,12,''],[10,12,''],[11,12,''],[13,12,''],[14,12,'']] },
};
const routeVisible = { mat:false, maint:false, admin:false, evac:false };
let routeRafId = null;

/* ════════════════════════════════════════════════════════════
   2. CONSTANTS
   ════════════════════════════════════════════════════════════ */

/* SLP standard line colours */
const LINE_COLOR = {
  A: '#ef4444',
  E: '#f97316',
  I: '#22c55e',
  O: '#3b82f6',
  U: '#3a3a3a',
  X: '#111111',
};
const LINE_WIDTH = { A:4.5, E:3.5, I:2.5, O:1.5, U:1, X:2 };

/* Dynamic scoring weights (distance-based) */
const DYN_WEIGHT = { A:12, E:8, I:4, O:0, U:0, X:-10 };
const MAX_DIST   = 420;  // px — threshold for distance scoring

/* Force-directed constants */
const NODE_R   = 50;    // node radius in px
const TEMP_MAX = 55;    // initial temperature (max displacement/step px)
const TEMP_MIN = 0.6;   // stop when temp < this
const COOL_FAC = 0.972; // cooling factor per frame

/* ════════════════════════════════════════════════════════════
   3. CANVAS SETUP
   ════════════════════════════════════════════════════════════ */

const canvasArea = document.getElementById('canvas-area');
const canvas     = document.getElementById('c');
const ctx        = canvas.getContext('2d');
const DPR        = window.devicePixelRatio || 1;

let W, H, CX, CY;

function resizeCanvas() {
  ctx.setTransform(1, 0, 0, 1, 0, 0); // reset before resize
  W = canvasArea.clientWidth;
  H = canvasArea.clientHeight;
  canvas.width  = W * DPR;
  canvas.height = H * DPR;
  canvas.style.width  = W + 'px';
  canvas.style.height = H + 'px';
  ctx.scale(DPR, DPR);
  CX = W / 2;
  CY = H / 2;
}

/* ════════════════════════════════════════════════════════════
   4. NODE POSITIONS  (relative to canvas centre CX, CY)
   ════════════════════════════════════════════════════════════ */

const pos = new Array(17); // pos[i] = {x, y}

function initPositions() {
  /* ── Bloque Producción (lado izquierdo, circuito) ──
     Filas separadas 100 px · Columnas separadas 125 px
     Relaciones A verificadas: 2-7, 2-4, 3-7, 3-4, 4-5,
     4-6 (200 px, contrib. A levemente positiva), 6-17, 1-10 */

  // Fila superior izquierda
  pos[16] = { x: -280, y: -100 }; // Nodo 17 — Carga y Descarga
  pos[5]  = { x: -155, y: -100 }; // Nodo 6  — Almacén

  // Fila media izquierda
  pos[6]  = { x: -280, y:    0 }; // Nodo 7  — Corte
  pos[1]  = { x: -155, y:    0 }; // Nodo 2  — Maq. Conv./Soldadura

  // Fila inferior izquierda (base del circuito)
  pos[2]  = { x: -280, y:  100 }; // Nodo 3  — Maquinado CNC
  pos[3]  = { x: -155, y:  100 }; // Nodo 4  — Ensamble
  pos[4]  = { x:  -30, y:  100 }; // Nodo 5  — Calidad (derecha de 4, cierra flujo)

  // Centro del circuito de producción
  pos[0]  = { x: -205, y:   50 }; // Nodo 1  — Mantenimiento
  pos[9]  = { x:  -85, y:   50 }; // Nodo 10 — Automatización (1-10: A a 120 px)

  /* ── Bloque Administrativo (extremo derecho) ──
     Alejado de nodos 2 y 17 para minimizar penalizaciones
     9-11: A a 110 px · 11-12: A a 110 px · 15-9: E a 110 px · 14-15: E a 110 px */
  pos[14] = { x:  210, y: -160 }; // Nodo 15 — Recursos Humanos
  pos[13] = { x:  320, y: -160 }; // Nodo 14 — Recepción
  pos[8]  = { x:  210, y:  -50 }; // Nodo 9  — Oficinas
  pos[10] = { x:  320, y:  -50 }; // Nodo 11 — Ventas
  pos[11] = { x:  320, y:   60 }; // Nodo 12 — Sala de Juntas

  /* ── Nodos Satélite ── */
  pos[15] = { x:   60, y:    0 }; // Nodo 16 — Baños (pasillo central)
  pos[7]  = { x:  110, y: -170 }; // Nodo 8  — Zona Libre (esquina superior derecha)
  pos[12] = { x:  110, y:  160 }; // Nodo 13 — Punto de Reunión (esquina inferior derecha)
}

/* ════════════════════════════════════════════════════════════
   5. FORCE-DIRECTED PHYSICS
   ════════════════════════════════════════════════════════════ */

let physicsTemp    = TEMP_MAX;
let physicsRunning = false;
let rafId          = null;

/* Spring rest-lengths by relation type */
const SPRING = {
  A: { k: 1.8, rest: 80  },
  E: { k: 1.3, rest: 130 },
  I: { k: 0.7, rest: 180 },
  O: { k: 0.3, rest: 230 },
  U: { k: 0,   rest: 280 },
  X: { k: 0.6, rest: 360 }, // X wants to be far; rest = desired minimum separation
};

function forceStep() {
  const n  = 17;
  const fx = new Float64Array(n);
  const fy = new Float64Array(n);

  /* Optimal inter-node distance for repulsion (Fruchterman-Reingold) */
  const k_rep = Math.sqrt((W * H) / n) * 1.05;

  /* Repulsion — all pairs */
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const dx = pos[i].x - pos[j].x;
      const dy = pos[i].y - pos[j].y;
      const d  = Math.max(1, Math.hypot(dx, dy));
      const f  = (k_rep * k_rep) / d;
      const nx = dx / d, ny = dy / d;
      fx[i] += nx * f;  fy[i] += ny * f;
      fx[j] -= nx * f;  fy[j] -= ny * f;
    }
  }

  /* Spring attraction (edges) */
  for (const e of EDGES) {
    const sp = SPRING[e.code];
    if (sp.k === 0) continue;
    const dx = pos[e.b].x - pos[e.a].x;
    const dy = pos[e.b].y - pos[e.a].y;
    const d  = Math.max(1, Math.hypot(dx, dy));
    /* Hooke-like: force = k * (d - rest)
       positive → attract, negative → repel */
    const f  = sp.k * (d - sp.rest);
    const nx = dx / d, ny = dy / d;
    fx[e.a] += nx * f;  fy[e.a] += ny * f;
    fx[e.b] -= nx * f;  fy[e.b] -= ny * f;
  }

  /* Weak centre gravity to prevent drift */
  const grav = 0.018;
  for (let i = 0; i < n; i++) {
    fx[i] -= pos[i].x * grav;
    fy[i] -= pos[i].y * grav;
  }

  /* Apply forces with temperature limit */
  const margin = NODE_R + 20;
  for (let i = 0; i < n; i++) {
    if (dragging === i) continue; // don't move dragged node
    const mag  = Math.max(0.001, Math.hypot(fx[i], fy[i]));
    const disp = Math.min(physicsTemp, mag);
    pos[i].x += (fx[i] / mag) * disp;
    pos[i].y += (fy[i] / mag) * disp;
    /* Clamp to canvas bounds */
    pos[i].x = Math.max(-CX + margin, Math.min(CX - margin, pos[i].x));
    pos[i].y = Math.max(-CY + margin, Math.min(CY - margin, pos[i].y));
  }
}

function physicsFrame() {
  /* Run multiple sub-steps per visual frame for faster settling */
  for (let s = 0; s < 4; s++) forceStep();
  physicsTemp *= COOL_FAC;

  currentScores    = computeScores();
  currentCrossings = computeCrossings();
  draw();
  updateSidebar(currentScores);

  if (physicsTemp > TEMP_MIN && physicsRunning) {
    rafId = requestAnimationFrame(physicsFrame);
  } else {
    physicsRunning = false;
    document.getElementById('physics-badge').classList.remove('visible');
    if (Object.values(routeVisible).some(Boolean) && !routeRafId) {
      routeRafId = requestAnimationFrame(routeAnimLoop);
    }
  }
}

function startPhysics() {
  if (routeRafId) { cancelAnimationFrame(routeRafId); routeRafId = null; }
  physicsTemp    = TEMP_MAX;
  physicsRunning = true;
  if (rafId) cancelAnimationFrame(rafId);
  document.getElementById('physics-badge').classList.add('visible');
  rafId = requestAnimationFrame(physicsFrame);
}

/* ════════════════════════════════════════════════════════════
   6. SCORING ENGINE
   ════════════════════════════════════════════════════════════ */

let currentScores   = null;
let currentCrossings = { total: 0, nc: new Array(17).fill(0) };

function computeScores() {
  const ns = new Float64Array(17);
  let bdPos = 0, bdNeg = 0;

  /* Per-edge distance contribution */
  for (const e of EDGES) {
    const w = DYN_WEIGHT[e.code];
    if (w === 0) continue;
    const dx   = pos[e.a].x - pos[e.b].x;
    const dy   = pos[e.a].y - pos[e.b].y;
    const dist = Math.hypot(dx, dy);
    const norm = Math.min(1, dist / MAX_DIST);
    /* w*(1-2n): +w when touching, -w when at MAX_DIST */
    const c = w * (1 - 2 * norm);
    ns[e.a] += c; ns[e.b] += c;
    if (c > 0) bdPos += c; else bdNeg += c;
  }

  const total = Math.round((bdPos + bdNeg) * 10) / 10;

  return {
    ns:    Array.from(ns),
    total,
    bdPos: Math.round(bdPos * 10) / 10,
    bdNeg: Math.round(bdNeg * 10) / 10,
  };
}

/* ════════════════════════════════════════════════════════════
   6.5. CROSSING ENGINE
   ════════════════════════════════════════════════════════════ */

/* Fast: returns total crossing count only (used in optimization loop) */
function countCrossings() {
  const vis = getVisible();
  const cr  = (ax,ay,bx,by,px,py) => (bx-ax)*(py-ay)-(by-ay)*(px-ax);
  let total = 0;
  for (let i = 0; i < EDGES.length - 1; i++) {
    const ea = EDGES[i];
    if (!vis[ea.code]) continue;
    const ax = pos[ea.a].x, ay = pos[ea.a].y;
    const bx = pos[ea.b].x, by = pos[ea.b].y;
    for (let j = i + 1; j < EDGES.length; j++) {
      const eb = EDGES[j];
      if (!vis[eb.code]) continue;
      if (ea.a===eb.a||ea.a===eb.b||ea.b===eb.a||ea.b===eb.b) continue;
      const cx = pos[eb.a].x, cy = pos[eb.a].y;
      const dx = pos[eb.b].x, dy = pos[eb.b].y;
      const d1 = cr(ax,ay,bx,by,cx,cy), d2 = cr(ax,ay,bx,by,dx,dy);
      const d3 = cr(cx,cy,dx,dy,ax,ay), d4 = cr(cx,cy,dx,dy,bx,by);
      if (((d1>0&&d2<0)||(d1<0&&d2>0))&&((d3>0&&d4<0)||(d3<0&&d4>0))) total++;
    }
  }
  return total;
}

/* Full: returns {total, nc[]} — used for UI updates */
function computeCrossings() {
  const vis = getVisible();
  const cr  = (ax,ay,bx,by,px,py) => (bx-ax)*(py-ay)-(by-ay)*(px-ax);
  const nc  = new Array(17).fill(0);
  let total = 0;
  for (let i = 0; i < EDGES.length - 1; i++) {
    const ea = EDGES[i];
    if (!vis[ea.code]) continue;
    const ax = pos[ea.a].x, ay = pos[ea.a].y;
    const bx = pos[ea.b].x, by = pos[ea.b].y;
    for (let j = i + 1; j < EDGES.length; j++) {
      const eb = EDGES[j];
      if (!vis[eb.code]) continue;
      if (ea.a===eb.a||ea.a===eb.b||ea.b===eb.a||ea.b===eb.b) continue;
      const cx = pos[eb.a].x, cy = pos[eb.a].y;
      const dx = pos[eb.b].x, dy = pos[eb.b].y;
      const d1 = cr(ax,ay,bx,by,cx,cy), d2 = cr(ax,ay,bx,by,dx,dy);
      const d3 = cr(cx,cy,dx,dy,ax,ay), d4 = cr(cx,cy,dx,dy,bx,by);
      if (((d1>0&&d2<0)||(d1<0&&d2>0))&&((d3>0&&d4<0)||(d3<0&&d4>0))) {
        nc[ea.a]++; nc[ea.b]++; nc[eb.a]++; nc[eb.b]++;
        total++;
      }
    }
  }
  return { total, nc };
}

/* ════════════════════════════════════════════════════════════
   7. RENDERING
   ════════════════════════════════════════════════════════════ */

let hovered  = null;
let dragging = null;
let zoom     = 1.0;
let panX     = 0, panY = 0;
let panning  = false, panStartMX = 0, panStartMY = 0, panStartPX = 0, panStartPY = 0;

function wrapText(text, maxCh) {
  const words = text.split(' ');
  const lines = []; let cur = '';
  for (const w of words) {
    const c = cur ? cur + ' ' + w : w;
    if (c.length > maxCh && cur) { lines.push(cur); cur = w; }
    else cur = c;
  }
  if (cur) lines.push(cur);
  return lines;
}

function lighten(hex, pct) {
  const n = parseInt(hex.replace('#',''), 16);
  const r = Math.min(255, ((n>>16)&255) + Math.round(255*pct));
  const g = Math.min(255, ((n>>8 )&255) + Math.round(255*pct));
  const b = Math.min(255, ( n     &255) + Math.round(255*pct));
  return `rgb(${r},${g},${b})`;
}

function getVisible() {
  return {
    A: document.getElementById('chkA').checked,
    E: document.getElementById('chkE').checked,
    I: document.getElementById('chkI').checked,
    O: document.getElementById('chkO').checked,
    X: document.getElementById('chkX').checked,
    U: document.getElementById('chkU').checked,
  };
}

function draw() {
  ctx.clearRect(0, 0, W, H);

  /* ── Background: subtle dot grid ── */
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.07)';
  for (let gx = 0; gx < W; gx += 38)
    for (let gy = 0; gy < H; gy += 38) {
      ctx.beginPath();
      ctx.arc(gx, gy, 0.9, 0, 2 * Math.PI);
      ctx.fill();
    }
  ctx.restore();

  const vis = getVisible();
  const ns  = currentScores ? currentScores.ns : null;

  /* ── Edges ── */
  EDGES.forEach((e, idx) => {
    if (!vis[e.code]) return;

    const ax = CX + panX + pos[e.a].x * zoom, ay = CY + panY + pos[e.a].y * zoom;
    const bx = CX + panX + pos[e.b].x * zoom, by = CY + panY + pos[e.b].y * zoom;
    const dx = bx - ax, dy = by - ay;
    const len = Math.hypot(dx, dy);
    if (len < 1) return;
    const ux = dx/len, uy = dy/len;

    const col  = LINE_COLOR[e.code];
    const wid  = LINE_WIDTH[e.code];
    const dash = e.code === 'X' ? [6, 4] : [];

    ctx.save();
    ctx.strokeStyle = col;
    ctx.lineWidth   = wid;
    ctx.lineCap     = 'round';
    ctx.setLineDash(dash);
    ctx.globalAlpha = e.code === 'U' ? 0.28 : e.code === 'O' ? 0.6 : 0.85;

    /* Clip line to node edge */
    ctx.beginPath();
    ctx.moveTo(ax + ux*NODE_R, ay + uy*NODE_R);
    ctx.lineTo(bx - ux*NODE_R, by - uy*NODE_R);
    ctx.stroke();
    ctx.restore();
  });

  /* ── Nodes ── */
  for (let i = 0; i < 17; i++) {
    const x    = CX + panX + pos[i].x * zoom;
    const y    = CY + panY + pos[i].y * zoom;
    const isH  = hovered === i;
    const isDr = dragging === i;
    const r    = isDr ? NODE_R + 4 : isH ? NODE_R + 2 : NODE_R;
    const zone = ZONES[AREAS[i].zone];

    /* Shadow */
    ctx.save();
    ctx.shadowColor = isDr ? 'rgba(29,106,191,0.65)' : isH ? 'rgba(29,106,191,0.30)' : 'rgba(0,0,0,0.22)';
    ctx.shadowBlur  = isDr ? 20 : isH ? 14 : 8;

    /* Node fill — vertical gradient with zone colour */
    const grad = ctx.createLinearGradient(x, y - r, x, y + r);
    grad.addColorStop(0, lighten(zone.fill, 0.22));
    grad.addColorStop(1, zone.fill);

    ctx.beginPath();
    ctx.arc(x, y, r, 0, 2 * Math.PI);
    ctx.fillStyle = grad;
    ctx.fill();

    /* Border ring */
    ctx.strokeStyle = isDr ? '#4a9de0' : isH ? zone.stroke : lighten(zone.fill, 0.12);
    ctx.lineWidth   = isDr ? 2.5 : isH ? 2 : 1;
    ctx.stroke();
    ctx.restore();

    /* ID + Name — stacked inside the node */
    const nameLines = wrapText(AREAS[i].name, 10);
    const nameLH    = 16;                              // px between name lines
    const idSize    = 18;                              // visual height of the ID row
    const gap       = 4;                               // gap between ID and name block
    const nameBlockH = nameLines.length * nameLH;
    const totalContentH = idSize + gap + nameBlockH;
    const idY       = y - totalContentH / 2 + idSize / 2;
    const nameStartY = idY + idSize / 2 + gap;

    ctx.save();
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';

    /* ID number */
    ctx.font      = `800 15px 'Inter', system-ui, sans-serif`;
    ctx.fillStyle = zone.text;
    ctx.globalAlpha = 0.70;
    ctx.fillText(AREAS[i].id, x, idY);

    /* Area name */
    ctx.font      = `700 14px 'Inter', system-ui, sans-serif`;
    ctx.fillStyle = zone.text;
    ctx.globalAlpha = 1;
    ctx.textBaseline = 'top';
    nameLines.forEach((l, li) =>
      ctx.fillText(l, x, nameStartY + li * nameLH)
    );

    ctx.restore();
  }

  /* ── Route overlays (drawn last, on top of everything) ── */
  drawRoutes();
}

/* ════════════════════════════════════════════════════════════
   7b. ROUTE RENDERING
   ════════════════════════════════════════════════════════════ */

function drawRouteSegment(ax, ay, bx, by, color, glow, dashOff, badge) {
  const dx = bx - ax, dy = by - ay;
  const d  = Math.hypot(dx, dy);
  if (d < 1) return;
  const ux = dx/d, uy = dy/d;
  const sx = ax + ux*NODE_R, sy = ay + uy*NODE_R;
  const ex = bx - ux*NODE_R, ey = by - uy*NODE_R;

  ctx.save();

  /* Main line */
  ctx.strokeStyle    = color;
  ctx.lineWidth      = 2.5;
  ctx.lineCap        = 'round';
  ctx.globalAlpha    = 0.90;
  ctx.setLineDash([10, 6]);
  ctx.lineDashOffset = -dashOff;
  ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.stroke();

  /* Arrowhead */
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;
  ctx.fillStyle   = color;
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur  = 0;
  const aLen = 10, aWid = 4.5;
  ctx.beginPath();
  ctx.moveTo(ex, ey);
  ctx.lineTo(ex - aLen*ux + aWid*uy, ey - aLen*uy - aWid*ux);
  ctx.lineTo(ex - aLen*ux - aWid*uy, ey - aLen*uy + aWid*ux);
  ctx.closePath();
  ctx.fill();

  ctx.restore();

  /* Step badge at segment midpoint */
  if (badge) {
    drawRouteBadge((ax+bx)/2, (ay+by)/2, badge, color);
  }
}

function drawRouteBadge(x, y, label, color) {
  const r = 10;
  ctx.save();
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur  = 0;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI*2);
  ctx.fillStyle = 'rgba(6,10,20,0.93)';
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth   = 2;
  ctx.stroke();
  ctx.shadowBlur    = 0;
  ctx.font          = '800 10px "Inter",system-ui,sans-serif';
  ctx.fillStyle     = color;
  ctx.textAlign     = 'center';
  ctx.textBaseline  = 'middle';
  ctx.fillText(label, x, y);
  ctx.restore();
}

function drawEvacPulse(idx, color, glow) {
  const cx = CX + panX + pos[idx].x * zoom;
  const cy = CY + panY + pos[idx].y * zoom;
  const t  = performance.now();
  const p  = (Math.sin(t * 0.0035) + 1) / 2; // 0→1 oscillation

  ctx.save();
  /* Outer pulsing ring */
  const outerR = (NODE_R + 4 + p * 12) * zoom;
  ctx.beginPath();
  ctx.arc(cx, cy, outerR, 0, Math.PI*2);
  ctx.strokeStyle = color;
  ctx.lineWidth   = 1.5;
  ctx.globalAlpha = 0.70 - p * 0.58;
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur  = 0;
  ctx.stroke();
  /* Inner fixed ring */
  ctx.beginPath();
  ctx.arc(cx, cy, (NODE_R + 4) * zoom, 0, Math.PI*2);
  ctx.globalAlpha = 0.55;
  ctx.lineWidth   = 1.5;
  ctx.stroke();
  /* ⚠ icon */
  ctx.globalAlpha  = 0.95;
  ctx.shadowBlur   = 0;
  ctx.fillStyle    = color;
  ctx.font         = `900 ${Math.round(13*zoom)}px "Inter",system-ui,sans-serif`;
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('⚠', cx, cy);
  ctx.restore();
}

function drawRoutes() {
  if (!Object.values(routeVisible).some(Boolean)) return;
  const dashOff = (performance.now() * 0.013) % 13;
  for (const [type, route] of Object.entries(ROUTES)) {
    if (!routeVisible[type]) continue;
    for (const [a, b, badge] of route.segs) {
      const ax = CX + panX + pos[a].x * zoom, ay = CY + panY + pos[a].y * zoom;
      const bx = CX + panX + pos[b].x * zoom, by = CY + panY + pos[b].y * zoom;
      drawRouteSegment(ax, ay, bx, by, route.color, route.glow, dashOff, badge);
    }
    /* Pulsing assembly-point rings for evacuation route */
    if (route.assembly) {
      for (const idx of route.assembly) {
        drawEvacPulse(idx, route.color, route.glow);
      }
    }
  }
}

/* Stand-alone animation loop — runs when physics is idle but routes are on */
function routeAnimLoop() {
  if (!Object.values(routeVisible).some(Boolean) || physicsRunning) {
    routeRafId = null;
    return;
  }
  draw();
  routeRafId = requestAnimationFrame(routeAnimLoop);
}

/* Public API called by sidebar buttons */
function setRouteVisible(type, vis) {
  routeVisible[type] = vis;
  if (vis && !physicsRunning && !routeRafId) {
    routeRafId = requestAnimationFrame(routeAnimLoop);
  }
  if (!vis && !Object.values(routeVisible).some(Boolean)) {
    if (routeRafId) { cancelAnimationFrame(routeRafId); routeRafId = null; }
    if (!physicsRunning) draw();
  }
}

/* ════════════════════════════════════════════════════════════
   8. SIDEBAR UPDATE
   ════════════════════════════════════════════════════════════ */

function fmt(v, decimals = 1) {
  const r = Math.round(v * 10 ** decimals) / 10 ** decimals;
  return (r > 0 ? '+' : '') + r.toFixed(decimals);
}

function updateSidebar(sc) {
  if (!sc) return;

  /* Total score */
  const sv = document.getElementById('score-val');
  sv.textContent = fmt(sc.total, 1);
  sv.className = sc.total > 5 ? 's-pos' : sc.total < -5 ? 's-neg' : 's-neutral';

  /* Score bar — map total to [0,100]%
     Approximate max/min: ~±200 pts */
  const pct = Math.min(100, Math.max(0, ((sc.total + 200) / 400) * 100));
  document.getElementById('score-bar-fill').style.width = pct + '%';

  /* Breakdown */
  document.getElementById('bd-pos').textContent = fmt(sc.bdPos, 1);
  document.getElementById('bd-neg').textContent = fmt(sc.bdNeg, 1);

  /* Table rows */
  AREAS.forEach((area, i) => {
    const cell = document.getElementById(`pos-${i}`);
    if (!cell) return;
    const v = Math.round(sc.ns[i]);
    cell.textContent = (v > 0 ? '+' : '') + v;
    cell.className   = 'td-pos ' + (v > 3 ? 'v-pos' : v < -3 ? 'v-neg' : 'v-neu');

    /* Crossing count */
    const cc = document.getElementById(`cross-${i}`);
    if (cc) {
      const cr = currentCrossings.nc[i];
      cc.textContent = cr > 0 ? cr : '—';
      cc.className   = 'td-cross ' + (cr > 0 ? 'v-neg' : 'v-neu');
    }

    /* Highlight row being dragged */
    const row = document.getElementById(`row-${i}`);
    if (row) row.classList.toggle('row-drag', dragging === i);
  });

  /* Crossing total display */
  const cv = document.getElementById('cross-val');
  if (cv) {
    const ct = currentCrossings.total;
    cv.textContent = ct;
    cv.className = ct === 0 ? 'c-zero' : ct <= 15 ? 'c-few' : 'c-many';
  }
}

/* ════════════════════════════════════════════════════════════
   9. TABLE INITIALISATION
   ════════════════════════════════════════════════════════════ */

function initTable() {
  const tbody = document.getElementById('area-tbody');
  AREAS.forEach((area, i) => {
    const tr = document.createElement('tr');
    tr.id = `row-${i}`;
    tr.innerHTML =
      `<td class="td-id">${area.id}</td>` +
      `<td class="td-name">${area.name}</td>` +
      `<td class="td-slp">${area.slp}</td>` +
      `<td class="td-pos v-neu" id="pos-${i}">—</td>` +
      `<td class="td-cross v-neu" id="cross-${i}">—</td>`;
    tbody.appendChild(tr);
  });
}

/* ════════════════════════════════════════════════════════════
   10. INTERACTIONS
   ════════════════════════════════════════════════════════════ */

let dragOffX = 0, dragOffY = 0;

function getNodeAt(mx, my) {
  for (let i = 16; i >= 0; i--) {
    const dx = mx - (CX + panX + pos[i].x * zoom);
    const dy = my - (CY + panY + pos[i].y * zoom);
    if (Math.hypot(dx, dy) <= NODE_R + 4) return i;
  }
  return null;
}

/* Mouse Down — start pan (Ctrl) or node drag */
canvas.addEventListener('mousedown', e => {
  const r  = canvas.getBoundingClientRect();
  const mx = e.clientX - r.left;
  const my = e.clientY - r.top;

  if (e.ctrlKey) {
    panning    = true;
    panStartMX = mx; panStartMY = my;
    panStartPX = panX; panStartPY = panY;
    canvas.style.cursor = 'move';
    e.preventDefault();
    return;
  }

  const hit = getNodeAt(mx, my);
  if (hit !== null) {
    dragging = hit;
    dragOffX = mx - (CX + panX + pos[hit].x * zoom);
    dragOffY = my - (CY + panY + pos[hit].y * zoom);
    canvas.style.cursor = 'grabbing';
    e.preventDefault();
  }
});

/* Mouse Move — pan, drag or hover */
canvas.addEventListener('mousemove', e => {
  const r  = canvas.getBoundingClientRect();
  const mx = e.clientX - r.left;
  const my = e.clientY - r.top;
  const tip = document.getElementById('tooltip');

  if (panning) {
    panX = panStartPX + (mx - panStartMX);
    panY = panStartPY + (my - panStartMY);
    if (!physicsRunning) draw();
    return;
  }

  if (dragging !== null) {
    pos[dragging].x = (mx - dragOffX - CX - panX) / zoom;
    pos[dragging].y = (my - dragOffY - CY - panY) / zoom;
    tip.style.opacity = '0';
    currentScores    = computeScores();
    currentCrossings = computeCrossings();
    draw();
    updateSidebar(currentScores);
    return;
  }

  const h = getNodeAt(mx, my);
  if (h !== null) {
    canvas.style.cursor = 'grab';
    hovered = h;
    const area   = AREAS[h];
    const zone   = ZONES[area.zone];
    const counts = {A:0,E:0,I:0,O:0,U:0,X:0};
    for (const ed of EDGES) if (ed.a===h || ed.b===h) counts[ed.code]++;
    const dynS  = currentScores    ? Math.round(currentScores.ns[h])   : '—';
    const crossH = currentCrossings ? currentCrossings.nc[h] : 0;

    tip.innerHTML =
      `<strong>${area.id}. ${area.name}</strong>` +
      `<div style="color:#6a82a0;font-size:10px;margin-top:1px">${zone.label}</div>` +
      `<div class="tt-grid">` +
      `<span class="tt-lbl">SLP:</span><span>${area.slp} pts</span><span></span>` +
      `<span class="tt-lbl">Pos.:</span>` +
      `<span style="color:${dynS>0?'#4ade80':dynS<0?'#f87171':'#6a82a0'}">${dynS>0?'+':''}${dynS} pts</span>` +
      `<span></span>` +
      `<span class="tt-lbl">Cruces:</span>` +
      `<span style="color:${crossH>0?'#f87171':'#4ade80'}">${crossH}</span>` +
      `<span></span>` +
      `</div>` +
      `<div style="margin-top:5px;font-size:10px;color:#6a82a0">` +
      `<span style="color:#ef4444">A:${counts.A}</span> ` +
      `<span style="color:#f97316">E:${counts.E}</span> ` +
      `<span style="color:#22c55e">I:${counts.I}</span> ` +
      `<span style="color:#3b82f6">O:${counts.O}</span> ` +
      `<span>U:${counts.U}</span> ` +
      `<span style="color:#aaa">X:${counts.X}</span>` +
      `</div>`;

    tip.style.opacity = '1';
    let tx = mx + 14, ty = my - 8;
    if (tx + 200 > W) tx = mx - 215;
    if (ty + 110 > H) ty = my - 120;
    tip.style.left = tx + 'px'; tip.style.top = ty + 'px';
  } else {
    canvas.style.cursor = 'default';
    hovered = null;
    tip.style.opacity = '0';
  }

  if (!physicsRunning) draw(); // only redraw if physics isn't doing it
});

/* Mouse Up — end pan or drag */
canvas.addEventListener('mouseup', () => {
  panning  = false;
  dragging = null;
  canvas.style.cursor = hovered !== null ? 'grab' : 'default';
  currentScores    = computeScores();
  currentCrossings = computeCrossings();
  draw();
  updateSidebar(currentScores);
});

/* Mouse Leave */
canvas.addEventListener('mouseleave', () => {
  panning = false;
  if (dragging !== null) {
    dragging = null;
    currentScores    = computeScores();
    currentCrossings = computeCrossings();
    draw();
    updateSidebar(currentScores);
  }
  hovered = null;
  document.getElementById('tooltip').style.opacity = '0';
});

/* Touch support */
canvas.addEventListener('touchstart', e => {
  const r   = canvas.getBoundingClientRect(), t = e.touches[0];
  const mx  = t.clientX - r.left, my = t.clientY - r.top;
  const hit = getNodeAt(mx, my);
  if (hit !== null) {
    dragging = hit;
    dragOffX = mx - (CX + panX + pos[hit].x * zoom);
    dragOffY = my - (CY + panY + pos[hit].y * zoom);
    e.preventDefault();
  }
}, { passive: false });

canvas.addEventListener('touchmove', e => {
  if (dragging === null) return;
  const r = canvas.getBoundingClientRect(), t = e.touches[0];
  const tmx = t.clientX - r.left, tmy = t.clientY - r.top;
  pos[dragging].x = (tmx - dragOffX - CX - panX) / zoom;
  pos[dragging].y = (tmy - dragOffY - CY - panY) / zoom;
  currentScores    = computeScores();
  currentCrossings = computeCrossings();
  draw();
  updateSidebar(currentScores);
  e.preventDefault();
}, { passive: false });

canvas.addEventListener('touchend', () => {
  dragging = null;
  currentScores    = computeScores();
  currentCrossings = computeCrossings();
  draw();
  updateSidebar(currentScores);
});

/* Ctrl held — show move cursor hint */
canvas.addEventListener('keydown', () => {});
window.addEventListener('keydown', e => {
  if (e.key === 'Control') canvas.style.cursor = 'move';
});
window.addEventListener('keyup', e => {
  if (e.key === 'Control' && !panning) canvas.style.cursor = dragging !== null ? 'grabbing' : hovered !== null ? 'grab' : 'default';
});

/* Wheel — zoom suave hacia el centro del canvas */
canvas.addEventListener('wheel', e => {
  e.preventDefault();
  const factor = e.deltaY < 0 ? 1.07 : 1 / 1.07;
  zoom = Math.max(0.25, Math.min(5, zoom * factor));
  if (!physicsRunning) draw();
}, { passive: false });

/* Doble clic — resetear zoom a 1× */
canvas.addEventListener('dblclick', e => {
  const r  = canvas.getBoundingClientRect();
  const mx = e.clientX - r.left;
  const my = e.clientY - r.top;
  if (getNodeAt(mx, my) === null) {
    zoom = 1; panX = 0; panY = 0;
    if (!physicsRunning) draw();
  }
});

/* Checkboxes — recalculate crossings for visible relations only */
['chkA','chkE','chkI','chkO','chkX','chkU'].forEach(id =>
  document.getElementById(id).addEventListener('change', () => {
    if (!physicsRunning) {
      currentCrossings = computeCrossings();
      updateSidebar(currentScores);
      draw();
    }
  })
);

/* Reset physics button */
document.getElementById('btn-reset').addEventListener('click', () => {
  initPositions();
  physicsTemp = TEMP_MAX;
  startPhysics();
});

/* ── Crossing optimizer (hill-climbing by node-position swaps) ── */
let optRunning = false;

document.getElementById('btn-optimize').addEventListener('click', () => {
  if (optRunning) { optRunning = false; return; }

  /* Stop physics if running */
  if (physicsRunning) {
    physicsRunning = false;
    cancelAnimationFrame(rafId);
    document.getElementById('physics-badge').classList.remove('visible');
  }

  optRunning = true;
  const btn = document.getElementById('btn-optimize');
  const badge = document.getElementById('optimize-badge');
  btn.classList.add('running');
  btn.textContent = '■ Stop';
  badge.classList.add('visible');

  let crossNow     = countCrossings();
  let passImproved = false;
  let oi = 0, oj = 1;

  function step() {
    if (!optRunning) { finish(); return; }

    const BATCH = 18;
    for (let b = 0; b < BATCH; b++) {
      /* Swap positions of areas oi and oj */
      const px = pos[oi].x, py = pos[oi].y;
      pos[oi].x = pos[oj].x; pos[oi].y = pos[oj].y;
      pos[oj].x = px;        pos[oj].y = py;

      const after = countCrossings();
      if (after < crossNow) {
        crossNow     = after;
        passImproved = true;
        currentCrossings = computeCrossings();
        currentScores    = computeScores();
        draw();
        updateSidebar(currentScores);
      } else {
        /* Revert */
        pos[oj].x = pos[oi].x; pos[oj].y = pos[oi].y;
        pos[oi].x = px;        pos[oi].y = py;
      }

      /* Advance to next pair */
      oj++;
      if (oj >= 17) { oi++; oj = oi + 1; }
      if (oi >= 16) {
        if (!passImproved) { finish(); return; }
        passImproved = false;
        oi = 0; oj = 1;
      }
    }
    requestAnimationFrame(step);
  }

  function finish() {
    optRunning = false;
    btn.classList.remove('running');
    btn.textContent = '⊞ Minimize Crossings';
    badge.classList.remove('visible');
    currentCrossings = computeCrossings();
    currentScores    = computeScores();
    draw();
    updateSidebar(currentScores);
  }

  requestAnimationFrame(step);
});

/* Route toggle buttons */
['mat','maint','admin','evac'].forEach(type => {
  const btn = document.getElementById('btn-route-' + type);
  if (!btn) return;
  btn.addEventListener('click', () => {
    const active = btn.classList.toggle('active');
    setRouteVisible(type, active);
  });
});

/* Window resize */
window.addEventListener('resize', () => {
  resizeCanvas();
  /* Clamp positions to new bounds */
  const margin = NODE_R + 44;
  for (let i = 0; i < 17; i++) {
    pos[i].x = Math.max(-CX + margin, Math.min(CX - margin, pos[i].x));
    pos[i].y = Math.max(-CY + margin, Math.min(CY - margin, pos[i].y));
  }
  if (!physicsRunning) {
    currentScores    = computeScores();
    currentCrossings = computeCrossings();
    draw();
    updateSidebar(currentScores);
  }
});

/* ════════════════════════════════════════════════════════════
   11. INITIALISATION
   ════════════════════════════════════════════════════════════ */

(function init() {
  resizeCanvas();
  initTable();
  initPositions();
  currentScores    = computeScores();
  currentCrossings = computeCrossings();
  draw();
  updateSidebar(currentScores);
})();
