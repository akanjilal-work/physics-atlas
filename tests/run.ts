// Numerical sanity checks for every topic's physics module.
// Run with: npm test
import { suites as dp } from './topics/double-pendulum.ts';
import { suites as tr } from './topics/tennis-racket.ts';
import { suites as sr } from './topics/special-relativity.ts';
import { suites as gr } from './topics/curved-spacetime.ts';
import { suites as qt } from './topics/quantum-tunneling.ts';
import { suites as st } from './topics/vibrating-strings.ts';
import { suites as tb } from './topics/three-body.ts';
import { suites as tw } from './topics/twin-paradox.ts';
import { suites as hy } from './topics/hydrogen-orbitals.ts';
import { suites as ds } from './topics/double-slit.ts';
import { suites as cy } from './topics/calabi-yau.ts';
import { suites as br } from './topics/branes.ts';
import { suites as s0 } from './topics/lagrange-points.ts';
import { suites as s1 } from './topics/normal-modes.ts';
import { suites as s2 } from './topics/gyroscope.ts';
import { suites as s3 } from './topics/black-hole-lensing.ts';
import { suites as s4 } from './topics/gravitational-waves.ts';
import { suites as s5 } from './topics/spin-bloch.ts';
import { suites as s6 } from './topics/entanglement.ts';
import { suites as s7 } from './topics/uncertainty.ts';
import { suites as s8 } from './topics/holography.ts';
import { suites as s9 } from './topics/foucault-pendulum.ts';
import { suites as s10 } from './topics/kerr-black-hole.ts';
import { suites as s11 } from './topics/cosmic-expansion.ts';
import { suites as s12 } from './topics/quantum-oscillator.ts';
import { suites as s13 } from './topics/grover-search.ts';
import { suites as s14 } from './topics/cosmic-strings.ts';
import { suites as s15 } from './topics/em-waves.ts';
import { suites as s16 } from './topics/magnetic-fields.ts';
import { suites as s17 } from './topics/rainbows.ts';
import { suites as s18 } from './topics/ising-model.ts';
import { suites as s19 } from './topics/maxwells-demon.ts';
import { suites as s20 } from './topics/brownian-motion.ts';

const all: Record<string, () => string | void> = { ...dp, ...tr, ...sr, ...gr, ...qt, ...st, ...tb, ...tw, ...hy, ...ds, ...cy, ...br, ...s0, ...s1, ...s2, ...s3, ...s4, ...s5, ...s6, ...s7, ...s8, ...s9, ...s10, ...s11, ...s12, ...s13, ...s14, ...s15, ...s16, ...s17, ...s18, ...s19, ...s20 };
let failed = 0;
for (const [name, fn] of Object.entries(all)) {
  try {
    const notes = fn();
    console.log(`✓ ${name}${notes ? `  (${notes})` : ''}`);
  } catch (e) {
    failed++;
    console.log(`✗ ${name}\n    ${(e as Error).message}`);
  }
}
if (failed) {
  console.log(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log(`\nAll ${Object.keys(all).length} physics checks passed`);
