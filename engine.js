// Pallet Optimization Engine + geometric verification.
// Units: mm, kg. Origin = pallet corner on the top deck (z = 0), x along L, y along W, z up.

const EPS = 0.5;
const ov = (a0, a1, b0, b1) => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));

// All sums i*a + j*b <= max: the only cut positions a guillotine pattern ever needs.
function normalPoints(max, a, b) {
  const s = new Set();
  for (let i = 0; i * a <= max; i++)
    for (let j = 0; i * a + j * b <= max; j++) s.add(i * a + j * b);
  return [...s].sort((p, q) => p - q);
}

function floorTo(pts, v) {
  let lo = 0, hi = pts.length - 1;
  while (lo < hi) { const m = (lo + hi + 1) >> 1; if (pts[m] <= v) lo = m; else hi = m - 1; }
  return pts[lo];
}

// Best layout of a×b rectangles (90° turns allowed) in an L×W area → [{x, y, l, w}].
// ponytail: guillotine-only DP; non-guillotine (pinwheel) patterns can beat it by ~1 box, add a 5-block heuristic if that matters.
export function layoutLayer(L, W, a, b) {
  const px = normalPoints(L, a, b), py = normalPoints(W, a, b);
  const grid = px.length * py.length > 40000; // tiny cartons: DP too slow, plain grid is near-optimal anyway
  const memo = new Map();
  const f = (X, Y) => {
    const key = X + ',' + Y;
    let r = memo.get(key);
    if (r) return r;
    const n1 = Math.floor(X / a) * Math.floor(Y / b), n2 = Math.floor(X / b) * Math.floor(Y / a);
    r = n1 >= n2 ? { n: n1, rot: false } : { n: n2, rot: true };
    const ub = Math.floor((X * Y) / (a * b));
    if (!grid) {
      for (const x of px) {
        if (r.n === ub || x > X / 2) break;
        if (x === 0) continue;
        const n = f(x, Y).n + f(floorTo(px, X - x), Y).n;
        if (n > r.n) r = { n, cut: 'x', at: x };
      }
      for (const y of py) {
        if (r.n === ub || y > Y / 2) break;
        if (y === 0) continue;
        const n = f(X, y).n + f(X, floorTo(py, Y - y)).n;
        if (n > r.n) r = { n, cut: 'y', at: y };
      }
    }
    memo.set(key, r);
    return r;
  };
  const out = [];
  const place = (X, Y, ox, oy) => {
    const r = f(X, Y);
    if (r.cut === 'x') { place(r.at, Y, ox, oy); place(floorTo(px, X - r.at), Y, ox + r.at, oy); return; }
    if (r.cut === 'y') { place(X, r.at, ox, oy); place(X, floorTo(py, Y - r.at), ox, oy + r.at); return; }
    const [l, w] = r.rot ? [b, a] : [a, b];
    for (let i = 0; (i + 1) * l <= X; i++)
      for (let j = 0; (j + 1) * w <= Y; j++) out.push({ x: ox + i * l, y: oy + j * w, l, w });
  };
  place(floorTo(px, L), floorTo(py, W), 0, 0);
  return out;
}

// s: { L, W, palletH, maxH (incl. pallet), maxKg, overhang, l, w, h, kg, allowTip, interlock }
export function optimize(s) {
  const o = s.overhang || 0, loadH = s.maxH - s.palletH;
  const PL = s.L + 2 * o, PW = s.W + 2 * o;
  const dims = [[s.l, s.w, s.h]];
  if (s.allowTip) dims.push([s.l, s.h, s.w], [s.w, s.h, s.l]);
  const byKg = s.maxKg > 0 && s.kg > 0 ? Math.floor(s.maxKg / s.kg) : Infinity;
  let best = null;
  for (const [a, b, v] of dims) {
    const layer = layoutLayer(PL, PW, a, b);
    const byH = layer.length * Math.floor(loadH / v);
    const total = Math.min(byH, byKg);
    const layers = total ? Math.ceil(total / layer.length) : 0;
    const c = { a, b, v, layer, total, layers, loadHeight: layers * v, limit: byKg < byH ? 'tải trọng' : 'chiều cao' };
    if (!best || c.total > best.total || (c.total === best.total && c.loadHeight < best.loadHeight)) best = c;
  }
  const { layer, v } = best;
  // centre the pattern on the pallet
  const dx = (PL - Math.max(0, ...layer.map(p => p.x + p.l))) / 2 - o;
  const dy = (PW - Math.max(0, ...layer.map(p => p.y + p.w))) / 2 - o;
  const boxes = [];
  for (let k = 0; boxes.length < best.total; k++)
    for (const p of layer) {
      if (boxes.length >= best.total) break;
      const x = p.x + dx;
      // interlock: mirror odd layers across the pallet centre
      boxes.push({ x: s.interlock && k % 2 ? s.L - x - p.l : x, y: p.y + dy, z: k * v, l: p.l, w: p.w, h: v });
    }
  return {
    ...best, layer: undefined, boxes,
    perLayer: layer.length,
    totalHeight: best.loadHeight + s.palletH,
    weight: best.total * s.kg,
    areaUtil: (layer.length * best.a * best.b) / (s.L * s.W),
    volUtil: best.loadHeight ? (best.total * s.l * s.w * s.h) / (s.L * s.W * best.loadHeight) : 0,
  };
}

// Checks real geometry, independent of how the boxes were produced.
// ponytail: O(n²) pair scan, fine to ~2k boxes; add a spatial grid beyond that.
export function verify(boxes, s) {
  const o = s.overhang || 0, loadH = s.maxH - s.palletH, minSup = s.minSupport ?? 0.8;
  const collisions = [], outside = [], orient = [], unsupported = [];
  boxes.forEach((b, i) => {
    if (b.x < -o - EPS || b.y < -o - EPS || b.x + b.l > s.L + o + EPS || b.y + b.w > s.W + o + EPS ||
        b.z < -EPS || b.z + b.h > loadH + EPS) outside.push(i);
    if (!s.allowTip && Math.abs(b.h - s.h) > EPS) orient.push(i);
    for (let j = i + 1; j < boxes.length; j++) {
      const c = boxes[j];
      if (ov(b.x, b.x + b.l, c.x, c.x + c.l) > EPS && ov(b.y, b.y + b.w, c.y, c.y + c.w) > EPS &&
          ov(b.z, b.z + b.h, c.z, c.z + c.h) > EPS) collisions.push([i, j]);
    }
    let area = 0;
    if (Math.abs(b.z) < EPS) area = ov(b.x, b.x + b.l, 0, s.L) * ov(b.y, b.y + b.w, 0, s.W);
    else for (const c of boxes)
      if (c !== b && Math.abs(c.z + c.h - b.z) < EPS) area += ov(b.x, b.x + b.l, c.x, c.x + c.l) * ov(b.y, b.y + b.w, c.y, c.y + c.w);
    const ratio = area / (b.l * b.w);
    if (ratio < minSup - 1e-9) unsupported.push({ i, ratio });
  });
  const status = boxes.map(() => null);
  for (const { i } of unsupported) status[i] = 'unsupported';
  for (const i of orient) status[i] = 'orient';
  for (const i of outside) status[i] = 'outside';
  for (const [i, j] of collisions) status[i] = status[j] = 'collision';
  const n = boxes.length;
  const height = n ? Math.max(...boxes.map(b => b.z + b.h)) : 0;
  const vol = boxes.reduce((t, b) => t + b.l * b.w * b.h, 0);
  const cog = n ? {
    x: boxes.reduce((t, b) => t + b.x + b.l / 2, 0) / n,
    y: boxes.reduce((t, b) => t + b.y + b.w / 2, 0) / n,
    z: boxes.reduce((t, b) => t + b.z + b.h / 2, 0) / n,
  } : { x: s.L / 2, y: s.W / 2, z: 0 };
  return {
    count: n, height, weight: n * (s.kg || 0),
    volUtil: height ? vol / (s.L * s.W * height) : 0,
    cog, cogOffset: Math.hypot(cog.x - s.L / 2, cog.y - s.W / 2),
    collisions, outside, orient, unsupported, status,
    ok: status.every(x => x === null),
  };
}

// Gravity: lowest z the box falls to from where it is now.
export function dropZ(boxes, b) {
  let z = 0;
  for (const c of boxes)
    if (c !== b && c.z + c.h <= b.z + EPS &&
        ov(b.x, b.x + b.l, c.x, c.x + c.l) > EPS && ov(b.y, b.y + b.w, c.y, c.y + c.w) > EPS) z = Math.max(z, c.z + c.h);
  return z;
}
