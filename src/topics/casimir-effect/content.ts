import type { TopicContent } from '../../core/types.ts';

export const content: TopicContent = {
  intuition: `
<p class="lead">Put two clean metal plates face to face in a perfect vacuum, a millionth of a metre apart. No charge, no light, no air. They still pull on each other. Hendrik Casimir predicted this in 1948, and it has now been measured many times.</p>
<p>One way to picture it uses the waves of the electromagnetic field. Quantum theory says every possible wave pattern, or <strong>mode</strong>, keeps a tiny jitter even in total darkness. A metal plate forces the field to vanish at its surface. So between the plates only waves that fit a whole number of half-wavelengths survive. The longest one is twice the gap. Outside, the space is open and every wavelength is allowed.</p>
<p>So there are slightly fewer modes pushing from inside than from outside. Count the energy carefully and the difference is finite. It is lower when the plates are closer, so they are pushed together. The push grows very fast as the gap shrinks. Halve the gap and it gets <strong>sixteen</strong> times stronger.</p>
<p>At a micrometre the pressure is about a thousandth of a pascal, far less than a breath of air. At ten nanometres it would be about one atmosphere for ideal metals. That is why the force matters for tiny machines, where it can make moving parts stick together.</p>
<p>In the scene, the <span style="color:#f5b642">amber waves</span> are the few modes that fit between the plates. The <span style="color:#4fd1e8">cyan waves</span> outside can take any wavelength. The arrows show the net push. The inset tracks the pressure on log axes.</p>`,
  tryFirst: [
    'Drag <b>Gap d</b> to the left. Watch the arrows grow and the dot slide up the slope −4 line in the inset.',
    'Press <b>Halve gap</b>. The readout shows the force jump by exactly 16.',
    'Look at the spectrum strip. Between the plates, no wave longer than $2d$ fits. That missing band is the whole effect.',
    'Switch <b>Geometry</b> to sphere and plate. This is how real experiments measure the force. Halve the gap again and the factor is now 8.',
  ],
  equation: {
    tex: '\\frac{F}{A} \\;=\\; -\\,\\frac{\\pi^2\\,\\hbar c}{240\\,d^4}',
    caption: 'Casimir pressure between two ideal, uncharged, perfectly conducting plates a distance $d$ apart at zero temperature. The minus sign means attraction.',
    terms: [
      { tex: '\\frac{F}{A}', name: 'Casimir pressure', meaning: 'Force per unit area on each plate. At $d = 1\\,\\mu$m it is $1.30\\times10^{-3}$ Pa. At $d = 10$ nm it is about $1.3$ atm.', param: 'pressure' },
      { tex: '-', name: 'Attraction', meaning: 'Negative means the plates pull together. The energy between them falls as they approach.', param: 'force' },
      { tex: '\\frac{\\pi^2}{240}', name: 'Mode-sum number', meaning: 'What survives after the infinite parts of the mode sum cancel. It comes from $\\zeta(-3) = 1/120$ in 3D, just as $\\zeta(-1) = -1/12$ gives the 1D toy result. The readout checks a cutoff sum against it.', param: 'check' },
      { tex: '\\hbar c', name: 'Quantum and relativity', meaning: 'Planck’s constant times the speed of light, $3.16\\times10^{-26}$ J·m. No charge, mass or material property appears for ideal plates.', param: 'hbarc' },
      { tex: 'd^4', name: 'Gap to the fourth', meaning: 'The steep power law. Halving the gap multiplies the pressure by 16.', param: 'gap' },
    ],
  },
  physicsNotes: `
<h3>The 1D toy version</h3>
<p>Take a massless field on a line, pinned to zero at two points a distance $d$ apart. The allowed modes are $k_n = n\\pi/d$ with $n = 1, 2, 3, \\dots$ Each keeps a zero-point energy $\\hbar c k_n/2$. In units with $\\hbar = c = 1$ the total is</p>
$$E(d) = \\frac{\\pi}{2d}\\sum_{n=1}^{\\infty} n,$$
<p>which is infinite. Real metals stop reflecting at very short wavelengths, so damp each mode by $e^{-\\varepsilon k_n}$. With $a = \\varepsilon\\pi/d$ the sum is geometric:</p>
$$\\sum_{n\\ge1} n\\,e^{-an} = \\frac{e^{-a}}{(1-e^{-a})^2} = \\frac{1}{a^2} - \\frac{1}{12} + \\frac{a^2}{240} - \\dots$$
<p>so</p>
$$E(d,\\varepsilon) = \\frac{d}{2\\pi\\varepsilon^2} \\;-\\; \\frac{\\pi}{24\\,d} \\;+\\; O(\\varepsilon^2).$$
<p>The first term blows up as $\\varepsilon \\to 0$, but it is proportional to $d$. It is just a fixed energy per unit length, the same inside and outside. Put the pair of points inside a long box of length $L$. The total is $L/2\\pi\\varepsilon^2 - \\tfrac{\\pi}{24}\\big(\\tfrac1d + \\tfrac{1}{L-d}\\big)$. The divergent part depends only on $L$, so it exerts no force. What is left, $-\\pi/24d$, does not depend on the cutoff at all. The force is $F = -\\partial E/\\partial d = -\\pi\\hbar c/24d^2$, an attraction.</p>
<p>The zeta-function shortcut gets the same answer in one line. Assign $\\sum n = \\zeta(-1) = -1/12$. That is not a real sum of positive numbers. It is the finite piece a cutoff leaves behind, and the tests confirm that an exponential and a Gaussian cutoff both give it.</p>
<h3>Three dimensions and two polarisations</h3>
<p>Between plates the electromagnetic modes have $k_z = n\\pi/d$ and any transverse wavevector. Doing the same cutoff subtraction, now with the Euler–Maclaurin formula, gives an energy per area</p>
$$\\frac{E}{A} = -\\frac{\\pi^2\\hbar c}{720\\,d^3},\\qquad \\frac{F}{A} = -\\frac{\\partial}{\\partial d}\\frac{E}{A} = -\\frac{\\pi^2\\hbar c}{240\\,d^4}.$$
<p>The $720$ is $6 \\times 120$, and the $120$ is $1/\\zeta(-3)$. The test suite does this 3D cutoff sum in closed form and recovers $\\pi^2/720$ to better than one part in $10^5$.</p>
<h3>Sphere and plate</h3>
<p>Two flat plates are hard to keep parallel at a micrometre. Experiments use a sphere of radius $R$ near a flat. If $d \\ll R$, treat the sphere as rings, each a small patch of plate at its own local gap. Adding them up is the <strong>proximity force approximation</strong>:</p>
$$F = 2\\pi R\\,\\frac{E}{A}(d) = -\\frac{\\pi^3\\hbar c\\,R}{360\\,d^3}.$$
<p>One power of $d$ is lost because only a small patch near the bottom of the sphere matters. Its radius is about $\\sqrt{2Rd}$, and that patch supplies $7/8$ of the force.</p>`,
  deep: [
    {
      title: 'Deriving the sphere–plate force from the plate pressure',
      html: `<p>Near its lowest point a sphere of radius $R$ sits at local height $h(\\rho) = d + R - \\sqrt{R^2 - \\rho^2} \\approx d + \\rho^2/2R$ above the plate. A ring of radius $\\rho$ and width $d\\rho$ feels the plate pressure at gap $h$. Since $dh = \\rho\\,d\\rho/R$,</p>
$$F = \\int_0^{\\infty} P(h)\\,2\\pi\\rho\\,d\\rho = 2\\pi R\\int_d^{\\infty} P(h)\\,dh = 2\\pi R\\,\\frac{E}{A}(d).$$
<p>The last step uses $P = -\\partial(E/A)/\\partial d$ and $E/A \\to 0$ far away. Put in $E/A = -\\pi^2\\hbar c/720d^3$ and you get $-\\pi^3\\hbar c R/360 d^3$. The tests do this integral numerically over the exact sphere shape. The answer matches PFA up to a relative correction of $d/2R$ from the exact profile, which is tiny in real experiments.</p>
<p>PFA is an approximation. Exact calculations for a sphere and a plate made of ideal metal show corrections that start at order $d/R$. For $d/R \\sim 10^{-3}$ they are well below the experimental error.</p>`,
    },
    {
      title: 'History: Casimir, Polder and the first measurements',
      html: `<p>Hendrik Casimir and Dirk Polder worked at the Philips laboratories in Eindhoven on colloids. Experiments there suggested that the van der Waals attraction between particles weakens at long range. In 1948 Casimir and Polder showed why. When atoms are far apart, the finite speed of light delays their mutual influence. The attraction between two neutral atoms then falls as $1/r^7$ instead of London’s $1/r^6$.</p>
<p>Casimir later recalled that a remark by Niels Bohr pointed him toward zero-point energy. Later in 1948 he derived the plate formula from a mode sum in a short, elegant paper. Marcus Sparnaay tried to measure it with parallel plates in 1958. His result was compatible with theory but had very large uncertainty.</p>
<p>The first precise test came from Steve Lamoreaux in 1997. He used a torsion pendulum to measure the force between a gold-coated flat and a spherical lens of radius 11.3 cm, at gaps from 0.6 to 6 µm. The data agreed with theory at about the 5% level. The forces were a few times $10^{-10}$ N. In 1998 Umar Mohideen and Anushree Roy used an atomic force microscope. A metal-coated polystyrene sphere 196 µm across hung on a cantilever, at gaps of 0.1 to 0.9 µm. They reached about 1% precision at the closest gaps. In 2002 Bressi and colleagues measured the parallel-plate force directly, with about 15% precision.</p>`,
    },
    {
      title: 'Is it really vacuum energy?',
      html: `<p>The mode-counting story is correct and useful. It is not the only story. Robert Jaffe pointed out in 2005 that the Casimir force can be computed without ever mentioning zero-point energy. It is the limit of the ordinary van der Waals forces between the charges in the two plates, as described by Lifshitz theory in 1956. In that picture the force comes from correlated fluctuations of charges and currents in the metals.</p>
<p>A telling detail: the full answer depends on the fine-structure constant $\\alpha$ and goes to zero as $\\alpha \\to 0$. The ideal formula has no $\\alpha$ only because it takes the limit of a perfect conductor, which is a metal with infinitely strong coupling to light. Real plates are transparent to very short waves. That is also why a physical cutoff exists at all.</p>
<p>Both pictures give the same forces. Neither is wrong. What the Casimir effect does <em>not</em> do is prove that the vacuum has a large absolute energy.</p>`,
    },
    {
      title: 'The vacuum energy puzzle',
      html: `<p>Summing zero-point energies over all modes up to a high cutoff gives a vacuum energy density that is absurdly large compared with the dark energy seen in cosmology. See <a href="#/t/cosmological-constant">the vacuum energy puzzle</a>. The Casimir effect is often quoted as proof that this vacuum energy is real.</p>
<p>It is not proof, for two reasons. First, the Casimir force comes from the <em>change</em> in energy when the plates move. The huge bulk term, the $d/2\\pi\\varepsilon^2$ piece in the 1D toy, cancels exactly. Second, as Jaffe noted, the same force follows from forces between charges, with no reference to the vacuum’s absolute energy. No experiment has yet measured how Casimir energy gravitates. Whether vacuum energy gravitates, and how much of it there is, is still an open question.</p>
<p>For more on quantum fields as collections of oscillators, see <a href="#/t/quantum-fields">quantum fields</a>.</p>`,
    },
    {
      title: 'Stiction, MEMS and repulsive Casimir forces',
      html: `<p>Micro-electromechanical systems (MEMS) are tiny machines with parts separated by nanometres to micrometres. At these gaps Casimir and van der Waals forces can pull a moving part onto its neighbour and hold it there. Engineers call this <strong>stiction</strong>. Capillary water and stray charge also cause it, so designers fight all three. In 2001 Chan and colleagues at Bell Labs turned the problem around. They used the Casimir force from a gold sphere to tilt a MEMS torsion plate.</p>
<p>The force need not be attractive. Dzyaloshinskii, Lifshitz and Pitaevskii showed in 1961 that two different materials separated by a fluid can repel. This happens when the fluid’s dielectric response lies between those of the two bodies. In 2009 Munday, Capasso and Parsegian measured such a repulsion. They used a gold sphere and a silica plate immersed in bromobenzene. Repulsion like this could one day help frictionless or stiction-free devices.</p>`,
    },
  ],
  challenges: [
    {
      id: 'atm',
      title: 'One atmosphere',
      prompt: 'With parallel plates, find the gap where the ideal Casimir pressure equals 1 atmosphere, within 10%.',
      hint: 'Slide the gap down to about ten nanometres. The atm readout should read near 1.',
      check: (s) => s.geometry === 'plates' && Math.abs((s.pressureAtm as number) - 1) < 0.1,
    },
    {
      id: 'sixteen',
      title: 'The fourth power',
      prompt: 'With parallel plates, halve the gap and confirm the force rises by a factor of 16.',
      hint: 'Use the Halve gap button with Geometry set to parallel plates.',
      check: (s) => s.halveGeom === 'plates' && Math.abs((s.halveFactor as number) - 16) < 0.1,
    },
    {
      id: 'cube',
      title: 'Only a cube for spheres',
      prompt: 'Switch to sphere and plate, halve the gap, and see the force grow by 8 instead of 16.',
      hint: 'Only a small patch of the sphere matters, and its area grows with $d$. That costs one power of $d$.',
      check: (s) => s.halveGeom === 'sphere' && Math.abs((s.halveFactor as number) - 8) < 0.05,
    },
    {
      id: 'lamoreaux',
      title: 'Match Lamoreaux',
      prompt: 'Set up Lamoreaux’s 1997 experiment: a sphere of radius about 11 cm (8 to 16 cm), a gap between 0.6 and 6 µm, and a force between $10^{-10}$ and $10^{-9}$ N.',
      hint: 'Sphere and plate geometry, radius slider near the right end, gap near 1 µm. The force should read a few times $10^{-10}$ N.',
      check: (s) =>
        s.geometry === 'sphere' &&
        (s.R as number) >= 0.08 && (s.R as number) <= 0.16 &&
        (s.d as number) >= 0.6e-6 && (s.d as number) <= 6e-6 &&
        (s.force as number) >= 1e-10 && (s.force as number) <= 1e-9,
    },
  ],
  caveats: `<p>The formulas assume perfect conductors at zero temperature. Real metals reflect poorly at wavelengths shorter than about their plasma wavelength, about 0.14 µm for gold. That lowers the force by roughly 10% at 1 µm and by much more at smaller gaps. At 10 nm the ideal formula badly overestimates. There the force crosses over to the non-retarded van der Waals regime and depends on the materials, so the “1 atm at 10 nm” figure is an ideal-metal number. At gaps of several micrometres, room temperature adds a thermal correction.</p>
<p>The sphere–plate force uses the proximity force approximation, which is good when $d \\ll R$. Surface roughness, patch potentials and residual charge matter in real experiments. The scene is not to scale. Gaps, wave counts and the cantilever bend are drawn on compressed scales so that every setting stays visible. The tip deflection readout assumes a typical AFM cantilever stiffness of 0.02 N/m, even for large spheres where real experiments used torsion pendulums.</p>`,
  further: [
    { label: 'Casimir effect on Wikipedia', url: 'https://en.wikipedia.org/wiki/Casimir_effect' },
    { label: 'Jaffe, The Casimir effect and the quantum vacuum, Phys. Rev. D 72, 021301 (2005)', url: 'https://arxiv.org/abs/hep-th/0503158' },
    { label: 'Lamoreaux, Demonstration of the Casimir force in the 0.6 to 6 µm range, PRL 78, 5 (1997)', url: 'https://doi.org/10.1103/PhysRevLett.78.5' },
    { label: 'Munday, Capasso and Parsegian, Measured long-range repulsive Casimir–Lifshitz forces, Nature 457, 170 (2009)', url: 'https://doi.org/10.1038/nature07610' },
  ],
};
