// node engine.test.mjs
import assert from 'node:assert/strict';
import { layoutLayer, optimize, verify, dropZ, reconcile, snapToFaces, slide, fits } from './engine.js';

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

// every plan the engine reports passes its own geometry check: overhang is cut back and interlock
// dropped when they would leave cartons hanging or balanced on a gap
let plans = 0;
for (const [L, W] of [[1200, 800], [1200, 1000], [1100, 1100]])
  for (let l = 150; l <= 600; l += 75) for (let w = 120; w <= l; w += 70)
    for (const interlock of [true, false]) for (const overhang of [0, 30]) {
      const sp = { ...spec, L, W, l, w, interlock, overhang, maxKg: 0 };
      const p = optimize(sp);
      assert.ok(verify(p.boxes, sp).ok, JSON.stringify({ L, W, l, w, interlock, overhang }));
      plans++;
    }
assert.ok(plans > 300);
const edge = optimize({ ...spec, L: 1200, W: 800, l: 150, w: 120, overhang: 30 });
assert.ok(edge.overhangUsed < 30 && verify(edge.boxes, { ...spec, L: 1200, W: 800, l: 150, w: 120, overhang: 30 }).ok);

// geometry catches what the engine never produces
const b = (x, y, z, h = 250) => ({ x, y, z, l: 400, w: 300, h });
const bad = verify([b(0, 0, 0), b(100, 0, 0), b(800, 700, 600), b(1000, 0, 0), b(0, 600, 0, 300)], spec);
assert.deepEqual(bad.collisions, [[0, 1]]);
assert.deepEqual(bad.status, ['collision', 'collision', 'unsupported', 'outside', 'orient']);
assert.equal(bad.ok, false);

const stack = [b(0, 0, 0), b(0, 0, 900)];
assert.equal(dropZ(stack, stack[1], spec), 250);

// stability: a carton whose centre is past the edge of what holds it falls, whatever the area rule says
const loose = { ...spec, minSupport: 0 };
assert.equal(verify([b(0, 0, 0), b(150, 0, 250)], loose).status[1], null); // centre at 350, over the carton below
assert.equal(verify([b(0, 0, 0), b(250, 0, 250)], loose).status[1], 'unsupported'); // centre at 450, past its edge at 400
assert.equal(verify([b(0, 0, 600)], loose).status[0], 'unsupported'); // floating

// by hand: a carton stops flush against the next one, never enters the pallet, and off the pallet falls to the floor
const wall = b(0, 0, 0), mover = b(600, 0, 0);
slide(mover, { x: 100, y: 0, z: 0 }, [wall], spec);
assert.equal(mover.x, 400);
slide(mover, { x: 400, y: 0, z: -200 }, [wall], spec);
assert.equal(mover.z, 0);
const off = b(1300, 0, 0);
assert.equal(dropZ([off], off, spec), -spec.palletH);
assert.equal(fits(b(200, 0, 0), [wall], spec), false);
assert.equal(fits(b(400, 0, 0), [wall], spec), true);

// tolerance is 0.01 mm: touching faces are fine, a 0.1 mm overlap is a collision
assert.equal(verify([b(0, 0, 0), b(400, 0, 0)], spec).collisions.length, 0);
assert.equal(verify([b(0, 0, 0), b(399.9, 0, 0)], spec).collisions.length, 1);

// reconcile: an exact copy matches to 0 mm; a moved, a deleted and an added carton are each counted
const copy = r.boxes.map(x => ({ ...x }));
const same = reconcile(r.boxes, copy, spec);
assert.ok(same.exact);
assert.equal(same.maxDev, 0);
assert.equal(same.matched, 60);
assert.deepEqual(same.diff, { count: 0, height: 0, weight: 0, volUtil: 0, cog: 0 });
copy[0].x += 5;
copy.pop();
copy.push(b(0, 0, 1500));
const drift = reconcile(r.boxes, copy, spec);
assert.deepEqual([drift.matched, drift.moved, drift.missing, drift.extra, drift.maxDev, drift.diff.count, drift.exact],
  [58, 1, 1, 1, 5, 0, false]);

// snapping: a carton dragged to within 15 mm of its slot locks back exactly, so the plan matches to 0 mm again
const hand = r.boxes.map(x => ({ ...x }));
const top = hand[hand.length - 1];
top.x += 7.3; top.y -= 11.9; top.z += 4.2;
snapToFaces(top, hand.filter(c => c !== top), spec);
const back = reconcile(r.boxes, hand, spec);
assert.ok(back.exact && back.maxDev === 0, JSON.stringify(top));
top.x += 30; // further than the reach: left where the hand put it
snapToFaces(top, hand.filter(c => c !== top), spec);
assert.equal(reconcile(r.boxes, hand, spec).maxDev, 30);

console.log('engine OK');
