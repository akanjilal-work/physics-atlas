import type { TopicContent } from '../../core/types.ts';

export const content: TopicContent = {
  intuition: `
<p class="lead">Balance a pencil on its tip. The rules that govern it, gravity and the table, treat every direction the same. Yet the pencil cannot stay upright. It falls, and it falls one particular way. The laws were perfectly round. The outcome is not.</p>
<p>That is <strong>spontaneous symmetry breaking</strong>. The rules keep their symmetry, but the state the system settles into does not. Nobody chose the direction. A tiny random nudge did, and after that the choice is locked in.</p>
<p>The same thing happens everywhere. Squeeze a plastic ruler end to end. It stays straight until the push passes a critical value, then it bows out to the left or to the right. Cool a lump of iron and its atomic magnets line up along some direction nobody specified. Cool a metal into a superconductor and a hidden quantum phase picks a value. And in the early universe, the <strong>Higgs field</strong> settled into a state that gave the W and Z particles their mass.</p>
<p>The picture that ties them together is a <strong>Mexican hat</strong>. Put a ball on a surface shaped like a sombrero. The peak in the middle is perfectly symmetric but unstable, like the pencil. The ball rolls down into the circular trough, and it has to land somewhere on the rim. Every point of the rim is equally good. Rolling <em>along</em> the rim costs nothing. Rolling <em>up</em> the walls costs a lot. Those two motions are the two kinds of ripple that survive after the symmetry breaks.</p>
<p>Heat undoes it. At high temperature the hat becomes a plain bowl and the ball sits in the middle, symmetric again. Cool it quickly and different regions of space pick different directions. Where they fail to match up, knots called <strong>vortices</strong> get trapped. The third view shows this happening.</p>`,
  tryFirst: [
    'The hat starts cold, and the ball has already rolled off the peak to a random point on the rim. Drag <b>T</b> above $T_c$ to melt the hat into a bowl, then back down and see where it lands this time.',
    'Press <b>Goldstone kick</b>. The ball glides around the rim with nothing pulling it back. Then press <b>Radial kick</b> and compare with the stiff bounce.',
    'Switch to <b>Ruler</b>. Raise the <b>load</b> past 1 and see it snap left or right. Set a small <b>bias</b> and try again.',
    'Switch to <b>XY quench</b> and press <b>Quench</b>. Colour patches form, and the pink and cyan dots are vortices that pair up and annihilate.',
  ],
  equation: {
    tex: 'V(\\phi) = -\\mu^2|\\phi|^2 + \\lambda|\\phi|^4',
    caption: 'The Mexican hat potential for a complex field $\\phi$. Its minimum is a ring at $|\\phi| = v/\\sqrt2$ with $v = \\sqrt{\\mu^2/\\lambda}$. The radial ripple has mass $m_H = \\sqrt{2\\mu^2} = \\sqrt{2\\lambda}\\,v$ and the ripple along the ring is massless. At temperature $T$, replace $\\mu^2$ by $\\mu^2 - cT^2$.',
    terms: [
      { tex: 'V(\\phi)', name: 'Potential energy', meaning: 'Energy density of a uniform field value $\\phi$. It depends only on $|\\phi|$, so it is unchanged if you rotate $\\phi \\to e^{i\\alpha}\\phi$. That rotation is the symmetry.', param: 'V' },
      { tex: '\\phi', name: 'The field', meaning: 'A complex number at every point of space. In the scene, $\\mathrm{Re}\\,\\phi$ and $\\mathrm{Im}\\,\\phi$ are the two floor directions and the ball marks the current value.', param: 'phi' },
      { tex: '-\\mu^2|\\phi|^2', name: 'Upside-down bowl', meaning: 'With $\\mu^2 > 0$ this term lowers the energy away from $\\phi = 0$ and makes the central peak. Heat adds $+cT^2|\\phi|^2$, which flattens and then inverts it above $T_c = \\sqrt{\\mu^2/c}$.', param: 'mu2' },
      { tex: '\\lambda|\\phi|^4', name: 'Steep outer wall', meaning: 'Grows faster than the first term, so it stops the field running away. Larger $\\lambda$ pulls the ring inward and makes it shallower.', param: 'lambda' },
    ],
  },
  physicsNotes: `
<h3>Finding the vacuum</h3>
<p>Write $\\rho = |\\phi|$. Then $dV/d\\rho = -2\\mu^2\\rho + 4\\lambda\\rho^3$ vanishes at $\\rho = 0$ and at</p>
$$\\rho_0 = \\sqrt{\\frac{\\mu^2}{2\\lambda}} = \\frac{v}{\\sqrt2}, \\qquad V(\\rho_0) = -\\frac{\\mu^4}{4\\lambda}.$$
<p>For $\\mu^2 > 0$ the origin is a maximum and the whole circle $\\rho = \\rho_0$ is the minimum. Picking one point of the circle is the breaking.</p>
<h3>Two kinds of ripple</h3>
<p>Expand about a point on the ring, $\\phi = (v + h + i\\pi)/\\sqrt2$. With the kinetic term $|\\partial\\phi|^2$, the fields $h$ and $\\pi$ are normalized so that the mass squared is the curvature of $V$ along each:</p>
$$m_h^2 = \\frac{\\partial^2 V}{\\partial h^2} = -\\mu^2 + 3\\lambda v^2 = 2\\mu^2, \\qquad m_\\pi^2 = \\frac{\\partial^2 V}{\\partial \\pi^2} = 0.$$
<p>The massless $\\pi$ is the <strong>Goldstone mode</strong>, motion along the rim. The massive $h$ is the <strong>Higgs-like mode</strong>, motion up and down the wall. The ball in the scene obeys exactly these equations, $\\ddot x = -\\tfrac12\\,\\partial V/\\partial x$ with a little friction. The readout compares the measured frequency of the radial bounce with $\\sqrt{2\\mu^2}$.</p>
<h3>Temperature</h3>
<p>A hot field feels the average of its own fluctuations. To leading order at high $T$ this adds a term $cT^2|\\phi|^2$, where $c$ depends on the couplings. The effective potential is</p>
$$V_T(\\phi) = (cT^2 - \\mu^2)|\\phi|^2 + \\lambda|\\phi|^4, \\qquad T_c = \\sqrt{\\mu^2/c}.$$
<p>Above $T_c$ the only minimum is $\\phi = 0$ and the symmetry is restored. Below it the ring appears with radius $\\rho_0 \\propto (T_c - T)^{1/2}$. The scene uses $c = 1$. In this mean-field picture the ring grows continuously from zero, a second-order transition. Real systems can differ, as the Deep Dive explains.</p>
<h3>The buckling ruler</h3>
<p>A column with pinned ends stays straight until the load reaches Euler's value $P_c = \\pi^2 EI/L^2$. Above it the straight state is unstable and two bent states appear, mirror images of each other. The exact post-buckling curve is $P/P_c = \\big(2K(k)/\\pi\\big)^2$ with $k = \\sin(\\alpha/2)$, where $\\alpha$ is the end slope and $K$ is the complete elliptic integral. Near the threshold, $P/P_c \\approx 1 + \\alpha^2/8$. This is a pitchfork, the same shape as a slice through the hat. The corner plot draws it. The model in the scene uses one degree of freedom, the end slope, plus a small side force and noise.</p>`,
  deep: [
    {
      title: 'From superconductors to the Higgs: who found what',
      html: `<p>The idea came into particle physics from superconductivity. In the BCS theory of 1957, the ground state does not respect the phase symmetry of the electron field. <strong>Yoichiro Nambu</strong> saw that the same logic could apply to the vacuum of particle physics. In 1960 and 1961, partly with Giovanni Jona-Lasinio, he proposed that a nearly massless pion signals a broken symmetry of the strong force. He shared the 2008 Nobel Prize in Physics for "the discovery of the mechanism of spontaneous broken symmetry in subatomic physics".</p>
<p><strong>Jeffrey Goldstone</strong> wrote down the Mexican hat model in 1961 and noticed the massless mode along the rim. In 1962 Goldstone, Abdus Salam and Steven Weinberg proved the general result. Every broken continuous global symmetry gives a massless spin-0 particle. That was bad news. No such particles were seen alongside the weak force.</p>
<p><strong>Philip Anderson</strong> pointed to the way out in 1963. In a superconductor the would-be Goldstone mode is absorbed by the electromagnetic field, and the photon inside the metal behaves as if it had a mass. That is why magnetic fields are pushed out, the Meissner effect. Anderson suggested the same could happen in particle physics.</p>
<p>In 1964 three groups showed it in relativistic field theory. François Englert and Robert Brout published first, then Peter Higgs, then Gerald Guralnik, Carl Hagen and Tom Kibble. Higgs pointed out that a massive scalar particle should remain. Englert and Higgs shared the 2013 Nobel Prize after ATLAS and CMS found that particle at CERN in 2012. Brout had died in 2011.</p>`,
    },
    {
      title: 'Why the photon stays massless while the W and Z do not',
      html: `<p>When the symmetry is <em>global</em>, the same rotation everywhere, breaking it leaves a Goldstone boson. When it is <em>local</em>, a gauge symmetry with its own force carrier, something different happens. The Goldstone mode becomes the extra polarization a force carrier needs to have mass. A massless spin-1 particle has two polarizations. A massive one has three. The Goldstone supplies the third. It is often said that the gauge boson "eats" the Goldstone.</p>
<p>In the Standard Model the Higgs field is a doublet of two complex fields, four real fields in all. The electroweak symmetry has four generators. The vacuum breaks three of them. Three Goldstone modes are eaten, one each by the $W^+$, the $W^-$ and the $Z$, which become heavy. The fourth real field is the radial mode, the Higgs boson.</p>
<p>One combination of generators leaves the vacuum unchanged. It is electric charge, $Q = T_3 + Y/2$. The Higgs vacuum is neutral, so the symmetry that goes with $Q$ is not broken, and its carrier, the photon, stays massless. Measured values match this picture. With $v \\approx 246$ GeV and $m_H \\approx 125$ GeV, the hat has $\\mu \\approx 88$ GeV and $\\lambda \\approx 0.13$ in this normalization.</p>`,
    },
    {
      title: 'Ferromagnets, crystals and the Ising link',
      html: `<p>A magnet obeys rules that do not care about direction. Below the Curie temperature it magnetizes along some direction anyway. The rotation symmetry is broken. The long-wavelength Goldstone modes are spin waves, called magnons, which cost almost no energy at long wavelength. In a ferromagnet their energy grows as the square of the wavenumber, not linearly, a known twist on Goldstone counting.</p>
<p>A crystal breaks the symmetry of moving through space. Its Goldstone modes are sound waves. A superfluid breaks the phase symmetry of its wavefunction, and its Goldstone mode is also a sound wave.</p>
<p>The <a href="#/t/ising-model">Ising model</a> breaks a <em>discrete</em> symmetry, up versus down. There is no rim to roll along, just two valleys, so there is no Goldstone mode. The buckling ruler is the same kind of case with two choices. In a <a href="#/t/superconductivity">superconductor</a> the broken phase symmetry is gauged, which gives the Anderson-Higgs mechanism instead of a Goldstone mode.</p>
<p>Dimension matters. The Mermin-Wagner theorem (1966) says a continuous symmetry cannot break at any nonzero temperature in two dimensions with short-range forces. Long-wavelength Goldstone ripples destroy the order. The 2D XY model in the third view still has a transition, found by Berezinskii and by Kosterlitz and Thouless, near $T \\approx 0.89\\,J$. Below it, order decays slowly with distance and vortices are bound in pairs. Above it, free vortices appear.</p>`,
    },
    {
      title: 'Kibble-Zurek: defects from a fast quench',
      html: `<p>In 1976 Tom Kibble asked what happens as the early universe cools through a symmetry-breaking transition. Regions far apart cannot communicate, so they pick their vacuum directions independently. Where the choices fail to match, defects are trapped. For a complex field these are strings in 3D and vortices in 2D. Walk around a vortex and the phase turns through a full $2\\pi$.</p>
<p>In 1985 Wojciech Zurek argued the defect density depends on the cooling rate. Near the transition the system slows down, so it cannot keep up. Order freezes in patches of a size $\\hat\\xi$ set by the quench time $\\tau_Q$. If the correlation length diverges with exponent $\\nu$ and the relaxation time with exponent $z$, then in $d$ dimensions</p>
$$n \\sim \\hat\\xi^{-d} \\propto \\tau_Q^{-d\\nu/(1+z\\nu)}.$$
<p>Faster quenches give smaller patches and more defects. Try it with the <b>quench rate</b> slider. The 2D XY transition is a special case with logarithmic corrections, so the simple power law is only a rough guide here.</p>
<p>Zurek proposed testing this in superfluid helium. It has been tested in liquid crystals (1991), in superfluid helium-3 (1996), and later in Bose-Einstein condensates and trapped-ion crystals. Most tests agree with the predicted trend. In cosmology, cosmic strings from such a transition would leave marks in the microwave background and in gravitational waves. None have been found, and current limits are strong. They remain a hypothesis.</p>`,
    },
    {
      title: 'Is the electroweak transition really like the hat?',
      html: `<p>The picture of a hat flattening into a bowl is the standard first sketch. It is only the leading term. Loop corrections add a term cubic in $|\\phi|$ that can make the transition first order, with bubbles of the new phase forming and growing. That would matter for explaining why the universe holds more matter than antimatter.</p>
<p>Lattice simulations in the 1990s settled the Standard Model case. For a Higgs mass above roughly 70 to 80 GeV there is no sharp transition at all, only a smooth <strong>crossover</strong>. With the measured 125 GeV, the electroweak "transition" around a temperature of about 160 GeV was a crossover. A strong first-order transition would need new physics, which is being searched for.</p>
<p>The quark-hadron transition is also a crossover at zero baryon density, according to lattice QCD. So in our universe, the sharp Kibble picture applies to lab systems more cleanly than to the known cosmic transitions.</p>`,
    },
  ],
  challenges: [
    {
      id: 'break',
      title: 'Break the symmetry',
      prompt: 'Heat the hat above $T_c$ so it becomes a bowl, then cool it back below $T_c$ and let the ball settle on the rim of the vacuum ring.',
      hint: 'Drag <b>T</b> above the $T_c$ readout and wait for the ball to reach the centre. Then drag it below. The ball needs a moment to roll off the peak. Any direction counts.',
      check: (s) => s.cooledThrough === true && (s.T as number) < (s.Tc as number) && s.onRim === true,
    },
    {
      id: 'goldstone',
      title: 'Roll for free',
      prompt: 'With the symmetry broken and the ball resting on the rim, excite the Goldstone mode. The ball must sweep at least 90° around the ring while staying within 20% of the ring radius.',
      hint: 'Settle the ball on the rim first, then press <b>Goldstone kick</b> once. Work well below $T_c$. Near $T_c$ the walls go soft, so the ball drifts outward and friction stops it early.',
      check: (s) => s.goldstoneOK === true,
    },
    {
      id: 'unlikely',
      title: 'Against the odds',
      prompt: 'Set a bias of at least 0.3 either way, then make the ruler buckle toward the side the bias does not favour.',
      hint: 'Slow loading lets the bias win almost every time. Press <b>Release</b>, then <b>Slam load</b> to cross $P_c$ quickly, and repeat. Fast loading hands the choice to noise.',
      check: (s) => s.unlikely === true,
    },
    {
      id: 'vortices',
      title: 'Trap the knots',
      prompt: 'Run a quench of the XY lattice and still have at least 4 vortices when it reaches the cold end, $T \\le 0.1$.',
      hint: 'Raise the <b>quench rate</b> and press <b>Quench</b>. Slow cooling gives the field time to smooth itself out.',
      check: (s) => s.xyUser === true && (s.frozenVortices as number) >= 4,
    },
  ],
  caveats: `<p><strong>Classical ball, quantum field.</strong> The ball on the hat is a single uniform field value moving classically. A real field varies in space and is quantum. The masses quoted are the curvatures of the potential, the tree-level result. Loop corrections shift them.</p>
<p><strong>Temperature as a knob.</strong> The term $cT^2|\\phi|^2$ is only the leading high-temperature correction. It gives a mean-field transition. The true critical behaviour, and for the Standard Model the fact that it is a crossover, needs more than this.</p>
<p><strong>A one-mode ruler.</strong> The ruler keeps only the end slope. Its equilibrium curve is the exact elastica, but the drawn shape is a half sine with the exact deflection and span, and the damping and noise are chosen for display. Real rulers also have built-in curvature, which acts like the bias.</p>
<p><strong>Toy dynamics for the quench.</strong> The XY lattice uses overdamped Langevin dynamics on a 48 × 48 grid with wrap-around edges. Defect counts depend on grid size and fluctuate from run to run. A 2D XY model is not a model of the early universe. It shows the mechanism only.</p>`,
  further: [
    { label: 'Spontaneous symmetry breaking on Wikipedia', url: 'https://en.wikipedia.org/wiki/Spontaneous_symmetry_breaking' },
    { label: 'Nobel Prize in Physics 2008, scientific background', url: 'https://www.nobelprize.org/prizes/physics/2008/summary/' },
    { label: 'T. W. B. Kibble, Topology of cosmic domains and strings, J. Phys. A 9, 1387 (1976)', url: 'https://doi.org/10.1088/0305-4470/9/8/029' },
    { label: 'P. W. Higgs, Broken symmetries and the masses of gauge bosons, Phys. Rev. Lett. 13, 508 (1964)', url: 'https://doi.org/10.1103/PhysRevLett.13.508' },
  ],
};
