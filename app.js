const cpu = new SAP1();
const $ = id => document.getElementById(id);
const bin = (v, n) => v.toString(2).padStart(n, '0');
const fmtBin = (v, n) => n === 8 ? bin(v, 8).replace(/(\d{4})(\d{4})/, '$1 $2') : bin(v, n);

/*Block Diagram: */
const PANELS = [
  { id: 'PC',  title: 'Program Counter (PC)',    bits: 4, row: 'rowTop',    get: () => cpu.pc },
  { id: 'MAR', title: 'Memory Address Reg (MAR)', bits: 4, row: 'rowTop',    get: () => cpu.mar },
  { id: 'IR',  title: 'Instruction Register (IR)', bits: 8, row: 'rowTop',   get: () => cpu.ir },
  { id: 'A',   title: 'Accumulator (A)',          bits: 8, row: 'rowBottom', get: () => cpu.a },
  { id: 'ALU', title: 'Adder / Subtractor',       bits: 8, row: 'rowBottom', get: () => cpu.alu },
  { id: 'B',   title: 'B Register',               bits: 8, row: 'rowBottom', get: () => cpu.b },
  { id: 'OUT', title: 'Output Register',          bits: 8, row: 'rowBottom', get: () => cpu.out },
];
const last = {};
PANELS.forEach(p => {
  const d = document.createElement('div');
  d.className = 'panel'; d.id = 'p-' + p.id;
  d.innerHTML = `<h3>${p.title}</h3><div class="bin"></div><div class="hex"></div><div class="extra"></div>` +
                (p.id === 'OUT' ? '<div class="leds">' + '<span class="led"></span>'.repeat(8) + '</div>' : '');
  $(p.row).appendChild(d);
});

const SIGNALS = ['Ep', 'Cp', 'Lm', 'CE', 'Li', 'Ei', 'La', 'Ea', 'Su', 'Eu', 'Lb', 'Lo', 'HLT'];
$('signals').innerHTML = SIGNALS.map(s => `<span data-s="${s}">${s}</span>`).join('');
$('tstates').innerHTML = [1, 2, 3, 4, 5, 6].map(n => `<span data-t="${n}">T${n}</span>`).join('');
$('ramTable').tBody = $('ramTable').querySelector('tbody');

/*Painting: */
function decode(byte) {
  const op = byte >> 4, arg = byte & 15;
  if (op in MNEMONICS) return (op === 0xE || op === 0xF) ? MNEMONICS[op] : `${MNEMONICS[op]} ${hex(arg, 1)}H`;
  return '';
}

function paint(ev) {
  // registers
  PANELS.forEach(p => {
    const v = p.get(), el = $('p-' + p.id);
    el.querySelector('.bin').textContent = fmtBin(v, p.bits);
    el.querySelector('.hex').textContent = hex(v, p.bits / 4) + 'H';
    if (last[p.id] !== undefined && last[p.id] !== v) {
      el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash');
    }
    last[p.id] = v;
  });
  $('p-IR').querySelector('.extra').textContent = cpu.irValid && decode(cpu.ir) ? `opcode ${bin(cpu.ir >> 4, 4)} | operand ${bin(cpu.ir & 15, 4)}  (${decode(cpu.ir)})` : '';
  $('p-ALU').querySelector('.extra').textContent = cpu.aluMode === 'SUB' ? 'A - B (2\'s complement)' : 'A + B';
  document.querySelectorAll('#p-OUT .led').forEach((led, i) => led.classList.toggle('on', (cpu.out >> (7 - i)) & 1));

  // highlights, bus, signals
  document.querySelectorAll('.src, .dst').forEach(e => e.classList.remove('src', 'dst'));
  const bus = $('bus');
  if (ev && ev.bus !== null) {
    bus.classList.add('active');
    $('busBits').textContent = fmtBin(ev.bus, 8);
    $('busInfo').textContent = ev.from && ev.to ? `${ev.from} \u2192 ${ev.to}` : '';
  } else {
    bus.classList.remove('active');
    $('busBits').textContent = '--------';
    $('busInfo').textContent = ev && ev.to === 'PC' ? 'PC counting (no bus use)' : 'idle';
  }
  if (ev) {
    if (ev.from) $('p-' + ev.from).classList.add('src');
    if (ev.to)   $('p-' + ev.to).classList.add('dst');
  }
  document.querySelectorAll('#signals span').forEach(s => s.classList.toggle('on', !!ev && ev.signals.includes(s.dataset.s)));
  document.querySelectorAll('#tstates span').forEach(s => s.classList.toggle('on', !!ev && +s.dataset.t === ev.t));

  paintRam(ev);
  $('btnStep').disabled = $('btnTick').disabled = cpu.halted;
  $('btnRun').disabled = cpu.halted;
}

let kinds = new Array(16).fill('DATA');   // kung san na enter na row si ram
function paintRam(ev) {
  const hit = ev ? ev.ram : null;
  $('ramTable').tBody.innerHTML = cpu.ram.map((v, i) =>
    `<tr class="${i === cpu.pc && !cpu.halted ? 'pc' : ''} ${i === hit ? 'hit' : ''}">` +
    `<td>${hex(i, 1)}H</td><td>${fmtBin(v, 8)}</td><td>${hex(v)}H</td><td>${kinds[i] !== 'DATA' ? decode(v) : ''}</td></tr>`).join('');
  $('p-RAM').classList.toggle('src', hit !== null);
  if (hit !== null) $('p-RAM').classList.add('src');
}

function logEvent(ev) {
  const li = document.createElement('li');
  li.innerHTML = `<b>T${ev.t}</b>${ev.text}`;
  $('log').appendChild(li);
  if (ev.instrDone) {
    const d = document.createElement('li');
    d.className = 'done'; d.textContent = cpu.halted ? '--- halted ---' : `--- instruction ${cpu.instrCount} complete ---`;
    $('log').appendChild(d);
  }
  while ($('log').children.length > 80) $('log').removeChild($('log').firstChild);
  $('log').scrollTop = $('log').scrollHeight;
}

/*Execution Control*/
let running = false, timer = null;
const delay = () => +$('speed').value;

function doTick() {
  const ev = cpu.tick();
  if (!ev) return null;
  paint(ev); logEvent(ev);
  if (cpu.error) showMsg(cpu.error, true);
  return ev;
}
function stop() { running = false; clearTimeout(timer); $('btnRun').textContent = 'Run'; paint(null); }

function runLoop(untilInstrDone) {
  if (running) return;
  running = true; $('btnRun').textContent = 'Pause';
  const go = () => {
    const ev = doTick();
    if (!ev || cpu.halted || (untilInstrDone && ev.instrDone)) {
      running = false; $('btnRun').textContent = 'Run';
      $('btnRun').disabled = cpu.halted; $('btnStep').disabled = $('btnTick').disabled = cpu.halted;
      return;
    }
    timer = setTimeout(go, delay());
  };
  go();
}

$('btnStep').onclick = () => { if (!running) runLoop(true); };
$('btnTick').onclick = () => { if (!running) doTick(); };
$('btnRun').onclick  = () => { running ? stop() : runLoop(false); };
$('btnReset').onclick = () => {
  stop(); cpu.resetRegisters(); $('log').innerHTML = ''; showMsg('Registers reset. RAM kept.', false);
  Object.keys(last).forEach(k => delete last[k]); paint(null);
  $('btnRun').disabled = $('btnStep').disabled = $('btnTick').disabled = false;
};
$('speed').oninput = () => $('speedVal').textContent = delay() + ' ms';

/*Program Loader*/
const MNS = ['LDA', 'ADD', 'SUB', 'OUT', 'HLT', 'DATA'];
const edBody = $('editor').querySelector('tbody');
for (let i = 0; i < 16; i++) {
  const tr = document.createElement('tr');
  tr.innerHTML = `<td>${hex(i, 1)}H</td>
    <td><select>${MNS.map(m => `<option>${m}</option>`).join('')}</select></td>
    <td><input maxlength="2" spellcheck="false"></td>`;
  const sel = tr.querySelector('select'), inp = tr.querySelector('input');
  sel.value = 'DATA';
  sel.onchange = () => syncRow(sel, inp);
  syncRow(sel, inp);
  edBody.appendChild(tr);
}
function syncRow(sel, inp) {
  const noArg = sel.value === 'OUT' || sel.value === 'HLT';
  inp.disabled = noArg; inp.classList.remove('bad');
  if (noArg) inp.value = '';
  inp.placeholder = sel.value === 'DATA' ? 'data (00-FF)' : noArg ? '' : 'address (0-F)';
}
function setRow(i, mn, val) {
  const r = edBody.children[i], sel = r.querySelector('select'), inp = r.querySelector('input');
  sel.value = mn; syncRow(sel, inp); inp.value = val;
}
function showMsg(t, err) { $('msg').textContent = t; $('msg').className = 'msg ' + (err ? 'err' : 'ok'); }

/**Read, validate, encode*/
function readEditor() {
  const bytes = []; let ok = true;
  [...edBody.children].forEach((r, i) => {
    const mn = r.querySelector('select').value, inp = r.querySelector('input'), txt = inp.value.trim();
    inp.classList.remove('bad');
    let b = 0;
    if (mn === 'OUT') b = (OPCODES.OUT << 4) | 0xF;
    else if (mn === 'HLT') b = (OPCODES.HLT << 4) | 0xF;
    else {
      const max = mn === 'DATA' ? 0xFF : 0xF;
      const v = parseInt(txt || (mn === 'DATA' ? '0' : 'x'), 16);
      if (!/^[0-9a-f]{1,2}$/i.test(txt || (mn === 'DATA' ? '0' : 'x')) || isNaN(v) || v > max) { inp.classList.add('bad'); ok = false; }
      b = mn === 'DATA' ? v : (OPCODES[mn] << 4) | (v & 0xF);
    }
    bytes[i] = b & 0xFF;
  });
  return ok ? bytes : null;
}

$('btnLoad').onclick = () => {
  const bytes = readEditor();
  if (!bytes) return showMsg('Fix the highlighted fields (hex only; address 0-F, data 00-FF).', true);
  kinds = [...edBody.children].map(r => r.querySelector('select').value);
  stop(); cpu.loadRam(bytes); cpu.resetRegisters(); $('log').innerHTML = '';
  Object.keys(last).forEach(k => delete last[k]); paint(null);
  $('btnRun').disabled = $('btnStep').disabled = $('btnTick').disabled = false;
  showMsg('Program loaded into RAM. Press Step or Run.', false);
};
$('btnClear').onclick = () => { for (let i = 0; i < 16; i++) setRow(i, 'DATA', ''); showMsg('Editor cleared. Press "Load into RAM" to apply.', false); };

/* Formula builder: */
const defaults = { A: '25', B: '05', C: '23' };
function parseFormula() {
  const f = $('formula').value.toUpperCase().replace(/\u2212/g, '-').replace(/\s+/g, '');
  if (!/^[A-Z]([+-][A-Z])*$/.test(f)) return null;
  const terms = [{ sign: '+', v: f[0] }];
  for (let i = 1; i < f.length; i += 2) terms.push({ sign: f[i], v: f[i + 1] });
  return terms;
}
function syncVars() {
  const box = $('vars'), old = {};
  box.querySelectorAll('input').forEach(i => old[i.dataset.v] = i.value);
  box.innerHTML = '';
  const t = parseFormula();
  if (!t) return;
  [...new Set(t.map(x => x.v))].forEach(v => {
    const lab = document.createElement('label');
    lab.innerHTML = `${v} <input data-v="${v}" maxlength="2" value="${old[v] ?? defaults[v] ?? '00'}">`;
    box.appendChild(lab);
  });
}
$('formula').oninput = syncVars;

$('btnQuick').onclick = () => {
  const t = parseFormula();
  if (!t) return showMsg('Formula: letters joined by + or - only, starting with a letter (e.g. A - B + C).', true);
  const vars = [...new Set(t.map(x => x.v))], vals = {};
  for (const inp of $('vars').querySelectorAll('input')) {
    if (!/^[0-9a-f]{1,2}$/i.test(inp.value.trim())) return showMsg('Each value must be 1-2 hex digits (00-FF).', true);
    vals[inp.dataset.v] = inp.value.trim().toUpperCase();
  }
  const start = Math.max(t.length + 2, 9);            // data goes after HLT (at 9H like the sample)
  if (start + vars.length > 16) return showMsg('Formula too long for the 16-byte RAM.', true);
  const addr = {}; vars.forEach((v, i) => addr[v] = start + i);
  for (let i = 0; i < 16; i++) setRow(i, 'DATA', '');
  t.forEach((x, i) => setRow(i, i === 0 ? 'LDA' : x.sign === '+' ? 'ADD' : 'SUB', hex(addr[x.v], 1)));
  setRow(t.length, 'OUT', ''); setRow(t.length + 1, 'HLT', '');
  vars.forEach(v => setRow(addr[v], 'DATA', vals[v]));
  $('btnLoad').click();
};

/* Istart-up*/
syncVars();
$('btnQuick').click();
