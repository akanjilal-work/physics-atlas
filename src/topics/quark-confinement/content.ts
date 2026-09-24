import type { TopicContent } from '../../core/types.ts';
import { breakingDistance, CHARM_FIT } from './physics.ts';

export const E_TH = 1.1; // GeV, pair-creation threshold used in the scene

export const content: TopicContent = {
  intuition: `
<p class="lead">Every proton is made of quarks. Physicists have smashed protons together for sixty years, and nobody has ever caught a single quark on its own. The reason is strange and beautiful.</p>
<p>Two quarks are joined by the <strong>strong force</strong>, carried by gluons. Between electric charges the field lines spread out in all directions, so the pull fades with distance. Between quarks the gluon field does something else. It squeezes itself into a narrow <strong>flux tube</strong>, like a glowing rubber band that keeps the same width however far you stretch it.</p>
<p>A tube of fixed width holds the same energy in every femtometre. So the energy grows in a straight line as you pull. The pull never fades. It stays at about <strong>15 tonnes of force</strong>, acting across a distance smaller than a proton.</p>
<p>So what happens if you keep pulling? At some point the tube holds enough energy to make new matter. It <strong>snaps</strong>, and a fresh quark and antiquark pop out of the vacuum at the break. Each new particle grabs one of the old ends. You are left holding two complete particles, called mesons, and still no lone quark.</p>
<p>In the scene, drag the separation slider and watch the energy climb in the corner graph. Keep going until the tube breaks. Then switch on the electric comparison to see how differently ordinary field lines behave.</p>`,
  tryFirst: [
    'Drag <b>Separation</b> slowly to the right. The tube gets longer but not wider, and the energy in the corner graph climbs in a straight line.',
    'Keep pulling past the dashed threshold line. The tube snaps with a flash and leaves two mesons.',
    'Turn on <b>Compare with electric dipole</b>. Its field lines bulge out through all of space, while the gluon field stays in a tube.',
    'Slide <b>Probe energy Q</b> up. The strong coupling in the top corner falls. At high energy quarks barely feel each other.',
    'Set <b>View</b> to <b>Charmonium levels</b> to see the potential hold a charm quark and antiquark in states that match real particles.',
  ],
  equation: {
    tex: 'V(r) = -\\frac{4}{3}\\frac{\\alpha_s\\,\\hbar c}{r} + \\sigma r',
    caption: 'The Cornell potential. A Coulomb-like attraction at short distance, plus a linear rise that never levels off.',
    terms: [
      { tex: 'V(r)', name: 'Potential energy', meaning: 'Energy stored in the gluon field between a quark and an antiquark a distance $r$ apart. Only differences in $V$ matter, so the zero is a convention.', param: 'V' },
      { tex: '\\alpha_s', name: 'Strong coupling', meaning: `How strongly quarks and gluons interact. In this model it is a fitted constant ($${CHARM_FIT.alphaS}$). In full QCD it runs with energy, as the top corner graph shows.`, param: 'alphaS' },
      { tex: '\\tfrac{4}{3}', name: 'Colour factor', meaning: 'A group-theory number for a colour-neutral quark and antiquark in SU(3). For electric charges the same slot holds 1.' },
      { tex: 'r', name: 'Separation', meaning: 'Distance between the two quarks, in femtometres (1 fm = $10^{-15}$ m, roughly the size of a proton).', param: 'r' },
      { tex: '\\sigma', name: 'String tension', meaning: 'Energy per unit length of the flux tube. About 0.9 GeV/fm, which is a force of about $1.4\\times10^{5}$ N, the weight of roughly 15 tonnes.', param: 'sigma' },
    ],
  },
  physicsNotes: `
<h3>Two regimes in one formula</h3>
<p>At short distance the first term wins. It has the same $1/r$ shape as the electric potential because a single gluon exchange looks like a single photon exchange. At long distance the second term wins. The force $-dV/dr$ tends to the constant $\\sigma$. That constant force is confinement in its simplest form.</p>
<h3>Where the linear term comes from</h3>
<p>If the field is trapped in a tube of fixed cross-section $A$ with energy density $u$, the stored energy is $uA \\times r$. That is $\\sigma r$ with $\\sigma = uA$. Nobody derives this tube from the QCD equations with pen and paper. It is seen in lattice QCD computer simulations, and the Cornell form is a good fit to them.</p>
<h3>When the string breaks</h3>
<p>Once $V(r)$ exceeds the energy needed to make a light quark and antiquark bound to the ends, it is cheaper to create the pair than to stretch further. Setting $V(r_b) = E_{\\text{th}}$ gives a quadratic with the root</p>
$$r_b = \\frac{E_{\\text{th}} + \\sqrt{E_{\\text{th}}^2 + 4\\sigma a}}{2\\sigma}, \\qquad a = \\tfrac43 \\alpha_s \\hbar c.$$
<p>The scene uses $E_{\\text{th}} = ${E_TH}$ GeV. That is roughly two light constituent quarks at about 0.33 GeV each, plus what it costs to bind them into two mesons. With the default settings it gives $r_b \\approx ${breakingDistance(E_TH, CHARM_FIT.alphaS, CHARM_FIT.sigma).toFixed(2)}$ fm. Lattice QCD finds about 1.25 fm.</p>
<h3>Running coupling</h3>
<p>At one loop with $n_f$ light flavours,</p>
$$\\alpha_s(Q) = \\frac{\\alpha_s(M_Z)}{1 + \\dfrac{33 - 2n_f}{12\\pi}\\,\\alpha_s(M_Z)\\ln\\dfrac{Q^2}{M_Z^2}}.$$
<p>With $n_f = 5$ the coefficient is positive, so the coupling shrinks as the energy $Q$ grows. This is <em>asymptotic freedom</em>. The inset anchors it at $\\alpha_s(M_Z) = 0.118$ with $M_Z = 91.19$ GeV.</p>`,
  deep: [
    {
      title: 'Why nobody has seen a free quark',
      html: `<p>Quarks carry electric charges of $+\\tfrac23$ or $-\\tfrac13$ of the proton charge. A free one would be easy to spot. Searches in bulk matter, cosmic rays and collider debris have never found a confirmed fractional charge.</p>
<p>The flux tube explains why. Isolating a quark would need an infinitely long tube, so infinite energy. Long before that, the tube breaks into new pairs. Every high-energy collision that knocks a quark loose ends with the quark wrapped inside a new hadron.</p>
<p>Yet quarks are real. Electron beams at SLAC in the late 1960s bounced off hard point-like objects inside the proton. Their charges and spins match the quark model. We see quarks inside hadrons and never outside them.</p>`,
    },
    {
      title: 'Colour, and why gluons are different from photons',
      html: `<p>The strong charge is called <strong>colour</strong>. It comes in three kinds, called red, green and blue, and antiquarks carry anticolours. The names are only labels. Only colour-neutral combinations exist freely: three quarks with one of each colour (a baryon such as the proton), or a quark with its matching anticolour (a meson).</p>
<p>The key difference from electromagnetism is that <strong>gluons carry colour themselves</strong>. There are eight of them. A photon has no electric charge, so photons do not attract each other and electric field lines spread freely. Gluons do attract other gluons. The field lines pull on each other and bunch into a tube.</p>
<p>The same self-interaction produces asymptotic freedom. Virtual gluon pairs around a quark spread its colour charge out, which is the opposite of how virtual electron pairs screen an electric charge. Probe a quark up close and you see less charge. David Gross, Frank Wilczek and David Politzer found this in 1973 and shared the 2004 Nobel Prize in Physics for it.</p>`,
    },
    {
      title: 'Lattice QCD: seeing the tube in a computer',
      html: `<p>QCD cannot be solved with pen and paper at long distances, because the coupling is large there. Lattice QCD puts space and time on a grid and evaluates the theory numerically on supercomputers.</p>
<p>These simulations measure the energy of a static quark and antiquark. It rises linearly at large $r$, with $\\sqrt{\\sigma}$ close to 0.44 GeV, which is about 0.9 to 1 GeV/fm. Maps of the gluon field show the energy concentrated in a narrow tube between the sources. In 2005 Bali and collaborators saw the tube break when light sea quarks were included, at about 1.25 fm.</p>
<p>The tube is not perfectly rigid. Its width grows slowly, as the logarithm of its length, because it vibrates like a quantum string. That behaviour was predicted by Lüscher, Münster and Weisz in 1981 and is seen on the lattice.</p>`,
    },
    {
      title: 'Charmonium: the potential that predicts particles',
      html: `<p>Heavy quarks move slowly enough to use ordinary quantum mechanics. Put a charm quark and antiquark in the Cornell potential and solve the radial Schrödinger equation</p>
$$-\\frac{(\\hbar c)^2}{2\\mu c^2}\\,u''(r) + V(r)\\,u(r) = E\\,u(r), \\qquad \\mu = m_c/2.$$
<p>The Charmonium view does this with a shooting method. It integrates outward from $r = 0$ and adjusts $E$ until the wave dies away at large $r$. The mass of each state is $M = 2m_c + E$.</p>
<p>With $\\sigma = 0.9$ GeV/fm, $\\alpha_s = ${CHARM_FIT.alphaS}$ and $m_c = ${CHARM_FIT.mq}$ GeV, the 1S and 2S states land at 3.095 and 3.685 GeV. The measured J/ψ and ψ(2S) sit at 3.097 and 3.686 GeV. This is a <strong>fit</strong>. Two parameters were tuned to two masses, so the agreement is by design. The test is what else comes out: the same numbers give sensible sizes and a 3S level near 4.13 GeV, while the measured ψ(4040) sits at about 4.04 GeV. That state lies above the open-charm threshold and can decay to D mesons, which this simple model ignores.</p>
<p>The Cornell group (Eichten, Gottfried, Kinoshita, Lane and Yan) built this model after the J/ψ was discovered in 1974.</p>`,
    },
    {
      title: 'Jets, and the unsolved problem',
      html: `<p>At a collider, a quark knocked out at high energy drags a flux tube behind it. The tube breaks again and again, and the pieces become a spray of mesons and baryons moving roughly in the quark's direction. That spray is a <strong>jet</strong>. Two-jet events were seen at SLAC in 1975. Three-jet events at DESY in 1979 showed a gluon radiated by a quark. Event generators such as PYTHIA use a string-breaking picture, the Lund model, for this step.</p>
<p>Here is the honest part. Confinement has <strong>not been proven</strong> from the equations of QCD. The evidence from experiment and lattice simulations is overwhelming, but a mathematical proof does not exist. The closely related problem of showing that quantum Yang–Mills theory exists and has a <em>mass gap</em> is one of the seven Millennium Prize Problems set by the Clay Mathematics Institute in 2000, with a prize of one million dollars. It is still open.</p>`,
    },
  ],
  challenges: [
    {
      id: 'snap',
      title: 'Snap the string',
      prompt: 'Stretch the quarks apart until the flux tube breaks into two mesons.',
      hint: 'Drag the separation slider past the dashed threshold line in the V(r) graph. With default settings that is about 1.3 fm.',
      check: (s) => (s.breaks as number) >= 1,
    },
    {
      id: 'gev',
      title: 'One GeV in the tube',
      prompt: 'Find the separation where the stored energy V(r) is 1 GeV, within 0.05 GeV, without breaking the string.',
      hint: 'With σ = 0.9 GeV/fm it is a little below 1.2 fm. Watch the V readout.',
      check: (s) => s.touched === true && s.broken === false && Math.abs((s.V as number) - 1) <= 0.05,
    },
    {
      id: 'free',
      title: 'Asymptotic freedom',
      prompt: 'Push the probe energy high enough that the strong coupling drops below 0.12.',
      hint: 'The coupling is 0.118 at the Z boson mass, 91 GeV. Go a bit higher.',
      check: (s) => (s.alphaS as number) < 0.12,
    },
    {
      id: 'em',
      title: 'Field lines that spread',
      prompt: 'Turn on the electric dipole comparison and stretch the separation beyond 1 fm.',
      hint: 'Compare how far the dipole lines reach with the fixed width of the tube.',
      check: (s) => s.emCompare === true && (s.r as number) > 1,
    },
  ],
  caveats: `<p>The Cornell potential describes a static quark and antiquark. It works well for heavy charm and bottom quarks. Light quarks move near the speed of light, so for them the picture is only a cartoon.</p>
<p>The breaking threshold of ${E_TH} GeV is a model choice tuned to give a breaking distance near lattice results. Real string breaking is a quantum process that happens over a range of distances, not at one sharp point. The coupling in the potential is a fixed fitted number, while the true coupling runs.</p>
<p>The running shown in the inset is one-loop with five flavours held fixed. It is accurate near and above $M_Z$ but underestimates $\\alpha_s$ at a few GeV, where fewer flavours are active and higher orders matter. Below about 1 GeV perturbation theory fails, so the curve stops there.</p>
<p>The charmonium spectrum ignores spin forces, relativistic corrections and coupling to D mesons. The jet view is a qualitative sketch, not a simulation.</p>`,
  further: [
    { label: 'Colour confinement (Wikipedia)', url: 'https://en.wikipedia.org/wiki/Color_confinement' },
    { label: 'Bali et al., Observation of string breaking in QCD (2005)', url: 'https://arxiv.org/abs/hep-lat/0505012' },
    { label: 'Eichten et al., Charmonium: the model (1978)', url: 'https://doi.org/10.1103/PhysRevD.17.3090' },
    { label: 'Nobel Prize in Physics 2004', url: 'https://www.nobelprize.org/prizes/physics/2004/summary/' },
  ],
};
