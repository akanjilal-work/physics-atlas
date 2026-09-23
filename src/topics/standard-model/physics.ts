// Standard Model data, conservation-law checker and Higgs potential.
// Pure module: no DOM, no Three.js. Masses from the PDG 2026 Summary Tables.

export type Category = 'quark' | 'lepton' | 'gauge' | 'scalar';

export interface SMParticle {
  id: string;
  symbol: string;
  name: string;
  category: Category;
  /** Mass in GeV. 0 for massless or for neutrinos (no measured mass). */
  massGeV: number;
  /** Human-readable mass with uncertainty or limit. */
  massText: string;
  /** Electric charge in units of e. For W± this is +1 (the W⁻ is its antiparticle). */
  charge: number;
  chargeText: string;
  spin: number;
  colour: string;
  generation: 1 | 2 | 3 | null;
  interactions: string[];
  note: string;
  /** Standard chart position: column 0..4, row 0..3. */
  col: number;
  row: number;
}

const STRONG = 'strong';
const EM = 'electromagnetic';
const WEAK = 'weak';

/** The 17 fundamental particles of the Standard Model (antiparticles not counted separately). */
export const PARTICLES: SMParticle[] = [
  { id: 'u', symbol: 'u', name: 'up quark', category: 'quark', massGeV: 2.16e-3, massText: '2.16 ± 0.07 MeV', charge: 2 / 3, chargeText: '+2/3', spin: 0.5, colour: 'red, green or blue', generation: 1, interactions: [STRONG, EM, WEAK], note: 'Mass is the MS-bar value at 2 GeV. Quarks are never free, so "mass" is a parameter in the theory, not a weighed object.', col: 0, row: 0 },
  { id: 'c', symbol: 'c', name: 'charm quark', category: 'quark', massGeV: 1.2729, massText: '1.2729 ± 0.0045 GeV', charge: 2 / 3, chargeText: '+2/3', spin: 0.5, colour: 'red, green or blue', generation: 2, interactions: [STRONG, EM, WEAK], note: 'MS-bar mass m_c(m_c). Discovered in 1974 inside the J/ψ meson.', col: 1, row: 0 },
  { id: 't', symbol: 't', name: 'top quark', category: 'quark', massGeV: 172.6, massText: '172.60 ± 0.27 GeV', charge: 2 / 3, chargeText: '+2/3', spin: 0.5, colour: 'red, green or blue', generation: 3, interactions: [STRONG, EM, WEAK], note: 'The heaviest known elementary particle, close to a gold atom in mass. It decays in about 5×10⁻²⁵ s, before it can form hadrons.', col: 2, row: 0 },
  { id: 'd', symbol: 'd', name: 'down quark', category: 'quark', massGeV: 4.70e-3, massText: '4.70 ± 0.07 MeV', charge: -1 / 3, chargeText: '−1/3', spin: 0.5, colour: 'red, green or blue', generation: 1, interactions: [STRONG, EM, WEAK], note: 'MS-bar mass at 2 GeV. The down quark is heavier than the up quark, which is why the neutron outweighs the proton.', col: 0, row: 1 },
  { id: 's', symbol: 's', name: 'strange quark', category: 'quark', massGeV: 92.9e-3, massText: '92.9 ± 0.7 MeV', charge: -1 / 3, chargeText: '−1/3', spin: 0.5, colour: 'red, green or blue', generation: 2, interactions: [STRONG, EM, WEAK], note: 'MS-bar mass at 2 GeV. Carried by kaons and hyperons found in cosmic rays in the late 1940s.', col: 1, row: 1 },
  { id: 'b', symbol: 'b', name: 'bottom quark', category: 'quark', massGeV: 4.186, massText: '4.186 ± 0.006 GeV', charge: -1 / 3, chargeText: '−1/3', spin: 0.5, colour: 'red, green or blue', generation: 3, interactions: [STRONG, EM, WEAK], note: 'MS-bar mass m_b(m_b). Discovered at Fermilab in 1977 inside the Υ meson.', col: 2, row: 1 },
  { id: 'e', symbol: 'e', name: 'electron', category: 'lepton', massGeV: 0.51099895069e-3, massText: '0.51099895069 MeV', charge: -1, chargeText: '−1', spin: 0.5, colour: 'none', generation: 1, interactions: [EM, WEAK], note: 'Discovered by J. J. Thomson in 1897. Its mass sets the size of every atom.', col: 0, row: 2 },
  { id: 'mu', symbol: 'μ', name: 'muon', category: 'lepton', massGeV: 0.1056583755, massText: '105.6583755 MeV', charge: -1, chargeText: '−1', spin: 0.5, colour: 'none', generation: 2, interactions: [EM, WEAK], note: 'A heavy electron. Lives 2.2 μs at rest and decays to e⁻ ν̄e νμ.', col: 1, row: 2 },
  { id: 'tau', symbol: 'τ', name: 'tau', category: 'lepton', massGeV: 1.77693, massText: '1776.93 ± 0.09 MeV', charge: -1, chargeText: '−1', spin: 0.5, colour: 'none', generation: 3, interactions: [EM, WEAK], note: 'Found by Martin Perl and collaborators at SLAC in 1975. Heavy enough to decay into hadrons.', col: 2, row: 2 },
  { id: 've', symbol: 'νe', name: 'electron neutrino', category: 'lepton', massGeV: 0, massText: 'not measured (< 0.45 eV)', charge: 0, chargeText: '0', spin: 0.5, colour: 'none', generation: 1, interactions: [WEAK], note: 'Oscillations prove neutrinos have mass, but the flavour states are mixtures of mass states. KATRIN limits the effective mass to below 0.45 eV (90% CL).', col: 0, row: 3 },
  { id: 'vmu', symbol: 'νμ', name: 'muon neutrino', category: 'lepton', massGeV: 0, massText: 'not measured (< 0.45 eV)', charge: 0, chargeText: '0', spin: 0.5, colour: 'none', generation: 2, interactions: [WEAK], note: 'Shown to differ from νe at Brookhaven in 1962. Masses are tiny but not zero.', col: 1, row: 3 },
  { id: 'vtau', symbol: 'ντ', name: 'tau neutrino', category: 'lepton', massGeV: 0, massText: 'not measured (< 0.45 eV)', charge: 0, chargeText: '0', spin: 0.5, colour: 'none', generation: 3, interactions: [WEAK], note: 'Directly observed by the DONUT experiment at Fermilab in 2000.', col: 2, row: 3 },
  { id: 'g', symbol: 'g', name: 'gluon', category: 'gauge', massGeV: 0, massText: '0 (theory)', charge: 0, chargeText: '0', spin: 1, colour: 'colour octet (8 states)', generation: null, interactions: [STRONG], note: 'Carries colour itself, so gluons attract each other. This self-interaction is why quarks stay confined.', col: 3, row: 0 },
  { id: 'gamma', symbol: 'γ', name: 'photon', category: 'gauge', massGeV: 0, massText: '0 (< 1×10⁻¹⁸ eV)', charge: 0, chargeText: '0', spin: 1, colour: 'none', generation: null, interactions: [EM], note: 'Carrier of electromagnetism. It stays massless because the Higgs vacuum has no electric charge.', col: 3, row: 1 },
  { id: 'Z', symbol: 'Z', name: 'Z boson', category: 'gauge', massGeV: 91.1879, massText: '91.1879 ± 0.0020 GeV', charge: 0, chargeText: '0', spin: 1, colour: 'none', generation: null, interactions: [WEAK], note: 'Neutral weak carrier. Discovered at CERN in 1983. Its mass comes from the Higgs field.', col: 3, row: 2 },
  { id: 'W', symbol: 'W', name: 'W boson', category: 'gauge', massGeV: 80.3625, massText: '80.3625 ± 0.0077 GeV', charge: 1, chargeText: '±1', spin: 1, colour: 'none', generation: null, interactions: [WEAK, EM], note: 'Charged weak carrier (W⁺ and W⁻). It changes one quark or lepton flavour into its partner, as in beta decay.', col: 3, row: 3 },
  { id: 'H', symbol: 'H', name: 'Higgs boson', category: 'scalar', massGeV: 125.13, massText: '125.13 ± 0.11 GeV', charge: 0, chargeText: '0', spin: 0, colour: 'none', generation: null, interactions: ['Higgs couplings (mass-proportional)', WEAK], note: 'The only spin-0 elementary particle known. A ripple in the field whose vacuum value gives W, Z and fermions their mass. Found by ATLAS and CMS in 2012.', col: 4, row: 0 },
];

export const particleById = (id: string): SMParticle | undefined => PARTICLES.find((p) => p.id === id);

/** Tile height on a log mass scale. Massless and unmeasured masses get the floor height. */
export const MASS_FLOOR_GEV = 1e-4;
export function tileHeight(massGeV: number, perDecade = 0.72, base = 0.08): number {
  if (massGeV <= MASS_FLOOR_GEV) return base;
  return base + perDecade * Math.log10(massGeV / MASS_FLOOR_GEV);
}

// ---------------------------------------------------------------------------
// Force strengths

export const CONST = {
  alpha0: 1 / 137.035999, // fine-structure constant at q² = 0
  alphaMZ: 1 / 127.95, // MS-bar α at M_Z (PDG)
  alphaS_MZ: 0.118, // strong coupling at M_Z (PDG world average 0.1180)
  sin2thetaMZ: 0.23129, // MS-bar weak mixing angle at M_Z
  GF: 1.1663788e-5, // Fermi constant, GeV⁻²
  G: 6.6743e-11, // m³ kg⁻¹ s⁻²
  hbar: 1.054571817e-34, // J s
  c: 299792458, // m/s
  mpKg: 1.67262192e-27,
  mpGeV: 0.93827208816,
  mnGeV: 0.93956542052,
};

export interface ForceStrength { force: string; value: number; how: string }

export function forceStrengths(): ForceStrength[] {
  const alpha2 = CONST.alphaMZ / CONST.sin2thetaMZ;
  const grav = (CONST.G * CONST.mpKg * CONST.mpKg) / (CONST.hbar * CONST.c);
  return [
    { force: 'strong', value: CONST.alphaS_MZ, how: 'α_s(M_Z)' },
    { force: 'weak', value: alpha2, how: 'α₂ = α/sin²θ_W at M_Z' },
    { force: 'electromagnetic', value: CONST.alphaMZ, how: 'α(M_Z)' },
    { force: 'gravity', value: grav, how: 'G m_p² / ħc' },
  ];
}

/** Higgs vacuum expectation value from the Fermi constant: v = (√2 G_F)^(-1/2). */
export const vFromGF = (GF = CONST.GF): number => 1 / Math.sqrt(Math.SQRT2 * GF);

// ---------------------------------------------------------------------------
// Reaction builder: particles with conserved quantum numbers.

export type LineKind = 'fermion' | 'photon' | 'wz' | 'higgs' | 'hadron';

export interface RParticle {
  id: string;
  label: string;
  /** Charge × 3 (integer arithmetic). */
  q3: number;
  /** Baryon number × 3. */
  b3: number;
  le: number;
  lmu: number;
  ltau: number;
  mass: number; // GeV
  /** Twice the spin. */
  spin2: number;
  anti: boolean;
  line: LineKind;
  neutrino?: boolean;
  /** Net quark flavour numbers (u, d, s, c, b, t) for spotting weak flavour change. */
  flav?: [number, number, number, number, number, number];
}

const P = PARTICLES;
const m = (id: string) => P.find((p) => p.id === id)!.massGeV;

export const RPARTICLES: RParticle[] = [
  { id: 'e-', label: 'e⁻', q3: -3, b3: 0, le: 1, lmu: 0, ltau: 0, mass: m('e'), spin2: 1, anti: false, line: 'fermion' },
  { id: 'e+', label: 'e⁺', q3: 3, b3: 0, le: -1, lmu: 0, ltau: 0, mass: m('e'), spin2: 1, anti: true, line: 'fermion' },
  { id: 'mu-', label: 'μ⁻', q3: -3, b3: 0, le: 0, lmu: 1, ltau: 0, mass: m('mu'), spin2: 1, anti: false, line: 'fermion' },
  { id: 'mu+', label: 'μ⁺', q3: 3, b3: 0, le: 0, lmu: -1, ltau: 0, mass: m('mu'), spin2: 1, anti: true, line: 'fermion' },
  { id: 'tau-', label: 'τ⁻', q3: -3, b3: 0, le: 0, lmu: 0, ltau: 1, mass: m('tau'), spin2: 1, anti: false, line: 'fermion' },
  { id: 'tau+', label: 'τ⁺', q3: 3, b3: 0, le: 0, lmu: 0, ltau: -1, mass: m('tau'), spin2: 1, anti: true, line: 'fermion' },
  { id: 've', label: 'νe', q3: 0, b3: 0, le: 1, lmu: 0, ltau: 0, mass: 0, spin2: 1, anti: false, line: 'fermion', neutrino: true },
  { id: 'vebar', label: 'ν̄e', q3: 0, b3: 0, le: -1, lmu: 0, ltau: 0, mass: 0, spin2: 1, anti: true, line: 'fermion', neutrino: true },
  { id: 'vmu', label: 'νμ', q3: 0, b3: 0, le: 0, lmu: 1, ltau: 0, mass: 0, spin2: 1, anti: false, line: 'fermion', neutrino: true },
  { id: 'vmubar', label: 'ν̄μ', q3: 0, b3: 0, le: 0, lmu: -1, ltau: 0, mass: 0, spin2: 1, anti: true, line: 'fermion', neutrino: true },
  { id: 'vtau', label: 'ντ', q3: 0, b3: 0, le: 0, lmu: 0, ltau: 1, mass: 0, spin2: 1, anti: false, line: 'fermion', neutrino: true },
  { id: 'vtaubar', label: 'ν̄τ', q3: 0, b3: 0, le: 0, lmu: 0, ltau: -1, mass: 0, spin2: 1, anti: true, line: 'fermion', neutrino: true },
  { id: 'p', label: 'p', q3: 3, b3: 3, le: 0, lmu: 0, ltau: 0, mass: CONST.mpGeV, spin2: 1, anti: false, line: 'hadron', flav: [2, 1, 0, 0, 0, 0] },
  { id: 'pbar', label: 'p̄', q3: -3, b3: -3, le: 0, lmu: 0, ltau: 0, mass: CONST.mpGeV, spin2: 1, anti: true, line: 'hadron', flav: [-2, -1, 0, 0, 0, 0] },
  { id: 'n', label: 'n', q3: 0, b3: 3, le: 0, lmu: 0, ltau: 0, mass: CONST.mnGeV, spin2: 1, anti: false, line: 'hadron', flav: [1, 2, 0, 0, 0, 0] },
  { id: 'nbar', label: 'n̄', q3: 0, b3: -3, le: 0, lmu: 0, ltau: 0, mass: CONST.mnGeV, spin2: 1, anti: true, line: 'hadron', flav: [-1, -2, 0, 0, 0, 0] },
  { id: 'pi+', label: 'π⁺', q3: 3, b3: 0, le: 0, lmu: 0, ltau: 0, mass: 0.13957039, spin2: 0, anti: false, line: 'hadron', flav: [1, -1, 0, 0, 0, 0] },
  { id: 'pi-', label: 'π⁻', q3: -3, b3: 0, le: 0, lmu: 0, ltau: 0, mass: 0.13957039, spin2: 0, anti: false, line: 'hadron', flav: [-1, 1, 0, 0, 0, 0] },
  { id: 'pi0', label: 'π⁰', q3: 0, b3: 0, le: 0, lmu: 0, ltau: 0, mass: 0.1349768, spin2: 0, anti: false, line: 'hadron', flav: [0, 0, 0, 0, 0, 0] },
  { id: 't', label: 't', q3: 2, b3: 1, le: 0, lmu: 0, ltau: 0, mass: m('t'), spin2: 1, anti: false, line: 'fermion', flav: [0, 0, 0, 0, 0, 1] },
  { id: 'tbar', label: 't̄', q3: -2, b3: -1, le: 0, lmu: 0, ltau: 0, mass: m('t'), spin2: 1, anti: true, line: 'fermion', flav: [0, 0, 0, 0, 0, -1] },
  { id: 'b', label: 'b', q3: -1, b3: 1, le: 0, lmu: 0, ltau: 0, mass: m('b'), spin2: 1, anti: false, line: 'fermion', flav: [0, 0, 0, 0, 1, 0] },
  { id: 'bbar', label: 'b̄', q3: 1, b3: -1, le: 0, lmu: 0, ltau: 0, mass: m('b'), spin2: 1, anti: true, line: 'fermion', flav: [0, 0, 0, 0, -1, 0] },
  { id: 'gamma', label: 'γ', q3: 0, b3: 0, le: 0, lmu: 0, ltau: 0, mass: 0, spin2: 2, anti: false, line: 'photon' },
  { id: 'W+', label: 'W⁺', q3: 3, b3: 0, le: 0, lmu: 0, ltau: 0, mass: m('W'), spin2: 2, anti: false, line: 'wz' },
  { id: 'W-', label: 'W⁻', q3: -3, b3: 0, le: 0, lmu: 0, ltau: 0, mass: m('W'), spin2: 2, anti: false, line: 'wz' },
  { id: 'Z', label: 'Z', q3: 0, b3: 0, le: 0, lmu: 0, ltau: 0, mass: m('Z'), spin2: 2, anti: false, line: 'wz' },
  { id: 'H', label: 'H', q3: 0, b3: 0, le: 0, lmu: 0, ltau: 0, mass: m('H'), spin2: 0, anti: false, line: 'higgs' },
];

const RMAP = new Map(RPARTICLES.map((r) => [r.id, r]));
export const rp = (id: string): RParticle => {
  const r = RMAP.get(id);
  if (!r) throw new Error(`unknown particle ${id}`);
  return r;
};

export interface CheckResult { ok: boolean; before: number; after: number }

export interface Verdict {
  complete: boolean;
  allowed: boolean;
  charge: CheckResult; // in units of e/3
  baryon: CheckResult; // ×3
  le: CheckResult;
  lmu: CheckResult;
  ltau: CheckResult;
  spin: { ok: boolean; fermionsIn: number; fermionsOut: number };
  energy: { ok: boolean; kind: 'decay' | 'collision' | 'fusion' | 'none'; massIn: number; massOut: number; q: number; text: string };
  /** Extra selection rules (Landau–Yang). */
  extra: { ok: boolean; text: string };
  force: string;
  reasons: string[];
  explanation: string;
}

const sum = (ids: string[], f: (r: RParticle) => number) => ids.reduce((s, id) => s + f(rp(id)), 0);
const chk = (a: number, b: number): CheckResult => ({ ok: a === b, before: a, after: b });

/** Check a reaction `ins → outs` against Standard Model conservation laws. */
export function checkReaction(ins: string[], outs: string[]): Verdict {
  const complete = ins.length > 0 && outs.length > 0;
  const charge = chk(sum(ins, (r) => r.q3), sum(outs, (r) => r.q3));
  const baryon = chk(sum(ins, (r) => r.b3), sum(outs, (r) => r.b3));
  const le = chk(sum(ins, (r) => r.le), sum(outs, (r) => r.le));
  const lmu = chk(sum(ins, (r) => r.lmu), sum(outs, (r) => r.lmu));
  const ltau = chk(sum(ins, (r) => r.ltau), sum(outs, (r) => r.ltau));
  const fIn = ins.filter((id) => rp(id).spin2 % 2 === 1).length;
  const fOut = outs.filter((id) => rp(id).spin2 % 2 === 1).length;
  const spin = { ok: (fIn + fOut) % 2 === 0, fermionsIn: fIn, fermionsOut: fOut };

  const massIn = sum(ins, (r) => r.mass);
  const massOut = sum(outs, (r) => r.mass);
  let energy: Verdict['energy'];
  if (!complete) energy = { ok: true, kind: 'none', massIn, massOut, q: 0, text: 'add particles' };
  else if (ins.length === 1) {
    const q = massIn - massOut;
    if (massIn === 0) energy = { ok: false, kind: 'decay', massIn, massOut, q, text: 'massless particles cannot decay' };
    else if (outs.length === 1) energy = { ok: false, kind: 'decay', massIn, massOut, q, text: 'one particle cannot decay into one other' };
    else energy = { ok: q > 1e-12, kind: 'decay', massIn, massOut, q, text: q > 0 ? `Q = ${fmtE(q)} released` : `short by ${fmtE(-q)}` };
  } else if (outs.length === 1) {
    const o = rp(outs[0]);
    energy = o.mass > 0 && o.mass >= massIn
      ? { ok: true, kind: 'fusion', massIn, massOut, q: 0, text: `only at √s = ${fmtE(o.mass)} (resonance)` }
      : { ok: false, kind: 'fusion', massIn, massOut, q: 0, text: o.mass === 0 ? 'one massless particle cannot carry zero momentum' : 'product lighter than the colliding pair at rest' };
  } else {
    energy = { ok: true, kind: 'collision', massIn, massOut, q: 0, text: `needs √s ≥ ${fmtE(Math.max(massOut, massIn))}` };
  }

  // Landau–Yang: a massive spin-1 particle cannot decay into two photons.
  let extra = { ok: true, text: 'none' };
  if (ins.length === 1 && rp(ins[0]).spin2 === 2 && rp(ins[0]).mass > 0 && outs.length === 2 && outs.every((o) => o === 'gamma')) {
    extra = { ok: false, text: 'Landau–Yang: spin 1 → γγ is impossible' };
  }

  const reasons: string[] = [];
  if (!charge.ok) reasons.push('charge');
  if (!baryon.ok) reasons.push('baryon number');
  const lFam = [le, lmu, ltau].filter((c) => !c.ok).length;
  const lTotal = le.before + lmu.before + ltau.before === le.after + lmu.after + ltau.after;
  if (!le.ok) reasons.push('electron number');
  if (!lmu.ok) reasons.push('muon number');
  if (!ltau.ok) reasons.push('tau number');
  if (!spin.ok) reasons.push('angular momentum');
  if (!energy.ok) reasons.push('energy');
  if (!extra.ok) reasons.push('Landau–Yang');
  const allowed = complete && reasons.length === 0;

  let explanation = '';
  if (!complete) explanation = 'Pick at least one incoming and one outgoing particle.';
  else if (allowed) explanation = 'Every Standard Model conservation law holds.';
  else if (!baryon.ok) explanation = 'Baryon number changes. No Standard Model process seen in any experiment does this. Super-Kamiokande finds the proton lifetime for p → e⁺π⁰ exceeds 2.4×10³⁴ years. Grand unified theories predict proton decays like this one, which change B and L but keep B − L fixed.';
  else if (!charge.ok) explanation = 'Electric charge is exactly conserved. It is tied to the unbroken U(1) gauge symmetry of electromagnetism.';
  else if (lFam > 0 && lTotal && reasons.length === lFam) explanation = 'Only lepton family numbers change. They are exact in the minimal Standard Model with massless neutrinos, so this is forbidden there. Neutrino oscillations break them, but for charged leptons the effect is tiny: μ → eγ is predicted near 10⁻⁵⁴ per decay, far below the MEG II limit of 1.5×10⁻¹³.';
  else if (lFam > 0) explanation = 'Lepton number changes. The Standard Model conserves it in every observed process.';
  else if (!spin.ok) explanation = 'An odd number of spin-½ particles means half-integer angular momentum cannot balance.';
  else if (!extra.ok) explanation = 'A massive spin-1 particle cannot decay into two photons (Landau–Yang theorem). This is why the 2012 diphoton signal pointed to spin 0 (or 2).';
  else explanation = `Energy or momentum fails: ${energy.text}.`;

  return { complete, allowed, charge, baryon, le, lmu, ltau, spin, energy, extra, force: allowed ? classifyForce(ins, outs) : 'none', reasons, explanation };
}

function classifyForce(ins: string[], outs: string[]): string {
  const all = [...ins, ...outs].map(rp);
  if (ins.length === 1 && ins[0] === 'H' && outs.every((o) => o === 'gamma')) return 'loop-level, via W and top loops';
  if (all.some((r) => r.id === 'H')) return 'Higgs coupling';
  if (all.some((r) => r.neutrino || r.line === 'wz')) return 'weak';
  const flav = [0, 0, 0, 0, 0, 0];
  for (const id of ins) rp(id).flav?.forEach((v, i) => (flav[i] += v));
  for (const id of outs) rp(id).flav?.forEach((v, i) => (flav[i] -= v));
  if (flav.some((v) => v !== 0)) return 'weak (quark flavour changes)';
  if (all.some((r) => r.id === 'gamma') || all.every((r) => r.line === 'fermion')) return 'electromagnetic';
  return 'strong';
}

export function fmtE(gev: number): string {
  const a = Math.abs(gev);
  if (a >= 1) return `${gev.toFixed(gev >= 100 ? 1 : 3)} GeV`;
  if (a >= 1e-3) return `${(gev * 1e3).toFixed(3)} MeV`;
  return `${(gev * 1e6).toFixed(1)} keV`;
}

export const reactionText = (ins: string[], outs: string[]) =>
  `${ins.map((i) => rp(i).label).join(' ') || '?'} → ${outs.map((o) => rp(o).label).join(' ') || '?'}`;

// ---------------------------------------------------------------------------
// Higgs potential V(φ) = −μ²|φ|² + λ|φ|⁴ with the convention ⟨φ⟩ = v/√2.

/** Measured-value defaults: v from G_F, m_H = √2 μ, λ = m_H²/(2v²). */
export const V_EW = vFromGF();
export const MH = 125.13;
export const MU_PHYS = MH / Math.SQRT2;
export const LAMBDA_PHYS = (MH * MH) / (2 * V_EW * V_EW);

/** Potential with a signed μ² (μ² < 0 is the unbroken, symmetric phase). */
export const potential = (mu2: number, lambda: number, r: number) => -mu2 * r * r + lambda * r ** 4;
export const dPotential = (mu2: number, lambda: number, r: number) => -2 * mu2 * r + 4 * lambda * r ** 3;

/** |φ| at the minimum: v/√2 = √(μ²/2λ) for μ² > 0, else 0. */
export const phiMin = (mu2: number, lambda: number) => (mu2 > 0 ? Math.sqrt(mu2 / (2 * lambda)) : 0);
/** Vacuum expectation value v = √(μ²/λ). */
export const vev = (mu2: number, lambda: number) => (mu2 > 0 ? Math.sqrt(mu2 / lambda) : 0);
export const vMinDepth = (mu2: number, lambda: number) => (mu2 > 0 ? -(mu2 * mu2) / (4 * lambda) : 0);
/** Higgs boson mass m_H = √(2μ²) = √(2λ) v. */
export const higgsMass = (mu2: number) => (mu2 > 0 ? Math.sqrt(2 * mu2) : 0);

/** Tree-level couplings fixed so that m_W and m_Z come out right at v = 246 GeV. */
export const G_WEAK = (2 * m('W')) / V_EW;
export const G_PRIME = G_WEAK * Math.sqrt(1 - (m('W') / m('Z')) ** 2) / (m('W') / m('Z'));
export const massW = (v: number) => (G_WEAK * v) / 2;
export const massZ = (v: number) => (Math.hypot(G_WEAK, G_PRIME) * v) / 2;
export const yukawa = (mass: number) => (Math.SQRT2 * mass) / V_EW;

/** Radius where V reaches `cap` (used to trim the drawn surface). */
export function radiusAtCap(mu2: number, lambda: number, cap: number): number {
  return Math.sqrt((mu2 + Math.sqrt(mu2 * mu2 + 4 * lambda * cap)) / (2 * lambda));
}

/**
 * Damped ball on the potential surface. Scene units: horizontal φ = x·S (GeV per unit),
 * height h = V / Vs. Writes new position and velocity in place.
 */
export interface Ball { x: number; z: number; vx: number; vz: number }
export function stepBall(b: Ball, mu2: number, lambda: number, S: number, Vs: number, grav: number, damp: number, dt: number): void {
  const rho = Math.hypot(b.x, b.z);
  let ax = -damp * b.vx;
  let az = -damp * b.vz;
  if (rho > 1e-9) {
    const slope = (dPotential(mu2, lambda, rho * S) * S) / Vs; // dh/dρ
    const g = -grav * slope / Math.sqrt(1 + slope * slope);
    ax += (g * b.x) / rho;
    az += (g * b.z) / rho;
  }
  b.vx += ax * dt;
  b.vz += az * dt;
  b.x += b.vx * dt;
  b.z += b.vz * dt;
}

/** Numerical minimum of V along a ray, by golden-section search on [0, rMax]. */
export function numericMinimum(mu2: number, lambda: number, rMax: number): number {
  const gr = (Math.sqrt(5) - 1) / 2;
  let a = 0;
  let b = rMax;
  let c = b - gr * (b - a);
  let d = a + gr * (b - a);
  for (let i = 0; i < 200; i++) {
    if (potential(mu2, lambda, c) < potential(mu2, lambda, d)) b = d;
    else a = c;
    c = b - gr * (b - a);
    d = a + gr * (b - a);
  }
  return (a + b) / 2;
}
