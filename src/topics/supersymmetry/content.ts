import type { TopicContent } from '../../core/types.ts';

export const content: TopicContent = {
  intuition: `
<p class="lead">Every particle we know is either a <strong>fermion</strong> or a <strong>boson</strong>. Fermions, like electrons and quarks, build matter. Bosons, like photons and gluons, carry forces. Supersymmetry is the idea that nature has a hidden symmetry that swaps the two.</p>
<p>If it is true, every particle has a partner whose spin differs by one half. The electron gets a spin-0 <em>selectron</em>. The top quark gets a <em>stop</em>. The spin-1 gluon gets a spin-½ <em>gluino</em>. The scene shows this as a mirror. Our particles float on the left. Their partners float on the right. Height is mass. The rings around each orb count its spin.</p>
<p>Here is the catch. If the symmetry were exact, each partner would weigh exactly as much as its twin. A spin-0 selectron with the electron's mass would have shown up long ago. None has. So if supersymmetry exists, it is <strong>broken</strong>, and the partners are heavy. The SUSY scale slider lifts them up.</p>
<p>Why would anyone still care? Two reasons, shown in the other two views. First, the three forces of the Standard Model change strength with energy. With the extra partners in the loops, the three lines <strong>meet at one point</strong> near $10^{16}$ GeV. Without them they miss. Second, the Higgs mass gets huge quantum corrections from the top quark. A stop loop cancels them exactly. Make the stop heavy and the cancellation starts to fail.</p>
<p>The honest status: the Large Hadron Collider has looked hard and found <strong>no superpartners</strong>. Supersymmetry is still a live idea, and string theory seems to need it at some energy. But the simplest hope, light partners that fix the Higgs mass cleanly, is under real strain.</p>`,
  tryFirst: [
    'In the <b>Mirror world</b>, drag the <b>SUSY scale</b> slider. The ghost partners on the right rise in mass. Our particles stay put.',
    'Count the rings. Two rings is spin 1, one ring is spin ½, no ring is spin 0. Every pair differs by one ring.',
    'Switch to <b>Unification</b> and flip between <b>SM</b> and <b>MSSM</b>. Watch the three lines meet, or miss. The corner inset zooms in on the gap.',
    'Switch to <b>Hierarchy</b> and push the <b>stop mass</b> up. The seesaw tips and the fine-tuning meter climbs.',
  ],
  equation: {
    tex: 'Q\\,|\\text{boson}\\rangle = |\\text{fermion}\\rangle, \\qquad Q\\,|\\text{fermion}\\rangle = |\\text{boson}\\rangle',
    caption: 'The supersymmetry generator Q turns a boson into a fermion and back. It changes spin by one half and leaves mass and charge alone. So partners should have equal masses unless the symmetry is broken.',
    terms: [
      { tex: 'Q', name: 'Supercharge', meaning: 'The generator of supersymmetry. It carries spin ½, so it shifts spin by one half. It commutes with the Hamiltonian, so in an exact symmetry partners share a mass. Breaking the symmetry lets the partners move up to the SUSY scale.', param: 'msusy' },
      { tex: '|\\text{boson}\\rangle', name: 'Boson state', meaning: 'A particle with whole-number spin: the photon, gluon, W, Z and Higgs, or a scalar partner like the stop. Shown with 2 rings (spin 1) or none (spin 0).', param: 'view' },
      { tex: '|\\text{fermion}\\rangle', name: 'Fermion state', meaning: 'A particle with half-integer spin: quarks, leptons, or a partner like the gluino. Shown with one ring (spin ½).', param: 'view' },
      { tex: '\\{Q, Q^\\dagger\\} \\sim P_\\mu', name: 'The algebra closes on momentum', meaning: 'Two supersymmetry moves in a row give a translation in spacetime. This is why supersymmetry is a spacetime symmetry, and why making it local brings in gravity (supergravity).' },
      { tex: 'M_{\\text{SUSY}}', name: 'Breaking scale', meaning: 'Where the partners sit once supersymmetry is broken. It also sets where the coupling lines switch from Standard Model to MSSM running.', param: 'msusy' },
    ],
  },
  physicsNotes: `
<h3>Running couplings</h3>
<p>Each force has a strength $\\alpha_i = g_i^2/4\\pi$ that changes slowly with the energy $\\mu$ at which you probe it. At one loop the inverse couplings run in straight lines against $\\ln\\mu$:</p>
$$\\alpha_i^{-1}(\\mu) = \\alpha_i^{-1}(M_Z) - \\frac{b_i}{2\\pi}\\ln\\frac{\\mu}{M_Z}$$
<p>The start values come from measurements at $M_Z = 91.19$ GeV. With $\\alpha_{\\text{em}}^{-1}(M_Z) = 127.95$, $\\sin^2\\theta_W = 0.2312$ and $\\alpha_s = 0.118$, you get $\\alpha_1^{-1} = \\tfrac35\\cos^2\\theta_W/\\alpha_{\\text{em}} \\approx 59.0$, $\\alpha_2^{-1} = \\sin^2\\theta_W/\\alpha_{\\text{em}} \\approx 29.6$ and $\\alpha_3^{-1} \\approx 8.5$. The factor $\\tfrac35$ is the GUT normalisation of hypercharge. It is the one that fits inside $SU(5)$.</p>
<p>The slopes $b_i$ count the particles in the loops. Bosons make a force weaker at high energy and fermions make it stronger, roughly. For the Standard Model $b = (41/10,\\ -19/6,\\ -7)$. For the MSSM, with all the partners and two Higgs doublets, $b = (33/5,\\ 1,\\ -3)$. In the scene the MSSM curves use SM slopes below $M_{\\text{SUSY}}$ and MSSM slopes above it.</p>
<h3>The top and the stop</h3>
<p>The Higgs mass squared picks up loop corrections. With a hard cutoff $\\Lambda$, the top quark loop and the two stop loops give</p>
$$\\delta m_H^2 = \\frac{3}{8\\pi^2}\\left(\\lambda_{\\tilde t} - y_t^2\\right)\\Lambda^2 + \\ldots$$
<p>Supersymmetry fixes the stop quartic coupling to $\\lambda_{\\tilde t} = y_t^2$. The $\\Lambda^2$ pieces cancel exactly, for any $\\Lambda$. What survives when the stop is heavier than the top is a logarithm:</p>
$$\\delta m_H^2 \\approx -\\frac{3y_t^2}{8\\pi^2}\\,\\big(m_{\\tilde t}^2 - m_t^2\\big)\\ln\\frac{\\Lambda^2}{m_{\\tilde t}^2}$$
<p>Here $\\Lambda$ is the scale where supersymmetry breaking is passed to the partners. The fine-tuning measure compares this with the Higgs mass, $\\Delta = |\\delta m_H^2| / (m_h^2/2)$. For a heavy stop $\\Delta \\approx \\frac{3y_t^2}{4\\pi^2 m_h^2}\\, m_{\\tilde t}^2 \\ln(\\Lambda^2/m_{\\tilde t}^2)$. It grows like $m_{\\tilde t}^2$. A tuning of $1/\\Delta$ means the parameters must cancel to that fraction. With $y_t = 0.94$ and $\\Lambda = 10^{16}$ GeV, the tuning passes 1% near a 650 GeV stop.</p>`,
  deep: [
    {
      title: 'The only loophole: Coleman–Mandula and HLS',
      html: `<p>In 1967 Sidney Coleman and Jeffrey Mandula proved a no-go theorem. Under mild assumptions, the symmetries of an interacting quantum field theory in 4D can only be spacetime symmetries (the Poincaré group) times internal ones (like colour or charge). The two cannot mix in a deeper way.</p>
<p>The theorem assumed that symmetry generators obey commutators. In 1975 Rudolf Haag, Jan Łopuszański and Martin Sohnius showed what happens if you also allow <strong>anticommutators</strong>. Exactly one new structure appears: fermionic generators $Q$ whose anticommutator gives the momentum, $\\{Q_\\alpha, \\bar Q_{\\dot\\beta}\\} = 2\\sigma^\\mu_{\\alpha\\dot\\beta} P_\\mu$. That is supersymmetry. It is the unique way to extend spacetime symmetry in an interacting 4D theory.</p>
<p>The ideas came from several places. Yuri Golfand and Evgeny Likhtman wrote down the 4D super-Poincaré algebra in 1971. Dmitry Volkov and Vladimir Akulov found a nonlinear version in 1972. Worldsheet supersymmetry appeared in string theory in 1971. In 1974 Julius Wess and Bruno Zumino built the first renormalisable 4D field theory with supersymmetry. Their model has one complex scalar and one Weyl fermion with equal mass, and its loop divergences cancel between them. That cancellation is the seed of everything on this page.</p>`,
    },
    {
      title: 'Gauge coupling unification',
      html: `<p>Grand unified theories put the three forces inside one group, such as $SU(5)$. Then the three couplings must become equal at some high scale. In the Standard Model they do not. The lines cross in pairs between about $10^{13}$ and $10^{17}$ GeV and form a wide triangle.</p>
<p>In 1981 Savas Dimopoulos, Stuart Raby and Frank Wilczek noted that adding superpartners changes the slopes. In 1991, after precision data from LEP, Ugo Amaldi, Wim de Boer and Hermann Fürstenau, and independently John Ellis, Shaaban Kelley and Dimitri Nanopoulos, and Paul Langacker and Mingxing Luo, showed that the MSSM lines meet within errors near $2 \\times 10^{16}$ GeV. That plot became one of the strongest hints for supersymmetry.</p>
<p>The scene reproduces it at one loop. With the partners switched on at $M_Z$, the three lines pass within 0.05 of each other near $2 \\times 10^{16}$ GeV. The Standard Model triangle is about 70 times wider. Real analyses add two-loop running and threshold corrections. Those shift the picture at the same level as the remaining mismatch, so unification is a hint, not a proof.</p>
<p>Unification at $10^{16}$ GeV also predicts proton decay through heavy GUT bosons. Super-Kamiokande finds the proton lifetime in the $e^+\\pi^0$ channel is above about $10^{34}$ years. That already rules out minimal non-supersymmetric $SU(5)$. The higher MSSM unification scale suppresses this mode. Supersymmetric GUTs face their own limits from other decay channels, such as $p \\to K^+\\bar\\nu$.</p>`,
    },
    {
      title: 'The hierarchy problem and naturalness',
      html: `<p>The Higgs boson is the only elementary scalar we know. Scalar masses are not protected by any symmetry in the Standard Model. Loop corrections pull $m_H^2$ toward the highest scale in the theory. If new physics sits at $10^{16}$ GeV, the bare mass and the corrections must cancel to about one part in $10^{26}$ to leave a 125 GeV Higgs. That looks like an absurd coincidence. This is the hierarchy problem.</p>
<p>Supersymmetry cures the worst of it. Fermion loops and boson loops enter with opposite signs. With equal couplings the quadratic pieces cancel exactly, as in the Wess–Zumino model. Soft breaking only leaves logarithms times the partner masses. So the partners that matter most, the stops, higgsinos and gluino, should be light. That argument drove hopes of seeing them early at the LHC.</p>
<p>Fine-tuning measures, such as the one introduced by Riccardo Barbieri and Gian Giudice in 1988, try to make "natural" quantitative. They are not unique. Different choices of parameters and of the scale $\\Lambda$ change the number by factors of several. The toy in the scene keeps only the leading stop logarithm. Treat its percentages as orders of magnitude.</p>`,
    },
    {
      title: 'The neutralino and dark matter',
      html: `<p>Many supersymmetric models have a conserved quantity called <strong>R-parity</strong>, introduced by Glennys Farrar and Pierre Fayet in 1978. It gives every Standard Model particle $+1$ and every partner $-1$. Partners must then be made in pairs, and the lightest partner cannot decay. It is stable.</p>
<p>If that lightest partner is a <strong>neutralino</strong>, a mix of the photino, zino and higgsinos, it is neutral, heavy and weakly interacting. It is a natural dark matter candidate. Haim Goldberg in 1983, and John Ellis, John Hagelin, Dimitri Nanopoulos, Keith Olive and Mark Srednicki in 1984, showed that its relic abundance can come out close to the observed dark matter density. This is part of the "WIMP miracle".</p>
<p>Direct detection experiments such as XENONnT and LZ have pushed the WIMP-nucleon cross section down by orders of magnitude without a signal. Neutralino dark matter is not ruled out, since some mixtures scatter very weakly. But the simplest versions are strongly constrained.</p>`,
    },
    {
      title: 'Strings, the LHC and the honest status',
      html: `<p><strong>Why string theory likes supersymmetry.</strong> The bosonic string has a tachyon and no fermions. Adding worldsheet supersymmetry gives the superstring. With the GSO projection, the tachyon is removed and the spectrum becomes supersymmetric in 10 dimensions. In 1984 Michael Green and John Schwarz showed that anomalies cancel in the superstring, which launched the first superstring revolution. Supersymmetry also keeps many string backgrounds stable and makes their calculations tractable. But string theory does not require supersymmetry to survive down to LHC energies. It could be broken near the string scale.</p>
<p><strong>What the LHC found.</strong> ATLAS and CMS have searched for superpartners since 2010. In simplified models with a light neutralino, full Run 2 data exclude gluinos below roughly 2.2 TeV and stops below roughly 1.2 TeV. These limits are model dependent. Compressed spectra, where the partners are close in mass, and R-parity violating models leave gaps at much lower masses. Higgsinos and sleptons are far less constrained.</p>
<p><strong>The status.</strong> Supersymmetry is a mathematically unique extension of spacetime symmetry, and it improves unification and the hierarchy problem. No superpartner has been seen. A 125 GeV Higgs is possible in the MSSM but needs heavy stops or large stop mixing, which already costs percent-level tuning or worse in the simplest setups. Supersymmetry may exist at a higher scale, may be hidden in less minimal forms, or may not describe nature at all.</p>`,
    },
  ],
  challenges: [
    {
      id: 'meet',
      title: 'A small triangle',
      prompt: 'In the <b>Unification</b> view with <b>MSSM</b> running, make the three lines meet with a spread below 0.4 in $1/\\alpha$.',
      hint: 'The partners change the slopes only above the SUSY scale. Lower the SUSY scale toward 1 TeV and watch the inset triangle shrink.',
      check: (s) => s.view === 'unify' && s.model === 'MSSM' && (s.mismatch as number) < 0.4,
    },
    {
      id: 'miss',
      title: 'The Standard Model misses',
      prompt: 'Switch the running to the <b>Standard Model</b> and see how badly the three lines miss.',
      hint: 'Use the SM / MSSM switch in the Unification section. The inset readout shows a gap near 3.7, many times the MSSM value.',
      check: (s) => s.view === 'unify' && s.model === 'SM',
    },
    {
      id: 'tuned',
      title: 'Worse than 1%',
      prompt: 'In the <b>Hierarchy</b> view, push the stop mass until the tuning is worse than 1%, so $\\Delta > 100$.',
      hint: 'Keep Λ at $10^{16}$ GeV and raise the stop mass. Δ grows like $m_{\\tilde t}^2$, so it crosses 100 before the stop reaches 1 TeV.',
      check: (s) => s.view === 'hierarchy' && (s.delta as number) > 100,
    },
    {
      id: 'gut',
      title: 'Find the GUT scale',
      prompt: 'With MSSM running, slide the <b>probe scale</b> to where the three couplings meet, within a quarter of a decade.',
      hint: 'Move the probe until the three numbers it shows almost agree. Look near $10^{16}$ GeV.',
      check: (s) => s.view === 'unify' && s.model === 'MSSM' && Math.abs((s.probe as number) - (s.mgutLog as number)) < 0.25,
    },
  ],
  caveats: `<p><strong>Speculative physics.</strong> No superpartner has ever been observed. Everything on the right side of the mirror is hypothetical.</p>
<p><strong>Toy spectrum.</strong> The partner masses in the mirror world are fixed multiples of one SUSY scale, chosen to look like a typical spectrum. Real models have over 100 free parameters. Photino, zino and higgsinos mix into four neutralinos, and winos with charged higgsinos into two charginos. The MSSM also needs two Higgs doublets and so five Higgs bosons. The scene shows one pair per particle for clarity.</p>
<p><strong>One-loop running.</strong> The coupling lines use one-loop beta functions and a single step threshold at the SUSY scale. Two-loop terms and detailed thresholds move the meeting point and the mismatch by amounts similar to what the scene shows as "small".</p>
<p><strong>Fine-tuning toy.</strong> The hierarchy view keeps only the leading stop logarithm with a fixed top Yukawa of 0.94. Stop mixing, higgsino mass and running of $y_t$ all matter in real estimates. The LHC limits quoted are rough and hold only in simplified models.</p>`,
  further: [
    { label: 'Martin, A Supersymmetry Primer (arXiv)', url: 'https://arxiv.org/abs/hep-ph/9709356' },
    { label: 'Amaldi, de Boer and Fürstenau, Comparison of grand unified theories with electroweak and strong coupling constants measured at LEP (1991)', url: 'https://doi.org/10.1016/0370-2693(91)91641-8' },
    { label: 'Wess and Zumino, Supergauge transformations in four dimensions (1974)', url: 'https://doi.org/10.1016/0550-3213(74)90355-1' },
    { label: 'Supersymmetry (Wikipedia)', url: 'https://en.wikipedia.org/wiki/Supersymmetry' },
  ],
};
