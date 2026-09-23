import type { TopicContent } from '../../core/types.ts';

export const content: TopicContent = {
  intuition: `
<p class="lead">Newton said the Sun pulls on the planets. Einstein said nothing pulls at all. Mass bends spacetime, and a planet simply moves as straight as it can through that bent geometry.</p>
<p>The idea starts with a lift. Cut the cable and everyone inside floats. A dropped apple hangs beside your hand. For a while you cannot tell falling from floating in deep space. Einstein called this the <strong>equivalence principle</strong>. If falling feels like no force at all, maybe gravity is not a force. Maybe falling bodies are just coasting along the straightest paths that spacetime allows. Those paths are called <em>geodesics</em>.</p>
<p>Far from a mass the new picture agrees with Newton almost perfectly. Close in, it adds one small extra pull. That extra pull has a visible signature. A Newtonian orbit is a closed ellipse that retraces itself forever. An orbit in curved spacetime does not quite close. Each lap the closest point, the <strong>periapsis</strong>, creeps forward. Over many laps the path draws a rosette.</p>
<p>In the scene the funnel is a picture of curved space around a black hole. The gold particle follows Einstein's equations. The violet ghost follows Newton's, launched the same way. Watch the green spokes. Each one marks a periapsis, and each new spoke sits a little further round than the last. The ghost's spokes would all land on the same line.</p>
<p>The inset plot in the corner is the key to everything else. It shows the effective potential, a landscape the particle rolls through. Newton's version has a wall at small radius that always pushes the particle back out. Einstein's version has a hill instead of a wall. Get over the hill and nothing can stop you falling in.</p>`,
  tryFirst: [
    'Watch the default <b>Rosette</b> for a few laps. Compare the gold orbit with the violet Newtonian ghost, which closes on itself.',
    'Compare the <b>precession</b> readout with the <b>weak-field</b> prediction. Then pick <b>Gentle</b> and see them move closer together.',
    'Pick <b>Zoom-whirl</b>. The particle dives in, whirls around the hole nearly twice, then flies back out. Look at the potential plot: its energy line sits just under the top of the barrier.',
    'Pick <b>Plunge</b>, or drag <b>L</b> below 3.46. The barrier disappears from the plot and the orbit falls through the horizon.',
  ],
  equation: {
    tex: 'V_{\\text{eff}}(r) \\;=\\; -\\frac{M}{r} \\;+\\; \\frac{L^2}{2r^2} \\;-\\; \\frac{M L^2}{r^3}',
    caption: 'The effective potential for orbits around a non-rotating mass, in units where G = c = 1. The first two terms are pure Newton. The third is Einstein\u2019s correction, and it is the whole story.',
    terms: [
      { tex: 'V_{\\text{eff}}(r)', name: 'Effective potential', meaning: 'The landscape the radial motion rolls through. The particle moves where its energy line sits above the curve, and turns around where they cross. Shown in the inset plot.', param: 'plot' },
      { tex: '-\\frac{M}{r}', name: 'Newtonian gravity', meaning: 'The ordinary pull toward the mass. On its own it gives Kepler\u2019s closed ellipses. The violet ghost feels only this term and the next.', param: 'newton' },
      { tex: '\\frac{L^2}{2r^2}', name: 'Centrifugal barrier', meaning: 'Angular momentum $L$ keeps the particle swinging sideways, which holds it off the centre. Set $L$ with its slider.', param: 'L' },
      { tex: '-\\frac{M L^2}{r^3}', name: 'GR correction', meaning: 'A small extra attraction that grows fast at small $r$. It stops orbits closing, which is the precession readout. Near $r \\approx 3M$ to $6M$ it beats the barrier and opens a path to the horizon.', param: 'prec' },
      { tex: 'r', name: 'Radius', meaning: 'The Schwarzschild radial coordinate, in units of $M$. A circle at radius $r$ has circumference exactly $2\\pi r$.', param: 'r' },
    ],
  },
  physicsNotes: `
<h3>Where the equation comes from</h3>
<p>Outside any non-rotating, uncharged mass, spacetime is described by the Schwarzschild metric. In the equatorial plane, with $G = c = 1$:</p>
$$d\\tau^2 = \\left(1-\\frac{2M}{r}\\right) dt^2 - \\frac{dr^2}{1-2M/r} - r^2\\, d\\phi^2$$
<p>The metric does not change with $t$ or with $\\phi$. Each of those symmetries gives a conserved quantity along a geodesic. They are the energy per unit mass $E = (1-2M/r)\\,\\dot t$ and the angular momentum per unit mass $L = r^2 \\dot\\phi$, where dots mean $d/d\\tau$, the rate along the particle\u2019s own clock.</p>
<p>Put both back into the metric and the motion collapses to one radial equation that looks like a Newtonian energy law:</p>
$$\\tfrac12 \\dot r^2 + V_{\\text{eff}}(r) = \\tfrac12\\left(E^2 - 1\\right)$$
<p>Differentiate it and you get the equation the scene integrates:</p>
$$\\ddot r = -\\frac{M}{r^2} + \\frac{L^2}{r^3} - \\frac{3ML^2}{r^4}, \\qquad \\dot\\phi = \\frac{L}{r^2}, \\qquad \\dot t = \\frac{E}{1-2M/r}$$
<h3>How the simulation solves it</h3>
<p>The browser steps these equations with fourth-order Runge-Kutta in proper time. The step is a fixed small fraction of the orbital period, capped by the local dynamical time near the hole. Each frame takes many small steps. The <b>energy E drift</b> readout shows that $E$ stays constant to about one part in a trillion, so the rosette is physics and not numerical error. The Newtonian ghost is stepped in coordinate time $t$ so the two stay in sync as a distant observer would see them.</p>
<p>The <b>precession</b> readout is measured, not computed from a formula. The code finds each periapsis, where $\\dot r$ turns from negative to positive, and compares the angles of successive ones.</p>`,
  deep: [
    {
      title: 'Mercury and Einstein\u2019s 1915 triumph',
      html: `<p>In 1859 Urbain Le Verrier found that Mercury\u2019s perihelion advances a little faster than Newton allows. Most of the total shift, about 532 arcseconds per century, comes from tugs by the other planets. A stubborn residue of about 43 arcseconds per century did not. Astronomers searched for a hidden planet, named it Vulcan, and never found it.</p>
<p>In November 1915 Einstein applied his new field equations to Mercury. He worked by successive approximation, before Karl Schwarzschild found the exact solution a few weeks later. For a nearly Newtonian orbit the extra term gives an advance per orbit of</p>
$$\\Delta\\phi \\approx \\frac{6\\pi G M}{c^2\\, a\\,(1-e^2)}$$
<p>For Mercury, $a = 5.79\\times10^{10}$ m and $e = 0.206$, and $GM_\\odot/c^2 \\approx 1.48$ km. That gives about $5.0\\times10^{-7}$ radians per orbit. Over the 415 orbits Mercury makes in a century, it adds up to 43 arcseconds. Einstein later wrote that he was beside himself with joy for days.</p>
<p>The same formula drives the <b>weak-field</b> readout. Try the <b>Gentle</b> preset. At large radius the measured value lands close to the formula. Close to the hole the formula undershoots badly, because it keeps only the first power of $M/a$.</p>`,
    },
    {
      title: 'Reading the potential: bound orbits, ISCO, zoom-whirl',
      html: `<p>For $L$ above $\\sqrt{12}\\,M$ the GR potential has a valley and a hill. The valley bottom is a <strong>stable circular orbit</strong>. The hill top is an <strong>unstable</strong> one. Solving $V_{\\text{eff}}'(r) = 0$ gives</p>
$$r_\\pm = \\frac{L^2 \\pm L\\sqrt{L^2 - 12M^2}}{2M}, \\qquad L^2_{\\text{circ}} = \\frac{M r^2}{r - 3M}$$
<p>Lower $L$ and the valley and hill slide toward each other. At $L = \\sqrt{12}\\,M$ they merge at $r = 6M$. That is the <strong>innermost stable circular orbit</strong>, the ISCO. Inside it no circular orbit is stable. For black holes this matters a lot. Gas in an accretion disc spirals inward through stable orbits, then falls in fast once it passes the ISCO. The inner edge of the bright disc sits there.</p>
<p>If the energy line sits just below the hilltop, the particle spends a long time near the unstable circular orbit before it turns back. It dives in, whirls around the hole several times, then zooms back out. This is <strong>zoom-whirl</strong>. It is a pure strong-field effect with no Newtonian cousin. Gravitational-wave astronomers expect to see it in highly eccentric black hole binaries.</p>
<p>If the energy line sits above the hilltop, or if $L < \\sqrt{12}\\,M$ so there is no hill at all, nothing turns the particle back. That is the <strong>lost barrier</strong>. The $-ML^2/r^3$ term grows faster than the $L^2/2r^2$ barrier, so at small enough $r$ it always wins. In Newton\u2019s world the barrier always wins, and a particle with any angular momentum can never reach the centre.</p>
<p>The circle at $r = 3M$ is the photon sphere. Light itself can orbit there, unstably. No massive particle can orbit inside it at all.</p>`,
    },
    {
      title: 'Time runs slow near mass',
      html: `<p>A clock held at rest at radius $r$ ticks slower than a distant clock by the factor $\\sqrt{1-2M/r}$. A clock in orbit also moves, so it runs slower still. The scene\u2019s <b>clock rate</b> readout shows</p>
$$\\frac{d\\tau}{dt} = \\frac{1 - 2M/r}{E}$$
<p>For a circular orbit this reduces to $\\sqrt{1 - 3M/r}$. At the ISCO it is about $0.71$. The orbiting clock loses nearly a third of every second compared with a clock far away.</p>
<p>This is not a small effect in daily life. GPS satellite clocks sit higher in Earth\u2019s gravity and gain about 45 microseconds per day from it. Their orbital speed costs them about 7. Without correcting the net 38 microseconds per day, GPS positions would drift by kilometres within a day. In 1959 Pound and Rebka measured the same effect over the 22.5 metre height of a Harvard tower.</p>`,
    },
    {
      title: 'Horizons',
      html: `<p>At $r = 2M$, or $2GM/c^2$ in ordinary units, the factor $1 - 2M/r$ reaches zero. This is the <strong>event horizon</strong>. For a mass like the Sun that radius is about 3 km. For Earth it is about 9 mm.</p>
<p>From far away, a clock lowered toward the horizon appears to tick ever slower and never quite arrives. Our $\\dot t$ grows without limit there. But the infalling particle feels nothing special. Its own proper time to cross is finite, and so is the curvature for a large black hole. The horizon is a one-way surface, not a wall. Inside it, decreasing $r$ is as unavoidable as the passing of time outside.</p>
<p>The scene stops the particle at $r = 2.05M$ and marks it as plunged. Past that point the $t$ coordinate is useless for drawing, even though the particle carries on.</p>`,
    },
    {
      title: 'The rubber sheet, honestly',
      html: `<p>The funnel is the most famous picture in physics, and it is easy to misread. The usual story is a heavy ball on a rubber sheet with marbles rolling around it. That story uses gravity to explain gravity. The marbles only roll inward because Earth\u2019s gravity pulls them down the slope.</p>
<p>What the funnel really shows is <strong>Flamm\u2019s paraboloid</strong>, $z = 2\\sqrt{2M(r-2M)}$. Take one instant of time, take the flat equatorial slice, and ask how much <em>space</em> is stretched. A circle at radius $r$ has circumference $2\\pi r$, but the radial distance between two circles is larger than the difference in their $r$. Embedding that slice in an imaginary 3D space gives the funnel. The height has no physical meaning. Only distances measured along the surface do.</p>
<p>The funnel leaves out the most important part: the curvature of <strong>time</strong>. For slow objects like planets, almost all of what we call gravity comes from clocks running at different rates at different heights, the $1-2M/r$ in front of $dt^2$. Space curvature adds only a correction, which is part of why the precession happens. A ball thrown across a room and Earth circling the Sun are mostly following the warp in time.</p>
<p>So use the funnel as a map of spatial distances, not as a slope the particle slides down. The particle is drawn on it for orientation only.</p>`,
    },
    {
      title: 'Real-world evidence',
      html: `<p><strong>Mercury.</strong> The 43 arcseconds per century are now pinned down precisely by radar ranging to the planet and by the MESSENGER spacecraft. General relativity matches.</p>
<p><strong>S2 and Sagittarius A*.</strong> The star S2 orbits the four-million-solar-mass black hole at the centre of our galaxy every 16 years, passing within about 120 AU. In 2020 the GRAVITY collaboration reported its Schwarzschild precession, about 12 arcminutes per orbit, in the prograde direction. The measured size matched general relativity, with a ratio of $1.10 \\pm 0.19$. Earlier, in 2018, the same team measured the gravitational redshift of S2\u2019s light at closest approach.</p>
<p><strong>LIGO.</strong> On 14 September 2015 LIGO detected gravitational waves from two black holes, of about 36 and 29 solar masses, spiralling together 1.3 billion light years away. The final plunge in that signal is governed by the same strong-field physics as the ISCO and the lost barrier in this scene, though the full problem needs numerical relativity.</p>
<p><strong>Binary pulsars.</strong> The Hulse-Taylor pulsar\u2019s periastron advances 4.2 degrees per year, and its orbit shrinks exactly as gravitational-wave emission predicts.</p>`,
    },
  ],
  challenges: [
    {
      id: 'circle',
      title: 'Hold a circle',
      prompt: 'Keep an orbit with eccentricity below 0.05 for at least 3 full laps.',
      hint: 'Pick any start radius and press <b>Make circular</b>. It sets $L^2 = Mr^2/(r-3M)$. Or nudge $L$ by hand until the eccentricity readout is tiny.',
      check: (s) => s.touched === true && s.status === 'bound' && (s.ecc as number) < 0.05 && (s.orbits as number) >= 3,
    },
    {
      id: 'precess',
      title: 'Big swing',
      prompt: 'Get the measured precession above 30° per orbit without plunging.',
      hint: 'Precession grows as the periapsis gets closer to the hole. Lower $L$ a little from a circular orbit, or try the Rosette preset.',
      check: (s) => s.touched === true && s.status === 'bound' && (s.periCount as number) >= 2 && (s.precDeg as number) > 30,
    },
    {
      id: 'plunge',
      title: 'Point of no return',
      prompt: 'Send the particle through the horizon.',
      hint: 'Drag $L$ below $\\sqrt{12} \\approx 3.46$. The barrier vanishes from the potential plot.',
      check: (s) => s.status === 'plunged',
    },
    {
      id: 'skim',
      title: 'Skim the edge',
      prompt: 'Survive 3 periapsis passages with the closest approach inside $8M$.',
      hint: 'Keep the energy line in the inset plot below the top of the barrier. The Zoom-whirl preset is one answer. Start from $r_0 = 20$ and adjust $L$ between about 3.7 and 3.9 for others.',
      check: (s) => s.touched === true && s.status === 'bound' && (s.rMin as number) < 8 && (s.periCount as number) >= 3,
    },
  ],
  caveats: `<p>This is the Schwarzschild solution only: a single, non-rotating, uncharged mass. Real black holes spin, which drags orbits around and moves the ISCO inward for prograde orbits. That needs the Kerr metric, which is not shown here.</p>
<p>The orbiting body is a test particle. It has no mass of its own, feels no drag, and radiates no gravitational waves, so orbits never decay. Motion is kept to the equatorial plane, which loses nothing for a non-spinning hole because every orbit lies in a plane.</p>
<p>The Newtonian ghost uses the same $r_0$ and the same $L$. That is one fair comparison among several possible ones, and near the hole the two orbits start with different speeds as a local observer would measure them.</p>
<p>The funnel is an embedding of space on one time slice. Its height is not physical, it hides the curvature of time, and the particle does not roll on it. The scene also compresses time: the step size is set per orbit so every orbit takes about the same time on screen, whatever its real period.</p>`,
  further: [
    { label: 'GRAVITY Collaboration (2020), Detection of the Schwarzschild precession in the orbit of S2', url: 'https://doi.org/10.1051/0004-6361/202037813' },
    { label: 'Tests of general relativity on Wikipedia', url: 'https://en.wikipedia.org/wiki/Tests_of_general_relativity' },
    { label: 'LIGO (2016), Observation of gravitational waves from a binary black hole merger', url: 'https://doi.org/10.1103/PhysRevLett.116.061102' },
    { label: 'Schwarzschild geodesics on Wikipedia', url: 'https://en.wikipedia.org/wiki/Schwarzschild_geodesics' },
  ],
};
