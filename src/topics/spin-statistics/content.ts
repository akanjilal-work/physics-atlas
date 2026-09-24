import type { TopicContent } from '../../core/types.ts';

export const content: TopicContent = {
  intuition: `
<p class="lead">Every electron in the universe is exactly like every other electron. Not just similar. Identical. Quantum mechanics takes that literally, and the consequences shape almost everything around you.</p>
<p>If two particles are truly identical, swapping them cannot change anything you could measure. The wavefunction may only pick up a sign. Nature uses both options. Particles that keep the sign are <strong>bosons</strong>. Particles that flip it are <strong>fermions</strong>.</p>
<p>That one sign has huge effects. A fermion wavefunction must equal minus itself when both particles sit at the same place, so it has to be zero there. Two identical fermions can never be found in the same state. This is the <strong>Pauli exclusion principle</strong>. Bosons do the opposite. They are more likely than chance to be found together.</p>
<p>Look at the three surfaces in the scene. Each one shows where two particles in a box are likely to be. The pink line marks the places where both particles sit at the same point. For fermions the surface drops to zero along that line. For bosons it rises into a ridge.</p>
<p>Electrons are fermions, so they stack into atoms one pair per orbital instead of all falling into the lowest level. That stacking builds the periodic table and keeps matter from collapsing. Photons are bosons, so they happily crowd into one mode. That is how a laser works.</p>`,
  tryFirst: [
    'Switch <b>Particle type</b> between the three options and compare the pink diagonal on each surface.',
    'Set both box states to the same value. The fermion surface disappears: no such state exists.',
    'Open the <b>Filling</b> view and press <b>Build atoms</b> to watch electrons fill shells from hydrogen to calcium.',
    'Open the <b>HOM</b> view and slide the delay to zero. The coincidence lamp goes quiet.',
  ],
  equation: {
    tex: '\\psi(x_1,x_2) \\;=\\; \\pm\\,\\psi(x_2,x_1)',
    caption: 'Swap two identical particles and the wavefunction comes back to itself up to a sign. Spin 1/2 particles (fermions) take the minus sign. Integer-spin particles (bosons) take the plus sign.',
    terms: [
      { tex: '\\psi(x_1,x_2)', name: 'Two-particle wavefunction', meaning: 'One amplitude for finding one particle at $x_1$ and the other at $x_2$. Here it is built from box states $n_1$ and $n_2$.', param: 'n1' },
      { tex: '\\psi(x_2,x_1)', name: 'Swapped wavefunction', meaning: 'The same function with the two positions exchanged. Change $n_2$ to change the second state.', param: 'n2' },
      { tex: '\\pm', name: 'Exchange sign', meaning: '$+$ for bosons, $-$ for fermions. Distinguishable particles obey no such rule. Set by the particle type.', param: 'ptype' },
      { tex: 'x_1 = x_2', name: 'The diagonal', meaning: 'Put both particles at the same place. The minus sign forces $\\psi = -\\psi$, so $\\psi = 0$. The readout compares the density there with distinguishable particles.', param: 'diag' },
      { tex: 'x_1,\\,x_2', name: 'Positions', meaning: 'The rms distance between the particles shows the effective push (fermions) or pull (bosons) that comes from symmetry alone.', param: 'sep' },
    ],
  },
  physicsNotes: `
<h3>Building the states</h3>
<p>One particle in a box of width $L$ has states $\\phi_n(x) = \\sqrt{2/L}\\,\\sin(n\\pi x/L)$. Put particle 1 in state $a$ and particle 2 in state $b$. For distinguishable particles the joint wavefunction is the product $\\phi_a(x_1)\\phi_b(x_2)$. For identical particles we must symmetrise or antisymmetrise:</p>
$$\\psi_\\pm = \\tfrac{1}{\\sqrt2}\\big[\\phi_a(x_1)\\phi_b(x_2) \\pm \\phi_b(x_1)\\phi_a(x_2)\\big]$$
<p>On the diagonal $x_1 = x_2 = x$ the two terms are equal. The minus version cancels to zero. The plus version gives $|\\psi_+|^2 = 2|\\phi_a(x)\\phi_b(x)|^2$, exactly twice the distinguishable value. If $a = b$ the fermion state vanishes everywhere. That is exclusion in its simplest form.</p>
<h3>An exchange "force" with no force</h3>
<p>The average squared separation works out to</p>
$$\\langle (x_1-x_2)^2\\rangle_\\pm = \\langle (x_1-x_2)^2\\rangle_{\\text{dist}} \\mp 2\\,|\\langle a|x|b\\rangle|^2$$
<p>Bosons sit closer together and fermions sit farther apart than distinguishable particles in the same states. No potential is involved. It is pure symmetry. The readout computes the separation on a grid and compares it with this formula.</p>
<h3>Many particles: occupation numbers</h3>
<p>At temperature $T$ the mean number of particles in a single state of energy $E$ is</p>
$$\\bar n = \\frac{1}{e^{(E-\\mu)/kT} + 1}\\ \\text{(Fermi–Dirac)},\\qquad \\bar n = \\frac{1}{e^{(E-\\mu)/kT} - 1}\\ \\text{(Bose–Einstein)}$$
<p>Here $\\mu$ is the chemical potential, fixed by the total particle number. The $+1$ caps fermions at one per state. The $-1$ lets bosons pile up without limit as $\\mu$ approaches the lowest level. When $E - \\mu \\gg kT$ both reduce to the classical Boltzmann factor $e^{-(E-\\mu)/kT}$. The inset shows all three for the current temperature.</p>`,
  deep: [
    {
      title: 'The spin–statistics theorem',
      html: `<p>Why should the sign be tied to spin? In ordinary quantum mechanics it is simply a rule you add by hand. Markus Fierz (1939) and Wolfgang Pauli (1940) showed that it follows once quantum mechanics is combined with special relativity.</p>
<p>The argument runs through quantum field theory. Demand that energy is bounded below and that measurements at spacelike separation do not disturb each other. Then fields of integer spin must be quantised with commutators (bosons), and fields of half-integer spin with anticommutators (fermions). Try it the other way round and you get either energies with no floor or signals faster than light.</p>
<p>There is no simple intuitive proof. Feynman said so himself in his lectures. The theorem is well established, and every particle measured so far obeys it.</p>`,
    },
    {
      title: 'Why matter is solid: Pauli, shells and stability',
      html: `<p>Pauli proposed exclusion in 1925 to explain the pattern of atomic spectra and the closing of electron shells. The Filling view shows the idea. Each orbital holds two electrons, one spin up and one spin down. So electrons climb a ladder of levels, and the rows of the periodic table close at 2, 10 and 18 electrons: helium, neon and argon. The row capacities are 2, 8 and 8.</p>
<p>This is a simplification. The ladder here is a toy spectrum with the real ordering (1s, 2s, 2p, 3s, 3p, 4s, 3d). Real atoms need electron–electron repulsion to get that ordering, and some heavier atoms, such as chromium and copper, break the simple rule.</p>
<p>Exclusion also stops bulk matter from collapsing. Freeman Dyson and Andrew Lenard proved in 1967 that ordinary matter, with fermion electrons, has a binding energy that grows only in proportion to the number of particles. Together with later work on volume, this is why two kilograms of rock take up about twice the space of one. Dyson also showed that if electrons were bosons, the binding energy would grow faster than the number of particles, and bulk matter would not be stable. Elliott Lieb and Walter Thirring later gave a much shorter proof.</p>`,
    },
    {
      title: 'Bosons together: lasers and condensates',
      html: `<p>For bosons, the rate at which a particle enters a state that already holds $n$ identical bosons grows as $n + 1$. For photons, the extra $n$ is stimulated emission, which Einstein described in 1917. A laser uses it: each photon in the cavity mode makes it more likely that the next photon joins the same mode. See <a href="#/t/lasers">lasers</a>.</p>
<p>Cool a gas of bosonic atoms enough and a large fraction drops into the single lowest state. That is a Bose–Einstein condensate, first made in 1995 by Eric Cornell and Carl Wieman with rubidium and by Wolfgang Ketterle with sodium. See <a href="#/t/bose-einstein">Bose–Einstein condensates</a>.</p>
<p>A caution about the Filling view. At zero temperature, distinguishable particles also all sit in the ground state. The difference shows at finite temperature. Bosons start piling into the ground state at a much higher temperature than a classical estimate suggests, because the $-1$ in the Bose–Einstein formula favours already occupied states.</p>`,
    },
    {
      title: 'The Hong–Ou–Mandel dip',
      html: `<p>In 1987 Chung Ki Hong, Zhe Yu Ou and Leonard Mandel sent pairs of identical photons into the two inputs of a 50:50 beam splitter. There are two ways for the photons to leave through different ports: both transmitted, or both reflected. For identical bosons these two amplitudes are equal in size and opposite in sign, so they cancel. The photons always leave together.</p>
<p>Delay one photon by more than its coherence time $\\tau_c$ and the photons become distinguishable by arrival time. The cancellation stops and the coincidence probability goes back to one half. Scanning the delay traces the dip:</p>
$$P_c(\\tau) = \\tfrac12\\big(1 - V e^{-\\tau^2/\\tau_c^2}\\big)$$
<p>for Gaussian wave packets. The visibility $V$ measures how identical the photons are. $V = 1$ means perfectly identical. The dip is now a standard test of single-photon sources for quantum computing. Fermions give the opposite result, a peak with $V = -1$, because the two amplitudes add with the same sign. That antibunching has been seen with electrons in semiconductor circuits.</p>`,
    },
    {
      title: 'Stars and anyons',
      html: `<p><strong>White dwarfs.</strong> When a Sun-like star runs out of fuel, its core shrinks until the electrons are packed so tightly that exclusion forces them into ever higher momentum states. That creates degeneracy pressure, even at zero temperature. For non-relativistic electrons at number density $n_e$,</p>
$$P = \\frac{(3\\pi^2)^{2/3}}{5}\\,\\frac{\\hbar^2}{m_e}\\, n_e^{5/3}$$
<p>A white dwarf with the mass of the Sun is about the size of the Earth. Subrahmanyan Chandrasekhar showed in 1930–31 that relativity weakens this pressure, so no white dwarf can exceed about 1.4 solar masses. See <a href="#/t/stellar-evolution">stellar evolution</a>.</p>
<p><strong>Anyons.</strong> The argument that only $\\pm$ are allowed assumes that swapping twice is the same as doing nothing. In three dimensions that holds. In two dimensions a double swap can wind one particle around the other, so the exchange phase $e^{i\\theta}$ may take any value. Jon Magne Leinaas and Jan Myrheim pointed this out in 1977, and Frank Wilczek named such particles anyons in 1982. Quasiparticles in the fractional <a href="#/t/quantum-hall">quantum Hall effect</a> are anyons. Two experiments reported direct evidence of their statistics in 2020.</p>`,
    },
  ],
  challenges: [
    {
      id: 'fermion-zero',
      title: 'The forbidden line',
      prompt: 'In the Exchange view, select fermions with two different box states and find the zero along the diagonal.',
      hint: 'Set Particle type to Fermions. Keep $n_1 \\neq n_2$. The pink line lies flat on the floor.',
      check: (s) => s.view === 'exchange' && s.ptype === 'fermion' && s.n1 !== s.n2,
    },
    {
      id: 'ten-bosons',
      title: 'Pile them up',
      prompt: 'In the Filling view, get at least 9.5 of 10 or more bosons into the lowest level.',
      hint: 'Choose Bosons, raise the particle number to 10, and lower the temperature.',
      check: (s) => s.view === 'filling' && s.ptype === 'boson' && (s.N as number) >= 10 && (s.N0 as number) >= 9.5,
    },
    {
      id: 'neon',
      title: 'Close a shell',
      prompt: 'Fill fermions up to neon ($Z = 10$) and see the second row close with 8 electrons.',
      hint: 'Choose Fermions, set the number to 10, and keep the temperature low so nothing leaks into 3s.',
      check: (s) => s.view === 'filling' && s.ptype === 'fermion' && s.N === 10 && (s.shell2 as number) > 7.95 && (s.shell3 as number) < 0.05,
    },
    {
      id: 'hom-dip',
      title: 'Find the dip',
      prompt: 'With identical photons, find the delay where coincidences almost vanish. Collect at least 30 pairs there with a measured coincidence rate under 5%.',
      hint: 'Open the HOM view, choose Bosons, and slide the delay to zero. Wait a moment for counts.',
      check: (s) => s.view === 'hom' && s.ptype === 'boson' && Math.abs(s.delay as number) <= 0.1 && (s.pairsHere as number) >= 30 && (s.measured as number) < 0.05,
    },
  ],
  caveats: `<p>The particles in the box do not interact, and the box is one-dimensional. The spin part of the wavefunction is left out. For real electrons it is the whole state, spin included, that must be antisymmetric. Two electrons with opposite spins can have a symmetric spatial part.</p>
<p>The Filling view uses a toy energy ladder with the real Madelung order up to 4p, not measured atomic energies. It treats particles as independent and ignores electron repulsion. It shows thermal occupations of these levels, which for real atoms would need absurd temperatures. Hund's rule is used only to decide how to draw partly filled orbitals.</p>
<p>The HOM view assumes a lossless 50:50 beam splitter, perfect detectors and Gaussian wave packets. The counts are simulated with a random number generator, not measured.</p>`,
  further: [
    { label: 'Pauli, The Connection Between Spin and Statistics (1940)', url: 'https://doi.org/10.1103/PhysRev.58.716' },
    { label: 'Hong, Ou and Mandel, PRL 59, 2044 (1987)', url: 'https://doi.org/10.1103/PhysRevLett.59.2044' },
    { label: 'Spin–statistics theorem on Wikipedia', url: 'https://en.wikipedia.org/wiki/Spin%E2%80%93statistics_theorem' },
    { label: 'Stability of matter on Wikipedia', url: 'https://en.wikipedia.org/wiki/Stability_of_matter' },
  ],
};
