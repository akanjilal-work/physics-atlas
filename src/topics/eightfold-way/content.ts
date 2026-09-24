import type { TopicContent } from '../../core/types.ts';

export const content: TopicContent = {
  intuition: `
<p class="lead">By the early 1960s physicists had found dozens of strongly interacting particles. Pions, kaons, lambdas, sigmas, xis and a crowd of short-lived resonances. Nobody knew why there were so many. People called it the particle zoo.</p>
<p>The way out was to sort them like a chemist sorts elements. Give each particle two labels: its <strong>isospin</strong> $I_3$, which tells you how it sits among its near-twins of different charge, and its <strong>hypercharge</strong> $Y$, which tracks a property called strangeness. Plot every particle of the same spin on those two axes and a pattern jumps out. Eight mesons make a hexagon with extra states at the centre. Eight baryons make the same hexagon. Ten heavier baryons make a triangle.</p>
<p>In the scene, the floor is that plot. Each glowing tile is one particle, lifted to a height equal to its mass. Look at the ten-particle triangle from the side. It becomes a staircase. Each step down the triangle adds one unit of strangeness and about 146 MeV of mass.</p>
<p>In 1962 the tip of the triangle was empty. Murray Gell-Mann counted the steps and predicted a particle with strangeness −3, charge −1 and a mass near 1680 MeV. It was found at Brookhaven in 1964. That is the surprise of this topic: a pattern in a table told experimenters what to look for, and nature agreed.</p>
<p>The pattern had a simple cause. Every one of these particles is built from three kinds of <strong>quarks</strong>, called up, down and strange. Use the builder to snap quarks together and see which particle you get.</p>`,
  tryFirst: [
    'Click the tile at the bottom tip of the triangle. That is the Ω⁻, three strange quarks.',
    'Turn off <b>Show mass as height</b> and watch the staircase fold flat into the textbook triangle.',
    'Switch on <b>Ω⁻ prediction</b>. The tip disappears. Use the step sizes in the corner graph to guess its mass, then reveal it.',
    'In the <b>Quark builder</b>, pick u, u, d. You get the proton, or the Δ⁺ if the three spins line up.',
  ],
  equation: {
    tex: 'Q = I_3 + \\tfrac{Y}{2}, \\qquad Y = B + S',
    caption: 'The Gell-Mann–Nishijima relation. Charge follows from where a particle sits in the pattern. Across the decuplet, mass rises in near-equal steps of about 146 MeV per unit of strangeness.',
    terms: [
      { tex: 'Q', name: 'Electric charge', meaning: 'In units of the proton charge. Quarks carry $+\\tfrac23$ (u) or $-\\tfrac13$ (d, s).', param: 'Q' },
      { tex: 'I_3', name: 'Isospin component', meaning: 'Horizontal axis of the weight diagram. u has $+\\tfrac12$, d has $-\\tfrac12$, s has 0.', param: 'I3' },
      { tex: 'Y', name: 'Hypercharge', meaning: 'Vertical axis of the weight diagram. It equals baryon number plus strangeness.', param: 'Y' },
      { tex: 'B', name: 'Baryon number', meaning: 'Each quark carries $\\tfrac13$, each antiquark $-\\tfrac13$. Baryons have 1, mesons 0.', param: 'B' },
      { tex: 'S', name: 'Strangeness', meaning: 'Minus the number of s quarks, plus the number of s̄ antiquarks. Conserved by the strong force.', param: 'S' },
    ],
  },
  physicsNotes: `
<h3>Three quarks, additive labels</h3>
<p>Each quark flavour carries fixed quantum numbers. Antiquarks carry the opposite signs.</p>
$$\\begin{array}{c|cccc} & Q & I_3 & S & B \\\\ \\hline u & +\\tfrac23 & +\\tfrac12 & 0 & \\tfrac13 \\\\ d & -\\tfrac13 & -\\tfrac12 & 0 & \\tfrac13 \\\\ s & -\\tfrac13 & 0 & -1 & \\tfrac13 \\end{array}$$
<p>A hadron's labels are just the sums over its quarks. Check any row: $Q = I_3 + (B+S)/2$ holds for each quark, so it holds for any combination. The readout <b>Q − I₃ − Y/2</b> confirms it is exactly zero for all 27 hadrons in the scene.</p>
<h3>Why octets and decuplets</h3>
<p>If the three flavours were interchangeable, the laws would have an SU(3) symmetry. The three quarks form its smallest multiplet, a triangle. Combining them gives larger patterns:</p>
$$3 \\otimes \\bar 3 = 8 \\oplus 1, \\qquad 3 \\otimes 3 \\otimes 3 = 10 \\oplus 8 \\oplus 8 \\oplus 1$$
<p>Mesons fill the 8 and the 1. For the lightest baryons only the 10 (spin 3/2) and one 8 (spin ½) appear. That selection comes from combining flavour with spin symmetry, which Pauli's principle and colour make sure is fully symmetric.</p>
<h3>Mass splitting</h3>
<p>The s quark is heavier than u and d, so the symmetry is broken in a controlled way. To first order, mass grows linearly with the number of s quarks. That gives the Gell-Mann–Okubo rules: equal spacing in the decuplet, and $2(m_N + m_\\Xi) = 3m_\\Lambda + m_\\Sigma$ in the octet. With PDG masses the octet rule holds to 0.6 percent.</p>`,
  deep: [
    {
      title: 'The particle zoo and the eightfold way',
      html: `<p>Kaons and lambdas turned up in cosmic-ray cloud chambers from 1947. They were made quickly but decayed slowly, which was odd. In 1953 Gell-Mann, and independently Nakano and Nishijima, explained this with a new conserved quantity, <em>strangeness</em>. The strong force keeps it. The weak force can change it, which is why these particles live long enough to leave tracks.</p>
<p>In 1961 Gell-Mann and, separately, Yuval Ne'eman noticed that the known spin-½ baryons and spin-0 mesons fit the eight-dimensional representation of the group SU(3). Gell-Mann called the scheme the <em>eightfold way</em>, a nod to the Buddhist Noble Eightfold Path. At the time many physicists preferred other groups, and the scheme was not yet widely accepted.</p>`,
    },
    {
      title: 'The Ω⁻ prediction',
      html: `<p>At the 1962 high-energy physics conference at CERN, nine spin-3/2 resonances were known: four Δ, three Σ*, two Ξ*. Gell-Mann saw they fit a decuplet with one empty corner. The masses rose by roughly equal steps as strangeness fell. Extend the staircase one more step:</p>
$$m_\\Omega \\approx 2m_{\\Xi^*} - m_{\\Sigma^*} \\approx 1682\\ \\text{MeV}$$
<p>using today's averages. A straight-line fit through all three levels gives about 1685 MeV. The new particle also had to have $S=-3$ and charge −1. It could not decay by the strong force to anything lighter with the same strangeness, so it would live long enough to leave a track.</p>
<p>In 1964 a team led by Nicholas Samios at Brookhaven reported one clean event in an 80-inch hydrogen bubble chamber (Barnes et al., Phys. Rev. Lett. 12, 204). They measured $1686 \\pm 12$ MeV. The modern PDG value is 1672.45 MeV. The prediction was off by about 10 MeV, less than one percent.</p>`,
    },
    {
      title: 'Quarks, and why the Δ⁺⁺ needed colour',
      html: `<p>In 1964 Gell-Mann and George Zweig independently proposed that the patterns came from three constituents. Gell-Mann called them quarks. Zweig called them aces. Their fractional charges looked so strange that many, including Gell-Mann at first, treated them as bookkeeping rather than real objects. Deep inelastic scattering at SLAC from 1968 showed point-like charges inside the proton, and the idea hardened.</p>
<p>The Δ⁺⁺ posed a puzzle. It is uuu with spin 3/2, so all three spins point the same way. In its ground state the three quarks share the same spatial state too. Quarks are fermions, and the Pauli principle forbids three identical fermions in the same state.</p>
<p>The fix, proposed by Oscar Greenberg in 1964 and by Han and Nambu in 1965, was a new three-valued label now called <strong>colour</strong>. If the three u quarks carry red, green and blue, the total state can be antisymmetric in colour, and Pauli is satisfied. The small balls in the scene use those three colours. Colour later became the charge of the strong force in quantum chromodynamics.</p>`,
    },
    {
      title: 'Heavier quarks and an approximate symmetry',
      html: `<p>In November 1974 two groups, led by Samuel Ting at Brookhaven and Burton Richter at SLAC, found the J/ψ, a bound state of a fourth quark, charm, and its antiquark. The rapid shift in thinking that followed is called the November Revolution. The bottom quark appeared in the Υ at Fermilab in 1977. The top quark was found at Fermilab by the CDF and D0 experiments in 1995.</p>
<p>Charm, bottom and top are far heavier than u, d and s. So SU(4) and larger flavour groups are badly broken and much less useful. Even SU(3) is only approximate. The s quark is roughly 90 MeV heavier than u and d in the QCD sense, and inside a hadron its effective extra mass is closer to 150 MeV. That is the step you see in the staircase. Isospin, the u and d part, is much better, since those two quarks differ by only a few MeV.</p>`,
    },
    {
      title: 'Edge cases in the meson nonet',
      html: `<p>The neutral mesons at the centre are not single quark pairs. The π⁰ is $(u\\bar u - d\\bar d)/\\sqrt2$. In the ideal SU(3) picture the η would be the octet state $(u\\bar u + d\\bar d - 2s\\bar s)/\\sqrt6$ and the η′ the singlet $(u\\bar u + d\\bar d + s\\bar s)/\\sqrt3$. In reality the physical η and η′ are mixtures of those two, with a mixing angle of roughly −10° to −20° depending on how it is extracted.</p>
<p>The η′ is also much heavier than the octet pattern suggests. Its mass comes largely from a quantum effect of the strong force, the axial anomaly, not from quark masses. The scene shows the η′ towering above the others for that reason.</p>`,
    },
  ],
  challenges: [
    {
      id: 'proton',
      title: 'Build the proton',
      prompt: 'Use the quark builder to make a proton.',
      hint: 'Two up quarks and one down. The proton has charge +1 = ⅔ + ⅔ − ⅓.',
      check: (s) => s.built === 'uud',
    },
    {
      id: 'omega',
      title: 'Predict the Ω⁻',
      prompt: 'In prediction mode, set your guess for the Ω⁻ mass and reveal it. Land within 20 MeV of the true value.',
      hint: 'Read the step sizes in the corner graph. Add one more step of about the same size to the Ξ* level.',
      check: (s) => (s.omegaBestErr as number) <= 20,
    },
    {
      id: 'strange-meson',
      title: 'Build a strange meson',
      prompt: 'Build a meson with nonzero strangeness.',
      hint: 'Switch the builder to Meson and include exactly one s or s̄. An s with an s̄ cancels out.',
      check: (s) => s.builtStrangeMeson === true,
    },
    {
      id: 's-minus-3',
      title: 'Strangeness −3',
      prompt: 'Find and select the only particle here with S = −3.',
      hint: 'Each s quark gives S = −1. You need three of them.',
      check: (s) => s.selectedS === -3,
    },
  ],
  caveats: `<p>The quark contents shown are the simple flavour labels. Real hadrons also contain gluons and a sea of quark–antiquark pairs, and most of the proton's mass comes from strong-force energy, not from quark masses. The η and η′ are drawn as ideal octet and singlet states, though the physical ones are mixtures.</p>
<p>The mass rules are first-order approximations. The decuplet steps are 153, 149 and 139 MeV, not exactly equal. The Δ masses are quoted as a single value because these resonances are broad, about 117 MeV wide. Electromagnetic effects split the charge states by a few MeV and are ignored in the rules.</p>`,
  further: [
    { label: 'Barnes et al., Observation of a Hyperon with Strangeness Minus Three (1964)', url: 'https://doi.org/10.1103/PhysRevLett.12.204' },
    { label: 'Gell-Mann, A schematic model of baryons and mesons (1964)', url: 'https://doi.org/10.1016/S0031-9163(64)92001-3' },
    { label: 'Eightfold way on Wikipedia', url: 'https://en.wikipedia.org/wiki/Eightfold_way_(physics)' },
    { label: 'Particle Data Group, Review of Particle Physics', url: 'https://pdg.lbl.gov/' },
  ],
};
