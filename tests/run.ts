// Numerical sanity checks for every topic's physics module.
// Run with: npm test
import { suites as s0 } from './topics/double-pendulum.ts';
import { suites as s1 } from './topics/tennis-racket.ts';
import { suites as s2 } from './topics/three-body.ts';
import { suites as s3 } from './topics/lagrange-points.ts';
import { suites as s4 } from './topics/normal-modes.ts';
import { suites as s5 } from './topics/gyroscope.ts';
import { suites as s6 } from './topics/foucault-pendulum.ts';
import { suites as s7 } from './topics/em-waves.ts';
import { suites as s8 } from './topics/magnetic-fields.ts';
import { suites as s9 } from './topics/rainbows.ts';
import { suites as s10 } from './topics/ising-model.ts';
import { suites as s11 } from './topics/maxwells-demon.ts';
import { suites as s12 } from './topics/brownian-motion.ts';
import { suites as s13 } from './topics/special-relativity.ts';
import { suites as s14 } from './topics/curved-spacetime.ts';
import { suites as s15 } from './topics/twin-paradox.ts';
import { suites as s16 } from './topics/black-hole-lensing.ts';
import { suites as s17 } from './topics/gravitational-waves.ts';
import { suites as s18 } from './topics/kerr-black-hole.ts';
import { suites as s19 } from './topics/cosmic-expansion.ts';
import { suites as s20 } from './topics/quantum-tunneling.ts';
import { suites as s21 } from './topics/hydrogen-orbitals.ts';
import { suites as s22 } from './topics/double-slit.ts';
import { suites as s23 } from './topics/spin-bloch.ts';
import { suites as s24 } from './topics/entanglement.ts';
import { suites as s25 } from './topics/uncertainty.ts';
import { suites as s26 } from './topics/quantum-oscillator.ts';
import { suites as s27 } from './topics/grover-search.ts';
import { suites as s28 } from './topics/vibrating-strings.ts';
import { suites as s29 } from './topics/calabi-yau.ts';
import { suites as s30 } from './topics/branes.ts';
import { suites as s31 } from './topics/holography.ts';
import { suites as s32 } from './topics/cosmic-strings.ts';
import { suites as s33 } from './topics/lorenz-attractor.ts';
import { suites as s34 } from './topics/solitons.ts';
import { suites as s35 } from './topics/kepler-slingshot.ts';
import { suites as s36 } from './topics/rattleback.ts';
import { suites as s37 } from './topics/superconductivity.ts';
import { suites as s38 } from './topics/maxwell-fields.ts';
import { suites as s39 } from './topics/lasers.ts';
import { suites as s40 } from './topics/cherenkov.ts';
import { suites as s41 } from './topics/carnot-engines.ts';
import { suites as s42 } from './topics/percolation.ts';
import { suites as s43 } from './topics/bose-einstein.ts';
import { suites as s44 } from './topics/wormholes.ts';
import { suites as s45 } from './topics/hawking-radiation.ts';
import { suites as s46 } from './topics/relativistic-visuals.ts';
import { suites as s47 } from './topics/quantum-teleportation.ts';
import { suites as s48 } from './topics/shor-algorithm.ts';
import { suites as s49 } from './topics/quantum-zeno.ts';
import { suites as s50 } from './topics/band-structure.ts';
import { suites as s51 } from './topics/supersymmetry.ts';
import { suites as s52 } from './topics/string-landscape.ts';
import { suites as s53 } from './topics/standard-model.ts';
import { suites as s54 } from './topics/neutrino-oscillations.ts';
import { suites as s55 } from './topics/solar-fusion.ts';
import { suites as s56 } from './topics/nuclear-binding.ts';
import { suites as s57 } from './topics/stellar-evolution.ts';
import { suites as s58 } from './topics/neutron-stars.ts';
import { suites as s59 } from './topics/dark-matter.ts';
import { suites as s60 } from './topics/exoplanet-transits.ts';
import { suites as s61 } from './topics/vortex-rings.ts';
import { suites as s62 } from './topics/karman-street.ts';
import { suites as s63 } from './topics/chladni-figures.ts';
import { suites as s64 } from './topics/doppler-effect.ts';

const all: Record<string, () => string | void> = { ...s0, ...s1, ...s2, ...s3, ...s4, ...s5, ...s6, ...s7, ...s8, ...s9, ...s10, ...s11, ...s12, ...s13, ...s14, ...s15, ...s16, ...s17, ...s18, ...s19, ...s20, ...s21, ...s22, ...s23, ...s24, ...s25, ...s26, ...s27, ...s28, ...s29, ...s30, ...s31, ...s32, ...s33, ...s34, ...s35, ...s36, ...s37, ...s38, ...s39, ...s40, ...s41, ...s42, ...s43, ...s44, ...s45, ...s46, ...s47, ...s48, ...s49, ...s50, ...s51, ...s52, ...s53, ...s54, ...s55, ...s56, ...s57, ...s58, ...s59, ...s60, ...s61, ...s62, ...s63, ...s64 };
let failed = 0;
for (const [name, fn] of Object.entries(all)) {
  try {
    const notes = fn();
    console.log(`\u2713 ${name}${notes ? `  (${notes})` : ''}`);
  } catch (e) {
    failed++;
    console.log(`\u2717 ${name}\n    ${(e as Error).message}`);
  }
}
if (failed) {
  console.log(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log(`\nAll ${Object.keys(all).length} physics checks passed`);
