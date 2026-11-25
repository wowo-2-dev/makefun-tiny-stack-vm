// Tiny stack VM, ISA v1 (see kit generator/subject/ISA.md).
// One run answers every instance in /input (or $MAKEFUN_INPUT_DIR):
// for each <id>/program.bin + <id>/input.bin it writes
// <id>/stdout.bin (exact bytes the program wrote) and <id>/exit.txt
// (its exit code, 0-255). Faithful to the kit reference vm.mjs:
// same trap order, same trap codes, same wrapping arithmetic.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// [immediate bytes, pops, pushes] per opcode; undefined = unknown opcode.
const OPS = new Map([
  [0x00, [0, 0, 0]], [0x01, [1, 0, 1]], [0x02, [4, 0, 1]],
  [0x03, [0, 1, 0]], [0x04, [0, 1, 2]], [0x05, [0, 2, 2]],
  [0x06, [0, 2, 3]], [0x07, [0, 3, 3]],
  [0x10, [0, 2, 1]], [0x11, [0, 2, 1]], [0x12, [0, 2, 1]],
  [0x13, [0, 2, 1]], [0x14, [0, 2, 1]], [0x15, [0, 2, 1]],
  [0x16, [0, 2, 1]], [0x17, [0, 1, 1]], [0x18, [0, 2, 1]],
  [0x19, [0, 2, 1]], [0x1a, [0, 2, 1]], [0x1b, [0, 1, 1]],
  [0x1c, [0, 2, 1]], [0x1d, [0, 2, 1]], [0x1e, [0, 2, 1]],
  [0x20, [0, 2, 1]], [0x21, [0, 2, 1]], [0x22, [0, 2, 1]],
  [0x30, [2, 0, 0]], [0x31, [2, 1, 0]], [0x32, [2, 1, 0]],
  [0x33, [2, 0, 0]], [0x34, [0, 0, 0]],
  [0x40, [0, 1, 1]], [0x41, [0, 2, 0]],
  [0x50, [0, 1, 0]], [0x51, [0, 1, 0]], [0x52, [0, 0, 1]],
  [0x53, [0, 1, 0]],
]);

function run(p, input) {
  const n = p.length;
  const D = new Int32Array(256); // data stack
  const C = new Int32Array(64);  // call stack (return addresses)
  const M = new Int32Array(256); // memory, zeroed
  const out = new Uint8Array(65536);
  let sp = 0, csp = 0, olen = 0, inPos = 0, pc = 0, steps = 0;
  for (;;) {
    if (steps === 1000000) return [out.subarray(0, olen), 10];
    if (pc < 0 || pc >= n) return [out.subarray(0, olen), 9];
    const op = OPS.get(p[pc]);
    if (op === undefined) return [out.subarray(0, olen), 5];
    const imm = op[0], pops = op[1], pushes = op[2];
    if (pc + imm >= n) return [out.subarray(0, olen), 9];
    steps++;
    const next = pc + 1 + imm;
    if (sp < pops) return [out.subarray(0, olen), 2];
    if (sp - pops + pushes > 256) return [out.subarray(0, olen), 3];
    const oc = p[pc]; // opcode byte, read before pc advances
    pc = next;
    switch (oc) {
      case 0x00: return [out.subarray(0, olen), 0];
      case 0x01: D[sp++] = (p[next - 1] << 24) >> 24; break; // PUSH8 sign-extended
      case 0x02: // PUSH32 little-endian signed
        D[sp++] = p[next - 4] | (p[next - 3] << 8) | (p[next - 2] << 16) | (p[next - 1] << 24);
        break;
      case 0x03: sp--; break;
      case 0x04: D[sp] = D[sp - 1]; sp++; break;
      case 0x05: { const t = D[sp - 1]; D[sp - 1] = D[sp - 2]; D[sp - 2] = t; break; }
      case 0x06: D[sp] = D[sp - 2]; sp++; break;
      case 0x07: { const a = D[sp - 3]; D[sp - 3] = D[sp - 2]; D[sp - 2] = D[sp - 1]; D[sp - 1] = a; break; }
      case 0x17: D[sp - 1] = -D[sp - 1] | 0; break;
      case 0x1b: D[sp - 1] = ~D[sp - 1]; break;
      case 0x10: case 0x11: case 0x12: case 0x13: case 0x14: case 0x15:
      case 0x16: case 0x18: case 0x19: case 0x1a: case 0x1c: case 0x1d:
      case 0x1e: case 0x20: case 0x21: case 0x22: {
        const b = D[sp - 1], a = D[sp - 2];
        let r = 0;
        if (oc === 0x10) r = (a + b) | 0;
        else if (oc === 0x11) r = (a - b) | 0;
        else if (oc === 0x12) r = Math.imul(a, b);
        else if (oc === 0x13) {
          if (b === 0) return [out.subarray(0, olen), 4];
          r = a === -2147483648 && b === -1 ? a : (a / b) | 0;
        } else if (oc === 0x14) {
          if (b === 0) return [out.subarray(0, olen), 4];
          r = b === -1 ? 0 : (a % b) | 0;
        } else if (oc === 0x15) {
          if (b === 0) return [out.subarray(0, olen), 4];
          r = Math.floor((a >>> 0) / (b >>> 0)) | 0;
        } else if (oc === 0x16) {
          if (b === 0) return [out.subarray(0, olen), 4];
          r = ((a >>> 0) % (b >>> 0)) | 0;
        } else if (oc === 0x18) r = a & b;
        else if (oc === 0x19) r = a | b;
        else if (oc === 0x1a) r = a ^ b;
        else if (oc === 0x1c) r = a << (b & 31);
        else if (oc === 0x1d) r = a >> (b & 31);
        else if (oc === 0x1e) r = (a >>> (b & 31)) | 0;
        else if (oc === 0x20) r = a === b ? 1 : 0;
        else if (oc === 0x21) r = a < b ? 1 : 0;
        else r = (a >>> 0) < (b >>> 0) ? 1 : 0;
        sp -= 2; D[sp++] = r;
        break;
      }
      case 0x30: case 0x31: case 0x32: {
        const rel = ((p[next - 2] | (p[next - 1] << 8)) << 16) >> 16;
        let take = true;
        if (oc !== 0x30) { const v = D[--sp]; take = oc === 0x31 ? v === 0 : v !== 0; }
        if (take) pc = next + rel;
        break;
      }
      case 0x33:
        if (csp === 64) return [out.subarray(0, olen), 7];
        C[csp++] = next; pc = p[next - 2] | (p[next - 1] << 8);
        break;
      case 0x34:
        if (csp === 0) return [out.subarray(0, olen), 8];
        pc = C[--csp];
        break;
      case 0x40: {
        const addr = D[sp - 1];
        if (addr < 0 || addr >= 256) return [out.subarray(0, olen), 6];
        D[sp - 1] = M[addr];
        break;
      }
      case 0x41: {
        const addr = D[sp - 1], v = D[sp - 2];
        if (addr < 0 || addr >= 256) return [out.subarray(0, olen), 6];
        sp -= 2; M[addr] = v;
        break;
      }
      case 0x50: {
        const bytes = Buffer.from(String(D[sp - 1]));
        if (olen + bytes.length > 65536) return [out.subarray(0, olen), 11];
        sp--; out.set(bytes, olen); olen += bytes.length;
        break;
      }
      case 0x51:
        if (olen + 1 > 65536) return [out.subarray(0, olen), 11];
        out[olen++] = D[--sp] & 255;
        break;
      case 0x52: D[sp++] = inPos < input.length ? input[inPos++] : -1; break;
      case 0x53: return [out.subarray(0, olen), D[--sp] & 255];
    }
  }
}

const I = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const O = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
for (const id of readdirSync(I).sort()) {
  const dir = join(I, id);
  let prog;
  try { prog = readFileSync(join(dir, 'program.bin')); } catch { continue; }
  let input = Buffer.alloc(0);
  try { input = readFileSync(join(dir, 'input.bin')); } catch { /* no input */ }
  const [stdout, exit] = run(prog, input);
  mkdirSync(join(O, id), { recursive: true });
  writeFileSync(join(O, id, 'stdout.bin'), stdout);
  writeFileSync(join(O, id, 'exit.txt'), String(exit) + '\n');
}
