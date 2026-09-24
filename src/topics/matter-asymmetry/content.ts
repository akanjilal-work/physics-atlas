import type { TopicContent } from '../../core/types.ts';

export const content: TopicContent = {
  intuition: `
<p class="lead">The Big Bang should have made matter and antimatter in equal amounts. When the two meet, they annihilate into light. So the universe should be full of light and nothing else. It is not. You exist.</p>
<p>Some time in the first second, something tipped the balance very slightly. For roughly every billion antiquarks there were a billion and one quarks. As the universe cooled, the pairs found each other and vanished in flashes of radiation. The lonely extra quarks had no partners. They survived, and everything we see is built from them.</p>
<p>We can measure how small the tip was. Today there are about 1.6 billion photons of the cosmic background for every proton or neutron. That ratio, about $6\\times10^{-10}$, is the fossil of the imbalance.</p>
<p>The scene has two views. In the <strong>early universe box</strong>, white sparks are matter and violet sparks are antimatter. The box grows and cools, and pairs annihilate in flashes. Set the bias to zero and nothing survives. Give it a tiny bias and a few white sparks are left at the end. Those are you.</p>
<p>The <strong>kaon view</strong> shows the one place where nature was first caught treating matter and antimatter differently. A beam of neutral kaons flips back and forth between particle and antiparticle as it flies. Very rarely, a long-lived kaon decays in a way that a perfectly fair universe would forbid. Watch for the amber bursts far down the pipe.</p>
<p>The honest ending: the imbalance we can measure in the lab is far too weak to explain our existence. Something beyond the Standard Model is needed, and we do not yet know what it is.</p>`,
  tryFirst: [
    'Watch one full cooling run in the box. Keep an eye on the corner plot: the violet antimatter curve dives while the white matter curve levels off.',
    'Drag the <b>matter bias</b> all the way left to zero and replay. Every spark annihilates.',
    'Push the <b>expansion rate</b> to the top. Now the box cools so fast that pairs cannot find each other, and both kinds freeze out.',
    'Switch the view to <b>Kaon oscillation</b>. Watch the beam fade from cyan to purple as the short-lived part decays, and wait for an amber K<sub>L</sub> → ππ burst.',
  ],
  equation: {
    tex: '\\eta = \\frac{n_B - n_{\\bar B}}{n_\\gamma} \\approx 6\\times10^{-10}',
    caption: 'The baryon asymmetry of the universe. Baryons minus antibaryons, counted per photon. Measured independently from the cosmic microwave background and from the light elements made in the first minutes.',
    terms: [
      { tex: '\\eta', name: 'Baryon-to-photon ratio', meaning: 'The net number of baryons per photon. In the toy box it is set by the bias.', param: 'eta' },
      { tex: 'n_B', name: 'Baryon density', meaning: 'Matter particles per volume. In the box, the readout shows how many survive per billion that started.', param: 'survivors' },
      { tex: 'n_{\\bar B}', name: 'Antibaryon density', meaning: 'Antimatter per volume. Today it is essentially zero outside of cosmic rays and laboratories.', param: 'anti' },
      { tex: 'n_\\gamma', name: 'Photon density', meaning: 'About 411 per cubic centimetre today, fixed by the temperature through $n_\\gamma \\propto T^3$.', param: 'T' },
      { tex: '6\\times10^{-10}', name: 'The measured value', meaning: 'Planck and Big Bang nucleosynthesis give $\\eta \\approx 6.1\\times10^{-10}$. Try to reach a comparable survival fraction with the bias slider.', param: 'bias' },
    ],
  },
  physicsNotes: `
<h3>Why only the excess survives</h3>
<p>While the universe is hotter than the particle mass, pairs are created as fast as they annihilate. Once it cools below the mass, creation stops and annihilation wins. The net number $n_B - n_{\\bar B}$ is conserved by every process in the box, so annihilation can remove pairs but never the excess. If annihilation is fast compared with the expansion, the antiparticles are wiped out and the survivors equal the excess.</p>
<p>The box solves a toy Boltzmann equation for the antiparticle yield $\\bar Y$ in the cooling variable $x = m/T$:</p>
$$\\frac{d\\bar Y}{dx} = -\\frac{\\lambda}{x^2}\\left(Y\\bar Y - Y_{\\rm eq}^2\\right), \\qquad Y - \\bar Y = \\varepsilon .$$
<p>$\\lambda$ is the annihilation rate divided by the expansion rate. The expansion slider divides it. With $\\varepsilon = 0$ the leftover is set only by when annihilation stops ("freeze-out") and is roughly $x_f/\\lambda$. With the default settings that is about $3\\times10^{-12}$, far below one in a billion. With a real baryon cross-section the symmetric leftover would be around $10^{-19}$ baryons per photon. That is roughly a billion times less than we see. A symmetric universe fails badly.</p>
<h3>Sakharov's three conditions</h3>
<p>In 1967 Andrei Sakharov listed what any mechanism needs to create the excess from a symmetric start:</p>
<ol>
<li><strong>Baryon number violation.</strong> Some process must change the net number of baryons.</li>
<li><strong>C and CP violation.</strong> Otherwise every process that makes extra baryons is matched by a mirror process that makes extra antibaryons.</li>
<li><strong>Departure from thermal equilibrium.</strong> In equilibrium, a process and its reverse run at the same rate, and any excess is erased.</li>
</ol>
<h3>CP violation in neutral kaons</h3>
<p>A $K^0$ ($d\\bar s$) can turn into its antiparticle $\\bar K^0$ ($s\\bar d$) through the weak force. The states with definite lifetimes are mixtures:</p>
$$K_{S,L} = \\frac{(1+\\varepsilon)K^0 \\pm (1-\\varepsilon)\\bar K^0}{\\sqrt{2(1+|\\varepsilon|^2)}}$$
<p>$K_S$ lives $0.0895$ ns and decays to two pions. $K_L$ lives $51.2$ ns and should never decay to two pions if CP were exact. The small parameter $|\\varepsilon| \\approx 2.23\\times10^{-3}$ lets it happen about 2.8 times per thousand $K_L$ decays. It also makes $K_L$ decay slightly more often to a positive lepton than to a negative one. The asymmetry is $\\delta_L = 2\\,\\mathrm{Re}\\,\\varepsilon/(1+|\\varepsilon|^2) \\approx 3.2\\times10^{-3}$. The measured value is $(3.32 \\pm 0.06)\\times10^{-3}$. This is an absolute, convention-free way to tell matter from antimatter.</p>`,
  deep: [
    {
      title: 'The kaon two-level system',
      html: `<p>A neutral kaon beam behaves like a two-state quantum system with an effective Hamiltonian that is not Hermitian, because the kaons can decay:</p>
$$i\\frac{d}{dt}\\begin{pmatrix}a\\\\ \\bar a\\end{pmatrix} = \\left(M - \\tfrac{i}{2}\\Gamma\\right)\\begin{pmatrix}a\\\\ \\bar a\\end{pmatrix}.$$
<p>Its eigenstates are $K_S$ and $K_L$, with $\\Gamma_S \\approx 571\\,\\Gamma_L$ and a mass difference $\\Delta m \\approx 5.29\\times10^{9}\\,\\hbar\\,\\mathrm{s}^{-1}$. Starting from pure $K^0$:</p>
$$P(K^0) = \\tfrac14\\left[e^{-\\Gamma_S t} + e^{-\\Gamma_L t} + 2e^{-\\bar\\Gamma t}\\cos\\Delta m\\, t\\right],\\quad P(\\bar K^0) = \\left|\\tfrac{q}{p}\\right|^2\\tfrac14\\left[e^{-\\Gamma_S t} + e^{-\\Gamma_L t} - 2e^{-\\bar\\Gamma t}\\cos\\Delta m\\, t\\right]$$
<p>The oscillation period $2\\pi/\\Delta m \\approx 1.19$ ns is about 13 $K_S$ lifetimes, so the $K_S$ part is almost gone before one full flip. The curves above the pipe show this. The simulation uses these closed forms, and the tests check them against a direct numerical solution of the Schrödinger equation above.</p>
<p>The two-pion rate is $|e_S + \\varepsilon\\, e_L|^2$, where $e_{S,L}$ are the decaying phase factors. The inset shows its three parts: the steep $K_S$ line, the flat $|\\varepsilon|^2$ $K_L$ tail, and an interference dip where they cross, near 12 $K_S$ lifetimes.</p>`,
    },
    {
      title: 'Discovery: Christenson, Cronin, Fitch and Turlay (1964)',
      html: `<p>At the Brookhaven Alternating Gradient Synchrotron, James Christenson, James Cronin, Val Fitch and René Turlay sent a beam of long-lived kaons down an evacuated pipe. They looked for two-pion decays, which CP symmetry forbids for $K_L$. They found them, at about two per thousand decays. Cronin and Fitch shared the 1980 Nobel Prize in Physics.</p>
<p>In 1973 Makoto Kobayashi and Toshihide Maskawa showed that CP violation arises naturally in the Standard Model if there are at least three generations of quarks. A single complex phase in the quark mixing (CKM) matrix does the job. The third generation was found later. In 2001 the B-factory experiments BaBar at SLAC and Belle at KEK observed large CP violation in B meson decays, as the theory predicted. Kobayashi and Maskawa shared the 2008 Nobel Prize.</p>
<p>In 2025 the LHCb collaboration reported the first observation of CP violation in baryon decays. The rate of $\\Lambda_b^0 \\to pK^-\\pi^+\\pi^-$ differs from its antimatter mirror by $(2.45 \\pm 0.47)\\%$, a 5.2 standard deviation effect (Nature 643, 1223). Baryons are what we are made of, but the size still fits the CKM picture.</p>`,
    },
    {
      title: 'Why the Standard Model falls short',
      html: `<p>The Standard Model technically meets all three of Sakharov's conditions. Baryon number is violated by rare "sphaleron" transitions, which were fast in the hot early universe above about 100 GeV (Kuzmin, Rubakov and Shaposhnikov, 1985). The CKM phase violates CP. The electroweak transition could have supplied the departure from equilibrium. It fails on two counts.</p>
<ul>
<li><strong>CP violation is too weak.</strong> The CKM effect is proportional to the Jarlskog invariant $J \\approx 3\\times10^{-5}$ times small quark mass differences. At the electroweak temperature, estimates put the effective strength around $10^{-20}$ or smaller. That is about ten orders of magnitude short of $\\eta$.</li>
<li><strong>No departure from equilibrium.</strong> With a Higgs mass of 125 GeV, lattice calculations show the electroweak transition is a smooth crossover, not a violent first-order transition with bubbles. Nothing falls out of equilibrium.</li>
</ul>
<p>So the Standard Model has the right ingredients in the wrong amounts. This is one of the strongest pieces of evidence for physics beyond it.</p>`,
    },
    {
      title: 'Candidate mechanisms (speculative)',
      html: `<p><strong>Leptogenesis</strong> (Fukugita and Yanagida, 1986). Heavy right-handed neutrinos, the same particles that could explain why ordinary neutrinos are so light, decay unevenly into leptons and antileptons. Sphalerons then convert part of that lepton excess into a baryon excess. It is attractive because it ties two puzzles together. The heavy neutrinos may be far too heavy to produce directly. Experiments such as T2K, NOvA, and the future DUNE and Hyper-Kamiokande look for CP violation in ordinary neutrino oscillations. A clear signal would make leptogenesis more plausible but would not prove it.</p>
<p><strong>Electroweak baryogenesis.</strong> New particles could make the electroweak transition first-order and add new sources of CP violation. Bubble walls sweeping through the plasma would then leave a baryon excess behind. This needs new physics near the TeV scale. It is tested by Higgs self-coupling measurements and by searches for electron and neutron electric dipole moments, which have so far found nothing.</p>
<p>Other ideas include the Affleck–Dine mechanism and GUT baryogenesis. None is established.</p>`,
    },
    {
      title: 'How we measure η',
      html: `<p>Two independent routes agree. The cosmic microwave background acoustic peaks weigh the baryons: Planck 2018 gives $\\Omega_b h^2 \\approx 0.0224$, which converts to $\\eta \\approx 6.1\\times10^{-10}$. Big Bang nucleosynthesis in the first minutes sets the deuterium abundance, which is very sensitive to $\\eta$. Measured deuterium in distant gas clouds gives the same value. With about 411 photons per cubic centimetre, that means roughly one baryon in every four cubic metres of space, on average.</p>
<p>We also see no large regions of antimatter. If antimatter galaxies existed nearby, gamma rays from annihilation at the boundaries would show up. They do not, out to scales of at least tens of megaparsecs.</p>`,
    },
  ],
  challenges: [
    {
      id: 'total-annihilation',
      title: 'A universe of light',
      prompt: 'In the box, set the matter bias to exactly zero and let a full cooling run finish with fewer than 0.1 survivors per billion.',
      hint: 'Drag the bias slider to the far left. Keep the expansion rate near 1 so annihilation has time to work.',
      check: (s) => s.view === 'box' && s.zeroBias === true && s.runDone === true && (s.survivorsPerBillion as number) < 0.1,
    },
    {
      id: 'one-in-a-billion',
      title: 'One in a billion',
      prompt: 'Find a bias that leaves between 0.5 and 2 matter particles per billion at the end of a run, with the antimatter gone.',
      hint: 'In this toy the survivors equal the bias when annihilation is efficient. Try a bias near $10^{-9}$ and read the "matter left" readout.',
      check: (s) => s.view === 'box' && s.runDone === true && s.zeroBias === false && (s.survivorsPerBillion as number) >= 0.5 && (s.survivorsPerBillion as number) <= 2 && (s.antiPerBillion as number) < 0.1,
    },
    {
      id: 'kl-pipi',
      title: 'Catch the forbidden decay',
      prompt: 'With CP violation on, see a long-lived kaon decay to two pions (after 3 ns).',
      hint: 'Switch the view to Kaon oscillation and wait a few seconds for a large amber burst far down the pipe.',
      check: (s) => s.view === 'kaon' && s.cp === true && (s.latePipiSinceToggle as number) >= 1,
    },
    {
      id: 'cp-off',
      title: 'A fair universe',
      prompt: 'Turn CP violation off. Fire 3000 kaons with no late two-pion decays and a charge asymmetry of exactly zero.',
      hint: 'Untick the CP toggle and wait. The flat tail disappears from the inset and δ_L reads 0.',
      check: (s) => s.view === 'kaon' && s.cp === false && s.deltaL === 0 && (s.kaonsSinceToggle as number) >= 3000 && s.latePipiSinceToggle === 0,
    },
  ],
  caveats: `<p>The box is a <strong>toy model</strong>. It follows one generic particle species with a made-up annihilation strength, a simple interpolation for the equilibrium abundance and a comoving photon count held fixed. Real baryogenesis involves quarks, a QCD transition, and photon heating when electrons and positrons annihilate, which changes the bookkeeping between the early excess and today's $\\eta$ by factors of order ten. The bias is put in by hand. The model shows why an excess survives, not where it came from. Spark counts are log-compressed so that one survivor in a billion is still visible.</p>
<p>The kaon model ignores direct CP violation ($\\varepsilon'$, about a thousandth of $\\varepsilon$), treats the three-pion decays as incoherent, and assumes CPT symmetry and the $\\Delta S = \\Delta Q$ rule. It predicts $\\delta_L = 3.23\\times10^{-3}$, slightly below the measured $3.32\\times10^{-3}$. The pipe is drawn on a log time scale, and the beam rate is chosen so rare decays show up in seconds.</p>
<p>What is established: the size of $\\eta$, CP violation in kaons, B mesons, D mesons and baryons, and its CKM description. What is open: the mechanism that actually made the matter.</p>`,
  further: [
    { label: 'Baryogenesis (Wikipedia)', url: 'https://en.wikipedia.org/wiki/Baryogenesis' },
    { label: 'Christenson, Cronin, Fitch, Turlay, Phys. Rev. Lett. 13, 138 (1964)', url: 'https://doi.org/10.1103/PhysRevLett.13.138' },
    { label: 'LHCb, Observation of CP symmetry breaking in baryon decays, Nature (2025)', url: 'https://doi.org/10.1038/s41586-025-09119-3' },
    { label: 'Canetti, Drewes, Shaposhnikov, Matter and antimatter in the universe (review)', url: 'https://arxiv.org/abs/1204.4186' },
  ],
};
