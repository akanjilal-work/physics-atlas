import type { TopicContent } from '../../core/types.ts';

export const content: TopicContent = {
  intuition: `
<p class="lead">Empty space is not empty. Quantum theory says every field, like the electromagnetic field, is a huge collection of tiny oscillators, one for each way a wave can fit into space. A quantum oscillator can never sit perfectly still. Even in its lowest state it keeps a small jitter energy, half of one quantum.</p>
<p>So add it up. Every mode of every field contributes a little energy to every cubic metre of space. The trouble is how many modes there are. Shorter waves fit in more ways, and each one also carries more energy. Count all waves down to some shortest length and the total grows as the <strong>fourth power</strong> of the cutoff. Halve the shortest wavelength and the energy goes up sixteen times.</p>
<p>Gravity feels all energy, including this one. Empty space with energy pushes the universe apart faster and faster. We do see that push. Since 1998 we know the expansion is accelerating. But the measured energy of empty space is tiny, about half a billionth of a joule per cubic metre. The naive count, with waves down to the Planck length, gives about $10^{111}$ joules per cubic metre. The mismatch is a factor of roughly $10^{120}$. It is often called the <strong>worst prediction in physics</strong>.</p>
<p>The scene has two parts. On the left, the <strong>mode counter</strong> shows wave modes as dots in a space of wavenumbers. Raise the cutoff and new shells of modes light up. On the right, the <strong>energy tower</strong> stacks one slab for every factor of ten between what we observe and what the naive count predicts. Fly up it. It takes a while.</p>
<p>Nobody knows the answer. This page shows the problem honestly, including the parts that depend on how you count.</p>`,
  tryFirst: [
    'Drag <b>Cutoff energy</b> all the way right to the Planck scale. The tower lights up to the top and the gap reads about $10^{121}$.',
    'Press <b>Double cutoff</b>. The energy density jumps by exactly 16. That is the $k_{\\max}^4$ law.',
    'Turn on <b>SUSY cancellation</b>. A fermion tower appears with the opposite sign. Most of the energy cancels, but a big residue remains.',
    'Press <b>Fly up the tower</b> and ride from the observed value to the Planck value.',
  ],
  equation: {
    tex: '\\rho_{\\text{vac}} \\;=\\; \\int^{k_{\\max}} \\frac{d^3k}{(2\\pi)^3}\\,\\frac{\\hbar\\omega_k}{2} \\;\\propto\\; k_{\\max}^4',
    caption: 'Sum the zero-point energy of every field mode up to a cutoff. For a massless field $\\omega_k = ck$, and the integral gives $\\rho_{\\text{vac}} = \\hbar c\\,k_{\\max}^4/16\\pi^2$ per degree of freedom.',
    terms: [
      { tex: '\\rho_{\\text{vac}}', name: 'Vacuum energy density', meaning: 'Energy per cubic metre of empty space, from zero-point motion alone. Compare it with the observed $\\rho_\\Lambda \\approx 5\\times10^{-10}$ J/m³.', param: 'rho' },
      { tex: 'k_{\\max}', name: 'Cutoff', meaning: 'The largest wavenumber we trust. The slider sets it through the energy $E = \\hbar c\\,k_{\\max}$.', param: 'cutoff' },
      { tex: '\\frac{d^3k}{(2\\pi)^3}', name: 'Mode density', meaning: 'How many modes fit per unit volume of space and per unit volume of $k$-space. Up to $k_{\\max}$ there are $k_{\\max}^3/6\\pi^2$ modes per cubic metre.', param: 'modes' },
      { tex: '\\frac{\\hbar\\omega_k}{2}', name: 'Zero-point energy', meaning: 'Each mode is a quantum oscillator and keeps half a quantum even in its ground state. The top mode carries $E/2$.', param: 'emode' },
      { tex: 'k_{\\max}^4', name: 'Fourth-power growth', meaning: 'Three powers from counting modes, one from the energy per mode. Doubling the cutoff multiplies the density by 16.', param: 'ratio' },
    ],
  },
  physicsNotes: `
<h3>Doing the integral</h3>
<p>Use spherical shells in $k$-space, $d^3k = 4\\pi k^2\\,dk$, and $\\omega_k = ck$ for a massless field:</p>
$$\\rho_{\\text{vac}} = \\frac{4\\pi}{(2\\pi)^3}\\int_0^{k_{\\max}} k^2\\,\\frac{\\hbar c k}{2}\\,dk = \\frac{\\hbar c\\,k_{\\max}^4}{16\\pi^2}.$$
<p>The mode counter in the scene does the same sum by brute force. Standing waves in a box of side $L$ have $k = \\tfrac{\\pi}{L}(n_x, n_y, n_z)$ with whole numbers $n_i \\ge 1$. Summing $\\hbar c k/2$ over the lattice and dividing by $L^3$ approaches the formula above as the box grows. The test suite checks this.</p>
<h3>What we observe</h3>
<p>The dark-energy density is $\\rho_\\Lambda = \\Omega_\\Lambda\\,\\rho_c c^2$ with $\\rho_c = 3H_0^2/8\\pi G$. Planck 2018 gives $\\Omega_\\Lambda = 0.685$ and $H_0 = 67.4$ km/s/Mpc, so $\\rho_\\Lambda \\approx 5.2\\times10^{-10}$ J/m³. In natural units that is $(2.2\\text{ meV})^4$. The often quoted round figures, $6\\times10^{-10}$ J/m³ and $(2.3\\text{ meV})^4$, come from $H_0 = 70$ and $\\Omega_\\Lambda = 0.7$.</p>
<h3>How big is the gap?</h3>
<p>With one degree of freedom and a cutoff at the Planck energy $E_P = \\sqrt{\\hbar c^5/G} \\approx 1.22\\times10^{19}$ GeV, the sum gives $2.9\\times10^{111}$ J/m³, a factor $10^{120.7}$ above observation. With a cutoff at the electroweak scale, 246 GeV, the factor is about $10^{54}$. The famous "$10^{120}$" is not a precise number. Use the reduced Planck mass, drop the $16\\pi^2$, or count all Standard Model fields, and you get anything from about $10^{118}$ to $10^{123}$. Every version is absurd.</p>
<h3>Why the equation of state is $w = -1$</h3>
<p>Vacuum energy must look the same to every inertial observer. The only stress tensor with that property is $T_{\\mu\\nu} = -\\rho_{\\text{vac}}\\,g_{\\mu\\nu}$, which means pressure $p = -\\rho_{\\text{vac}}$, or $w = p/\\rho = -1$. With $d(\\rho V) = -p\\,dV$, the density then stays constant as space expands. Matter dilutes as $a^{-3}$, radiation as $a^{-4}$, and the vacuum not at all. That is why it wins in the end and makes expansion accelerate.</p>`,
  deep: [
    {
      title: 'Supersymmetry: a near miss',
      html: `<p>Fermion fields contribute zero-point energy with the <em>opposite sign</em>: $-\\hbar\\omega_k/2$ per mode. In a supersymmetric theory every boson has a fermion partner with the same mass, so the two towers cancel exactly and $\\rho_{\\text{vac}} = 0$.</p>
<p>But no superpartners have been found. The LHC excludes many of them below roughly 1 to 2 TeV, and lighter limits apply to others. If supersymmetry exists it is broken at some scale $M_S$. The scene uses a simple model: a chiral multiplet with scalars of mass² $2M_S^2$ and $0$ and a fermion of mass $M_S$. The $k^4$ and $k^2$ pieces cancel exactly, and the residue is</p>
$$|\\rho_{\\text{res}}| \\approx \\frac{M_S^4}{8\\pi^2}\\left(\\frac14 \\ln\\frac{k_{\\max}}{M_S} - \\frac{1}{16}\\right)\\ \\text{per boson-fermion pair}.$$
<p>In this model the residue is negative. With $M_S = 1$ TeV and a Planck cutoff, this removes about 63 orders of magnitude. About $10^{58}$ remain. Supersymmetry helps enormously and still fails badly.</p>`,
    },
    {
      title: 'History: Zel’dovich and Weinberg',
      html: `<p>Einstein added a cosmological constant $\\Lambda$ to his equations in 1917 to allow a static universe. In 1967 Yakov Zel’dovich pointed out that quantum vacuum energy acts exactly like a $\\Lambda$ term, and that particle physics gives a value far too large. This turned a free parameter of gravity into a puzzle about quantum fields.</p>
<p>Steven Weinberg’s 1989 review, <em>The cosmological constant problem</em>, set out the problem and the proposed solutions in the form still used today. At the time most physicists assumed some unknown symmetry would make $\\Lambda$ exactly zero. In 1998 two supernova teams found that the expansion is accelerating. $\\Lambda$ is small but not zero, which makes the puzzle harder.</p>`,
    },
    {
      title: 'Weinberg’s anthropic bound',
      html: `<p>In 1987 Weinberg asked how large a positive vacuum energy could be and still let galaxies form. Too much of it drives space apart before matter can clump. He found that $\\rho_\\Lambda$ could be at most a few hundred times the present matter density. Weinberg himself was cautious about what this meant. Later work, including his own with Martel and Shapiro in 1998, turned it into a rough expectation: if $\\Lambda$ varies across a vast ensemble of universes, observers should typically see a value not far below the bound. The measured value is about 2.2 times the matter density today. That is small enough for galaxies and larger than most physicists expected before 1998.</p>
<p>This is an order-of-magnitude argument, not a derivation. It only works if many universes with different $\\Lambda$ really exist.</p>`,
    },
    {
      title: 'Possible ways out',
      html: `<p><strong>Unimodular gravity.</strong> If the determinant of the metric is held fixed, a constant vacuum energy drops out of the field equations. $\\Lambda$ reappears as an integration constant. This removes the $10^{120}$ contribution, but it says nothing about why the constant is as small as it is.</p>
<p><strong>The landscape.</strong> String theory may have an enormous number of vacua, each with a different $\\Lambda$. Bousso and Polchinski (2000) showed how quantised fluxes can give a finely spaced set of values. We would then live in one of the rare vacua that allow galaxies. See <a href="#/t/string-landscape">the string landscape</a>. This is speculative and hotly debated.</p>
<p><strong>Something unknown.</strong> Proposals include dynamical relaxation, sequestering, and changes to gravity at large or small scales. None is established. It is also possible that the question is wrongly posed: we do not have a theory of quantum gravity to tell us how vacuum energy actually gravitates.</p>`,
    },
    {
      title: 'How robust is the 10^120?',
      html: `<p>A hard momentum cutoff is a crude tool. It breaks Lorentz invariance, and a massless tower cut off this way actually has pressure $p = \\rho/3$, like radiation, not $p = -\\rho$. A careful Lorentz-invariant calculation, for example with dimensional regularisation, finds that massless fields contribute nothing. Massive fields give terms like $m^4 \\ln(m^2/\\mu^2)$.</p>
<p>Jérôme Martin (2012) did that sum for the Standard Model and found a mismatch of about $10^{55}$, not $10^{120}$. So the precise number depends on the method. The core problem survives every method: known particle masses alone should give a vacuum energy dozens of orders of magnitude larger than we see, and nothing we know cancels it.</p>
<p>Casimir forces are often cited as evidence for vacuum energy. They measure how vacuum energy <em>changes</em> between plates, which is a real and tested effect. They do not measure the absolute energy that gravity would feel.</p>`,
    },
  ],
  challenges: [
    {
      id: 'match',
      title: 'Match the universe',
      prompt: 'With cancellation off, find the cutoff at which the zero-point sum equals the observed dark-energy density to within a factor of 3.',
      hint: 'Slide the cutoff almost to the far left. The answer is a few milli-electronvolts, a wavelength of a fraction of a millimetre.',
      check: (s) => s.cancel === false && Math.abs(s.logRatio as number) < Math.log10(3),
    },
    {
      id: 'planck',
      title: 'The worst prediction',
      prompt: 'Push the cutoff to the Planck energy with cancellation off and read a mismatch of at least $10^{120}$.',
      hint: 'Press the Planck preset or drag the cutoff slider all the way right.',
      check: (s) => s.cancel === false && (s.logCut as number) >= 28 && (s.logRatio as number) >= 120,
    },
    {
      id: 'susy',
      title: 'Nearly cancelled',
      prompt: 'Keep the cutoff at or above $10^{18}$ GeV, turn on SUSY cancellation, and shrink the gap by at least 40 orders of magnitude.',
      hint: 'Planck preset, then the SUSY toggle. The default breaking scale of 1 TeV already does it. Try raising it to see the gap grow back.',
      check: (s) => s.cancel === true && (s.logCut as number) >= 27 && (s.gapShrink as number) >= 40,
    },
    {
      id: 'double',
      title: 'The fourth power',
      prompt: 'With cancellation off, double the cutoff and confirm that the energy density rises by a factor of 16.',
      hint: 'Use the Double cutoff button. Two more doublings give 256.',
      check: (s) => s.cancel === false && Math.abs((s.doubleFactor as number) - 16) < 0.05,
    },
  ],
  caveats: `<p>The scene uses one massless scalar degree of freedom and a hard momentum cutoff. Real fields have many degrees of freedom and masses, and a hard cutoff is not Lorentz invariant. The size of the mismatch depends on these choices, from about $10^{118}$ to $10^{123}$ at the Planck scale, and about $10^{55}$ with a careful Lorentz-invariant treatment of Standard Model masses. Every version is enormous.</p>
<p>The supersymmetry model is one chiral multiplet with a simple mass pattern. Below the breaking scale the partners are treated as absent, so nothing cancels there, and the residue jumps where the cutoff crosses $M_S$. The mode counter draws its radius on a logarithmic scale so thirty decades fit in one box. The tower slabs are one factor of ten each.</p>
<p>Nobody knows how vacuum energy gravitates in a full theory of quantum gravity. Everything here assumes it gravitates like ordinary energy.</p>`,
  further: [
    { label: 'Weinberg, The cosmological constant problem, Rev. Mod. Phys. 61, 1 (1989)', url: 'https://doi.org/10.1103/RevModPhys.61.1' },
    { label: 'Martin, Everything you always wanted to know about the cosmological constant problem (2012)', url: 'https://arxiv.org/abs/1205.3365' },
    { label: 'Weinberg, Anthropic bound on the cosmological constant, PRL 59, 2607 (1987)', url: 'https://doi.org/10.1103/PhysRevLett.59.2607' },
    { label: 'Cosmological constant problem on Wikipedia', url: 'https://en.wikipedia.org/wiki/Cosmological_constant_problem' },
  ],
};
