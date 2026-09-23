import type { TopicContent } from '../../core/types.ts';

export const content: TopicContent = {
  intuition: `
<p class="lead">Every distant galaxy is moving away from us, and the farther it is, the faster it goes. That sounds like we sit at the centre of an explosion. We do not. Space itself is stretching, and every galaxy sees the same thing.</p>
<p>Think of raisin bread rising in an oven. Each raisin stays in its place in the dough. Yet as the dough swells, every raisin moves away from every other one. A raisin twice as far away moves away twice as fast, because there is twice as much dough between them to stretch. Pick any raisin and it will see the others rushing off in the same pattern. No raisin is the centre.</p>
<p>The universe works like this, with one big difference. The bread has a crust and an outside. As far as we know the universe has neither. It is not expanding <em>into</em> anything. The distances between things are simply growing.</p>
<p>Light feels the stretch too. A wave of light crossing the growing gaps gets pulled longer as it goes. Blue light becomes red, then infrared. That is the <strong>cosmological redshift</strong>. The redshift of a galaxy tells you how much the universe grew while its light was on the way.</p>
<p>In the scene each glowing dot is a galaxy, fixed in the dough. The lines run from your <strong>home</strong> galaxy to the others. The short arrows show how fast each one recedes. The pale sphere is the <strong>Hubble radius</strong>. Galaxies outside it are moving away faster than light, and relativity allows that. Watch the wiggly photon crawl toward home and change colour as it stretches.</p>`,
  tryFirst: [
    'Let the opening run. A photon leaves a far galaxy when the universe was a quarter of today\u2019s size. Watch it redden as it travels, and read its redshift when it reaches home.',
    'Press <b>Make selected the home</b> after clicking a different galaxy. The whole pattern of recession looks the same from there. There is no centre.',
    'Drag the <b>time</b> slider back toward the start. Every galaxy was once outside the Hubble radius, receding faster than light, and the far ones were beyond the particle horizon.',
    'Pick <b>Closed</b> and play the whole history. The expansion stops, reverses, and ends in a crunch. Compare the curves in the corner plot.',
  ],
  equation: {
    tex: 'H^2 = \\left(\\frac{\\dot a}{a}\\right)^2 = \\frac{8\\pi G}{3}\\rho - \\frac{kc^2}{a^2} + \\frac{\\Lambda c^2}{3}',
    caption: 'The first Friedmann equation. It links how fast the universe expands to what it contains. Divide by $H_0^2$ and it becomes $H^2 = H_0^2(\\Omega_r a^{-4} + \\Omega_m a^{-3} + \\Omega_k a^{-2} + \\Omega_\\Lambda)$, the form the simulation solves.',
    terms: [
      { tex: 'H = \\frac{\\dot a}{a}', name: 'Hubble rate', meaning: 'The fractional growth rate of all distances. Today it is $H_0$, in km/s per megaparsec. A galaxy at proper distance $d$ recedes at $v = Hd$.', param: 'H' },
      { tex: 'a', name: 'Scale factor', meaning: 'The size of the universe relative to today. Every distance between galaxies is proportional to $a$. Light emitted at $a$ arrives today with $1 + z = 1/a$. Move it with the time slider.', param: 'time' },
      { tex: '\\frac{8\\pi G}{3}\\rho', name: 'Matter and radiation', meaning: 'Ordinary and dark matter thin out as $a^{-3}$, radiation as $a^{-4}$. Their gravity slows the expansion. Set the matter share $\\Omega_m$ with its slider.', param: 'Om' },
      { tex: '-\\frac{kc^2}{a^2}', name: 'Spatial curvature', meaning: 'Whatever is left over after matter and $\\Lambda$ fixes the shape of space: $\\Omega_k = 1 - \\Omega_m - \\Omega_\\Lambda - \\Omega_r$. Negative means closed, like a sphere. Measurements say it is very close to zero.', param: 'Ok' },
      { tex: '\\frac{\\Lambda c^2}{3}', name: 'Cosmological constant', meaning: 'A constant energy of empty space. It does not thin out, so it wins at late times and makes the expansion speed up. Set $\\Omega_\\Lambda$ with its slider.', param: 'Ol' },
    ],
  },
  physicsNotes: `
<h3>Where the equation comes from</h3>
<p>Assume the universe is the same everywhere and in every direction, on large scales. Then its geometry is fixed by one function of time, the scale factor $a(t)$, plus a curvature sign $k$. This is the Friedmann-Lema\u00eetre-Robertson-Walker (FLRW) metric:</p>
$$ds^2 = -c^2dt^2 + a(t)^2\\left[\\frac{dr^2}{1-kr^2} + r^2 d\\Omega^2\\right]$$
<p>Put it into Einstein\u2019s field equations with a smooth fluid of density $\\rho$ and pressure $p$. Two equations come out. The first is the headline equation. The second gives the acceleration:</p>
$$\\frac{\\ddot a}{a} = -\\frac{4\\pi G}{3}\\left(\\rho + \\frac{3p}{c^2}\\right) + \\frac{\\Lambda c^2}{3}$$
<p>Matter has $p \\approx 0$. Radiation has $p = \\rho c^2/3$, so it decelerates twice as hard per unit density. $\\Lambda$ pushes outward. The <b>deceleration parameter</b> $q = -\\ddot a a/\\dot a^2$ packages this. For matter plus $\\Lambda$ today it is $q_0 = \\Omega_m/2 - \\Omega_\\Lambda$, about $-0.53$ for Planck values. Negative means speeding up.</p>
<h3>How the simulation solves it</h3>
<p>The code steps the second equation, $\\ddot a = H_0^2(-\\Omega_r a^{-3} - \\tfrac12\\Omega_m a^{-2} + \\Omega_\\Lambda a)$, with fourth-order Runge-Kutta. It starts at $a = 10^{-4}$, where the age is known from a quadrature. The step is a small fixed fraction of the local expansion time, so the whole history takes a few thousand steps. Stepping $\\ddot a$ rather than $\\dot a = aH$ lets a closed universe turn around smoothly.</p>
<p>The first Friedmann equation is then a free accuracy check. The <b>Friedmann check</b> readout shows the largest relative mismatch between $(\\dot a/a)^2$ and $H_0^2 E(a)^2$ along the whole solution. It stays near $10^{-7}$.</p>
<p>Alongside $a$ the code integrates the conformal distance $\\eta = \\int c\\,dt/a$. That is how far light can travel in comoving terms. Light seen at time $t$ from a galaxy at comoving distance $\\chi$ left it when $\\eta$ was $\\eta(t) - \\chi$. The ratio of scale factors at the two times gives the redshift. If $\\chi$ exceeds $\\eta(t)$, no light from that galaxy has reached home yet. It is beyond the <b>particle horizon</b>.</p>
<h3>Distances</h3>
<p>There is no single distance in an expanding universe. The comoving distance is $D_C = c\\int_0^z dz'/H(z')$. With curvature, the transverse distance $D_M$ replaces $\\chi$ by $R\\sin(\\chi/R)$ or $R\\sinh(\\chi/R)$. A candle looks as faint as if it were at the luminosity distance $D_L = (1+z)D_M$. A ruler looks as small as if it were at the angular diameter distance $D_A = D_M/(1+z)$. For Planck values at $z = 1$: $D_C \\approx 3.40$ Gpc, $D_L \\approx 6.80$ Gpc, $D_A \\approx 1.70$ Gpc.</p>`,
  deep: [
    {
      title: 'Slipher, Lema\u00eetre and Hubble',
      html: `<p>In 1912 Vesto Slipher at Lowell Observatory measured the Doppler shift of the Andromeda nebula. It was approaching. Over the next few years he measured more spiral nebulae, and most of them were receding, some at hundreds of kilometres per second. Nobody yet knew how far away they were.</p>
<p>In 1922 Alexander Friedmann showed that Einstein\u2019s equations allow a universe whose size changes with time. In 1927 Georges Lema\u00eetre derived the same kind of solution independently. He also linked it to the data. Using Slipher\u2019s velocities and distances from Edwin Hubble, he showed that expansion predicts speed proportional to distance, and he estimated the rate. His paper appeared in French in a Belgian journal and was little read.</p>
<p>In 1929 Hubble published his own velocity-distance plot with a slope of about 500 km/s per megaparsec. His distances were far too small, for reasons found only in the 1950s, so the slope was about seven times today\u2019s value. The linear law itself held up. In 2018 the International Astronomical Union recommended calling it the Hubble-Lema\u00eetre law.</p>
<p>Einstein had added $\\Lambda$ in 1917 to make a static universe. That model is unstable, and once expansion was established he dropped the term. It came back in 1998, for a different reason.</p>`,
    },
    {
      title: 'No centre, no explosion, and redshift is not Doppler',
      html: `<p>The law $v = Hd$ is the only velocity pattern that looks the same from every galaxy. Shift your origin to another galaxy and the velocities you see are still proportional to distance, with the same $H$. Try it in the scene with <b>Make selected the home</b>. An explosion would have a centre and an edge. The Friedmann models have neither.</p>
<p>The velocity $v = Hd = \\dot a\\chi$ is the rate at which the proper distance grows. It is not a speed through space, and no galaxy passes anything on the way. That is why it can exceed $c$ without breaking relativity. Special relativity limits speeds measured locally, against things right next to you. It says nothing about how the distance between far-apart objects changes in curved spacetime.</p>
<p>So the cosmological redshift is not the usual Doppler shift either. The formula $1 + z = a_{\\text{obs}}/a_{\\text{emit}}$ depends only on how much the universe grew during the trip. It does not depend on the galaxy\u2019s speed when the light left or when it arrived. A galaxy can have $z = 3$ while its recession speed today is well above $c$. Plugging $z$ into the special relativity Doppler formula gives a speed below $c$ that is not the recession speed at any time. Tamara Davis and Charles Lineweaver made this point carefully in 2004. For small $z$ all these pictures agree and $v \\approx cz$.</p>
<p>Photons can even be emitted toward us and still move away at first. Emit one from beyond the Hubble radius and watch it. It gains ground only as the Hubble radius grows past it.</p>`,
    },
    {
      title: 'The accelerating universe',
      html: `<p>Matter slows the expansion. For most of the 20th century the question was how much. Two teams used type Ia supernovae, exploding white dwarfs that are nearly standard candles, to measure distances to redshift near 1. In 1998 the High-Z Supernova Search Team (Adam Riess and Brian Schmidt) published that distant supernovae were fainter than expected in a decelerating universe. The Supernova Cosmology Project (Saul Perlmutter) reached the same conclusion in a paper published in 1999. The expansion is speeding up. The three leaders shared the 2011 Nobel Prize in Physics.</p>
<p>In a flat universe with matter and $\\Lambda$, acceleration begins when $\\Omega_m a^{-3}/2 = \\Omega_\\Lambda$, so</p>
$$1 + z_{\\text{acc}} = \\left(\\frac{2\\Omega_\\Lambda}{\\Omega_m}\\right)^{1/3}$$
<p>For Planck values this is $z \\approx 0.63$, about 6 billion years ago. Dark energy took over as the largest share of the density later, at $z \\approx 0.30$. Find the switch yourself in the scene: stop the clock where $q$ crosses zero.</p>
<p>What dark energy is remains open. A cosmological constant fits the data well. In 2024 and 2025 the DESI survey reported hints that dark energy may change with time. Those hints are not yet decisive.</p>`,
    },
    {
      title: 'The cosmic microwave background',
      html: `<p>Run the clock back and the universe gets denser and hotter. Early on it was an opaque plasma. At about $z \\approx 1100$, some 380,000 years after the Big Bang, it cooled enough for electrons and protons to form neutral hydrogen. Light then travelled freely. That light is still arriving. It has been stretched by a factor of about 1100, from a glow near 3000 K to microwaves at 2.7255 K.</p>
<p>Arno Penzias and Robert Wilson found it by accident in 1965 as an unexplained hiss in a horn antenna. They shared the 1978 Nobel Prize. The COBE satellite showed in the early 1990s that its spectrum is an almost perfect blackbody and detected its tiny temperature ripples, about one part in 100,000. WMAP and Planck mapped those ripples in detail. Their pattern pins down $\\Omega_m$, $\\Omega_\\Lambda$, the curvature and $H_0$ within the standard model. Combined with galaxy surveys, Planck finds $\\Omega_k = 0.0007 \\pm 0.0019$. Space looks flat.</p>
<p>The time slider starts at $a = 0.001$, just after this moment. No galaxies existed yet. The dots mark matter that will later gather into them.</p>`,
    },
    {
      title: 'The Hubble tension',
      html: `<p>There are two main ways to get $H_0$. One reads it off the early universe. Fit the standard model to the CMB and run it forward. Planck 2018 gives $H_0 = 67.4 \\pm 0.5$ km/s/Mpc. The other measures it locally with a distance ladder: parallax calibrates Cepheid stars, Cepheids calibrate type Ia supernovae in nearby galaxies, and supernovae reach the smooth Hubble flow. The SH0ES team reported $73.0 \\pm 1.0$ km/s/Mpc in 2022.</p>
<p>The gap is about five standard deviations. Observations with the James Webb Space Telescope have checked the Cepheids and have not found an error that removes it. Some other local methods, such as the tip of the red giant branch, have given values near 70, between the two. It is not settled whether the tension comes from unnoticed measurement errors or from physics missing in the standard model.</p>
<p>Slide $H_0$ between 67 and 73 and watch the age. A faster expansion today means a younger universe for the same $\\Omega$ values, by about 8 percent across that range.</p>`,
    },
  ],
  challenges: [
    {
      id: 'age',
      title: 'How old is it?',
      prompt: 'Using the sliders, build a universe whose age today is within 2% of 13.8 billion years.',
      hint: 'Start from Einstein-de Sitter. Its age $2/(3H_0)$ is under 10 Gyr. In the 1990s the oldest stars seemed older than that, which was a real crisis. Adding $\\Omega_\\Lambda$ fixes it. Planck values are $H_0 = 67.4$, $\\Omega_m = 0.315$, $\\Omega_\\Lambda = 0.685$.',
      check: (s) => s.cosmoTouched === true && s.fate !== 'nobang' && Math.abs((s.age0 as number) - 13.8) <= 0.276,
    },
    {
      id: 'crunch',
      title: 'Big Crunch',
      prompt: 'Build a universe that stops expanding and falls back.',
      hint: 'Raise $\\Omega_m$ well above 1 with little or no $\\Omega_\\Lambda$, or make $\\Omega_\\Lambda$ negative. The fate readout says when it will recollapse.',
      check: (s) => s.fate === 'crunch',
    },
    {
      id: 'ftl',
      title: 'Faster than light',
      prompt: 'Select a galaxy that is receding faster than light today.',
      hint: 'Press <b>Now</b>, then click a galaxy outside the pale Hubble sphere. For Planck values that means a comoving distance beyond about 4.4 Gpc, or a redshift above about 1.5.',
      check: (s) => s.selTouched === true && (s.selV as number) > 1 && Math.abs((s.a as number) - 1) < 0.01 && s.fate !== 'nobang',
    },
    {
      id: 'q',
      title: 'The switch',
      prompt: 'Pause at the moment the expansion stopped slowing down and started speeding up, where $q$ crosses zero.',
      hint: 'Watch the $q$ readout while you drag the time slider. For Planck values it happens near $a \\approx 0.61$, or $z \\approx 0.63$, about 7.7 Gyr after the Big Bang.',
      check: (s) => s.timeTouched === true && s.playing === false && Math.abs(s.q as number) < 0.02 && (s.a as number) < 1,
    },
  ],
  caveats: `<p>The model is a perfectly smooth universe. Real galaxies cluster, and gravity holds galaxies, groups and clusters together, so they do not expand. The dots are stand-ins for large regions. Their spacing, 1.4 Gpc, is far wider than real galaxy spacing so the Hubble radius fits on screen.</p>
<p>The lattice is drawn in flat space for every model. Distances and redshifts use the true curvature, but the picture of a curved universe is only schematic. The balloon view is an analogy for a closed universe, with one dimension removed. Only the rubber surface stands for space.</p>
<p>The view zooms out as $a$ grows, so that both the early and the late universe fit on screen. The scale bar shows true proper lengths. Photon wiggles are drawn huge. Their stretch factor is real, but their size is not.</p>
<p>Dark energy is taken to be a cosmological constant. Neutrinos are treated as massless radiation, and radiation is fixed at $\\Omega_r h^2 = 4.18\\times10^{-5}$. The universe is taken to start at $a = 0$ with no inflation or earlier physics.</p>`,
  further: [
    { label: 'Davis & Lineweaver (2004), Expanding confusion: common misconceptions of cosmological horizons and the superluminal expansion of the universe', url: 'https://arxiv.org/abs/astro-ph/0310808' },
    { label: 'Planck Collaboration (2020), Planck 2018 results VI. Cosmological parameters', url: 'https://doi.org/10.1051/0004-6361/201833910' },
    { label: 'Wright (2006), A cosmology calculator for the World Wide Web', url: 'https://arxiv.org/abs/astro-ph/0609593' },
    { label: 'Friedmann equations on Wikipedia', url: 'https://en.wikipedia.org/wiki/Friedmann_equations' },
  ],
};
