// Interactive 3D Geometry Editor. Scene is Z-up and in mm, same frame as engine.js.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { optimize, verify, dropZ } from './engine.js';

THREE.Object3D.DEFAULT_UP.set(0, 0, 1);
const $ = id => document.getElementById(id);
const form = $('spec'), f = form.elements;
const STATUS = {
  collision: [0xd63a3a, 'Va chạm'],
  outside: [0x2f70bb, 'Ngoài biên'],
  orient: [0xb8327a, 'Sai hướng'],
  unsupported: [0x4a4d50, 'Thiếu đỡ'],
};
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
const TOOLS = [['rz', 'Xoay', 'R'], ['rx', 'Lật', 'T'], ['drop', 'Thả', 'G'], ['del', 'Xóa', 'Delete']];

const view = $('view');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(devicePixelRatio);
view.prepend(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xeeefec);
const camera = new THREE.PerspectiveCamera(40, 1, 10, 60000);
scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8f94, 2));
const sun = new THREE.DirectionalLight(0xffffff, 1.6);
sun.position.set(-1, -2, 3);
scene.add(sun);

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

let spec, result, lastV, meshes = [], selected = null, edited = false, checksHtml = '';
const boxesOf = () => meshes.map(m => m.userData.box);

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
  result = optimize(spec);
  edited = false;
  buildWorld();
  $('cut').value = $('cut').max = 999; // show every layer after a recalculation
  if (reframe) setView('iso');
  refresh();
}

function slab(x, y, z, l, w, h, mat) {
  const m = new THREE.Mesh(unit, mat);
  m.position.set(x + l / 2, y + w / 2, z + h / 2);
  m.scale.set(l, w, h);
  world.add(m);
}

function buildWorld() {
  select(null);
  world.clear(); // ponytail: per-box materials leak on recalc; dispose them if recalcs get into the thousands
  const { L, W, palletH, overhang: o, maxH } = spec, H = maxH - palletH;
  const wood = new THREE.MeshStandardMaterial({ color: 0x9c7748 });
  const deck = Math.min(22, palletH);
  slab(0, 0, -deck, L, W, deck, wood);
  for (const y of [0, (W - 100) / 2, W - 100]) slab(0, y, -palletH, L, 100, palletH - deck, wood);
  // the allowed load envelope
  const env = new THREE.LineSegments(unitEdges, new THREE.LineBasicMaterial({ color: 0x1b6c80, transparent: true, opacity: 0.4 }));
  env.position.set(L / 2, W / 2, H / 2);
  env.scale.set(L + 2 * o, W + 2 * o, H);
  world.add(env);
  const grid = new THREE.GridHelper(Math.max(L, W, H) * 3, 30, 0xc9cbc6, 0xdcddd9);
  grid.rotation.x = Math.PI / 2;
  grid.position.set(L / 2, W / 2, -palletH);
  world.add(grid);
  meshes = result.boxes.map(b => addMesh({ ...b }));
}

function addMesh(box) {
  const m = new THREE.Mesh(unit, new THREE.MeshStandardMaterial({ emissiveIntensity: 0.55 }));
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
  const m = tc.object, b = m.userData.box;
  b.x = m.position.x - b.l / 2; b.y = m.position.y - b.w / 2; b.z = m.position.z - b.h / 2;
  if ($('snap').checked) { // snap the corner, not the centre, so edges line up with neighbours
    for (const k of ['x', 'y', 'z']) b[k] = Math.round(b[k] / 10) * 10;
    sync(m);
  }
  edited = true;
  refresh();
}

function onDragEnd() {
  if ($('gravity').checked && selected) { drop(selected); refresh(); }
}

function drop(m) {
  m.userData.box.z = dropZ(boxesOf(), m.userData.box);
  sync(m);
}

function select(m) {
  selected = m;
  m ? tc.attach(m) : tc.detach();
  if (spec) refresh();
}

function edit(op) {
  if (!spec) return;
  if (op === 'esc') return select(null);
  if (op === 'add') {
    const { L, W, l, w, h } = spec;
    const top = Math.max(0, ...boxesOf().map(b => b.z + b.h));
    const m = addMesh({ x: (L - l) / 2, y: (W - w) / 2, z: top, l, w, h });
    meshes.push(m);
    edited = true;
    return select(m);
  }
  const m = selected;
  if (!m) return;
  edited = true;
  if (op === 'del') {
    world.remove(m);
    m.material.dispose();
    meshes.splice(meshes.indexOf(m), 1);
    return select(null);
  }
  const b = m.userData.box, cx = b.x + b.l / 2, cy = b.y + b.w / 2;
  if (op === 'rz') [b.l, b.w] = [b.w, b.l];
  if (op === 'rx') [b.w, b.h] = [b.h, b.w]; // with Xoay this reaches all six orientations
  b.x = cx - b.l / 2; b.y = cy - b.w / 2; // turn in place around the vertical centre line
  if (op === 'drop' || $('gravity').checked) drop(m); else sync(m);
  refresh();
}

const fmt = (x, d = 0) => (+x).toLocaleString('vi-VN', { maximumFractionDigits: d });

function renderTools() {
  const el = $('tools'), has = String(!!selected);
  if (el.dataset.has !== has) { // rebuild only when the mode changes, so keyboard focus survives edits
    el.dataset.has = has;
    el.innerHTML = selected
      ? `<b id="selname"></b><span class="dim num" id="seldims"></span><span class="sep"></span>` +
        TOOLS.map(([op, label, key]) => `<button class="tool" data-op="${op}" title="${label} (${key})" aria-keyshortcuts="${key}">${ICON[op]}${label}</button>`).join('') +
        `<button class="tool" data-op="esc" title="Bỏ chọn (Esc)" aria-label="Bỏ chọn">${ICON.esc}</button>`
      : `<span class="dim">Nhấp vào thùng để chỉnh sửa</span>` +
        `<button class="tool" data-op="add" title="Thêm thùng (N)" aria-keyshortcuts="N">${ICON.add}Thêm thùng</button>`;
  }
  if (selected) {
    const b = selected.userData.box;
    $('selname').textContent = `Thùng ${meshes.indexOf(selected) + 1}`;
    $('seldims').textContent = `${b.l} × ${b.w} × ${b.h} mm`;
  }
}

function setLimit(id, val, max, unit, limiting) {
  $(`k-${id}`).innerHTML = `${fmt(val, 1)}<small> ${unit}</small>`;
  const ratio = max > 0 ? val / max : 0;
  $(`b-${id}`).style.width = Math.min(100, ratio * 100) + '%';
  $(`b-${id}`).className = ratio > 1 + 1e-9 ? 'over' : limiting ? 'lim' : '';
  $(`m-${id}`).textContent = max > 0 ? `tối đa ${fmt(max)} ${unit}` : 'không giới hạn';
}

function finding(v) {
  const r = result, s = spec;
  if (edited) {
    const d = v.count - r.total;
    return d ? `Đã chỉnh sửa: ${d > 0 ? '+' : '−'}${Math.abs(d)} thùng so với phương án tính (${r.total}).`
      : `Đã chỉnh sửa: cùng số thùng với phương án tính (${r.total}).`;
  }
  if (!r.total) return 'Không xếp được thùng nào với kích thước và giới hạn hiện tại.';
  if (r.limit === 'tải trọng') return `Giới hạn bởi tải trọng: thêm 1 thùng sẽ vượt ${fmt(s.maxKg)} kg.`;
  return `Giới hạn bởi chiều cao: còn ${fmt(s.maxH - r.totalHeight)} mm, chưa đủ cho một lớp nữa (${fmt(r.v)} mm).`;
}

function refresh() {
  const bx = boxesOf(), v = verify(bx, spec), r = result;
  lastV = v;

  const levels = [...new Set(bx.map(b => Math.round(b.z)))].sort((a, b) => a - b);
  const cut = $('cut'), all = +cut.value >= +cut.max;
  cut.max = Math.max(1, levels.length);
  if (all) cut.value = cut.max;
  $('cutv').textContent = `${cut.value}/${levels.length}`;
  meshes.forEach((m, i) => {
    const st = v.status[i], lv = levels.indexOf(Math.round(bx[i].z));
    m.material.color.set(st ? STATUS[st][0] : KRAFT[lv % 2]);
    m.material.emissive.set(m === selected ? 0x1b6c80 : 0x000000);
    m.visible = m === selected || lv < +cut.value;
  });

  $('k-count').innerHTML = `${fmt(v.count)}<small> thùng</small>`;
  const full = Math.floor(r.total / r.perLayer), rest = r.total % r.perLayer; // a weight limit can leave the top layer partial
  $('k-count-sub').textContent = edited ? 'đã chỉnh sửa thủ công'
    : r.total ? `${r.perLayer} / lớp × ${full} lớp${rest ? ` + ${rest}` : ''}${r.v !== spec.h ? ' · đặt nằm' : ''}` : '—';
  setLimit('h', v.height + spec.palletH, spec.maxH, 'mm', !edited && r.limit === 'chiều cao');
  setLimit('kg', v.weight, spec.maxKg, 'kg', !edited && r.limit === 'tải trọng');
  $('k-fill').textContent = v.count ? fmt(v.volUtil * 100, 1) + ' %' : '—';
  $('finding').textContent = finding(v);

  const bad = v.status.filter(Boolean).length;
  const kinds = Object.keys(STATUS).map(k => [k, v.status.filter(s => s === k).length]).filter(([, n]) => n);
  const html = !v.count ? '' : bad
    ? `<span class="neg">Kiểm chứng hình học:</span>` +
      kinds.map(([k, n]) => `<button class="chip" data-kind="${k}" title="Chọn lần lượt các thùng ${STATUS[k][1].toLowerCase()}"><i style="background:${hex(STATUS[k][0])}"></i>${STATUS[k][1]} ${n}</button>`).join('') +
      `<span>nhấp để tìm thùng lỗi</span>`
    : `${ICON.check}<span>Kiểm chứng hình học: không va chạm, nằm trong giới hạn, mỗi thùng được đỡ ≥ ${fmt(spec.minSupport * 100)} % đáy. Trọng tâm lệch ${fmt(v.cogOffset)} mm so với tâm pallet.</span>`;
  if (html !== checksHtml) $('checks').innerHTML = checksHtml = html;

  $('pill').className = 'pill ' + (bad ? 'neg' : v.count ? 'pos' : '');
  $('pill').textContent = bad ? `${bad} thùng lỗi` : v.count ? 'Hợp lệ' : 'Trống';
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
  f.maxH.setCustomValidity(+f.maxH.value > +f.palletH.value ? '' : 'phải lớn hơn chiều cao pallet');
  for (const el of form.elements) if (el.name) el.setAttribute('aria-invalid', !el.validity.valid);
  const bad = form.querySelector(':invalid'), err = $('err');
  if (bad) { // the message goes under the field's row; the old result dims so it isn't read as current
    const v = bad.validity;
    const why = v.valueMissing ? 'cần nhập giá trị' : v.rangeUnderflow ? `tối thiểu ${bad.min}` : v.rangeOverflow ? `tối đa ${bad.max}` : bad.validationMessage;
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
$('cut').addEventListener('input', () => spec && refresh());
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
  select(ray.intersectObjects(meshes.filter(m => m.visible), false)[0]?.object ?? null);
});

new ResizeObserver(() => {
  renderer.setSize(view.clientWidth, view.clientHeight);
  camera.aspect = view.clientWidth / view.clientHeight;
  camera.updateProjectionMatrix();
  renderer.render(scene, camera); // setSize clears the buffer; redraw now so the view never flashes empty
}).observe(view);
renderer.setAnimationLoop(() => renderer.render(scene, camera));
calc();
