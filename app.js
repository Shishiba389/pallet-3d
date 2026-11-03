// Interactive 3D Geometry Editor. Scene is Z-up and in mm, same frame as engine.js.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { optimize, verify, dropZ, reconcile, snapToFaces, slide, fits } from './engine.js';

THREE.Object3D.DEFAULT_UP.set(0, 0, 1);
const $ = id => document.getElementById(id);
const form = $('spec'), f = form.elements;
const STATUS = { collision: 0xd63a3a, outside: 0x2f70bb, orient: 0xb8327a, unsupported: 0x4a4d50 };

// Words in A.N.T's two languages; the choice is A.N.T's own (localStorage 'ant-language').
const WORDS = {
  vi: {
    title: 'Phương án xếp hàng', reset: 'Khôi phục phương án', carton: 'Thùng carton', len: 'Dài', wid: 'Rộng', hei: 'Cao',
    weight: 'Khối lượng', allowTip: 'Cho phép đặt nằm', pallet: 'Pallet', palletType: 'Loại pallet', custom: 'Tùy chỉnh',
    maxH: 'Cao tối đa', maxKg: 'Tải tối đa', limitsHint: 'Chiều cao tính cả pallet. Tải 0 là không giới hạn.', advanced: 'Nâng cao',
    palletH: 'Cao pallet', overhang: 'Tràn mép', minSupport: 'Diện tích đỡ tối thiểu', interlock: 'Xếp xen kẽ lớp',
    physics: 'Vật lý thật: thùng không xuyên qua nhau, tự rơi khi thả', snap: 'Bắt dính vào mặt thùng khi kéo', keys: 'Phím tắt', kRotate: 'Xoay thùng đang chọn',
    kTip: 'Lật thùng', kDrop: 'Thả xuống mặt đỡ', kAdd: 'Thêm thùng', kDel: 'Xóa thùng', kEsc: 'Bỏ chọn',
    dragKey: 'Kéo chuột', dragDo: 'Xoay góc nhìn', rightKey: 'Chuột phải', rightDo: 'Dời góc nhìn', wheelKey: 'Con lăn',
    wheelDo: 'Phóng to, thu nhỏ', cartons: 'Số thùng', height: 'Chiều cao', fill: 'Lấp đầy', byVolume: 'theo thể tích',
    plan: 'Sơ đồ lớp', views: 'Góc nhìn', top: 'Trên', topT: 'Nhìn từ trên xuống', front: 'Trước', frontT: 'Nhìn mặt trước',
    layers: 'Lớp',
    collision: 'Va chạm', outside: 'Ngoài biên', orient: 'Sai hướng', unsupported: 'Thiếu đỡ',
    rz: 'Xoay', rx: 'Lật', drop: 'Thả', del: 'Xóa', esc: 'Bỏ chọn', clickToEdit: 'Nhấp vào thùng để chỉnh sửa', add: 'Thêm thùng',
    box: 'Thùng {n}', unit: 'thùng', units: 'thùng', max: 'tối đa {v}', noLimit: 'không giới hạn',
    editedMore: 'Đã chỉnh sửa: {d} thùng so với phương án tính ({n}).', editedSame: 'Đã chỉnh sửa: cùng số thùng với phương án tính ({n}).',
    none: 'Không xếp được thùng nào với kích thước và giới hạn hiện tại.',
    byKg: 'Giới hạn bởi tải trọng: thêm 1 thùng sẽ vượt {kg} kg.',
    byH: 'Giới hạn bởi chiều cao: còn {left} mm, chưa đủ cho một lớp nữa ({v} mm).',
    handEdited: 'đã chỉnh sửa thủ công', perLayer: '{p} / lớp × {f} lớp', onSide: ' · đặt nằm',
    check: 'Kiểm chứng hình học:', findTitle: 'Chọn lần lượt các thùng {kind}', findHint: 'nhấp để tìm thùng lỗi',
    checkOk: 'Kiểm chứng hình học: không va chạm, nằm trong giới hạn, mỗi thùng được đỡ ≥ {sup} % đáy và đứng vững. Trọng tâm lệch {cog} mm so với tâm pallet.',
    faulty: '{n} thùng lỗi', valid: 'Hợp lệ', empty: 'Trống', needValue: 'cần nhập giá trị', atLeast: 'tối thiểu {v}', atMost: 'tối đa {v}',
    overPallet: 'phải lớn hơn chiều cao pallet', odd: 'Lớp lẻ', even: 'Lớp chẵn', each: 'Mỗi lớp', nBoxes: '{n} thùng',
    recon: 'Tính toán ↔ 3D:', reconOf: '{m}/{n} thùng trùng khớp', reconMoved: '{n} lệch', reconMissing: '{n} thiếu',
    reconExtra: '{n} thêm', reconDev: 'sai lệch lớn nhất {v} mm', reconTol: '(dung sai {v} mm)',
    colMetric: 'Chỉ số', colPlan: 'Tính toán', colBuilt: '3D đo được', colDiff: 'Sai lệch',
    rLoadH: 'Chiều cao hàng', rCog: 'Trọng tâm x; y; z', rBoxes: 'Vị trí từng thùng',
    play: 'Mô phỏng xếp', playT: 'Xem xếp từng thùng theo thứ tự: từng lớp, hàng sau trước',
    noRoom: 'Không đủ chỗ để xoay tại đây. Kéo thùng ra chỗ trống rồi xoay.',
    colStack: 'Xếp thẳng cột vì xen kẽ sẽ làm thùng lớp trên thiếu đỡ.',
    overCut: 'Tràn mép dùng {used} mm thay vì {max} mm để thùng ở mép được đỡ đủ.',
  },
  en: {
    title: 'Load plan', reset: 'Back to the computed plan', carton: 'Carton', len: 'Length', wid: 'Width', hei: 'Height',
    weight: 'Weight', allowTip: 'Allow laying on its side', pallet: 'Pallet', palletType: 'Pallet type', custom: 'Custom',
    maxH: 'Max height', maxKg: 'Max load', limitsHint: 'Height includes the pallet. A load of 0 means no limit.', advanced: 'Advanced',
    palletH: 'Pallet height', overhang: 'Overhang', minSupport: 'Minimum support', interlock: 'Interlock layers',
    physics: 'Real physics: cartons can’t pass through each other and drop when released', snap: 'Snap to carton faces when dragging', keys: 'Shortcuts', kRotate: 'Rotate the selected carton',
    kTip: 'Tip the carton over', kDrop: 'Drop onto what is below', kAdd: 'Add a carton', kDel: 'Delete the carton', kEsc: 'Deselect',
    dragKey: 'Drag', dragDo: 'Orbit the view', rightKey: 'Right drag', rightDo: 'Pan the view', wheelKey: 'Wheel',
    wheelDo: 'Zoom in and out', cartons: 'Cartons', height: 'Height', fill: 'Fill', byVolume: 'by volume',
    plan: 'Layer plan', views: 'View', top: 'Top', topT: 'View from above', front: 'Front', frontT: 'View from the front',
    layers: 'Layers',
    collision: 'Collision', outside: 'Out of bounds', orient: 'Wrong way up', unsupported: 'Unsupported',
    rz: 'Rotate', rx: 'Tip', drop: 'Drop', del: 'Delete', esc: 'Deselect', clickToEdit: 'Click a carton to edit it', add: 'Add carton',
    box: 'Carton {n}', unit: 'carton', units: 'cartons', max: 'max {v}', noLimit: 'no limit',
    editedMore: 'Edited by hand: {d} against the computed plan of {n}.', editedSame: 'Edited by hand: the same count as the computed plan ({n}).',
    none: 'No carton fits with these sizes and limits.',
    byKg: 'Limited by weight: one more carton would pass {kg} kg.',
    byH: 'Limited by height: {left} mm left, not enough for another layer ({v} mm).',
    handEdited: 'edited by hand', perLayer: '{p} per layer × {f} layers', onSide: ' · on its side',
    check: 'Geometry check:', findTitle: 'Select each carton in turn: {kind}', findHint: 'click to find the cartons',
    checkOk: 'Geometry check: no collisions, within limits, every carton supported on at least {sup} % of its base and stable. Centre of gravity {cog} mm from the pallet centre.',
    faulty: '{n} at fault', valid: 'Valid', empty: 'Empty', needValue: 'enter a value', atLeast: 'at least {v}', atMost: 'at most {v}',
    overPallet: 'must be more than the pallet height', odd: 'Odd layers', even: 'Even layers', each: 'Each layer', nBoxes: '{n} cartons',
    recon: 'Plan ↔ 3D:', reconOf: '{m} of {n} cartons match', reconMoved: '{n} moved', reconMissing: '{n} missing',
    reconExtra: '{n} added', reconDev: 'largest deviation {v} mm', reconTol: '(tolerance {v} mm)',
    colMetric: 'Measure', colPlan: 'Computed', colBuilt: 'Measured in 3D', colDiff: 'Deviation',
    rLoadH: 'Load height', rCog: 'Centre of gravity x; y; z', rBoxes: 'Each carton’s position',
    play: 'Play stacking', playT: 'Watch the cartons go on one by one: layer by layer, back row first',
    noRoom: 'No room to turn it here. Drag it clear first, then turn it.',
    colStack: 'Stacked in columns: interlocking would leave upper cartons short of support.',
    overCut: 'Overhang {used} mm instead of {max} mm so the edge cartons stay supported.',
  },
};
let lang = 'vi';
const t = (key, v = {}) => WORDS[lang][key].replace(/\{(\w+)\}/g, (_, k) => v[k]);
const KRAFT = [0xc9a26b, 0xdcbd8c];
const hex = c => '#' + c.toString(16).padStart(6, '0');
const svg = d => `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const ICON = {
  rz: svg('<path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/>'),
  rx: svg('<path d="m17 3-5 5-5-5h10"/><path d="m17 21-5-5-5 5h10"/><path d="M4 12H2M10 12H8M16 12h-2M22 12h-2"/>'),
  drop: svg('<path d="M12 17V3"/><path d="m6 11 6 6 6-6"/><path d="M19 21H5"/>'),
  del: svg('<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>'),
  add: svg('<path d="M5 12h14"/><path d="M12 5v14"/>'),
  esc: svg('<path d="M18 6 6 18"/><path d="m6 6 12 12"/>'),
  check: svg('<path d="M20 6 9 17l-5-5"/>'),
};
const TOOLS = [['rz', 'R'], ['rx', 'T'], ['drop', 'G'], ['del', 'Delete']];

const view = $('view');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); // 3x screens cost 2.25x the pixels for nothing visible
view.prepend(renderer.domElement);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
const css = name => new THREE.Color(getComputedStyle(document.documentElement).getPropertyValue(name).trim());
const camera = new THREE.PerspectiveCamera(40, 1, 10, 60000);
scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8f94, 2));
const sun = new THREE.DirectionalLight(0xffffff, 1.6); // placed over the load in buildWorld
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.bias = -0.0005;
sun.shadow.normalBias = 2;
scene.add(sun, sun.target);

const orbit = new OrbitControls(camera, renderer.domElement);
const tc = new TransformControls(camera, renderer.domElement);
tc.setSize(0.8);
tc.addEventListener('dragging-changed', e => { orbit.enabled = !e.value; if (!e.value) onDragEnd(); });
tc.addEventListener('objectChange', onMove);
scene.add(tc);

const world = new THREE.Group();
scene.add(world);
const unit = new THREE.BoxGeometry(1, 1, 1), unitEdges = new THREE.EdgesGeometry(unit);
const edgeMat = new THREE.LineBasicMaterial({ color: 0x6b5330 });

let spec, result, lastV, meshes = [], selected = null, edited = false, checksHtml = '', env = null, grid = null;
const boxesOf = () => meshes.map(m => m.userData.box);
// What is actually drawn: each carton's bounds read back from its 3D object, not the numbers it was given.
const box3 = new THREE.Box3();
const builtOf = () => meshes.map(m => {
  const { min, max } = box3.setFromObject(m);
  return { id: m.userData.box.id, x: min.x, y: min.y, z: min.z, l: max.x - min.x, w: max.y - min.y, h: max.z - min.z };
});
// Faces pushed back a hair so the carton edges lying on them always draw (from straight above they used to vanish).
const OFFSET = { polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 };

function readSpec() {
  const n = k => Math.round(+f[k].value);
  return { L: n('L'), W: n('W'), palletH: n('palletH'), maxH: n('maxH'), maxKg: +f.maxKg.value, overhang: n('overhang'),
    l: n('l'), w: n('w'), h: n('h'), kg: +f.kg.value, allowTip: f.allowTip.checked, interlock: f.interlock.checked,
    minSupport: +f.minSupport.value / 100 };
}

function calc() {
  const s = readSpec();
  const reframe = !spec || ['L', 'W', 'maxH', 'palletH'].some(k => s[k] !== spec[k]);
  spec = s;
  stopPlay();
  result = optimize(spec);
  edited = false;
  buildWorld();
  $('cut').value = $('cut').max = 999; // show every layer after a recalculation
  if (reframe) setView('iso');
  renderPlan();
  refresh();
}

// The layer plan: the computed pattern from above, odd and even layers when they are interlocked.
function renderPlan() {
  const { boxes } = result, s = spec, o = s.overhang || 0, el = $('plan');
  const levels = [...new Set(boxes.map(b => b.z))].sort((a, b) => a - b);
  if (!levels.length) { el.innerHTML = '<span class="sub">—</span>'; return; }
  const both = !!result.flip && levels.length > 1; // the engine may have dropped interlocking to keep cartons supported
  el.innerHTML = levels.slice(0, both ? 2 : 1).map((z, k) => {
    const layer = boxes.filter(b => b.z === z);
    const name = t(both ? (k ? 'even' : 'odd') : 'each'), count = t('nBoxes', { n: layer.length });
    return `<figure><svg viewBox="${-o} ${-o} ${s.L + 2 * o} ${s.W + 2 * o}" role="img" aria-label="${name}: ${count}">
      <rect class="deck" width="${s.L}" height="${s.W}"/>${layer.map(b =>
        `<rect class="c" x="${b.x}" y="${s.W - b.y - b.w}" width="${b.l}" height="${b.w}" fill="${hex(KRAFT[k % 2])}"/>`).join('')}
      </svg><figcaption>${name}<span>${count}</span></figcaption></figure>`;
  }).join('');
}

// Colours that follow the A.N.T theme: the well, the grid and the load envelope.
function paint() {
  scene.background = css('--well');
  edgeMat.color.copy(css('--edge'));
  if (!grid) return;
  env.material.color.copy(css('--text'));
  world.remove(grid);
  grid.dispose();
  world.add(grid = makeGrid());
}

function makeGrid() {
  const { L, W, palletH, maxH } = spec, H = maxH - palletH;
  const g = new THREE.GridHelper(Math.max(L, W, H) * 3, 30, css('--grid-major'), css('--grid-minor'));
  g.rotation.x = Math.PI / 2;
  g.position.set(L / 2, W / 2, -palletH);
  return g;
}

function slab(x, y, z, l, w, h, mat) {
  const m = new THREE.Mesh(unit, mat);
  m.position.set(x + l / 2, y + w / 2, z + h / 2);
  m.scale.set(l, w, h);
  m.castShadow = m.receiveShadow = true;
  world.add(m);
}

// A block pallet as built: top deck boards with gaps, three cross boards, nine blocks, three bottom boards.
function buildPallet(mat) {
  const { L, W, palletH: P } = spec, t = 22;
  if (P <= 0) return;
  if (P < 4 * t) return slab(0, 0, -P, L, W, P, mat); // too thin for boards and blocks
  const bw = Math.min(145, W / 6), bl = Math.min(145, L / 6), block = P - 3 * t;
  const ys = [0, (W - bw) / 2, W - bw], xs = [0, (L - bl) / 2, L - bl];
  for (let i = 0; i < 5; i++) slab(0, (i * (W - bw)) / 4, -t, L, bw, t, mat);
  for (const x of xs) slab(x, 0, -2 * t, bl, W, t, mat);
  for (const x of xs) for (const y of ys) slab(x, y, -2 * t - block, bl, bw, block, mat);
  for (const y of ys) slab(0, y, -P, L, bw, t, mat);
}

function buildWorld() {
  select(null);
  world.clear(); // ponytail: per-box materials leak on recalc; dispose them if recalcs get into the thousands
  const { L, W, palletH, overhang: o, maxH } = spec, H = maxH - palletH;
  buildPallet(new THREE.MeshStandardMaterial({ color: 0x9c7748, ...OFFSET }));
  // the sun over the load; its light camera covers the stack and the dark patch it casts on the floor
  const d = Math.max(L, W, H), c = new THREE.Vector3(L / 2, W / 2, H / 2);
  sun.target.position.copy(c);
  sun.position.copy(c).addScaledVector(new THREE.Vector3(-1, -2, 3).normalize(), d * 2);
  Object.assign(sun.shadow.camera, { left: -d * 1.5, right: d * 1.5, top: d * 1.5, bottom: -d * 1.5, near: 1, far: d * 5 });
  sun.shadow.camera.updateProjectionMatrix();
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(d * 6, d * 6), new THREE.ShadowMaterial({ opacity: 0.16 }));
  floor.position.set(L / 2, W / 2, -palletH - 0.5);
  floor.receiveShadow = true;
  world.add(floor);
  // the allowed load envelope
  env = new THREE.LineSegments(unitEdges, new THREE.LineBasicMaterial({ color: css('--text'), transparent: true, opacity: 0.3 }));
  env.position.set(L / 2, W / 2, H / 2);
  env.scale.set(L + 2 * o, W + 2 * o, H);
  world.add(env);
  world.add(grid = makeGrid());
  meshes = result.boxes.map(b => addMesh({ ...b }));
}

function addMesh(box) {
  const m = new THREE.Mesh(unit, new THREE.MeshStandardMaterial({ emissiveIntensity: 0.55, ...OFFSET }));
  m.castShadow = m.receiveShadow = true;
  m.add(new THREE.LineSegments(unitEdges, edgeMat));
  m.userData.box = box;
  sync(m);
  world.add(m);
  return m;
}

function sync(m) {
  const b = m.userData.box;
  m.position.set(b.x + b.l / 2, b.y + b.w / 2, b.z + b.h / 2);
  m.scale.set(b.l, b.w, b.h);
}

function setView(kind) {
  const { L, W, maxH, palletH } = spec, H = maxH - palletH, d = Math.max(L, W, H);
  const off = { iso: [d * 1.3, -d * 1.6, d], top: [0, -1, d * 2.4], front: [0, -d * 2.6, 0] }[kind];
  orbit.target.set(L / 2, W / 2, kind === 'top' ? 0 : H * 0.4);
  camera.position.set(L / 2 + off[0], W / 2 + off[1], orbit.target.z + off[2]);
  orbit.update();
  document.querySelectorAll('[data-view]').forEach(b => b.setAttribute('aria-pressed', b.dataset.view === kind));
}

function onMove() {
  const m = tc.object, b = m.userData.box, others = boxesOf().filter(c => c !== b);
  // where the hand wants it, snapped onto nearby faces; with physics it slides there and stops at whatever is in the way
  const want = { ...b, x: m.position.x - b.l / 2, y: m.position.y - b.w / 2, z: m.position.z - b.h / 2 };
  if ($('snap').checked) snapToFaces(want, others, spec);
  if ($('physics').checked) slide(b, want, others, spec); else Object.assign(b, { x: want.x, y: want.y, z: want.z });
  sync(m);
  refresh();
}

function onDragEnd() {
  if ($('physics').checked && selected) { drop(selected); refresh(); }
}

function drop(m) {
  m.userData.box.z = dropZ(boxesOf(), m.userData.box, spec);
  sync(m);
}

function toast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { el.hidden = true; }, 3000);
}

// The loading sequence: cartons go on one at a time, layer by layer, back row first, each dropping into its slot.
const STEP = 90, FALL = 400; // ms per carton, mm each one drops
let play = null;
function startPlay() {
  if (!meshes.length) return;
  select(null);
  const order = [...meshes].sort((p, q) => {
    const a = p.userData.box, b = q.userData.box;
    return Math.round(a.z - b.z) || Math.round(b.y - a.y) || Math.round(a.x - b.x);
  });
  play = { order, t0: matchMedia('(prefers-reduced-motion: reduce)').matches ? -Infinity : performance.now() };
}
function stepPlay(now) {
  const k = (now - play.t0) / STEP, n = play.order.length;
  play.order.forEach((m, i) => {
    sync(m);
    m.visible = i < k;
    const f = k - i; // 0..1 while this carton is falling into place
    if (f > 0 && f < 1) m.position.z += FALL * (1 - f * f);
  });
  $('play-label').textContent = `${Math.min(n, Math.ceil(k))}/${n}`;
  if (k >= n) { stopPlay(); refresh(); }
}
function stopPlay() {
  if (!play) return;
  play = null;
  $('play-label').textContent = t('play');
  meshes.forEach(sync); // every carton back exactly on the plan
}

function select(m) {
  selected = m;
  m ? tc.attach(m) : tc.detach();
  if (spec) refresh();
}

function edit(op) {
  if (!spec) return;
  stopPlay();
  if (op === 'esc') return select(null);
  if (op === 'add') {
    const { L, W, l, w, h } = spec;
    const top = Math.max(0, ...boxesOf().map(b => b.z + b.h));
    const m = addMesh({ x: (L - l) / 2, y: (W - w) / 2, z: top, l, w, h });
    meshes.push(m);
    return select(m);
  }
  const m = selected;
  if (!m) return;
  if (op === 'del') {
    world.remove(m);
    m.material.dispose();
    meshes.splice(meshes.indexOf(m), 1);
    return select(null);
  }
  const b = m.userData.box, before = { ...b }, cx = b.x + b.l / 2, cy = b.y + b.w / 2;
  if (op === 'rz') [b.l, b.w] = [b.w, b.l];
  if (op === 'rx') [b.w, b.h] = [b.h, b.w]; // with Xoay this reaches all six orientations
  b.x = cx - b.l / 2; b.y = cy - b.w / 2; // turn in place around the vertical centre line
  const physics = $('physics').checked;
  if (physics && op !== 'drop' && !fits(b, boxesOf().filter(c => c !== b), spec)) {
    Object.assign(b, before); // a real carton can't turn into its neighbours
    toast(t('noRoom'));
  } else if (op === 'drop' || physics) drop(m);
  sync(m);
  refresh();
}

const fmt = (x, d = 0) => (+x).toLocaleString(lang === 'en' ? 'en-GB' : 'vi-VN', { maximumFractionDigits: d });

function renderTools() {
  const el = $('tools'), has = String(!!selected);
  if (el.dataset.has !== has) { // rebuild only when the mode changes, so keyboard focus survives edits
    el.dataset.has = has;
    el.innerHTML = selected
      ? `<b id="selname"></b><span class="dim num" id="seldims"></span><span class="sep"></span>` +
        TOOLS.map(([op, key]) => `<button class="tool" data-op="${op}" title="${t(op)} (${key})" aria-label="${t(op)}" aria-keyshortcuts="${key}">${ICON[op]}<span>${t(op)}</span></button>`).join('') +
        `<button class="tool" data-op="esc" title="${t('esc')} (Esc)" aria-label="${t('esc')}">${ICON.esc}</button>`
      : `<span class="dim">${t('clickToEdit')}</span>` +
        `<button class="tool" data-op="add" title="${t('add')} (N)" aria-keyshortcuts="N">${ICON.add}${t('add')}</button>`;
  }
  if (selected) {
    const b = selected.userData.box;
    $('selname').textContent = t('box', { n: meshes.indexOf(selected) + 1 });
    $('seldims').textContent = `${b.l} × ${b.w} × ${b.h} mm`;
  }
}

function setLimit(id, val, max, unit, limiting) {
  $(`k-${id}`).innerHTML = `${fmt(val, 1)}<small> ${unit}</small>`;
  const ratio = max > 0 ? val / max : 0;
  $(`b-${id}`).style.width = Math.min(100, ratio * 100) + '%';
  $(`b-${id}`).className = ratio > 1 + 1e-9 ? 'over' : limiting ? 'lim' : '';
  $(`m-${id}`).textContent = max > 0 ? t('max', { v: `${fmt(max)} ${unit}` }) : t('noLimit');
}

function finding(v) {
  const r = result, s = spec;
  if (edited) {
    const d = v.count - r.total;
    return d ? t('editedMore', { d: `${d > 0 ? '+' : '−'}${Math.abs(d)}`, n: r.total }) : t('editedSame', { n: r.total });
  }
  if (!r.total) return t('none');
  // what the engine had to give up so the stack stands
  const gave = (r.interlockDropped ? ' ' + t('colStack') : '') +
    (r.overhangUsed < (s.overhang || 0) ? ' ' + t('overCut', { used: fmt(r.overhangUsed), max: fmt(s.overhang) }) : '');
  if (r.limit === 'tải trọng') return t('byKg', { kg: fmt(s.maxKg) }) + gave;
  return t('byH', { left: fmt(s.maxH - r.totalHeight), v: fmt(r.v) }) + gave;
}

const fx = (x, d) => (+x).toLocaleString(lang === 'en' ? 'en-GB' : 'vi-VN', { minimumFractionDigits: d, maximumFractionDigits: d });
// A deviation cell: zero within tolerance, otherwise signed (or a plain distance) and marked.
const devCell = (x, d, tol, signed = true) => Math.abs(x) <= tol ? `<td>${fx(0, d)}</td>`
  : `<td class="dev">${signed ? (x > 0 ? '+' : '−') : ''}${fx(Math.abs(x), d)}</td>`;

function renderRecon(rc) {
  const { plan: a, built: g, diff, tolerance: tol } = rc, n = result.boxes.length;
  $('recon').hidden = !n && !g.count;
  const parts = [t('reconOf', { m: rc.matched, n })];
  for (const k of ['Moved', 'Missing', 'Extra']) if (rc[k.toLowerCase()]) parts.push(t('recon' + k, { n: rc[k.toLowerCase()] }));
  $('recon-sum').innerHTML = (rc.exact ? ICON.check : '') + `<b>${t('recon')}</b> ` + [...parts, t('reconDev', { v: fx(rc.maxDev, 3) })].join(' · ') +
    (rc.exact ? ` ${t('reconTol', { v: fx(tol, 2) })}` : '');
  const cog = c => `${fx(c.x, 1)}; ${fx(c.y, 1)}; ${fx(c.z, 1)}`;
  const rows = [
    [t('cartons'), fmt(a.count), fmt(g.count), devCell(diff.count, 0, 0)],
    [`${t('rLoadH')} (mm)`, fx(a.height, 3), fx(g.height, 3), devCell(diff.height, 3, tol)],
    [`${t('weight')} (kg)`, fx(a.weight, 1), fx(g.weight, 1), devCell(diff.weight, 1, 1e-6)],
    [`${t('fill')} (%)`, fx(a.volUtil * 100, 2), fx(g.volUtil * 100, 2), devCell(diff.volUtil * 100, 2, 1e-6)],
    [`${t('rCog')} (mm)`, cog(a.cog), cog(g.cog), devCell(diff.cog, 3, tol, false)],
    [`${t('rBoxes')} (mm)`, fmt(n), `${rc.matched}/${n}`, devCell(rc.maxDev, 3, tol, false)],
  ];
  $('recon-table').innerHTML = `<tr><th>${t('colMetric')}</th><th>${t('colPlan')}</th><th>${t('colBuilt')}</th><th>${t('colDiff')}</th></tr>` +
    rows.map(([k, p, b, d]) => `<tr><td>${k}</td><td>${p}</td><td>${b}</td>${d}</tr>`).join('');
}

function refresh() {
  // verify and compare what is drawn, measured back out of the scene
  const bx = builtOf(), v = verify(bx, spec), r = result;
  lastV = v;
  const rc = reconcile(r.boxes, bx, spec);
  edited = !rc.exact; // edited means the 3D no longer matches the plan, measured, not "someone pressed a button"
  renderRecon(rc);

  const levels = [...new Set(bx.map(b => Math.round(b.z)))].sort((a, b) => a - b);
  const cut = $('cut'), all = +cut.value >= +cut.max;
  cut.max = Math.max(1, levels.length);
  if (all) cut.value = cut.max;
  $('cutv').textContent = `${Math.min(+cut.value, levels.length)}/${levels.length}`; // 0/0 when the pallet is empty
  meshes.forEach((m, i) => {
    const st = v.status[i], lv = levels.indexOf(Math.round(bx[i].z));
    m.material.color.set(st ? STATUS[st] : KRAFT[lv % 2]);
    m.material.emissive.set(m === selected ? 0xff5f2e : 0x000000); // A.N.T's one orange marks the carton being edited
    m.visible = m === selected || lv < +cut.value;
  });

  $('k-count').innerHTML = `${fmt(v.count)}<small> ${t(v.count === 1 ? 'unit' : 'units')}</small>`;
  const full = Math.floor(r.total / r.perLayer), rest = r.total % r.perLayer; // a weight limit can leave the top layer partial
  $('k-count-sub').textContent = edited ? t('handEdited')
    : r.total ? `${t('perLayer', { p: r.perLayer, f: full })}${rest ? ` + ${rest}` : ''}${r.v !== spec.h ? t('onSide') : ''}` : '—';
  setLimit('h', v.height + spec.palletH, spec.maxH, 'mm', !edited && r.limit === 'chiều cao');
  setLimit('kg', v.weight, spec.maxKg, 'kg', !edited && r.limit === 'tải trọng');
  $('k-fill').textContent = v.count ? fmt(v.volUtil * 100, 1) + ' %' : '—';
  $('finding').textContent = finding(v);

  const bad = v.status.filter(Boolean).length;
  const kinds = Object.keys(STATUS).map(k => [k, v.status.filter(s => s === k).length]).filter(([, n]) => n);
  const html = !v.count ? '' : bad
    ? `<span class="neg">${t('check')}</span>` +
      kinds.map(([k, n]) => `<button class="chip" data-kind="${k}" title="${t('findTitle', { kind: t(k).toLowerCase() })}"><i style="background:${hex(STATUS[k])}"></i>${t(k)} ${n}</button>`).join('') +
      `<span>${t('findHint')}</span>`
    : `${ICON.check}<span>${t('checkOk', { sup: fmt(spec.minSupport * 100), cog: fmt(v.cogOffset) })}</span>`;
  if (html !== checksHtml) $('checks').innerHTML = checksHtml = html;

  $('pill').className = 'pill ' + (bad ? 'neg' : v.count ? 'pos' : '');
  $('pill').textContent = bad ? t('faulty', { n: bad }) : t(v.count ? 'valid' : 'empty');
  $('reset').hidden = !edited;
  renderTools();
}

const PRESETS = { '1200x800': [1200, 800], '1200x1000': [1200, 1000], '1100x1100': [1100, 1100] };
form.addEventListener('input', e => {
  if (e.target.id === 'preset') {
    const p = PRESETS[e.target.value];
    $('custom').hidden = !!p;
    if (p) [f.L.value, f.W.value] = p;
  } else if (!e.target.name) return; // editor toggles don't change the plan
  f.maxH.setCustomValidity(+f.maxH.value > +f.palletH.value ? '' : t('overPallet'));
  for (const el of form.elements) if (el.name) el.setAttribute('aria-invalid', !el.validity.valid);
  const bad = form.querySelector(':invalid'), err = $('err');
  for (const el of form.querySelectorAll('[aria-describedby~="err"]')) {
    const rest = el.getAttribute('aria-describedby').replace(/\berr\b/, '').trim();
    rest ? el.setAttribute('aria-describedby', rest) : el.removeAttribute('aria-describedby');
  }
  if (bad) bad.setAttribute('aria-describedby', `${bad.getAttribute('aria-describedby') || ''} err`.trim()); // read with the field
  if (bad) { // the message goes under the field's row; the old result dims so it isn't read as current
    const v = bad.validity;
    const why = v.valueMissing ? t('needValue') : v.rangeUnderflow ? t('atLeast', { v: bad.min }) : v.rangeOverflow ? t('atMost', { v: bad.max }) : bad.validationMessage;
    err.textContent = `${bad.closest('label').firstChild.textContent.trim()}: ${why}`;
    (bad.closest('.row2, .row3') || bad.closest('label')).after(err);
  } else err.textContent = '';
  for (const el of [document.querySelector('.sheet'), $('pill')]) el.classList.toggle('stale', !!bad);
  if (!bad) calc();
});
form.addEventListener('submit', e => e.preventDefault());
$('reset').addEventListener('click', calc);
$('tools').addEventListener('click', e => { const op = e.target.closest('[data-op]')?.dataset.op; if (op) edit(op); });
$('views').addEventListener('click', e => { const k = e.target.closest('[data-view]')?.dataset.view; if (k) setView(k); });
$('cut').addEventListener('input', () => { stopPlay(); if (spec) refresh(); });
$('play').addEventListener('click', () => {
  if (!play) return startPlay();
  stopPlay();
  refresh();
});
$('checks').addEventListener('click', e => { // cycle through the boxes with this fault
  const k = e.target.closest('[data-kind]')?.dataset.kind;
  if (!k) return;
  const idx = lastV.status.flatMap((s, i) => s === k ? [i] : []);
  select(meshes[idx[(idx.indexOf(meshes.indexOf(selected)) + 1) % idx.length]]);
});
addEventListener('keydown', e => {
  if (['INPUT', 'SELECT'].includes(e.target.tagName)) return;
  const op = { r: 'rz', t: 'rx', g: 'drop', n: 'add', delete: 'del', escape: 'esc' }[e.key.toLowerCase()];
  if (op) edit(op);
});

// click-to-select; ignore drags (orbit) and clicks on the gizmo
const ray = new THREE.Raycaster(), ptr = new THREE.Vector2();
let down = null;
renderer.domElement.addEventListener('pointerdown', e => { down = [e.clientX, e.clientY]; });
renderer.domElement.addEventListener('pointerup', e => {
  if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 4 || tc.axis) return;
  const r = renderer.domElement.getBoundingClientRect();
  ptr.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ptr, camera);
  stopPlay();
  select(ray.intersectObjects(meshes.filter(m => m.visible), false)[0]?.object ?? null);
});

new ResizeObserver(() => {
  renderer.setSize(view.clientWidth, view.clientHeight);
  camera.aspect = view.clientWidth / view.clientHeight;
  camera.updateProjectionMatrix();
  renderer.render(scene, camera); // setSize clears the buffer; redraw now so the view never flashes empty
}).observe(view);
renderer.setAnimationLoop(now => { if (play) stepPlay(now); renderer.render(scene, camera); });
// A.N.T switches its theme in the parent page; the change reaches this frame as a storage event.
addEventListener('storage', e => {
  if (e.key === 'ant-language') return setLang();
  if (e.key !== 'ant-theme') return;
  document.documentElement.dataset.theme = e.newValue === 'dark' ? 'dark' : 'light';
  paint();
});

function setLang() {
  try { lang = localStorage.getItem('ant-language') === 'en' ? 'en' : 'vi'; } catch (e) { lang = 'vi'; }
  document.documentElement.lang = lang;
  document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
  document.querySelectorAll('[data-i18n-title]').forEach(el => { el.title = t(el.dataset.i18nTitle); });
  document.querySelectorAll('[data-i18n-aria]').forEach(el => { el.setAttribute('aria-label', t(el.dataset.i18nAria)); });
  $('tools').dataset.has = ''; // rebuild the edit bar in the new words
  if (spec) { renderPlan(); refresh(); }
}
setLang();
paint();
calc();
