# Group 11 SAP-1 Simulator

A browser-based simulator of SAP-1 computer. It shows the registers, the W-bus, the control signals, the 16x8 RAM and an 8-LED output display, and it executes SAP-1 machine programs in T-state, one instruction, or continously.

# Running and Installs
This project has no dependencies and no build steps.

How to run:
1. Download or clone this repo.
2. Open 'index.html' and run.

# Language and Framework
**Plain HTML, CSS and JavaScript with no framework.
- This project is small, so a framework would just be more work without adding any benefit.
- The user has nothing to install in order for this project to work as it is only a web based SAP-1 simulator.
- The CPU model is written with no DOM code, which keeps the backend and frontend seperated and makes the logic testable in NODE.

# Files
| File | Role |
| --- | --- |
| `sap1.js` | **Backend.** `SAP1` class: RAM, PC, MAR, IR, A, B, OUT, adder/subtractor, controller-sequencer (T1-T6 ring counter). |
| `index.html` | Page structure. |
| `style.css` | Styling. |
| `app.js` | **Frontend.** Draws registers/bus/LEDs/RAM, wires buttons, program loader. |

# How to use
1. Type the three hex values in A, B, C and click Build A + B - C, or build any program manually in the "Load Program table", then click "Load to RAM".
2. "Step" runs one full instruction which is animated by T-state to T-state, "T-state" runs a single clock pulse, "Run" executes until the HLT executes, "Reset" clears the registers but not the RAM.
3. Use the "Delay" slider to change the speed of the execution to follow it easily.

# Instruction Set
| Mnemonic | Opcode | Operation |
| --- | --- | --- |
| LDA addr | 0000 | A <- RAM[addr] |
| ADD addr | 0001 | A <- A + RAM[addr] |
| SUB addr | 0010 | A <- A - RAM[addr] (2's complement) |
| OUT | 1110 | Output <- A |
| HLT | 1111 | Stop the clock |

# Instruction Cycle
| T-state | Fetch (all instructions) | Signals |
| --- | --- | --- |
| T1 | PC -> W-Bus -> MAR | Ep, Lm |
| T2 | PC <- PC + 1 | Cp |
| T3 | RAM[MAR] -> W-Bus -> IR | CE, Li |

| T-state | LDA | ADD / SUB | OUT |
| --- | --- | --- | --- |
| T4 | IR operand -> MAR (Ei, Lm) | IR operand -> MAR (Ei, Lm) | A -> Output (Ea, Lo) |
| T5 | RAM -> A (CE, La) | RAM -> B (CE, Lb) | nop |
| T6 | nop | ALU -> A (Eu, La; Su for SUB) | nop |

# Sample
| Addr | Instruction | Machine code |
| --- | --- | --- |
| 0H | LDA 9H | 0000 1001 |
| 1H | ADD AH | 0001 1010 |
| 2H | SUB BH | 0010 1011 |
| 3H | OUT | 1110 1111 |
| 4H | HLT | 1111 1111 |
| 9H, AH, BH | data (entered by the user) | 25H, 05H, 23H |

The results are 8-bit, a negative result is shown in 2's complement.

