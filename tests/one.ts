// Run one topic's physics checks: node --experimental-strip-types tests/one.ts <topic-id>
const id = process.argv[2];
if (!id) {
  console.log('usage: npm run test:one -- <topic-id>');
  process.exit(1);
}
const { suites } = (await import(`./topics/${id}.ts`)) as { suites: Record<string, () => string | void> };
let failed = 0;
for (const [name, fn] of Object.entries(suites)) {
  try {
    const notes = fn();
    console.log(`\u2713 ${name}${notes ? `  (${notes})` : ''}`);
  } catch (e) {
    failed++;
    console.log(`\u2717 ${name}\n    ${(e as Error).message}`);
  }
}
console.log(failed ? `\n${failed} failed` : `\nAll ${Object.keys(suites).length} checks passed`);
process.exit(failed ? 1 : 0);
export {};
