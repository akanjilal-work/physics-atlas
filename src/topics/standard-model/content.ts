import type { TopicContent } from '../../core/types.ts';

export const content: TopicContent = {
  intuition: `
<p class="lead">Everything you have ever touched is made of three particles: the up quark, the down quark and the electron. Add a few more, and you have a list that explains almost every measurement ever made in a laboratory. That list is the Standard Model.</p>
<p>It has <strong>17 entries</strong>. Twelve are matter particles: six quarks and six leptons. Four carry forces: the gluon, the photon, and the W and Z bosons. The last one is the Higgs boson, the ripple of a field that fills all of space.</p>
<p>The first surprise is the <strong>mass hierarchy</strong>. In the scene each tile's height is the particle's mass on a logarithmic scale, so every step up is a factor of ten. The top quark weighs about as much as a gold atom. The electron is 340,000 times lighter. The neutrinos are lighter still, so light that nobody has managed to weigh one. They lie flat.</p>
<p>The second surprise is <strong>why anything has mass at all</strong>. The symmetry that shapes the weak force forbids the W, the Z, the quarks and the electron from having mass on their own. The way out is the Higgs field. Its energy is lowest not at zero but on a ring, like the trough of a sombrero. The universe settled into that trough. Particles that feel the field get mass from it.</p>
<p>The third surprise is what the Higgs does <em>not</em> do. It gives the quarks their small masses, but a proton is about 100 times heavier than its three quarks. Almost all of your weight is the energy of quarks and gluons buzzing inside protons and neutrons, locked in by the strong force.</p>
<p>The <strong>Reactions</strong> view lets you play particle physics. Choose what goes in and what comes out, and the page checks the conservation laws one by one. Most combinations you invent turn out to be forbidden. That is the Standard Model at work.</p>`,
  tryFirst: [
    'Click the tallest tile. It is the top quark, 172.6 GeV. Then find the flat neutrino tiles along the front row.',
    'Switch to <b>Higgs</b> and press <b>Nudge ball</b>. It rolls off the unstable peak and settles somewhere on the rim. Every point on the rim is an equally good vacuum.',
    'Drag the <b>μ²</b> slider below zero. The hat becomes a bowl, the ball rolls to the centre and the W mass readout drops to zero. That is the symmetric phase.',
    'Switch to <b>Reactions</b> and pick <b>Beta decay</b>. Watch a down quark turn into an up quark by emitting a virtual W⁻.',
    'Pick <b>p → e⁺ π⁰</b>. Charge and energy are fine, but the baryon-number light turns red.',
  ],
  equation: {
    tex: 'V(\\phi) = -\\mu^2\\,|\\phi|^2 + \\lambda\\,|\\phi|^4',
    caption: 'The Higgs potential. With μ² > 0 its minimum is not at φ = 0 but on a ring at |φ| = v/√2, where v = √(μ²/λ) = 246 GeV.',
    terms: [
      { tex: 'V(\\phi)', name: 'Potential energy density', meaning: 'Energy stored in the Higgs field per unit volume. The readout shows its value where the ball sits, in GeV⁴.', param: 'Vball' },
      { tex: '-\\mu^2|\\phi|^2', name: 'Mass term with the wrong sign', meaning: 'For $\\mu^2 > 0$ this pushes the field away from zero and makes the peak unstable. For $\\mu^2 < 0$ the potential is a plain bowl and nothing breaks.', param: 'mu2' },
      { tex: '\\lambda|\\phi|^4', name: 'Self-coupling', meaning: 'Makes the walls rise again at large field. It sets how deep the trough is and, with $\\mu$, where it sits. Measured value about 0.13.', param: 'lambda' },
      { tex: '|\\phi|', name: 'Field size', meaning: 'Magnitude of the complex Higgs field, the distance from the centre of the hat. The ball shows the field value of the vacuum.', param: 'phi' },
      { tex: 'v', name: 'Vacuum expectation value', meaning: '$v = \\sqrt{\\mu^2/\\lambda}$, fixed by the Fermi constant at 246.22 GeV. The rim sits at $|\\phi| = v/\\sqrt2$.', param: 'v' },
      { tex: 'm_H', name: 'Higgs boson mass', meaning: 'Curvature of the trough across the rim: $m_H = \\sqrt{2}\\,\\mu$. The measured 125.13 GeV fixes $\\mu \\approx 88.5$ GeV.', param: 'mH' },
    ],
  },
  physicsNotes: `
<h3>The gauge group</h3>
<p>The Standard Model is a quantum field theory built on the symmetry group $SU(3)_C \\times SU(2)_L \\times U(1)_Y$. $SU(3)$ gives the strong force and its 8 gluons. $SU(2) \\times U(1)$ gives the electroweak force and four bosons, which the Higgs field mixes into the $W^\\pm$, the $Z$ and the photon. The subscript $L$ is a reminder that the $W$ talks only to left-handed particles, which is why the weak force violates mirror symmetry.</p>
<h3>Why the symmetry needs a Higgs</h3>
<p>A mass term for a gauge boson breaks gauge symmetry, and so does a plain mass term for a quark or electron, because the left- and right-handed parts carry different $SU(2) \\times U(1)$ charges. The Higgs is a complex doublet. With the potential above and $\\mu^2 > 0$ its lowest-energy state has $|\\phi| = v/\\sqrt2$, with</p>
$$v = \\sqrt{\\mu^2/\\lambda} = (\\sqrt2\\,G_F)^{-1/2} = 246.22\\ \\text{GeV}.$$
<p>The laws keep the symmetry but the vacuum does not. Expanding around the minimum, $\\phi = (v + h)/\\sqrt2$, gives:</p>
$$m_W = \\tfrac12 g v,\\qquad m_Z = \\tfrac12\\sqrt{g^2 + g'^2}\\,v,\\qquad m_f = \\frac{y_f\\,v}{\\sqrt2},\\qquad m_H = \\sqrt2\\,\\mu = \\sqrt{2\\lambda}\\,v.$$
<p>Three of the four real components of the doublet are the flat directions around the rim. They become the longitudinal spin states of the $W^+$, $W^-$ and $Z$. The fourth, the radial wobble, is the Higgs boson. The photon stays massless because the vacuum is neutral under the combination $Q = T_3 + Y$. The top quark has $y_t \\approx 0.99$, the electron $y_e \\approx 3\\times10^{-6}$. Nobody knows why the Yukawa couplings $y_f$ take the values they do.</p>
<h3>Conservation laws in the Reactions view</h3>
<ul>
<li><strong>Charge</strong> is exact.</li>
<li><strong>Baryon number</strong> $B$ (quarks count $\\tfrac13$) is conserved in every process ever observed.</li>
<li><strong>Lepton family numbers</strong> $L_e, L_\\mu, L_\\tau$ are exact in the minimal model with massless neutrinos. Neutrino oscillations break them, but for charged leptons the effect is far too small to see.</li>
<li><strong>Energy</strong>: a particle can decay only if it is heavier than the sum of its products. The check uses rest masses. Collisions need centre-of-mass energy $\\sqrt s$ at least the final rest masses.</li>
<li><strong>Angular momentum</strong>: the number of spin-½ particles must be even in total, and a massive spin-1 particle cannot decay to two photons (Landau and Yang).</li>
</ul>
<h3>How strong is each force?</h3>
<p>Dimensionless couplings at the $Z$ mass, 91 GeV: strong $\\alpha_s = 0.118$, weak $\\alpha_2 = \\alpha/\\sin^2\\theta_W \\approx 1/29.6$, electromagnetic $\\alpha \\approx 1/128$ (it is $1/137.036$ at low energy). Gravity between two protons is $G m_p^2/\\hbar c \\approx 5.9\\times10^{-39}$. The weak coupling is actually larger than the electromagnetic one. The weak force looks feeble at low energy because the $W$ is heavy: its effective strength is $G_F m_p^2 \\approx 10^{-5}$.</p>`,
  deep: [
    {
      title: 'From the electron to the Higgs: 1897 to 2012',
      html: `<ul>
<li><strong>1897.</strong> J. J. Thomson measures the charge-to-mass ratio of cathode rays. The electron is the first elementary particle.</li>
<li><strong>1905 to 1923.</strong> Einstein proposes light quanta. Compton scattering (1923) convinces most physicists that the photon is real.</li>
<li><strong>1936.</strong> Anderson and Neddermeyer find the muon in cosmic rays. I. I. Rabi asks "who ordered that?"</li>
<li><strong>1956.</strong> Cowan and Reines detect reactor antineutrinos at Savannah River.</li>
<li><strong>1962.</strong> Lederman, Schwartz and Steinberger show the muon neutrino is a different particle.</li>
<li><strong>1964.</strong> Gell-Mann and Zweig propose quarks. Englert and Brout, Higgs, and Guralnik, Hagen and Kibble publish the mass mechanism.</li>
<li><strong>1967 to 1968.</strong> Weinberg and Salam build the electroweak theory on Glashow's 1961 model. SLAC deep inelastic scattering reveals point-like parts inside the proton.</li>
<li><strong>1973.</strong> Gross, Wilczek and Politzer find asymptotic freedom, the key to QCD. Gargamelle at CERN sees weak neutral currents.</li>
<li><strong>1974 to 1977.</strong> Charm (J/ψ at SLAC and Brookhaven), the tau lepton (SLAC) and bottom (Υ at Fermilab).</li>
<li><strong>1979.</strong> Three-jet events at DESY's PETRA collider show the gluon.</li>
<li><strong>1983.</strong> UA1 and UA2 at CERN discover the W and Z.</li>
<li><strong>1995.</strong> CDF and D0 at Fermilab discover the top quark.</li>
<li><strong>2000.</strong> DONUT at Fermilab sees the tau neutrino.</li>
<li><strong>2012.</strong> ATLAS and CMS at the LHC announce the Higgs boson on 4 July. Englert and Higgs share the 2013 Nobel Prize.</li>
</ul>`,
    },
    {
      title: 'Three generations, and why not four',
      html: `<p>Matter comes in three copies. The charm and top quarks repeat the up quark. The strange and bottom quarks repeat the down quark. The muon and tau repeat the electron. Each copy has the same charges and the same forces, and only the masses differ. Heavier generations decay into lighter ones through the $W$, so ordinary matter is built from the first generation alone.</p>
<p>Within each generation the electric charges cancel once quarks are counted in their three colours: $3(\\tfrac23 - \\tfrac13) - 1 + 0 = 0$. This cancellation is part of what keeps the quantum theory consistent (it makes gauge anomalies vanish), and it is why quarks and leptons have to come in complete sets.</p>
<p>How many generations are there? At LEP the width of the $Z$ resonance counted every neutrino species lighter than half the $Z$ mass. The answer was $N_\\nu = 2.984 \\pm 0.008$. A fourth generation with a light neutrino is ruled out. The quarks of different generations mix through the CKM matrix, and three generations are the minimum that allows the matrix to contain a CP-violating phase, as Kobayashi and Maskawa pointed out in 1973.</p>`,
    },
    {
      title: 'Where mass comes from, and where it does not',
      html: `<p>The Higgs field gives mass to the $W$ and $Z$ and to every quark and charged lepton. Without it the electron would be massless, atoms would not form, and the weak force would have a long range like electromagnetism.</p>
<p>But you are not heavy because of the Higgs. Your mass is almost entirely protons and neutrons. A proton is two up quarks and a down quark, whose masses add to about 9 MeV. The proton weighs 938 MeV. The quark masses are about 1% of it.</p>
<p>The rest is energy, through $E = mc^2$. Quarks inside the proton move close to the speed of light and are held in by a gluon field that stores a large amount of energy. Lattice QCD calculations reproduce the proton mass from these ingredients. Even counting how the quark masses shift that binding energy (the so-called sigma terms), the Higgs is responsible for only about a tenth of the proton's mass at most. If the up and down quarks were massless, the proton would still weigh roughly as much as it does now.</p>
<p>The Higgs matters more subtly, though. The small difference $m_d - m_u$ makes the neutron heavier than the proton, so hydrogen is stable. The electron mass fixes the size of atoms. Change either and chemistry changes.</p>`,
    },
    {
      title: 'Beta decay at the vertex',
      html: `<p>A free neutron lives about 15 minutes (PDG average close to 878 s). Beam and bottle experiments disagree by about 9 seconds, an unresolved puzzle. The decay is $n \\to p\\,e^-\\,\\bar\\nu_e$, with $Q = m_n - m_p - m_e = 0.782$ MeV.</p>
<p>At the quark level one down quark becomes an up quark. The Reactions view draws the Feynman diagram. At the first vertex $d \\to u + W^-$. Check the charge: $-\\tfrac13 = +\\tfrac23 - 1$. At the second vertex $W^- \\to e^- + \\bar\\nu_e$, and charge $-1 = -1 + 0$, electron number $0 = 1 - 1$. Each vertex conserves everything on its own. Each carries a coupling $g/\\sqrt2$, times $V_{ud} \\approx 0.974$ from the CKM matrix at the quark vertex.</p>
<p>The $W$ is <em>virtual</em>. The decay has less than 1 MeV to spend and the $W$ weighs 80 GeV. Quantum mechanics allows this for a very short time, and the price is the propagator $1/(q^2 - m_W^2) \\approx -1/m_W^2$. Squared into a rate, the heavy $W$ makes the decay very slow. This is Fermi's contact theory as a low-energy limit:</p>
$$\\frac{G_F}{\\sqrt2} = \\frac{g^2}{8\\,m_W^2} \\quad\\Rightarrow\\quad G_F = 1.166\\times10^{-5}\\ \\text{GeV}^{-2}.$$
<p>The $W$ couples only to left-handed particles and right-handed antiparticles. Wu's cobalt-60 experiment revealed this mirror asymmetry, parity violation, in 1957.</p>`,
    },
    {
      title: 'What the Standard Model does not explain',
      html: `<ul>
<li><strong>Gravity.</strong> General relativity is not part of the model, and no tested quantum theory of gravity exists.</li>
<li><strong>Dark matter.</strong> Galaxy rotation, lensing and the cosmic microwave background show about five times more matter than the visible kind. No Standard Model particle fits.</li>
<li><strong>Neutrino masses.</strong> In the minimal model neutrinos are massless because there are no right-handed neutrinos. Oscillations (Super-Kamiokande 1998, SNO 2001) prove at least two are massive. Adding them needs new ingredients, and whether neutrinos are their own antiparticles is unknown.</li>
<li><strong>Matter over antimatter.</strong> The CP violation in the CKM matrix is far too small to explain why the universe kept about six baryons for every ten billion photons, and almost no antibaryons.</li>
<li><strong>Dark energy</strong>, the pattern of masses and mixings, and why the Higgs mass is so small compared with the Planck scale are also open.</li>
</ul>
<p>The model has 19 free parameters (more with neutrino masses), all measured, none predicted. It has passed every collider test so far. Some anomalies come and go, and none has yet reached the level of a confirmed discovery.</p>`,
    },
  ],
  challenges: [
    {
      id: 'heaviest',
      title: 'The giant',
      prompt: 'In the Particle table view, find and select the heaviest elementary particle.',
      hint: 'Tile height is log mass. Look for the tallest tower. It is not the Higgs.',
      check: (s) => s.selected === 't',
    },
    {
      id: 'build-beta',
      title: 'Build a beta decay',
      prompt: 'Use the reaction builder (not a preset) to assemble an allowed neutron beta decay, with every conservation light green.',
      hint: 'Clear, add n as incoming, then p, e⁻ and the right antineutrino as outgoing. Which neutrino keeps electron number at 0?',
      check: (s) => s.custom === true && s.allowed === true && s.isBeta === true,
    },
    {
      id: 'break-baryon',
      title: 'Break baryon number',
      prompt: 'With the reaction builder, make any reaction that changes baryon number and see the checker reject it.',
      hint: 'The p → e⁺ π⁰ preset shows one. Now invent your own: make a neutron vanish into leptons, or a proton into pions.',
      check: (s) => s.custom === true && s.complete === true && s.dB !== 0 && s.allowed === false,
    },
    {
      id: 'vacuum',
      title: 'Into the vacuum',
      prompt: 'In the Higgs view, with $\\mu^2 > 0$, knock the ball off the peak and let it come to rest in the trough.',
      hint: 'Press Nudge ball and wait a few seconds. If μ² is negative there is no trough, only a bowl.',
      check: (s) => s.higgsVacuum === true,
    },
  ],
  caveats: `<p>The particle table counts each of W⁺ and W⁻ as one entry and does not list antiparticles or the 8 gluon colour states separately. Quark masses are scheme-dependent MS-bar parameters, not masses you could weigh. Neutrinos are drawn flat because no neutrino mass has been measured. Only upper limits and mass differences are known.</p>
<p>The Higgs surface shows a slice through a complex doublet with four real components. The ball is a damped classical bead, a cartoon of how the vacuum settles, not a quantum field calculation. In the real early universe the transition was a smooth crossover, not a ball rolling off a peak.</p>
<p>The reaction checker tests conservation laws and rest-mass thresholds. It does not compute rates, so "allowed" can still mean very rare. It does not check colour or momentum distributions, and the "force" label is a simple rule of thumb. The Feynman diagrams show the leading contribution only.</p>`,
  further: [
    { label: 'Particle Data Group, Review of Particle Physics (summary tables)', url: 'https://pdg.lbl.gov/' },
    { label: 'Standard Model on Wikipedia', url: 'https://en.wikipedia.org/wiki/Standard_Model' },
    { label: 'ATLAS Collaboration, Observation of a new particle in the search for the Standard Model Higgs boson (2012), arXiv', url: 'https://arxiv.org/abs/1207.7214' },
    { label: 'CMS Collaboration, Observation of a new boson at a mass of 125 GeV (2012), arXiv', url: 'https://arxiv.org/abs/1207.7235' },
  ],
};
