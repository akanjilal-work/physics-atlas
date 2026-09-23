import type { TopicContent } from '../../core/types.ts';

export const content: TopicContent = {
  intuition: `
<p class="lead">Take a star heavier than the Sun and squeeze it into a ball the size of a city. That is a neutron star. It is so dense that a sugar cube of its matter would weigh hundreds of millions of tonnes.</p>
<p>A neutron star is born when the core of a massive star collapses in a supernova. The collapse crushes electrons into protons and turns most of the matter into neutrons. The star shrinks from about the size of the Earth to about 24 km across. Like a skater pulling in her arms, it spins up enormously as it shrinks. Its magnetic field is squeezed too, and becomes trillions of times stronger than the Earth's.</p>
<p>The magnetic axis is usually tilted away from the spin axis. Charged particles stream out along the field near the magnetic poles and send two narrow beams of radio waves into space. As the star turns, the beams sweep around <strong>like a lighthouse</strong>. If one of them crosses the Earth, we see a flash once per turn. That is a <em>pulsar</em>.</p>
<p>In the scene, watch the two coloured beams sweep around the glowing star. The small Earth marker lights up whenever a beam passes over it, and each flash is recorded in the timing trace in the corner. Press <b>Play clicks</b> to hear the pulses at their real rate. A slow pulsar ticks like a clock. The Crab buzzes. A millisecond pulsar sings a note.</p>
<p>The surprise is how steady these clocks are. The best millisecond pulsars keep time about as well as atomic clocks. They slow down so gently that you can read a pulsar's age and magnetic field from just two numbers: how fast it spins, and how quickly that spin is slowing.</p>`,
  tryFirst: [
    'Pick the <b>Crab</b> preset. The beams widen, the light cylinder shrinks, and the clicks become a 30 Hz buzz.',
    'Slide the <b>observer angle</b> away from the magnetic inclination. At some point the beam misses the Earth and the trace goes flat. Most pulsars in the galaxy are invisible to us for this reason.',
    'Set the inclination near 90° and the observer near 90°. Now both beams hit the Earth and you see a main pulse and an interpulse half a turn later.',
    'Turn on the <b>cutaway</b> to look inside: a solid crust, a layer of "nuclear pasta", a neutron superfluid core, and an inner core whose makeup nobody knows.',
  ],
  equation: {
    tex: '\\tau_c = \\frac{P}{2\\dot P},\\quad B \\approx 3.2\\times10^{19}\\sqrt{P\\dot P}\\ \\text{G}',
    caption: 'Two numbers from pulse timing, the period and how fast it grows, give an age and a surface magnetic field.',
    terms: [
      { tex: 'P', name: 'Spin period', meaning: 'Time for one turn, measured from the pulse arrival times. From about 1.4 ms to over 10 s.', param: 'period' },
      { tex: '\\dot P', name: 'Period derivative', meaning: 'How many seconds the period grows per second. Typically $10^{-15}$ for ordinary pulsars and $10^{-20}$ for millisecond pulsars.', param: 'pdot' },
      { tex: '\\tau_c', name: 'Characteristic age', meaning: 'The age if the star was born spinning much faster and has slowed by magnetic braking ever since.', param: 'tau' },
      { tex: 'B', name: 'Surface dipole field', meaning: 'Field strength at the magnetic equator in gauss (Earth has about 0.5 G). Assumes $R = 10$ km and $I = 10^{45}$ g cm².', param: 'bfield' },
    ],
  },
  physicsNotes: `
<h3>Where the formulas come from</h3>
<p>A spinning magnetic dipole loses energy. In vacuum it radiates like a rotating magnet, with power $\\dot E_{\\rm rad} = \\frac{2}{3c^3}\\,m^2\\,\\Omega^4 \\sin^2\\alpha$ in Gaussian units, where $m = B R^3$ is the dipole moment. That energy comes out of rotation, $E = \\tfrac12 I\\Omega^2$. Setting $-I\\Omega\\dot\\Omega$ equal to the radiated power gives</p>
$$P\\dot P = \\frac{8\\pi^2 B^2 R^6 \\sin^2\\alpha}{3 I c^3}.$$
<p>Solve for $B$ with $R = 10$ km, $I = 10^{45}$ g cm² and $\\sin\\alpha = 1$ and the coefficient comes out as $3.2\\times10^{19}$. It is an order-of-magnitude field, not a measurement of any single star.</p>
<p>The same law says $\\dot P \\propto 1/P$. Integrate from a birth period much shorter than today's and the age is $P/(2\\dot P)$.</p>
<h3>The light cylinder</h3>
<p>Field lines that corotate with the star would move faster than light beyond $R_{\\rm LC} = c/(2\\pi f)$. Inside this radius field lines close. Field lines that would reach it are forced open, and particles flow out along them. The beams come from the small polar caps where these open lines are rooted. For the Crab, $R_{\\rm LC}\\approx 1600$ km. For a 716 Hz pulsar it is only about 67 km, barely five stellar radii.</p>
<h3>Compactness</h3>
<p>For $M = 1.4\\,M_\\odot$ and $R = 12$ km, the Schwarzschild radius is 4.1 km, so $1 - 2GM/Rc^2 \\approx 0.66$. Escape speed is about $0.59c$. Gravity bends light so strongly that a distant observer sees about 76% of the surface at once, not 50%. The readouts in the panel show these numbers live.</p>`,
  deep: [
    {
      title: 'Lighthouse geometry and why most pulsars are hidden',
      html: `<p>Let $\\alpha$ be the angle between the spin and magnetic axes, and $\\zeta$ the angle between the spin axis and our line of sight. The beam axis traces a cone around the spin axis. Its closest approach to us is the impact angle $\\beta = \\zeta - \\alpha$. We see pulses only if $|\\beta|$ is smaller than the beam half-width $\\rho$.</p>
<p>When we do, spherical trigonometry gives the pulse width $W$, the rotation angle over which the beam covers us:</p>
$$\\cos\\frac{W}{2} = \\frac{\\cos\\rho - \\cos\\alpha\\cos\\zeta}{\\sin\\alpha\\sin\\zeta}.$$
<p>Radio beams of slow pulsars are narrow, with $\\rho \\approx 5.75^\\circ\\,P^{-1/2}$ as an empirical fit (Rankin 1993). So a typical beam sweeps only a band of the sky. Estimates put the fraction of pulsars beamed toward us at roughly 10 to 20%. Almost all of the galaxy's neutron stars go unseen.</p>`,
    },
    {
      title: 'Inside: crust, pasta, superfluid, and a question mark',
      html: `<p>The outer crust is a lattice of nuclei in a sea of electrons. It grows more neutron-rich with depth. At about $4\\times10^{11}$ g/cm³ neutrons begin to drip out of the nuclei. That marks the inner crust, where a lattice coexists with a neutron superfluid.</p>
<p>Near the base of the crust, nuclei may deform into rods, slabs and tubes. Physicists call these "nuclear pasta" (gnocchi, spaghetti, lasagna). Simulations predict them robustly, but they have not been observed directly.</p>
<p>The outer core is a fluid of neutrons with some protons, electrons and muons, at up to a few times nuclear density ($\\rho_0 \\approx 2.7\\times10^{14}$ g/cm³). The inner core is genuinely unknown. It could hold hyperons, a kaon condensate, or deconfined quark matter. That is why the cutaway marks it "?".</p>
<p>The famous density check: the average density of a 1.4 $M_\\odot$, 12 km star is about $4\\times10^{14}$ g/cm³, so a sugar cube weighs about 400 million tonnes. In the core, several times denser, it reaches about a billion tonnes.</p>`,
    },
    {
      title: 'Mass, radius and the equation of state',
      html: `<p>Given a pressure–density relation (the equation of state, EOS), the Tolman–Oppenheimer–Volkoff equation gives one star for each central density:</p>
$$\\frac{dp}{dr} = -\\frac{G\\,(\\epsilon + p/c^2)\\,(m + 4\\pi r^3 p/c^2)}{r^2\\,(1 - 2Gm/rc^2)}.$$
<p>The inset in the scene solves this in your browser for three published EOS models (SLy, APR4, MPA1), using the piecewise-polytrope fits of Read et al. (2009). Each curve has a maximum mass. A heavier star must collapse to a black hole. Treat the curves as approximate. They are fits to models, not measurements.</p>
<p>Observations now pin the curve down. Pulsar timing weighed PSR J0740+6620 at about 2.08 $M_\\odot$, which rules out soft EOS models. NASA's NICER X-ray telescope fits the light-bent hot spots on rotating pulsars. For PSR J0030+0451 one team found about 12.7 km at 1.34 $M_\\odot$. For J0740+6620 the result is about 12.4 km. Other analyses find somewhat larger radii, and the error bars are about a kilometre.</p>`,
    },
    {
      title: 'History: from a prediction to a Nobel-winning clock',
      html: `<p>In 1934, two years after Chadwick found the neutron, Walter Baade and Fritz Zwicky proposed that supernovae turn ordinary stars into much smaller, denser "neutron stars". For three decades nobody saw one.</p>
<p>In 1967 Jocelyn Bell, a graduate student at Cambridge working with Antony Hewish, noticed "a bit of scruff" on her chart recordings. It was a train of pulses every 1.337 seconds. The regularity was so unnatural that the source was jokingly labelled LGM-1, for "little green men". More sources soon turned up and the lighthouse model of a spinning neutron star won out. The 1974 Nobel Prize went to Hewish and Martin Ryle, not to Bell, a decision many physicists have criticised.</p>
<p>In 1974 Russell Hulse and Joseph Taylor found PSR B1913+16, a pulsar orbiting another neutron star every 7.75 hours. Its orbit shrinks at exactly the rate general relativity predicts for energy lost to <a href="#/t/gravitational-waves">gravitational waves</a>. It was the first evidence that such waves exist, and it earned the 1993 Nobel Prize.</p>
<p>On 17 August 2017, LIGO and Virgo recorded GW170817, the merger of two neutron stars about 40 Mpc away. A gamma-ray burst arrived 1.7 seconds later, and telescopes found a kilonova glowing with freshly made heavy elements. How much the stars deformed each other before merging set an upper limit on neutron star radii of roughly 13.5 km.</p>`,
    },
    {
      title: 'Magnetars and fast radio bursts',
      html: `<p>Magnetars are neutron stars with fields of $10^{14}$ to $10^{15}$ G, a thousand times stronger than ordinary pulsars. They spin slowly, with periods of a few seconds, but spin down fast. Their energy comes from the decay of the field itself. Stresses crack the crust and release X-ray and gamma-ray flares.</p>
<p>Fast radio bursts are millisecond flashes of radio waves, mostly from other galaxies. Their origin was a mystery. On 28 April 2020, the Galactic magnetar SGR 1935+2154 emitted a bright millisecond radio burst, detected by CHIME and STARE2 and catalogued as FRB 200428, at the same time as an X-ray burst. It is the strongest evidence so far that at least some fast radio bursts come from magnetars. It is not proof that all of them do. The Galactic burst was also less energetic than most extragalactic ones.</p>
<p>Try the <b>Magnetar</b> preset: $P = 3.245$ s and $\\dot P = 1.43\\times10^{-11}$ give $B \\approx 2.2\\times10^{14}$ G and a characteristic age of about 3600 years.</p>`,
    },
  ],
  challenges: [
    {
      id: 'dark',
      title: 'Hide the lighthouse',
      prompt: 'Tilt the observer so that neither beam ever crosses the Earth. The timing trace should go flat.',
      hint: 'Pulses need the observer angle within one beam width of the magnetic inclination (or of 180° minus it). Move the observer angle well away from both.',
      check: (s) => s.touched === true && s.pulseVisible === false,
    },
    {
      id: 'msp',
      title: 'Spin it up',
      prompt: 'Bring the spin period below 10 ms, into the millisecond pulsar regime.',
      hint: 'Drag the spin period slider far left, or pick the J1748−2446ad preset. Real millisecond pulsars are spun up by gas from a companion star.',
      check: (s) => (s.P as number) < 0.01,
    },
    {
      id: 'crab-age',
      title: 'Date the Crab',
      prompt: 'Using the sliders, dial in the Crab pulsar ($P \\approx 33.4$ ms, $\\dot P \\approx 4.21\\times10^{-13}$) so its characteristic age reads between 1200 and 1300 years.',
      hint: 'Set P to 33.4 ms first, then move Ṗ until τ is near 1260 yr. The real Crab was born in 1054, so it is about 970 years old. The formula overestimates because it assumes a tiny birth period and pure dipole braking.',
      check: (s) => s.dialed === true && (s.P as number) > 0.033 && (s.P as number) < 0.034 && (s.tauYr as number) > 1200 && (s.tauYr as number) < 1300,
    },
    {
      id: 'cutaway',
      title: 'Look inside',
      prompt: 'Open the cutaway to reveal the layers of the star.',
      hint: 'Tick the cutaway toggle in the panel.',
      check: (s) => s.cutaway === true,
    },
  ],
  caveats: `<p>The scene is not to scale. The star is drawn at a fixed size, the light cylinder distance is compressed logarithmically, and the crust layers are thickened so you can see them. Field lines are a pure vacuum dipole. Real pulsar magnetospheres are filled with plasma, the open field lines sweep back near the light cylinder, and the emission heights and beam shapes are still debated.</p>
<p>Beam widths use an empirical fit for radio pulsars, capped at 60° for fast spinners. Magnetars and many young pulsars emit mainly in X-rays and gamma rays, often from different regions. The spin animation is slowed down for fast pulsars, but the audio clicks play at the true rate. The formulas for $\\tau_c$ and $B$ assume pure magnetic dipole braking with a braking index of 3. Measured braking indices differ, so treat both as estimates. The compactness readouts assume a non-rotating star with $M = 1.4\\,M_\\odot$ and $R = 12$ km.</p>`,
  further: [
    { label: 'Hewish, Bell et al., Observation of a Rapidly Pulsating Radio Source (Nature, 1968)', url: 'https://doi.org/10.1038/217709a0' },
    { label: 'Read et al., piecewise-polytrope neutron star EOS (arXiv:0812.2163)', url: 'https://arxiv.org/abs/0812.2163' },
    { label: 'ATNF Pulsar Catalogue', url: 'https://www.atnf.csiro.au/research/pulsar/psrcat/' },
    { label: 'Neutron star on Wikipedia', url: 'https://en.wikipedia.org/wiki/Neutron_star' },
  ],
};
