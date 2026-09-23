import type { TopicContent } from '../../core/types.ts';

export const content: TopicContent = {
  intuition: `
<p class="lead">How much information fits inside a region of space? You might guess it grows with the volume. For a black hole it does not. <strong>A black hole stores information in proportion to the area of its surface.</strong> Double the radius and the volume grows eight times, but the information only grows four times.</p>
<p>Take that seriously and a strange idea appears. Maybe everything inside a region can be described by a theory living on its boundary, with one dimension fewer. That idea is called <strong>holography</strong>, after the flat film that stores a 3D image.</p>
<p>The scene shows the best-understood example. The glassy cylinder is <strong>anti-de Sitter space</strong> (AdS), a universe with a negative cosmological constant. Time runs up the cylinder. Each horizontal slice is a curved, hyperbolic plane. The tiles on it are all the same size in the true geometry. They only look smaller near the rim because we squeeze an infinite plane into a finite disk. The rim is infinitely far from the centre.</p>
<p>On the rim lives an ordinary quantum theory with no gravity. Inside, the <strong>bulk</strong>, there is gravity. The claim is that these are two descriptions of the same physics.</p>
<p>Pick a stretch of the rim, the amber <strong>interval A</strong>. The quantum stuff in A is entangled with the rest of the rim. How much? Draw the shortest curve through the bulk that joins the two ends of A. That is the cyan curve. Its length, divided by $4G$, is the entanglement entropy. This rule is <strong>Ryu–Takayanagi</strong>.</p>
<p>Now grow the interval. The curve dives deeper toward the centre. <strong>Depth in the bulk is scale on the boundary.</strong> Small features of the boundary theory live near the rim. Big, long-range features live deep inside. The extra dimension is a ruler for size.</p>
<p>This is a precise, heavily tested correspondence for AdS space. Our universe is not AdS. Whether holography also describes our world is an open question.</p>`,
  tryFirst: [
    'Drag <b>Interval size</b> up and watch the cyan curve dive toward the centre. Watch the <b>depth</b> readout.',
    'Look at the corner plot. $S$ climbs fast at first and then flattens. That is a logarithm, not a straight line.',
    'Scrub <b>Time slice</b>. The whole picture slides up the cylinder, and nothing else changes. Empty AdS is static.',
    'Switch <b>View</b> to <b>Black hole entropy</b> and raise the mass. Count the horizon tiles as it grows.',
  ],
  equation: {
    tex: 'S_A = \\frac{\\text{Area}(\\gamma_A)}{4G_N}',
    caption: 'The Ryu–Takayanagi formula. The entanglement entropy of a boundary region A equals the area of the minimal bulk surface γ_A that ends on the edge of A, in units of four times Newton\'s constant. In three-dimensional AdS the "area" is a length. Units ħ = c = k_B = 1.',
    terms: [
      { tex: 'S_A', name: 'Entanglement entropy', meaning: 'How entangled the boundary region A is with the rest of the boundary. It is the von Neumann entropy $-\\text{tr}\\,\\rho_A \\log \\rho_A$ of the state restricted to A.', param: 'S' },
      { tex: '\\text{Area}(\\gamma_A)', name: 'Minimal area', meaning: 'Length of the cyan curve. It is the shortest bulk curve with the same endpoints as A. It diverges near the rim, so it is cut off at a small distance $\\varepsilon$.', param: 'length' },
      { tex: '\\gamma_A', name: 'RT curve', meaning: 'The minimal curve itself. Bigger intervals give curves that reach deeper into the bulk.', param: 'size' },
      { tex: 'G_N', name: "Newton's constant", meaning: 'Gravity in the bulk. Small $G_N$ means weak gravity and a boundary theory with many degrees of freedom, $c = 3R/2G_N$ in AdS3.' },
      { tex: '4', name: 'The Bekenstein–Hawking 4', meaning: 'The same factor as in black hole entropy $S = A/4G$. A horizon is a special minimal surface.', param: 'sbh' },
    ],
  },
  physicsNotes: `
<h3>The geometry</h3>
<p>Global AdS3 with radius $R$ has the metric</p>
$$ds^2 = R^2\\left(-\\cosh^2\\!\\rho\\, dt^2 + d\\rho^2 + \\sinh^2\\!\\rho\\, d\\phi^2\\right).$$
<p>At fixed $t$ this is a hyperbolic plane. Setting $r = \\tanh(\\rho/2)$ turns it into the Poincaré disk, with $ds = 2R\\,|dz|/(1-|z|^2)$. The distance between two points is</p>
$$d(z,w) = R\\,\\operatorname{arcosh}\\!\\left(1 + \\frac{2|z-w|^2}{(1-|z|^2)(1-|w|^2)}\\right).$$
<p>Geodesics are circle arcs that meet the rim at right angles, plus diameters. The rim, $r = 1$, is at infinite distance.</p>
<h3>From a curve to a logarithm</h3>
<p>Cut the bulk off at $\\rho = \\rho_c$. The geodesic joining two cutoff points separated by angle $2\\alpha$ has exact length</p>
$$\\cosh\\frac{L}{R} = 1 + 2\\sinh^2\\!\\rho_c\\,\\sin^2\\!\\alpha .$$
<p>For large $\\rho_c$ this is $L \\approx 2R\\log(e^{\\rho_c}\\sin\\alpha)$. Brown and Henneaux found in 1986 that the boundary theory has central charge $c = 3R/2G$. Put these together with $e^{\\rho_c} = L_\\circ/(\\pi\\varepsilon)$ and $\\alpha = \\pi\\ell/L_\\circ$:</p>
$$S_A = \\frac{L}{4G} = \\frac{c}{3}\\log\\!\\left(\\frac{L_\\circ}{\\pi\\varepsilon}\\sin\\frac{\\pi \\ell}{L_\\circ}\\right).$$
<p>Here $\\ell$ is the interval length, $L_\\circ$ the boundary circumference and $\\varepsilon$ a short-distance cutoff. This is exactly the entanglement entropy of a two-dimensional conformal field theory, found by Holzhey, Larsen and Wilczek in 1994 and by Calabrese and Cardy in 2004. For $\\ell \\ll L_\\circ$ it reduces to $(c/3)\\log(\\ell/\\varepsilon)$. The scene uses $R = 1$ and $\\rho_c = 3.5$, so the boundary is about 100 cutoff lengths around. The readout <b>RT vs CFT</b> shows the small gap left by this finite cutoff.</p>
<h3>Depth is scale</h3>
<p>The deepest point of the curve sits at $\\rho_*$ with $\\tanh(\\rho_*/2) = |\\tan(\\pi/4 - \\alpha/2)|$. Its depth below the cutoff, $\\rho_c - \\rho_*$, is close to $\\log(\\ell/2\\varepsilon)$ for small intervals. Moving inward by $\\ln 2 \\approx 0.69$ doubles the length scale on the boundary. A half-circle interval, $\\ell = L_\\circ/2$, gives a diameter through the very centre.</p>
<h3>Black hole entropy</h3>
<p>A Schwarzschild black hole of mass $M$ has horizon radius $r_s = 2GM/c^2$ and area $A = 4\\pi r_s^2$. Its entropy is</p>
$$S_{BH} = \\frac{k_B A}{4\\,\\ell_P^2} = \\frac{4\\pi G M^2}{\\hbar c}\\,k_B,\\qquad \\ell_P^2 = \\frac{G\\hbar}{c^3}.$$
<p>For one solar mass, $r_s \\approx 2.95$ km and $S \\approx 1.05\\times10^{77}\\,k_B$, about $1.5\\times10^{77}$ bits. It grows as $M^2$, like area, not as $M^3$, like volume.</p>`,
  deep: [
    {
      title: 'Black holes have entropy: Bekenstein and Hawking',
      html: `<p>In 1971 Hawking proved that the total horizon area of black holes never decreases in classical general relativity. That sounds like the second law of thermodynamics. In 1972 Jacob Bekenstein took it literally. He argued that a black hole must carry entropy proportional to its area. Otherwise you could throw a hot box into a black hole and make the entropy of the universe go down.</p>
<p>Most physicists were sceptical, because anything with entropy should have a temperature and glow. In 1974 Hawking showed that quantum fields near a horizon do make it glow, with temperature $T = \\hbar c^3/(8\\pi G M k_B)$. The first law $dE = T\\,dS$ then fixes the coefficient: $S = A/4$ in Planck units.</p>
<p>The numbers are huge. A solar-mass black hole has about $10^{77}\\,k_B$. The entropy is not spread through the volume. It scales with the area of the surface. For any ordinary system made of local parts, entropy grows with volume. Black holes break that rule, and the maximum entropy of a region is set by its boundary.</p>`,
    },
    {
      title: "From a principle to a duality: 't Hooft, Susskind, Maldacena",
      html: `<p>In 1993 Gerard 't Hooft argued that since the maximum entropy of a region grows with its area, a theory of quantum gravity should have roughly one degree of freedom per Planck area of the boundary. In 1995 Leonard Susskind connected this to string theory and named it <strong>the world as a hologram</strong>. At that stage it was a principle with no concrete example.</p>
<p>The example arrived in late 1997. Juan Maldacena studied a stack of $N$ coincident D3-branes, the objects explored on the <a href="#/t/branes">branes</a> page. Seen one way, the open strings on the stack give $\\mathcal{N}=4$ super Yang–Mills theory with gauge group $SU(N)$, a four-dimensional quantum field theory with no gravity. Seen the other way, the branes are heavy and curve space into $AdS_5 \\times S^5$. Maldacena proposed that these are one and the same theory. This is the <strong>AdS/CFT correspondence</strong>.</p>
<p>In 1998 Gubser, Klebanov and Polyakov, and separately Witten, gave the dictionary. Fields in the bulk match operators on the boundary. The boundary value of a bulk field is the source for its operator. Since then, thousands of checks have been made where both sides can be computed.</p>`,
    },
    {
      title: 'Ryu–Takayanagi and its descendants',
      html: `<p>In 2006 Shinsei Ryu and Tadashi Takayanagi proposed that the entanglement entropy of a boundary region is the area of the minimal bulk surface anchored on it, divided by $4G$. For AdS3 the check is the calculation shown in the scene. The RT length reproduces the Calabrese–Cardy log formula, including the coefficient $c/3$.</p>
<p>The formula has since been generalised and derived:</p>
<ul>
<li>Hubeny, Rangamani and Takayanagi (2007) extended it to time-dependent spacetimes, using extremal rather than minimal surfaces.</li>
<li>Lewkowycz and Maldacena (2013) derived it for static cases from the gravitational path integral.</li>
<li>Faulkner, Lewkowycz and Maldacena (2013) added the first quantum correction, the entanglement of bulk fields across the surface.</li>
</ul>
<p>RT also explains a key property of entanglement. Strong subadditivity, $S_{AB} + S_{BC} \\ge S_{ABC} + S_B$, follows from simple cut-and-paste arguments on minimal curves.</p>
<p>A black hole in AdS makes the curve for a large interval wrap around the horizon. Then the area law of black holes is recovered as a special case.</p>`,
    },
    {
      title: 'Spacetime from entanglement',
      html: `<p>RT links a geometric quantity, area, to a quantum one, entanglement. In 2010 Mark Van Raamsdonk ran the link backwards. Take two boundary theories that are entangled, and the bulk is one connected spacetime. Reduce the entanglement, and the RT surfaces between the two halves shrink. In the limit the spacetime pinches off into two pieces. His slogan was that <strong>spacetime is built from entanglement</strong>.</p>
<p>The tiling in the scene hints at a related toy model. Tensor networks such as MERA, and the holographic error-correcting codes of Pastawski, Yoshida, Harlow and Preskill (2015), which use a $\\{5,4\\}$ tiling, place small quantum systems on a hyperbolic lattice. In those models, the minimal cut through the network obeys an RT-like rule. The tiling drawn here is only a picture of the geometry. It is not a working network.</p>
<p>In 2013 Maldacena and Susskind proposed <strong>ER = EPR</strong>. It says every pair of entangled particles is joined by some kind of Einstein–Rosen bridge, or wormhole. For black holes this is supported by specific constructions. For ordinary particles it is a conjecture with no clear test, and should be read as speculation.</p>`,
    },
    {
      title: 'Honest status: AdS versus our universe',
      html: `<p><strong>What is established.</strong> AdS/CFT has never been proved. It is still a conjecture, but an unusually well tested one. Quantities protected by supersymmetry match exactly. Integrability methods match the two sides at all couplings for some observables. Numerical studies of the boundary theory reproduce bulk black hole physics. RT has passed every test where the entropy can be computed independently.</p>
<p><strong>What is not.</strong> The best examples need a negative cosmological constant, a boundary at infinity, and usually supersymmetry and a large number of fields. Our universe has a positive cosmological constant and is heading toward de Sitter space, which has no timelike boundary to put a hologram on. Proposals such as Strominger's dS/CFT (2001) exist, but no working de Sitter version of holography is known.</p>
<p><strong>What the scene simplifies.</strong> Only a single time slice of pure AdS3 is drawn. Real examples also carry an internal space such as $S^5$. The cutoff $\\varepsilon$ is fixed, and its exact relation to $\\rho_c$ is a convention that shifts $S$ by a constant. The black hole view is a picture of the area law. The tiles are symbols, not literal Planck-sized cells, and the horizon is not a grid of bits in any known theory.</p>`,
    },
  ],
  challenges: [
    {
      id: 'centre',
      title: 'Reach the centre',
      prompt: 'Grow the interval until the RT curve passes through the centre of the disk.',
      hint: 'The curve is a diameter when the interval covers exactly half the boundary. Set <b>Interval size</b> to 0.50.',
      check: (s) => s.view === 'ads' && s.reachedCentre === true,
    },
    {
      id: 'log',
      title: 'Logarithm, not line',
      prompt: 'Read $S$ at interval size 0.05, then at 0.40. The interval grew 8 times. How much did $S$ grow?',
      hint: 'Visit both sizes with the <b>Interval size</b> slider. For small intervals $S \\approx (c/3)\\log(\\ell/\\varepsilon)$, so multiplying ℓ by 8 adds at most $(c/3)\\ln 8 \\approx 0.69\\,c$. The sine factor trims it to about $0.6\\,c$ here.',
      check: (s) => Number(s.sizeMinSeen) <= 0.051 && Number(s.sizeMaxSeen) >= 0.399,
    },
    {
      id: 'double',
      title: 'Double the mass',
      prompt: 'In the black hole view, press <b>Pin reference</b>, then set a mass exactly twice the pinned one. Check that the entropy quadruples.',
      hint: 'The reference starts at 1 M☉. Set the mass to 2.0 M☉. The readout S / S_ref should read 4.00, because $S \\propto A \\propto M^2$.',
      check: (s) => s.view === 'bh' && Math.abs(Number(s.massRatio) - 2) < 0.02,
    },
    {
      id: 'scrub',
      title: 'Scrub through time',
      prompt: 'Scrub the time slice across most of the cylinder and watch the readouts.',
      hint: 'Move <b>Time slice</b> from near 0 to near 2π. Empty AdS looks the same at every time, so the entropy never changes.',
      check: (s) => Number(s.timeSpan) >= 3,
    },
  ],
  caveats: `The scene shows one slice of pure AdS3 at a time, in units where the AdS radius is 1. The cutoff is fixed at ρc = 3.5, which makes finite-cutoff corrections visible for the smallest intervals. The {7,3} tiling is decoration that shows the hyperbolic geometry. It is not a tensor network or a code. The black hole view is a cartoon of the area law. Its tiles stand for huge blocks of Planck areas. AdS/CFT is a conjecture with strong evidence in AdS. Holography for our own, nearly de Sitter universe is unknown.`,
  further: [
    { label: 'Ryu & Takayanagi (2006), Holographic derivation of entanglement entropy from AdS/CFT (arXiv)', url: 'https://arxiv.org/abs/hep-th/0603001' },
    { label: 'Maldacena (1997), The large N limit of superconformal field theories and supergravity (arXiv)', url: 'https://arxiv.org/abs/hep-th/9711200' },
    { label: 'Van Raamsdonk (2010), Building up spacetime with quantum entanglement (arXiv)', url: 'https://arxiv.org/abs/1005.3035' },
    { label: 'Holographic principle (Wikipedia)', url: 'https://en.wikipedia.org/wiki/Holographic_principle' },
  ],
};
