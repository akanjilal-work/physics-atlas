import type { TopicContent } from '../../core/types.ts';

export const content: TopicContent = {
  intuition: `
<p class="lead">A neutrino can leave the Sun as an electron neutrino and arrive at Earth as something else. It changes identity in flight, back and forth, like a slow beat between two musical notes.</p>
<p>Neutrinos come in three <strong>flavours</strong>: electron, muon and tau. The flavour is the label a neutrino shows when it is made or caught. But a neutrino with a definite flavour does not have a definite mass. It is a blend of three <strong>mass states</strong>, called $\\nu_1$, $\\nu_2$ and $\\nu_3$.</p>
<p>Each mass state travels as a quantum wave. Because the masses differ very slightly, the waves have very slightly different wavelengths. They start in step. Over hundreds of kilometres they drift out of step, and the blend they make now looks like a different flavour. Further on they drift back. That is a <strong>neutrino oscillation</strong>.</p>
<p>In the scene, the tube is the flight path from source to detector. Its colour shows the flavour mix at each point: <span style="color:#5ee39a">green</span> for electron, <span style="color:#4f86ff">blue</span> for muon, <span style="color:#ff6b6b">red</span> for tau. Above it are the three mass waves. The vertical ticks mark the crests of $\\nu_1$. Watch the other waves slide past those ticks. Where the crests line up again, the neutrino is back to its birth flavour. The stacked bar under the travelling neutrino shows its flavour odds right now.</p>
<p>The disc on the right is Earth cut in half. Neutrinos made in the air on the far side of the planet cross it to reach a detector. This is how Super-Kamiokande found, in 1998, that about half of the muon neutrinos coming up through Earth had gone missing.</p>
<p>The surprise is deep. Oscillation only happens if the masses differ, so neutrinos cannot all be massless. The Standard Model had assumed they were.</p>`,
  tryFirst: [
    'Press <b>T2K</b>. A muon neutrino flies 295 km across Japan and arrives almost entirely as something else. Now drag <b>Energy</b> and watch the red stretch of the tube slide.',
    'Press <b>Atmos.</b> and look at the Earth view. Make the baseline short (a neutrino from overhead) and then long (from below). Only the long path changes the flavour a lot.',
    'Set <b>Model</b> to <b>2 flavours</b>. Put the mixing angle to 0° and see the colour freeze. Then restore it and set Δm² to 0.',
    'Press <b>Sun</b>. The waves are far too fast to draw over 150 million km. Only an average survives, and the curve in the corner goes flat.',
  ],
  equation: {
    tex: 'P_{\\alpha\\to\\beta} \\;=\\; \\sin^2 2\\theta\\;\\sin^2\\!\\left(\\frac{1.27\\,\\Delta m^2\\,L}{E}\\right)',
    caption: 'The two-flavour oscillation formula, with $\\Delta m^2$ in eV², $L$ in km and $E$ in GeV. The first factor is the depth of the oscillation. The second sets where along the path it happens.',
    terms: [
      { tex: 'P_{\\alpha\\to\\beta}', name: 'Appearance probability', meaning: 'The chance that a neutrino born as flavour $\\alpha$ is caught as flavour $\\beta$. The panel shows all three flavour probabilities at the detector.', param: 'P' },
      { tex: '\\sin^2 2\\theta', name: 'Mixing strength', meaning: 'How strongly the flavour states are blended from mass states. At $\\theta = 45°$ the conversion can be complete. At $\\theta = 0$ nothing happens.', param: 'theta' },
      { tex: '\\Delta m^2', name: 'Mass-squared splitting', meaning: 'The difference of the squared masses, $m_2^2 - m_1^2$. It sets how fast the waves drift out of step. Zero splitting means no drift.', param: 'dm2' },
      { tex: 'L', name: 'Baseline', meaning: 'Distance from source to detector, in km.', param: 'L' },
      { tex: 'E', name: 'Energy', meaning: 'Neutrino energy in GeV. Faster (more energetic) neutrinos oscillate over longer distances.', param: 'E' },
      { tex: '1.27', name: 'Unit constant', meaning: 'Converts eV², km and GeV into a phase in radians. It equals $1/(4\\hbar c)$ in these units, 1.2669. The whole bracket is the phase readout.', param: 'phase' },
    ],
  },
  physicsNotes: `
<h3>Where the formula comes from</h3>
<p>Write a flavour state as a blend of mass states, $|\\nu_\\alpha\\rangle = \\sum_i U^*_{\\alpha i}\\,|\\nu_i\\rangle$. The matrix $U$ is the <strong>PMNS matrix</strong>, after Pontecorvo, Maki, Nakagawa and Sakata. Each mass state picks up a phase as it travels. For an ultra-relativistic neutrino of energy $E$, the momentum is $p_i \\approx E - m_i^2/2E$, so after a distance $L$ the phase lags by $m_i^2 L/2E$. The amplitude to be found as flavour $\\beta$ is</p>
$$A_{\\alpha\\to\\beta} = \\sum_i U^*_{\\alpha i}\\,U_{\\beta i}\\,e^{-i m_i^2 L/2E}.$$
<p>Only the differences $\\Delta m^2_{ij} = m_i^2 - m_j^2$ survive in $|A|^2$. With two flavours, $U$ is a rotation by one angle $\\theta$, and squaring the amplitude gives the headline formula. The factor 1.27 appears when you put back $\\hbar$ and $c$ and use eV², km and GeV.</p>
<h3>Three flavours</h3>
<p>With three flavours, $U$ has three angles and one phase. The simulation uses the standard parametrisation with the NuFIT 6.0 (2024) best fits: $\\theta_{12} = 33.7°$, $\\theta_{13} = 8.5°$, $\\theta_{23} = 48.5°$, $\\Delta m^2_{21} = 7.49\\times10^{-5}$ eV² and $|\\Delta m^2_{31}| \\approx 2.5\\times10^{-3}$ eV². The two splittings differ by a factor of about 34. So there are two oscillations at once: a fast "atmospheric" one and a slow "solar" one. The corner plot shows both, on a log scale of $L/E$.</p>
<p>The accuracy readout checks that the three probabilities add up to one. That holds because $U$ is unitary. It is a test of the code, not a measured fact.</p>
<h3>The mass-state waves in the scene</h3>
<p>The wave heights show how much of each mass state the starting flavour contains, $|U_{\\alpha i}|$. Start with $\\nu_e$ and the $\\nu_3$ wave is almost flat, because $|U_{e3}| = \\sin\\theta_{13} \\approx 0.15$. The carrier wavelength is drawn far longer than a real neutrino's, which is smaller than an atom. Only the <em>relative</em> slip between the waves is to scale.</p>`,
  deep: [
    {
      title: 'Why oscillation means mass',
      html: `<p>A massless particle moves at exactly the speed of light, and its internal clock does not tick. All massless states would share the same phase at every point. Nothing could drift, and a flavour would stay a flavour forever.</p>
<p>The oscillation frequency is set by $\\Delta m^2$. Seeing oscillations with two different lengths means at least two neutrinos have mass, and the heaviest one is at least $\\sqrt{|\\Delta m^2_{31}|} \\approx 0.05$ eV. Oscillations cannot tell us the absolute scale, because a common shift of all $m_i^2$ cancels in every difference.</p>
<p>Direct measurements look at the end of the tritium beta spectrum. In 2025 the KATRIN experiment in Karlsruhe reported an upper limit of 0.45 eV (90% confidence) on the effective electron-neutrino mass, from 259 days of data. Cosmological surveys give tighter limits on the sum of the three masses, around 0.1 eV or less, but those depend on the cosmological model used.</p>`,
    },
    {
      title: 'From Pauli to the solar neutrino problem',
      html: `<p>On 4 December 1930, Wolfgang Pauli wrote an open letter proposing a light, neutral particle to rescue energy conservation in beta decay. He was not sure it could ever be detected. Clyde Cowan and Frederick Reines caught reactor antineutrinos at the Savannah River plant in 1956, and sent Pauli a telegram. Reines shared the 1995 Nobel Prize for it.</p>
<p>From the late 1960s, Raymond Davis counted electron neutrinos from the Sun with a tank of cleaning fluid (tetrachloroethylene) in the Homestake gold mine in South Dakota. Neutrinos turned chlorine into radioactive argon, a few atoms at a time. He found about a third of what John Bahcall's solar model predicted. For three decades nobody knew whether the Sun model, the experiment, or the neutrino was wrong. Davis shared the 2002 Nobel Prize.</p>
<p>Bruno Pontecorvo had already suggested in the 1950s and 1960s that neutrinos might change into one another. It turned out to be the answer.</p>`,
    },
    {
      title: 'Super-Kamiokande, SNO and the 2015 Nobel Prize',
      html: `<p><strong>Super-Kamiokande</strong> is a 50,000 tonne tank of pure water under a mountain in Japan. It sees muon neutrinos made by cosmic rays in the atmosphere. Those coming from above travel about 15 km. Those coming from below cross the planet, up to about 12,700 km. In 1998 the collaboration reported that roughly half of the upward muon neutrinos were missing, with a dependence on $L/E$ that matched oscillation. The atmospheric preset here recreates that geometry.</p>
<p><strong>SNO</strong> in Sudbury, Canada, used 1,000 tonnes of heavy water about 2 km underground. It could count electron neutrinos alone, and also all flavours together. In 2001 and 2002 it showed that the total number of solar neutrinos matched the solar model. Only about a third still arrived as electron type. The Sun was fine. The neutrinos had changed.</p>
<p>Takaaki Kajita (Super-Kamiokande) and Arthur B. McDonald (SNO) received the 2015 Nobel Prize in Physics "for the discovery of neutrino oscillations, which shows that neutrinos have mass".</p>
<p>Reactor and beam experiments then measured the parameters directly. KamLAND saw reactor antineutrinos vanish over about 180 km (2002). T2K sends a muon neutrino beam 295 km from Tokai to Super-Kamiokande, tuned to about 0.6 GeV so that it arrives near the first oscillation maximum.</p>`,
    },
    {
      title: 'Matter effects and the Sun',
      html: `<p>Ordinary matter is full of electrons. Electron neutrinos can scatter forward off them through the charged weak current, and the other flavours cannot. This adds a potential $V = \\sqrt2\\,G_F\\,n_e$ for $\\nu_e$ only. Lincoln Wolfenstein (1978) and Stanislav Mikheyev and Alexei Smirnov (1985) showed that this can change the mixing a lot. The effect is called MSW.</p>
<p>In the two-flavour case the mixing in matter becomes</p>
$$\\sin^2 2\\theta_m = \\frac{\\sin^2 2\\theta}{\\sin^2 2\\theta + (\\cos 2\\theta - A/\\Delta m^2)^2},\\qquad A = 2\\sqrt2\\,G_F\\,n_e\\,E.$$
<p>When $A = \\Delta m^2 \\cos 2\\theta$ the mixing is maximal even if $\\theta$ is small. This is the MSW resonance. In rock, $A \\approx 1.5\\times10^{-4}\\,Y_e\\,\\rho\\,E$ eV², with $\\rho$ in g/cm³ and $E$ in GeV. Antineutrinos feel $-A$, so matter treats neutrinos and antineutrinos differently. That is why DUNE's long 1,300 km path through rock can tell the normal ordering from the inverted one.</p>
<p>In the Sun, the density falls smoothly from the core outward. High-energy boron-8 neutrinos cross the resonance slowly and leave mostly as $\\nu_2$, so only about a third are electron type. Low-energy pp neutrinos barely feel matter and show the vacuum average, near 0.55. The toggle here uses one constant density, which is a fair model for beams through the crust but not for the Sun.</p>`,
    },
    {
      title: 'Open questions',
      html: `<p><strong>Mass ordering.</strong> We know $|\\Delta m^2_{31}|$ but not its sign. Is $\\nu_3$ the heaviest (normal) or the lightest (inverted)? Current data lean normal, but not decisively. JUNO, Hyper-Kamiokande, DUNE and the IceCube upgrade aim to settle it.</p>
<p><strong>CP violation.</strong> If the phase $\\delta_{CP}$ is not 0 or 180°, neutrinos and antineutrinos oscillate differently. T2K reported in 2020 that some ranges of $\\delta_{CP}$ are disfavoured at three sigma. A clear discovery is still ahead. It matters because an imbalance between matter and antimatter in the early universe needs CP violation somewhere.</p>
<p><strong>Dirac or Majorana.</strong> A neutrino might be its own antiparticle. If so, some nuclei could undergo neutrinoless double beta decay. Experiments with xenon, germanium and tellurium are searching. None has seen it.</p>
<p><strong>The octant of $\\theta_{23}$.</strong> The best fits sit near 45°. The data do not yet say clearly whether it is above or below. If it were exactly 45°, that could hint at a hidden symmetry between the muon and tau flavours. That idea is speculative.</p>`,
    },
  ],
  challenges: [
    {
      id: 't2k-max',
      title: 'Find the T2K dip',
      prompt: 'In the 3-flavour model, send a muon neutrino over 280 to 310 km and tune the <b>Energy</b> slider until fewer than 3% arrive as muon neutrinos.',
      hint: 'Press T2K, then move the energy slider away and back. The first dip is where $1.27\\,\\Delta m^2 L/E = \\pi/2$, which gives $E = 2.54\\,\\Delta m^2 L/\\pi$.',
      check: (s) => s.model === '3f' && s.start === 'mu' && (s.L as number) >= 280 && (s.L as number) <= 310 && s.eTouched === true && (s.E as number) >= 0.45 && (s.E as number) <= 0.8 && (s.pmu as number) < 0.03,
    },
    {
      id: 'no-mix',
      title: 'Switch off mixing',
      prompt: 'In the 2-flavour model, set the mixing angle θ to 0° while the phase is at least 0.3 rad. Confirm the neutrino keeps its flavour.',
      hint: 'Move the θ slider all the way left. The tube should turn one solid colour.',
      check: (s) => s.model === '2f' && (s.theta as number) === 0 && (s.dm2 as number) > 0 && (s.phase as number) >= 0.3 && (s.psurv as number) > 0.9999,
    },
    {
      id: 'e-to-mu',
      title: 'Turn an electron neutrino muonic',
      prompt: 'Start with an electron neutrino and make it more than 50% likely to arrive as a muon neutrino.',
      hint: 'The 2-flavour model with a large angle is the easy way. In three flavours, try constant-density matter at several GeV over thousands of km.',
      check: (s) => s.start === 'e' && (s.pmu as number) > 0.5,
    },
    {
      id: 'no-split',
      title: 'Mixing without mass difference',
      prompt: 'In the 2-flavour model, keep θ at 10° or more, set Δm² to 0 and a baseline of at least 100 km. Confirm nothing oscillates.',
      hint: 'With equal masses the waves never slip. Mixing alone is not enough.',
      check: (s) => s.model === '2f' && (s.theta as number) >= 10 && (s.dm2 as number) === 0 && (s.L as number) >= 100 && (s.psurv as number) > 0.9999,
    },
  ],
  caveats: `<p>The neutrino is treated as a plane wave with one sharp energy. Real beams have a spread of energies and a source of finite size. The detector readouts average over a window of ±0.5% of the baseline to mimic this, which is why very fast oscillations show up as their average. Wave-packet separation over astronomical distances is not modelled, but it gives the same averaged answer.</p>
<p>Matter effects use a single constant density and electron fraction $Y_e = 0.5$. That is reasonable for beams through the crust. It is rough for paths through the Earth's core, where the real density profile causes extra effects, and it is wrong for the Sun, so the solar preset stays in vacuum. The Earth view assumes a straight chord between two surface points and ignores the 15 km or so of atmosphere above the source.</p>
<p>Oscillation parameters are NuFIT 6.0 best fits without Super-Kamiokande atmospheric data. The octant of $\\theta_{23}$, the sign of $\\Delta m^2_{31}$ and $\\delta_{CP}$ are still uncertain. The δCP slider lets you explore them.</p>`,
  further: [
    { label: 'NuFIT 6.0 global fit (Esteban et al., 2024)', url: 'https://arxiv.org/abs/2410.05380' },
    { label: 'Nobel Prize in Physics 2015', url: 'https://www.nobelprize.org/prizes/physics/2015/summary/' },
    { label: 'KATRIN, Direct neutrino-mass measurement (Science, 2025)', url: 'https://doi.org/10.1126/science.adq9592' },
    { label: 'Neutrino oscillation on Wikipedia', url: 'https://en.wikipedia.org/wiki/Neutrino_oscillation' },
  ],
};
