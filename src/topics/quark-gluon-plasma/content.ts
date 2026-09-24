import type { TopicContent } from '../../core/types.ts';

export const content: TopicContent = {
  intuition: `
<p class="lead">Protons and neutrons are bags of quarks and gluons that never come apart. Heat them enough, though, and the bags melt. What you get is a soup of free quarks and gluons called the <strong>quark-gluon plasma</strong>. The whole universe was made of it for its first few microseconds.</p>
<p>To make some today, physicists smash two heavy nuclei, gold or lead, together at nearly the speed of light. In the scene they arrive as flat <strong>pancakes</strong>, because relativity squeezes them along their direction of travel by a factor of about 100 at RHIC and about 2700 at the LHC.</p>
<p>They rarely hit head-on. Usually they overlap off-centre, and the overlap region is shaped like an <strong>almond</strong>. The nucleons outside the almond (the spectators) fly straight on. The ones inside melt into a fireball over a trillion kelvin, more than 100,000 times hotter than the centre of the Sun.</p>
<p>The surprise came next. The fireball did not puff out like a gas cloud. It flowed like a <strong>liquid</strong>, and a strangely perfect one. The almond is thinner in one direction, so the pressure drops more steeply that way and pushes the fluid out faster. The fireball ends up squirting more particles sideways, in the plane of the collision, than up and down. Detectors see this as a lopsided pattern called <em>elliptic flow</em>. A gas of weakly interacting particles would smear that pattern out. The plasma keeps almost all of it.</p>
<p>Watch the cloud change colour as it cools. Below about 155 MeV (1.8 trillion kelvin) the quarks are locked back into hadrons, which spray out into the detector. The corner plot counts them by direction.</p>`,
  tryFirst: [
    'Press <b>Replay</b> and watch the corner plot. The circle stretches into a peanut along the reaction plane as the flow builds up.',
    'Drag <b>Impact parameter b</b> to 0 and replay. The overlap is round, so there is no preferred direction and $v_2$ stays near zero.',
    'Push <b>Viscosity η/s</b> up to several times the bound. The fluid smooths out its own pressure differences and $v_2$ shrinks.',
    'Set <b>View</b> to <b>Phase diagram</b> to see where the collision sits on the map of nuclear matter.',
  ],
  equation: {
    tex: '\\frac{dN}{d\\varphi} \\;\\propto\\; 1 + 2\\,v_2 \\cos 2(\\varphi-\\Psi_R)',
    caption: 'Elliptic flow. The number of particles per unit angle around the beam has a cos 2φ ripple. A near-perfect fluid keeps it large, and string theory suggests a floor on how perfect any fluid can be: $\\eta/s \\ge 1/4\\pi$ (in units of $\\hbar/k_B$).',
    terms: [
      { tex: '\\frac{dN}{d\\varphi}', name: 'Angular distribution', meaning: 'How many hadrons fly out per unit azimuthal angle around the beam. The corner plot shows it live.', param: 'hadrons' },
      { tex: 'v_2', name: 'Elliptic flow coefficient', meaning: 'The size of the cos 2φ ripple. Measured as $v_2 = \\langle \\cos 2(\\varphi-\\Psi_R) \\rangle$ over all hadrons. Typical values are a few percent.', param: 'v2' },
      { tex: '\\Psi_R', name: 'Reaction plane', meaning: 'The plane containing the beam and the impact parameter. In the scene it is the horizontal x axis. Real experiments must estimate it event by event.', param: 'b' },
      { tex: '\\varphi', name: 'Azimuthal angle', meaning: 'Direction of a hadron around the beam axis, measured from the reaction plane.' },
    ],
  },
  physicsNotes: `
<h3>From almond to ripple</h3>
<p>Measure the shape of the overlap by its <strong>eccentricity</strong>, $\\varepsilon_2 = \\frac{\\langle y^2\\rangle - \\langle x^2\\rangle}{\\langle y^2\\rangle + \\langle x^2\\rangle}$, where $x$ lies along the impact parameter. A head-on collision gives $\\varepsilon_2 = 0$. A grazing one approaches 1.</p>
<p>Pressure gradients are steeper along the short axis, so the fluid accelerates faster in the reaction plane. That turns a spatial anisotropy into a momentum anisotropy. Hydrodynamics predicts $v_2 \\approx \\kappa\\,\\varepsilon_2$, with a response $\\kappa$ of roughly 0.2 for a near-ideal fluid. Viscosity lowers $\\kappa$. The effect is self-quenching. As the fireball becomes round, the push stops, so $v_2$ is mostly fixed in the first few fm/c.</p>
<h3>How hot is it?</h3>
<p>Bjorken's estimate turns the measured transverse energy per unit rapidity into an energy density at an early time $\\tau_0$:</p>
$$\\varepsilon_{Bj} = \\frac{1}{\\pi R^2 \\tau_0}\\frac{dE_T}{dy}$$
<p>For central gold collisions at RHIC, PHENIX found about 5 GeV/fm³ at $\\tau_0 = 1$ fm/c. That is roughly thirty times the energy density inside a nucleus. For an ideal gas of gluons and three light quark flavours, $\\varepsilon = \\frac{\\pi^2}{30}\\,47.5\\,T^4$, which puts the start well above the crossover temperature $T_c \\approx 155$ MeV.</p>
<h3>What the simulation does</h3>
<p>The scene samples fluid cells from the hard-sphere almond. Their temperatures follow entropy conservation in a volume that grows along the beam (Bjorken flow) and sideways (a self-similar anisotropic expansion). Each cell freezes out at 110 MeV and emits pions from a thermal source boosted by the local flow. The $v_2$ readout is measured from those pions, with its statistical error. It is not typed in.</p>`,
  deep: [
    {
      title: 'Pancakes, rapidity and the Bjorken picture',
      html: `<p>A gold nucleus at RHIC carries 100 GeV per nucleon. Dividing by the nucleon mass gives $\\gamma \\approx 107$, so a nucleus 14 fm across is only about 0.13 fm thick in the lab. At the LHC each lead nucleon carries 2.51 TeV, $\\gamma \\approx 2700$. The pancakes cross each other in well under a fm/c.</p>
<p>Bjorken noticed in 1983 that at such energies the collision looks the same in every frame boosted along the beam. Matter at longitudinal position $z$ moves with velocity $z/t$. The natural clock is proper time $\\tau = \\sqrt{t^2 - z^2}$, and the volume of a slice grows like $\\tau$. That is why the fireball in the scene stretches along the beam while it expands sideways. See <a href="#/t/special-relativity">special relativity</a> for the contraction itself.</p>
<p>The spectators in the scene carry on down the beam pipe. Their number is how experiments estimate the impact parameter, which cannot be measured directly.</p>`,
    },
    {
      title: 'The perfect liquid and the viscosity bound',
      html: `<p>Viscosity is friction between layers of fluid. For comparing very different fluids, the useful measure is the ratio of shear viscosity to entropy density, $\\eta/s$. In units of $\\hbar/k_B$ it counts how much momentum a fluid spreads per quantum of disorder.</p>
<p>In 2001 Policastro, Son and Starinets computed $\\eta/s$ for a strongly coupled cousin of QCD using a black hole in a higher-dimensional space. In 2005 Kovtun, Son and Starinets found the same value, $1/4\\pi \\approx 0.08$, for a whole class of such theories and conjectured it was a universal lower bound. The tool is the AdS/CFT duality, where a hot plasma maps onto a black brane and viscosity maps onto how the horizon absorbs gravitational waves. The <a href="#/t/holography">holography</a> page explains the duality.</p>
<p>The bound is a conjecture, not a theorem. Theories with extra higher-derivative gravity terms can go below it. No real fluid has been found below it. Every ordinary fluid measured sits well above it. Fits of viscous hydrodynamics to RHIC and LHC data put the plasma near $T_c$ within about a factor of two or three of $1/4\\pi$. That is the sense in which it is the most perfect liquid known.</p>`,
    },
    {
      title: 'History: from RHIC to ALICE',
      html: `<p>The Relativistic Heavy Ion Collider at Brookhaven started colliding gold nuclei in 2000. Its four experiments, BRAHMS, PHENIX, PHOBOS and STAR, published assessment papers, and in April 2005 Brookhaven announced that the matter behaved like a nearly <em>perfect liquid</em> rather than the weakly interacting gas many had expected.</p>
<p>The key evidence was elliptic flow as large as ideal hydrodynamics predicted, plus <strong>jet quenching</strong>. Fast quarks that should have made back-to-back sprays of particles lost much of their energy crossing the fireball, so the partner jet often vanished.</p>
<p>The LHC began lead collisions in November 2010. ALICE, the LHC's dedicated heavy-ion experiment, measured elliptic flow in the first run and found it about 30% larger than at RHIC. ATLAS and CMS saw strongly unbalanced pairs of jets. Later, even small systems like proton-lead collisions showed flow-like patterns, which is still an active question.</p>`,
    },
    {
      title: 'The phase diagram, and the early universe',
      html: `<p>The second view maps nuclear matter by temperature $T$ and baryon chemical potential $\\mu_B$, which measures the excess of quarks over antiquarks. At $\\mu_B \\approx 0$, lattice QCD finds a smooth <strong>crossover</strong> near 155 MeV, not a sharp phase transition. Ordinary nuclei sit near $T = 0$, $\\mu_B \\approx 920$ MeV.</p>
<p>RHIC at 200 GeV and the LHC freeze out at $\\mu_B$ of about 20 MeV and 1 MeV, very close to the early universe. The universe cooled through $T_c$ about 10 microseconds after the Big Bang, with an even tinier $\\mu_B$. That is why these collisions are called little bangs.</p>
<p>At larger $\\mu_B$ the crossover may turn into a first-order line that ends at a <strong>critical point</strong>. Lattice methods fail there because of the sign problem, and experiments such as RHIC's beam energy scan are searching. The critical point and the colour-superconducting phases at high density are theory, not established fact. The diagram marks them as such.</p>`,
    },
    {
      title: 'Why it melts: the link to confinement',
      html: `<p>In cold matter the strong force confines quarks inside hadrons. Pulling two apart stretches a flux tube of gluon field until it snaps, as the <a href="#/t/quark-confinement">quark confinement</a> page shows. In a hot, dense plasma other colour charges crowd around every quark and screen its field, much as ions screen charges in an ordinary plasma. The flux tube has no room to form, so quarks roam over distances much larger than a proton.</p>
<p>Evidence includes the counting of degrees of freedom. The energy density divided by $T^4$ rises by roughly a factor of ten across $T_c$ in lattice calculations, as a gas of light hadrons gives way to many more coloured quark and gluon states. It stays roughly 15 to 20% below the free-gas value even at twice $T_c$, a hint that the plasma is still strongly coupled.</p>`,
    },
  ],
  challenges: [
    {
      id: 'central',
      title: 'Head-on',
      prompt: 'Run a nearly central collision ($b \\le 1.5$ fm) to the end and measure $|v_2| < 0.02$.',
      hint: 'Slide the impact parameter to zero. The run restarts on its own. Wait for all hadrons to freeze out.',
      check: (s) => (s.b as number) <= 1.5 && s.done === true && Math.abs(s.v2 as number) < 0.02,
    },
    {
      id: 'almond',
      title: 'Squeeze the almond',
      prompt: 'Make the almond thin enough to get $v_2 > 0.06$ at the end of a run.',
      hint: 'Raise $b$ to 10 fm or more, and keep the viscosity near the bound.',
      check: (s) => s.done === true && (s.v2 as number) > 0.06,
    },
    {
      id: 'viscous',
      title: 'Thick as honey',
      prompt: 'With $b \\ge 7$ fm, raise $\\eta/s$ to at least 0.3 and finish a run with $v_2 < 0.04$.',
      hint: 'A viscous fluid evens out its own velocity differences before the hadrons form.',
      check: (s) => (s.b as number) >= 7 && (s.etaS as number) >= 0.3 && s.done === true && (s.v2 as number) < 0.04,
    },
    {
      id: 'hot',
      title: 'Catch it hot',
      prompt: 'At LHC energy, pause the fireball while it is still above $T_c$.',
      hint: 'Switch the beam to LHC, then press Pause in the first second or so after the collision.',
      check: (s) => s.beam === 'lhc' && s.playing === false && (s.T as number) > 155 && (s.tau as number) > 0,
    },
  ],
  caveats: `<p>This is a toy model built to show the mechanism, not a research simulation. The nuclei are hard spheres, and the initial state is smooth. Real nuclei have lumpy, fluctuating nucleon positions, which give central collisions a $v_2$ of a few percent and also produce triangular flow $v_3$. The expansion is self-similar with a single strength constant, and the viscous term is a relaxation with a gain tuned by hand, not a solution of relativistic viscous hydrodynamics. All hadrons are treated as pions emitted at one temperature, and resonance decays and the hadronic afterburner are ignored.</p>
<p>The initial energy density uses Bjorken's formula with approximate transverse-energy inputs, and the equation of state is a smoothed step between a hadron gas and 80% of an ideal quark-gluon gas. Jet energy loss is only qualitative: it grows like $T^3 L^2$, the BDMPS scaling, with an arbitrary strength. The $\\eta/s \\ge 1/4\\pi$ bound is a conjecture from holography, and the critical point on the phase diagram has not been found.</p>`,
  further: [
    { label: 'Quark-gluon plasma on Wikipedia', url: 'https://en.wikipedia.org/wiki/Quark%E2%80%93gluon_plasma' },
    { label: 'Kovtun, Son, Starinets, viscosity bound (2005)', url: 'https://arxiv.org/abs/hep-th/0405231' },
    { label: 'ALICE, elliptic flow in Pb-Pb at 2.76 TeV (2010)', url: 'https://arxiv.org/abs/1011.3914' },
    { label: 'PHENIX, formation of dense partonic matter at RHIC (2005)', url: 'https://arxiv.org/abs/nucl-ex/0410003' },
  ],
};
