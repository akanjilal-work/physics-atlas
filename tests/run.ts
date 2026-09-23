// Numerical sanity checks for every topic's physics module.
// Run with: npm test
import { suites as dp } from './topics/double-pendulum.ts';
import { suites as tr } from './topics/tennis-racket.ts';
import { suites as sr } from './topics/special-relativity.ts';
import { suites as gr } from './topics/curved-spacetime.ts';
import { suites as qt } from './topics/quantum-tunneling.ts';
import { suites as st } from './topics/vibrating-strings.ts';

const all: Record<string, () => string | void> = { ...dp, ...tr, ...sr, ...gr, ...qt, ...st };
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
