/* ===========================================================
 * sap1.js  -  BACKEND: SAP-1 architecture model (no DOM code)
 * -----------------------------------------------------------
 * Registers : PC(4) MAR(4) IR(8) A(8) B(8) OUT(8)
 * Memory    : 16 x 8 RAM
 * ALU       : adder/subtractor (2's complement, 8-bit)
 * Controller: 6-state ring counter (T1..T6)
 *   Fetch   T1: PC  -> bus -> MAR        (Ep, Lm)
 *           T2: PC = PC + 1              (Cp)
 *           T3: RAM -> bus -> IR         (CE, Li)
 *   Execute T4-T6 depend on the opcode (see tick()).
 * Each call to tick() advances exactly ONE T-state and returns
 * an event object that the GUI uses to animate the bus.
 * =========================================================== */

const OPCODES = { LDA: 0x0, ADD: 0x1, SUB: 0x2, OUT: 0xE, HLT: 0xF };
const MNEMONICS = { 0x0: 'LDA', 0x1: 'ADD', 0x2: 'SUB', 0xE: 'OUT', 0xF: 'HLT' };
const hex = (v, n = 2) => v.toString(16).toUpperCase().padStart(n, '0');

class SAP1 {
  constructor() {
    this.ram = new Array(16).fill(0);
    this.resetRegisters();
  }

  /** Clear all registers + controller. RAM (the program) is kept. */
  resetRegisters() {
    this.pc = 0; this.mar = 0; this.ir = 0;
    this.a = 0; this.b = 0; this.out = 0;
    this.t = 1;                 // ring counter, 1..6
    this.halted = false;
    this.irValid = false;       // true once the first instruction is fetched
    this.error = null;
    this.aluMode = 'ADD';       // last ALU operation (for display)
    this.instrCount = 0;
  }

  /** Replace RAM contents (array of 16 bytes). */
  loadRam(bytes) {
    this.ram = Array.from({ length: 16 }, (_, i) => (bytes[i] || 0) & 0xFF);
  }

  /** Current adder/subtractor output (always A +/- B, mod 256). */
  get alu() {
    // Subtraction uses 2's complement: A - B = A + (NOT B) + 1
    return this.aluMode === 'SUB' ? (this.a + ((~this.b) & 0xFF) + 1) & 0xFF
                                  : (this.a + this.b) & 0xFF;
  }

  /** Advance one T-state. Returns an event, or null if halted. */
  tick() {
    if (this.halted) return null;

    const ev = { t: this.t, signals: [], bus: null, from: null, to: null,
                 ram: null, text: 'No operation (idle state)', instrDone: false };
    const opcode = this.ir >> 4;
    const operand = this.ir & 0xF;
    const memOp = opcode === OPCODES.LDA || opcode === OPCODES.ADD || opcode === OPCODES.SUB;

    switch (this.t) {
      /* ---------------- FETCH CYCLE ---------------- */
      case 1:   // PC -> MAR
        ev.bus = this.pc; this.mar = this.pc;
        ev.signals = ['Ep', 'Lm']; ev.from = 'PC'; ev.to = 'MAR';
        ev.text = `PC (${hex(this.pc, 1)}H) -> W-Bus -> MAR`;
        break;
      case 2:   // PC++
        this.pc = (this.pc + 1) & 0xF;
        ev.signals = ['Cp']; ev.to = 'PC';
        ev.text = `PC incremented to ${hex(this.pc, 1)}H`;
        break;
      case 3:   // RAM[MAR] -> IR
        ev.bus = this.ram[this.mar]; this.ir = ev.bus; this.irValid = true; ev.ram = this.mar;
        ev.signals = ['CE', 'Li']; ev.from = 'RAM'; ev.to = 'IR';
        ev.text = `RAM[${hex(this.mar, 1)}H] = ${hex(ev.bus)}H -> W-Bus -> IR`;
        break;

      /* --------------- EXECUTE CYCLE --------------- */
      case 4:
        if (memOp) {                      // IR operand -> MAR
          ev.bus = operand; this.mar = operand;
          ev.signals = ['Ei', 'Lm']; ev.from = 'IR'; ev.to = 'MAR';
          ev.text = `${MNEMONICS[opcode]}: IR operand ${hex(operand, 1)}H -> W-Bus -> MAR`;
        } else if (opcode === OPCODES.OUT) { // A -> OUT
          ev.bus = this.a; this.out = this.a;
          ev.signals = ['Ea', 'Lo']; ev.from = 'A'; ev.to = 'OUT';
          ev.text = `OUT: A (${hex(this.a)}H) -> W-Bus -> Output Register`;
        } else if (opcode === OPCODES.HLT) {
          this.halted = true; ev.signals = ['HLT'];
          ev.text = 'HLT: clock stopped';
        } else {
          this.halted = true; this.error = `Illegal opcode ${hex(opcode, 1)}H at address ${hex((this.pc - 1) & 0xF, 1)}H`;
          ev.signals = ['HLT']; ev.text = this.error;
        }
        break;
      case 5:
        if (opcode === OPCODES.LDA) {     // RAM -> A
          ev.bus = this.ram[this.mar]; this.a = ev.bus; ev.ram = this.mar;
          ev.signals = ['CE', 'La']; ev.from = 'RAM'; ev.to = 'A';
          ev.text = `LDA: RAM[${hex(this.mar, 1)}H] = ${hex(ev.bus)}H -> W-Bus -> A`;
        } else if (opcode === OPCODES.ADD || opcode === OPCODES.SUB) { // RAM -> B
          ev.bus = this.ram[this.mar]; this.b = ev.bus; ev.ram = this.mar;
          ev.signals = ['CE', 'Lb']; ev.from = 'RAM'; ev.to = 'B';
          ev.text = `${MNEMONICS[opcode]}: RAM[${hex(this.mar, 1)}H] = ${hex(ev.bus)}H -> W-Bus -> B`;
        }
        break;
      case 6:
        if (opcode === OPCODES.ADD || opcode === OPCODES.SUB) {  // ALU -> A
          const sub = opcode === OPCODES.SUB;
          this.aluMode = sub ? 'SUB' : 'ADD';
          const before = this.a;
          this.a = this.alu; ev.bus = this.a;
          ev.signals = sub ? ['Su', 'Eu', 'La'] : ['Eu', 'La'];
          ev.from = 'ALU'; ev.to = 'A';
          ev.text = `${hex(before)}H ${sub ? '-' : '+'} ${hex(this.b)}H = ${hex(this.a)}H -> W-Bus -> A`;
        }
        break;
    }

    // advance ring counter; instruction ends after T6 (or on halt)
    if (this.halted) {
      ev.instrDone = true; this.instrCount++;
    } else if (this.t === 6) {
      this.t = 1; ev.instrDone = true; this.instrCount++;
    } else {
      this.t++;
    }
    return ev;
  }
}

if (typeof module !== 'undefined') module.exports = { SAP1, OPCODES, MNEMONICS };
