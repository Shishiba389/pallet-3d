// node engine.test.mjs
import assert from 'node:assert/strict';
import { layoutLayer, optimize, verify, dropZ } from './engine.js';

// guillotine 2-block beats the plain grid (9) on 1200×1000; Euro pallet is an exact fit
assert.equal(layoutLayer(1200, 1000, 400, 300).length, 10);
assert.equal(layoutLayer(1200, 800, 400, 300).length, 8);

const spec = { L: 1200, W: 1000, palletH: 144, maxH: 1800, maxKg: 1000, overhang: 0,
  l: 400, w: 300, h: 250, kg: 12, allowTip: false, interlock: true, minSupport: 0.8 };
const r = optimize(spec);
assert.equal(r.perLayer, 10);
assert.equal(r.total, 60); // floor(1656/250) = 6 layers
const v = verify(r.boxes, spec);
assert.ok(v.ok, JSON.stringify(v.status));
assert.equal(v.count, r.total);
assert.equal(v.height, r.loadHeight);

assert.equal(optimize({ ...spec, maxKg: 500 }).total, 41); // weight-limited
const tip = { ...spec, allowTip: true };
const rt = optimize(tip);
assert.equal(rt.total, 64); // 300×250 footprint, 400 tall: 16 × 4
assert.ok(verify(rt.boxes, tip).ok);

// geometry catches what the engine never produces
const b = (x, y, z, h = 250) => ({ x, y, z, l: 400, w: 300, h });
const bad = verify([b(0, 0, 0), b(100, 0, 0), b(800, 700, 600), b(1000, 0, 0), b(0, 600, 0, 300)], spec);
assert.deepEqual(bad.collisions, [[0, 1]]);
assert.deepEqual(bad.status, ['collision', 'collision', 'unsupported', 'outside', 'orient']);
assert.equal(bad.ok, false);

const stack = [b(0, 0, 0), b(0, 0, 900)];
assert.equal(dropZ(stack, stack[1]), 250);

console.log('engine OK');
