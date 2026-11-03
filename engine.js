// Pallet Optimization Engine + geometric verification.
// Units: mm, kg. Origin = pallet corner on the top deck (z = 0), x along L, y along W, z up.

// Tolerance, mm. Inputs are whole mm and centring adds halves, all exact in floating point,
// so anything above float noise is a real gap or overlap.
const EPS = 0.01;
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

// One layer's pattern laid out with overhang o and centred on the pallet.
function centred(s, a, b, o) {
  const layer = layoutLayer(s.L + 2 * o, s.W + 2 * o, a, b);
  const dx = (s.L - Math.max(0, ...layer.map(p => p.x + p.l))) / 2, dy = (s.W - Math.max(0, ...layer.map(p => p.y + p.w))) / 2;
  return layer.map(p => ({ ...p, x: p.x + dx, y: p.y + dy }));
}

// The first `count` boxes of the stack; odd layers mirrored across the pallet centre on the axes in `flip`.
function stack(s, layer, v, flip, count) {
  const boxes = [];
  for (let k = 0; boxes.length < count; k++)
    for (const p of layer) {
      if (boxes.length >= count) break;
      const odd = k % 2 === 1;
      boxes.push({ id: boxes.length, x: odd && flip.includes('x') ? s.L - p.x - p.l : p.x,
        y: odd && flip.includes('y') ? s.W - p.y - p.w : p.y, z: k * v, l: p.l, w: p.w, h: v });
    }
  return boxes;
}

// s: { L, W, palletH, maxH (incl. pallet), maxKg, overhang, l, w, h, kg, allowTip, interlock, minSupport }
// Only plans that pass verify() are chosen: the count it reports is a stack that stands up.
export function optimize(s) {
  const loadH = s.maxH - s.palletH;
  const dims = [[s.l, s.w, s.h]];
  if (s.allowTip) dims.push([s.l, s.h, s.w], [s.w, s.h, s.l]);
  const byKg = s.maxKg > 0 && s.kg > 0 ? Math.floor(s.maxKg / s.kg) : Infinity;
  const better = (c, best) => !best || c.total > best.total || (c.total === best.total && c.loadHeight < best.loadHeight);
  let best = null;
  for (const [a, b, v] of dims) {
    // ponytail: overhang tried in 5 mm steps down to none; edge cartons hanging further than the support rule allows fail verify
    for (let o = s.overhang || 0; o >= 0; o = o > 0 && o < 5 ? 0 : o - 5) {
      const layer = centred(s, a, b, o);
      const byH = layer.length * Math.floor(loadH / v);
      const total = Math.min(byH, byKg);
      const layers = total ? Math.ceil(total / layer.length) : 0;
      const c = { a, b, v, layer, total, layers, loadHeight: layers * v, limit: byKg < byH ? 'tải trọng' : 'chiều cao', overhangUsed: o };
      if (!better(c, best)) break; // less overhang never fits more
      // three layers hold every support relation the stack has (odd on even, even on odd, the deck)
      c.flip = (s.interlock ? ['x', 'y', 'xy', ''] : ['']).find(fl => verify(stack(s, layer, v, fl, Math.min(total, 3 * layer.length)), s).ok);
      if (c.flip !== undefined) { best = c; break; }
    }
  }
  const { layer, v } = best;
  const boxes = stack(s, layer, v, best.flip, best.total);
  return {
    ...best, layer: undefined, boxes,
    interlockDropped: !!s.interlock && !best.flip && best.layers > 1,
    perLayer: layer.length,
    totalHeight: best.loadHeight + s.palletH,
    weight: best.total * s.kg,
    areaUtil: (layer.length * best.a * best.b) / (s.L * s.W),
    volUtil: best.loadHeight ? (best.total * s.l * s.w * s.h) / (s.L * s.W * best.loadHeight) : 0,
  };
}

// The overlap of b's base with c's footprint as [x0, y0, x1, y1], or null when they barely touch.
function clip(b, c) {
  const x0 = Math.max(b.x, c.x), x1 = Math.min(b.x + b.l, c.x + c.l), y0 = Math.max(b.y, c.y), y1 = Math.min(b.y + b.w, c.y + c.w);
  return x1 - x0 > EPS && y1 - y0 > EPS ? [x0, y0, x1, y1] : null;
}

// Is the point over the convex hull of the contact patches? (A carton balances on the hull of what it touches.)
// ponytail: each carton's own centre only; the weight stacked on it can shift that, add a load-path pass if towers matter.
function inHull(px, py, rects) {
  if (!rects.length) return false;
  const pts = rects.flatMap(([x0, y0, x1, y1]) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const half = list => {
    const h = [];
    for (const p of list) { while (h.length >= 2 && cross(h[h.length - 2], h[h.length - 1], p) <= 0) h.pop(); h.push(p); }
    h.pop();
    return h;
  };
  const hull = [...half(pts), ...half([...pts].reverse())];
  return hull.every((a, i) => cross(a, hull[(i + 1) % hull.length], [px, py]) >= -1e-6); // on the edge still balances
}

// The pallet as a solid block under the deck, for cartons moved by hand.
const palletBlock = s => ({ x: 0, y: 0, z: -s.palletH, l: s.L, w: s.W, h: s.palletH });

// Move b towards `to` one axis at a time, stopping flush against whatever is in the way (other cartons, the pallet,
// the floor), the way a carton pushed by hand does. It never passes through anything, so an edit can't overlap.
export function slide(b, to, others, s) {
  const solids = [...others, palletBlock(s)];
  for (const [k, n, a, an, c, cn] of [['x', 'l', 'y', 'w', 'z', 'h'], ['y', 'w', 'x', 'l', 'z', 'h'], ['z', 'h', 'x', 'l', 'y', 'w']]) {
    let d = to[k] - b[k];
    for (const o of solids) {
      if (ov(b[a], b[a] + b[an], o[a], o[a] + o[an]) <= EPS || ov(b[c], b[c] + b[cn], o[c], o[c] + o[cn]) <= EPS) continue;
      if (d > 0 && o[k] >= b[k] + b[n] - EPS) d = Math.min(d, o[k] - (b[k] + b[n]));
      if (d < 0 && o[k] + o[n] <= b[k] + EPS) d = Math.max(d, o[k] + o[n] - b[k]);
    }
    if (k === 'z') d = Math.max(d, -s.palletH - b.z); // the floor
    b[k] += d;
  }
}

// Does b sit somewhere free: not inside another carton or the pallet, not under the floor?
export function fits(b, others, s) {
  return b.z >= -s.palletH - EPS && [...others, palletBlock(s)].every(c =>
    ov(b.x, b.x + b.l, c.x, c.x + c.l) <= EPS || ov(b.y, b.y + b.w, c.y, c.y + c.w) <= EPS || ov(b.z, b.z + b.h, c.z, c.z + c.h) <= EPS);
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
    // where the base really rests: the deck, or the tops of the cartons right under it
    const under = Math.abs(b.z) < EPS ? [{ x: 0, y: 0, l: s.L, w: s.W }] : boxes.filter(c => c !== b && Math.abs(c.z + c.h - b.z) < EPS);
    const patches = under.map(c => clip(b, c)).filter(Boolean);
    const ratio = patches.reduce((t, [x0, y0, x1, y1]) => t + (x1 - x0) * (y1 - y0), 0) / (b.l * b.w);
    // it falls when nothing holds it or its centre is past the edge of what does, whatever the area rule says
    const tips = !inHull(b.x + b.l / 2, b.y + b.w / 2, patches);
    if (ratio < minSup - 1e-9 || tips) unsupported.push({ i, ratio, tips });
  });
  const status = boxes.map(() => null);
  for (const { i } of unsupported) status[i] = 'unsupported';
  for (const i of orient) status[i] = 'orient';
  for (const i of outside) status[i] = 'outside';
  for (const [i, j] of collisions) status[i] = status[j] = 'collision';
  return { ...measure(boxes, s), collisions, outside, orient, unsupported, status, ok: status.every(x => x === null) };
}

// Totals read from the boxes themselves, the same way for the computed plan and for the 3D scene.
export function measure(boxes, s) {
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
  };
}

// The computed plan against the boxes as built in 3D: carton by carton (matched on the plan's id) and in total.
export function reconcile(plan, built, s) {
  const a = measure(plan, s), g = measure(built, s);
  const byId = new Map(built.map(b => [b.id, b]));
  let maxDev = 0, moved = 0, missing = 0;
  for (const p of plan) {
    const b = byId.get(p.id);
    if (!b) { missing++; continue; }
    const d = Math.max(...['x', 'y', 'z', 'l', 'w', 'h'].map(k => Math.abs(b[k] - p[k])));
    if (d > EPS) moved++;
    maxDev = Math.max(maxDev, d);
  }
  const extra = built.filter(b => b.id == null).length;
  return {
    plan: a, built: g, tolerance: EPS, maxDev, moved, missing, extra,
    matched: plan.length - moved - missing,
    exact: !moved && !missing && !extra,
    diff: {
      count: g.count - a.count, height: g.height - a.height, weight: g.weight - a.weight, volUtil: g.volUtil - a.volUtil,
      cog: Math.hypot(g.cog.x - a.cog.x, g.cog.y - a.cog.y, g.cog.z - a.cog.z),
    },
  };
}

// Lock a dragged box's faces onto the nearest faces around it (other boxes, the pallet edges, the deck) within
// `reach` mm, so a hand edit lands exactly where the plan's boxes sit; a fixed grid left 5 mm overlaps on plans centred at 25 mm.
export function snapToFaces(b, others, s, reach = 15) {
  const o = s.overhang || 0;
  const faces = {
    x: [0, s.L, -o, s.L + o, ...others.flatMap(c => [c.x, c.x + c.l])],
    y: [0, s.W, -o, s.W + o, ...others.flatMap(c => [c.y, c.y + c.w])],
    z: [0, ...others.flatMap(c => [c.z, c.z + c.h])],
  };
  for (const [k, size] of [['x', 'l'], ['y', 'w'], ['z', 'h']]) {
    let best = reach, shift = 0;
    for (const face of faces[k]) for (const edge of [b[k], b[k] + b[size]]) {
      if (Math.abs(face - edge) < best) { best = Math.abs(face - edge); shift = face - edge; }
    }
    b[k] += shift;
  }
}

// Gravity: lowest z the box falls to from where it is now.
// Off the pallet it falls to the floor, not to deck height.
export function dropZ(boxes, b, s) {
  const fall = { ...b };
  slide(fall, { ...b, z: -Infinity }, boxes.filter(c => c !== b), s);
  return fall.z;
}
