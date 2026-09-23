import type { TopicContent } from '../../core/types.ts';

export const content: TopicContent = {
  intuition: `
<p class="lead">Black holes are supposed to be perfectly black. Nothing gets out. In 1974 Stephen Hawking found that this is not quite true. Once quantum physics is included, <strong>every black hole glows faintly, like a warm object</strong>. It has a temperature.</p>
<p>The surprise is which ones glow brightest. <strong>Small black holes are hot. Big ones are cold.</strong> A black hole with the mass of the Sun sits at about sixty billionths of a degree above absolute zero. A black hole with the mass of a large asteroid, squeezed into a ball about the size of a virus, would glow white like the surface of the Sun.</p>
<p>Glowing costs energy, and energy is mass. So a black hole that glows slowly shrinks. As it shrinks it gets hotter, so it glows harder and shrinks faster. The end is a runaway. The last moments come out as a burst of high-energy radiation.</p>
<p>For the black holes we know about, that end is absurdly far away. A solar-mass hole would take about $10^{67}$ years to evaporate. Today it is also colder than the microwave glow left over from the Big Bang. It swallows more of that glow than it gives off, so right now it is growing, not shrinking.</p>
<p>In the scene, pairs of particles pop up just outside the black sphere. One flies off as light, the other falls in. <strong>This is a popular picture, not the real calculation.</strong> It captures the bookkeeping: the escaping light carries energy away, and the hole pays for it. The Deep Dive explains what the mathematics actually says.</p>
<p>Hawking radiation has never been detected from a real black hole. It follows from combining two well-tested theories, and physicists trust it widely. Its deepest consequence, what happens to information that falls in, is still being worked out.</p>`,
  tryFirst: [
    'Drag <b>Mass M</b> left and right. Watch the glow change colour, from invisible, through red, white and blue, to X-rays and gamma rays. The size follows the horizon radius on a log scale.',
    'Watch the corner plot. Temperature falls as $1/M$ and lifetime climbs as $M^3$. Both are straight lines on log-log axes.',
    'Turn on <b>Compare with CMB</b> and set the mass to the Moon. The hole is colder than the sky around it.',
    'Press <b>Evaporate</b>. The time-lapse runs on a log clock, so billions of years and the final second both get screen time.',
  ],
  equation: {
    tex: 'T_H = \\frac{\\hbar\\, c^3}{8\\pi G M\\, k_B}',
    caption: 'The Hawking temperature of a non-rotating, uncharged black hole. The mass sits in the denominator, so lighter holes are hotter.',
    terms: [
      { tex: 'T_H', name: 'Hawking temperature', meaning: 'The temperature of the thermal radiation seen far from the hole. For one solar mass it is about $6.2\\times10^{-8}$ K.', param: 'T' },
      { tex: 'M', name: 'Mass', meaning: 'The mass of the black hole. Set it with the log-scale slider. Halve it and the temperature doubles.', param: 'M' },
      { tex: '\\hbar', name: 'Reduced Planck constant', meaning: 'The quantum ingredient. Set $\\hbar \\to 0$ and the temperature vanishes. Classical black holes are perfectly black.', param: 'pairs' },
      { tex: '8\\pi G M', name: 'Gravity and size', meaning: 'Through $r_s = 2GM/c^2$ this is $4\\pi r_s c^2$. The temperature is $\\hbar c/(4\\pi k_B r_s)$: the emitted wavelength is set by the size of the horizon.', param: 'rs' },
      { tex: 'k_B', name: 'Boltzmann constant', meaning: 'Converts energy to temperature. The typical photon energy is a few $k_B T_H$, which fixes the band where the glow peaks.', param: 'band' },
    ],
  },
  physicsNotes: `
<h3>Four numbers from one mass</h3>
<p>Everything about a Schwarzschild black hole follows from $M$. The horizon radius is $r_s = 2GM/c^2$, about 2.95 km for the Sun. The temperature is the headline formula. Treat the horizon as a perfect blackbody of area $A = 4\\pi r_s^2$ that emits only photons. The Stefan–Boltzmann law $P = \\sigma A T_H^4$ then gives</p>
$$P = \\frac{\\hbar c^6}{15360\\,\\pi G^2 M^2}.$$
<p>The power grows as $1/M^2$. Losing energy means losing mass, $dM/dt = -P/c^2$. Integrate $M^2\\,dM \\propto -dt$ and the time to vanish is</p>
$$t_{\\text{evap}} = \\frac{5120\\,\\pi G^2 M^3}{\\hbar c^4}.$$
<p>For one solar mass this is about $2.1\\times10^{67}$ years. The universe is about $1.4\\times10^{10}$ years old. Finally, the Bekenstein–Hawking entropy is</p>
$$S = \\frac{k_B\\, A\\, c^3}{4 G \\hbar} = \\frac{4\\pi G M^2}{\\hbar c}\\,k_B ,$$
<p>about $1.05\\times10^{77}\\,k_B$ for the Sun. Temperature goes as $M^{-1}$, power as $M^{-2}$, lifetime as $M^{3}$ and entropy as $M^{2}$.</p>
<h3>What the model leaves out</h3>
<p>These formulas ignore <strong>greybody factors</strong>. Radiation leaving the horizon has to climb out through the curved space around it, and some of it is reflected back. That lowers the power, most of all for long wavelengths. They also count only photons. A real hole also emits gravitons and, once it is hot enough, neutrinos, electrons and heavier particles. More channels mean faster evaporation. Page (1976) did the full calculation. The scaling laws survive. The prefactors change, by up to about an order of magnitude.</p>
<h3>Why the time-lapse uses a log clock</h3>
<p>The remaining lifetime falls from $10^{67}$ years to zero, so a steady clock would show nothing happening for almost all of it. Instead the time-lapse removes a fixed fraction of the remaining lifetime every real second. The <b>speed</b> slider sets how many factors of ten per second. The displayed mass follows the closed form $M = (\\tau\\,\\hbar c^4/5120\\pi G^2)^{1/3}$, where $\\tau$ is the remaining lifetime. As a check, each frame also integrates $dM/dt = -P/c^2$ with a fourth-order Runge–Kutta method from the same start. The <b>RK4 check</b> readout shows the largest difference. The check restarts every frame because small errors grow as the hole shrinks. That growth is real: the end of evaporation is very sensitive to the exact mass.</p>`,
  deep: [
    {
      title: 'What really happens: mode mixing, not pairs',
      html: `<p>The picture of pairs splitting at the horizon is Hawking's own popular explanation. It is a heuristic. His 1975 calculation contains no particles being torn apart at a particular place.</p>
<p>What it does contain is this. A quantum field has a vacuum state, the state with no particles. Which state counts as "no particles" depends on how you split the field into positive and negative frequencies. That split depends on your notion of time. Long before the hole forms, the field is in the ordinary vacuum. Waves that later leave from just outside the horizon had to climb out of a deep gravitational well, and they are stretched by an enormous, exponentially growing redshift.</p>
<p>That stretching mixes positive and negative frequency parts. The old vacuum, written in terms of the modes a distant observer uses, is not empty. It is a thermal state. The mixing coefficients $\\beta_\\omega$ satisfy</p>
$$|\\beta_\\omega|^2 = \\frac{1}{e^{2\\pi c\\,\\omega/\\kappa} - 1},\\qquad \\kappa = \\frac{c^4}{4GM},$$
<p>which is a Planck spectrum at $k_B T = \\hbar\\kappa/(2\\pi c)$. Here $\\kappa$ is the surface gravity. This is the headline formula.</p>
<p>Two features of the honest picture are worth keeping. The typical wavelength is larger than the hole itself. The peak of the spectrum sits at about 16 horizon radii. So the radiation is not emitted from a sharp surface. And each outgoing quantum is entangled with a partner mode behind the horizon. That entanglement is the one part of the pair picture that survives, and it is the root of the information paradox.</p>`,
    },
    {
      title: 'Why smaller holes are hotter',
      html: `<p>The emitted wavelength is set by the horizon size. The Wien peak sits at $\\lambda \\approx 16\\, r_s$ for every mass. A smaller horizon means shorter wavelengths, higher photon energies and a higher temperature. So $T_H \\propto 1/r_s \\propto 1/M$.</p>
<p>This gives black holes a <strong>negative heat capacity</strong>. With $E = Mc^2$,</p>
$$C = \\frac{dE}{dT} = -\\frac{8\\pi G M^2 k_B}{\\hbar c} < 0 .$$
<p>Add energy and the hole gets colder. Take energy away and it gets hotter. A black hole in cooler surroundings therefore runs away: it radiates, heats up and radiates faster. One in warmer surroundings absorbs, cools and absorbs more. The balance point with the 2.725 K microwave background is about $4.5\\times10^{22}$ kg, a little lighter than the Moon. Every black hole seen so far is at least a few solar masses, far heavier than that, so all of them are colder than the sky and gaining mass.</p>
<p>Negative heat capacity is also why a black hole cannot sit in stable equilibrium with an infinite heat bath. Gravitating systems such as stars share this odd property.</p>`,
    },
    {
      title: 'History: Bekenstein, Hawking and the entropy of a hole',
      html: `<p>In 1971 Hawking proved the area theorem: in classical general relativity the total area of black hole horizons never decreases. In 1972 Jacob Bekenstein argued that this is more than an analogy. A black hole must carry entropy proportional to its area, or dropping a hot box into it would make the entropy of the universe go down.</p>
<p>Hawking and others objected. Anything with entropy and energy has a temperature, and anything with a temperature glows. A black hole could not glow. Hawking expected to show that there was no such glow. In 1974 he found the opposite. His short paper in <em>Nature</em>, titled "Black hole explosions?", announced the thermal emission. The full calculation followed in 1975.</p>
<p>The temperature fixed Bekenstein's unknown coefficient through $dE = T\\,dS$. The result is $S = k_B A/(4\\ell_P^2)$ with $\\ell_P^2 = G\\hbar/c^3$. For a solar-mass hole that is about $10^{77}\\,k_B$, far more than the entropy of the star that collapsed to make it.</p>`,
    },
    {
      title: 'Evaporation, primordial black holes and the final flash',
      html: `<p>A black hole made by a dying star is at least a few solar masses, so it will not evaporate for more than $10^{67}$ years. Only much lighter holes could be evaporating now. These would be <strong>primordial black holes</strong>, formed from dense regions in the very early universe. They are hypothetical. None has been confirmed.</p>
<p>In the photon-only model shown here, a hole with a lifetime equal to the age of the universe, 13.8 billion years, starts at about $1.7\\times10^{11}$ kg. The full calculation lets the hole emit every particle species it is hot enough to make. That speeds up evaporation, so the mass finishing today is larger, about $5\\times10^{11}$ kg (Carr, Kohri, Sendouda and Yokoyama, 2010). That is roughly the mass of a mountain, packed into a region smaller than a proton.</p>
<p>The end is fast. In this model a hole with one second left weighs about $2\\times10^5$ kg, and its last second releases that mass as energy, about $2\\times10^{22}$ J. In reality most of it would come out as a shower of particles, with a gamma-ray flash. Gamma-ray observatories such as Fermi-LAT and HAWC have searched for such bursts. None has been seen, which sets upper limits on how many primordial black holes exist.</p>`,
    },
    {
      title: 'The information paradox, the Page curve, and analogue horizons',
      html: `<p>In 1976 Hawking argued that evaporation destroys information. The radiation is exactly thermal, whatever fell in. When the hole is gone, only thermal radiation is left, and a pure quantum state has become a mixed one. Ordinary quantum mechanics does not allow that.</p>
<p>In 1993 Don Page asked what the entanglement entropy of the radiation should do if information does get out. Early on it rises, as each outgoing quantum is entangled with a partner inside. But it cannot exceed the entropy of the shrinking hole. So if information is preserved, the radiation entropy must turn over and fall back to zero. That rise-and-fall is the <strong>Page curve</strong>. The turnover is the <strong>Page time</strong>. In the simplest estimate, the radiation has gained as much entropy as the hole has lost when the hole's entropy has halved. Then $M = M_0/\\sqrt2$, which comes at about 65% of the lifetime. Page's more careful 2013 count, which notes that the radiation carries more entropy than the hole loses, puts it near 54%. Either way it is well before the final flash.</p>
<p>In 2019 two groups, Penington and Almheiri, Engelhardt, Marolf and Maxfield, found how to compute a Page curve with semiclassical gravity. After the Page time, a region inside the horizon called an <strong>island</strong> counts as part of the radiation. Later that year, replica wormholes in the gravitational path integral were shown to justify this rule. <em>This is active research.</em> The calculations are cleanest in simplified models, such as two-dimensional gravity or black holes coupled to a bath. How the information gets out in detail, for a real four-dimensional black hole, is not settled.</p>
<p><strong>Analogue experiments.</strong> In 1981 Bill Unruh noticed that sound in a flowing fluid has a horizon wherever the flow outruns the speed of sound. The Hawking argument then predicts thermal phonons. Jeff Steinhauer's group made such a horizon in a Bose–Einstein condensate of rubidium atoms. In 2016 they reported entangled Hawking pairs of phonons. In 2019 they reported a thermal spectrum at the temperature predicted by the flow. These are observations of the analogue effect in a lab fluid. They support the idea that any horizon plus quantum fluctuations gives thermal emission. They do not observe radiation from gravity or from a real black hole.</p>`,
    },
  ],
  challenges: [
    {
      id: 'balance',
      title: 'Balanced against the sky',
      prompt: 'Turn on the CMB comparison and find the mass where the hole is exactly as hot as the microwave background, 2.725 K. Get within 5%.',
      hint: 'Colder than the sky means too heavy. The answer is a bit lighter than the Moon. Watch the <b>T / T_CMB</b> readout.',
      check: (s) => s.cmb === true && s.evaporating === false && s.flashed === false && Math.abs((s.ratioCmb as number) - 1) < 0.05,
    },
    {
      id: 'flash',
      title: 'To the last flash',
      prompt: 'Evaporate a black hole all the way to its final flash.',
      hint: 'Press <b>Evaporate</b>. Raise the <b>time-lapse speed</b> if it feels slow.',
      check: (s) => s.flashed === true,
    },
    {
      id: 'pbh',
      title: 'Dying today',
      prompt: 'Find a primordial black hole mass that would be finishing its evaporation about now, 13.8 billion years after the Big Bang.',
      hint: 'Watch the <b>lifetime</b> readout. The photon-only model says about $1.7\\times10^{11}$ kg. The full count of particle species says about $5\\times10^{11}$ kg. Anything between $1.3\\times10^{11}$ and $6\\times10^{11}$ kg counts.',
      check: (s) => s.touched === true && s.evaporating === false && s.flashed === false && (s.M as number) >= 1.3e11 && (s.M as number) <= 6e11,
    },
    {
      id: 'halve',
      title: 'Half the mass, twice the heat',
      prompt: 'Starting from the pinned reference mass, halve M and confirm that the temperature doubles.',
      hint: 'Halving is a step of $\\log_{10} 2 \\approx 0.30$ on the log slider. Watch <b>M / M_ref</b> and <b>T / T_ref</b>. Press <b>Pin reference</b> to start from any mass.',
      check: (s) => s.evaporating === false && s.flashed === false && Math.abs((s.ratioM as number) - 0.5) < 0.015 && Math.abs((s.ratioT as number) - 2) < 0.06,
    },
  ],
  caveats: `<p>The black hole is a non-rotating, uncharged Schwarzschild hole. The emission model is a perfect blackbody the size of the horizon that emits photons only. Greybody factors, gravitons, neutrinos and heavier particles are left out, so the power and lifetimes are rough. The scaling laws are exact. CMB absorption uses the same simple blackbody model, and the time-lapse ignores it and assumes empty space.</p>
<p>The sphere's size follows the Schwarzschild radius on a log scale, not to scale. The glow brightness is exaggerated so that it can be seen. Above ultraviolet the colours are false colours. The particle pairs are the popular heuristic, not the calculation. Their number is illustrative. In this simple model a solar-mass hole emits only about 40 photons per second.</p>
<p>Hawking radiation has never been observed from any astrophysical black hole. The information paradox is unresolved. The island results are research, not established fact.</p>`,
  further: [
    { label: 'Hawking, Particle creation by black holes (1975)', url: 'https://doi.org/10.1007/BF02345020' },
    { label: 'Almheiri et al., The entropy of Hawking radiation (review, 2020)', url: 'https://arxiv.org/abs/2006.06872' },
    { label: 'Muñoz de Nova et al., Thermal Hawking radiation in an analogue black hole (2019)', url: 'https://doi.org/10.1038/s41586-019-1241-0' },
    { label: 'Hawking radiation on Wikipedia', url: 'https://en.wikipedia.org/wiki/Hawking_radiation' },
  ],
};
