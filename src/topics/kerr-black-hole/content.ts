import type { TopicContent } from '../../core/types.ts';

export const content: TopicContent = {
  intuition: `
<p class="lead">Almost everything in the universe spins, and black holes keep the spin of whatever made them. A spinning black hole does something no star or planet does in a way you could notice. It twists space around itself, and it drags everything nearby along for the ride.</p>
<p>Picture a ball turning slowly in a pot of honey. The honey near the ball gets pulled round with it. The honey far away barely moves. Space near a spinning black hole behaves a bit like that honey. Nothing is touching anything, and yet a nearby object cannot stay still. It gets swept round in the direction of the spin.</p>
<p>Close enough in, the sweep becomes impossible to resist. Inside a pumpkin-shaped region called the <strong>ergosphere</strong>, no rocket of any power can hold a position fixed relative to the distant stars. You can still escape from it, because it lies outside the horizon. You just cannot avoid turning with the hole while you are there.</p>
<p>In the scene the black sphere is the horizon, the point of no return. The pale shell around it is the ergosphere, fat at the equator and pinched at the poles. The dust shows how fast space is being dragged at each place. Look at the streaks. They are long and bright near the hole and almost still far out. The gold particle was dropped with <strong>zero</strong> angular momentum. In Newton's world it would fall straight in. Here it spirals, and it spirals the same way the hole turns.</p>
<p>Spin also moves the last stable orbit. Orbit with the spin and you can circle much closer before you must fall. Orbit against it and you must stay further out. The two rings in the scene and the plot in the corner show how far apart they get.</p>`,
  tryFirst: [
    'Watch the gold particle. It starts with no sideways motion, yet it curls round in the spin direction as it falls. Press <b>Reset</b> to drop it again.',
    'Drag <b>spin a</b> from 0 upward. The ergosphere swells out from the horizon, and the cyan prograde ISCO ring slides in toward the hole while the violet retrograde ring slides out.',
    'Give the particle negative <b>angular momentum</b>. It starts to orbit against the spin, then gets turned round before it reaches the horizon.',
    'Press <b>Penrose demo</b>. A particle splits inside the ergosphere, one piece falls in with negative energy, and the other leaves with more energy than the whole particle brought in.',
  ],
  equation: {
    tex: '\\Omega_{\\text{drag}} \\;=\\; \\frac{2 M a\\, r}{\\left(r^2 + a^2\\right)^2 - a^2\\,\\Delta\\,\\sin^2\\theta}',
    caption: 'The angular velocity at which space itself is dragged around a spinning black hole, seen from far away. Units G = c = 1. It is the rate at which an observer with zero angular momentum turns.',
    terms: [
      { tex: '\\Omega_{\\text{drag}}', name: 'Frame-dragging rate', meaning: 'How fast a zero angular momentum observer circles the hole, as seen from far away. The readout shows it at the particle. The dust streaks show it everywhere.', param: 'omega' },
      { tex: 'a', name: 'Spin parameter', meaning: 'Angular momentum per unit mass, $a = J/M$. It runs from $0$ (Schwarzschild) to $M$ (extremal). Set it with the spin slider.', param: 'a' },
      { tex: 'r', name: 'Boyer–Lindquist radius', meaning: 'The radial coordinate. Far away $\\Omega_{\\text{drag}} \\to 2J/r^3$, the Lense–Thirring falloff. Close in it grows toward the horizon rate $\\Omega_H = a/(2Mr_+)$.', param: 'r' },
      { tex: '\\Delta', name: 'Horizon function', meaning: '$\\Delta = r^2 - 2Mr + a^2$. It is zero at the two horizons $r_\\pm = M \\pm \\sqrt{M^2 - a^2}$, which are shown in the readouts.', param: 'rplus' },
      { tex: '\\sin^2\\theta', name: 'Latitude factor', meaning: 'Dragging is strongest in the equatorial plane and weaker toward the spin axis. The dust spreads above and below the plane, so you can see the slower turning near the poles.', param: 'dust' },
    ],
  },
  physicsNotes: `
<h3>The metric</h3>
<p>Roy Kerr found the exact spacetime of a spinning mass in 1963. In Boyer–Lindquist coordinates, with $G = c = 1$,</p>
$$ds^2 = -\\left(1 - \\frac{2Mr}{\\Sigma}\\right)dt^2 - \\frac{4Mar\\sin^2\\theta}{\\Sigma}\\,dt\\,d\\phi + \\frac{\\Sigma}{\\Delta}dr^2 + \\Sigma\\,d\\theta^2 + \\frac{A\\sin^2\\theta}{\\Sigma}\\,d\\phi^2$$
<p>where $\\Sigma = r^2 + a^2\\cos^2\\theta$, $\\Delta = r^2 - 2Mr + a^2$ and $A = (r^2+a^2)^2 - a^2\\Delta\\sin^2\\theta$. The cross term $dt\\,d\\phi$ is the new ingredient. It ties time to rotation. The headline rate is $\\Omega_{\\text{drag}} = -g_{t\\phi}/g_{\\phi\\phi}$.</p>
<h3>Special surfaces</h3>
<p>The horizons sit where $\\Delta = 0$, at $r_\\pm = M \\pm \\sqrt{M^2 - a^2}$. For $a = 0$ that gives $r_+ = 2M$, the Schwarzschild value. The ergosphere's outer edge is where $g_{tt} = 0$, at $r_E(\\theta) = M + \\sqrt{M^2 - a^2\\cos^2\\theta}$. It touches the horizon at the poles and always reaches $2M$ at the equator, whatever the spin.</p>
<h3>Orbits in the equatorial plane</h3>
<p>A free particle has a conserved energy $E$ and angular momentum $L$ per unit mass. With $P = E(r^2+a^2) - aL$ the motion reduces to</p>
$$r^4\\dot r^2 = P^2 - \\Delta\\left[r^2 + (L - aE)^2\\right], \\qquad r^2\\dot\\phi = -(aE - L) + \\frac{aP}{\\Delta}$$
<p>Dots mean $d/d\\tau$, the particle's own clock. Set $L = 0$ and $\\dot\\phi$ is still positive. Divide by $\\dot t$ and you find $d\\phi/dt = \\Omega_{\\text{drag}}$ exactly. That is the swirl you see.</p>
<p>The scene steps the radial equation in second-order form with fourth-order Runge–Kutta in proper time. The step shrinks near the hole. The <b>constraint drift</b> readout checks the first equation along the path. It stays tiny, so the spiral is physics and not numerical error. The run stops just outside $r_+$, because the Boyer–Lindquist $\\phi$ and $t$ blow up at the horizon even though nothing physical does.</p>
<h3>The ISCO</h3>
<p>Bardeen, Press and Teukolsky gave the innermost stable circular orbit in closed form in 1972:</p>
$$r_{\\text{ISCO}} = M\\left(3 + Z_2 \\mp \\sqrt{(3 - Z_1)(3 + Z_1 + 2Z_2)}\\right)$$
<p>with $Z_1 = 1 + (1 - \\chi^2)^{1/3}\\left[(1+\\chi)^{1/3} + (1-\\chi)^{1/3}\\right]$, $Z_2 = \\sqrt{3\\chi^2 + Z_1^2}$ and $\\chi = a/M$. The upper sign is for prograde orbits. It runs from $6M$ at $a = 0$ down to $M$ at $a = M$ for prograde orbits and up to $9M$ for retrograde ones. Gas that reaches the ISCO has radiated $1 - E_{\\text{ISCO}}$ of its rest mass energy. That is the <b>efficiency</b> readout.</p>`,
  deep: [
    {
      title: 'Kerr 1963 and the no-hair theorem',
      html: `<p>Karl Schwarzschild found the non-rotating solution in 1916. The rotating one took 47 more years. Roy Kerr, a New Zealand mathematician, published it in a one-page letter in <em>Physical Review Letters</em> in 1963. Robert Boyer and Richard Lindquist introduced the coordinates used here in 1967.</p>
<p>Soon after, a series of results by Werner Israel, Brandon Carter, Stephen Hawking and David Robinson showed something remarkable. A stationary black hole in general relativity, in vacuum, is fixed completely by its <strong>mass, spin and electric charge</strong>. Everything else about what fell in is lost from the outside. John Wheeler summed this up as "black holes have no hair". Add charge and you get the Kerr–Newman solution. Real astrophysical black holes are expected to carry almost no net charge, because nearby plasma would neutralise it quickly. So Kerr, with just $M$ and $a$, is thought to describe every quiet black hole in the universe.</p>
<p>The theorem is a statement about the classical theory. Whether quantum effects leave any subtle "hair" is part of the unresolved black hole information problem.</p>`,
    },
    {
      title: 'Frame dragging near Earth: Lense–Thirring and Gravity Probe B',
      html: `<p>Frame dragging is not special to black holes. Josef Lense and Hans Thirring showed in 1918 that any spinning mass drags space. Far from the body the effect falls off as $\\Omega_{\\text{drag}} \\approx 2J/r^3$ (restoring units, $2GJ/(c^2 r^3)$). That is the same limit the headline equation takes at large $r$, and one of this page's tests checks it.</p>
<p>For Earth the effect is tiny. Gravity Probe B carried four near-perfect quartz gyroscopes in a polar orbit from 2004. It watched how their spin axes drifted relative to a guide star. The final results, published in 2011, gave a frame-dragging drift of $-37.2 \\pm 7.2$ milliarcseconds per year. General relativity predicts $-39.2$. The larger geodetic drift, caused by the curvature of space, came out at $-6601.8 \\pm 18.3$ against a prediction of $-6606.1$ milliarcseconds per year.</p>
<p>Laser ranging to the LAGEOS satellites has also measured Earth's frame dragging through the slow drift of their orbits. Around a black hole the same effect is strong enough to force everything in the ergosphere to turn.</p>`,
    },
    {
      title: 'Spin, the ISCO and how bright a black hole can shine',
      html: `<p>Gas in a thin accretion disc spirals slowly inward on nearly circular orbits, radiating as it goes. At the ISCO it runs out of stable orbits and falls in quickly, taking whatever energy it still has. So the fraction of rest mass energy radiated is $\\eta = 1 - E_{\\text{ISCO}}$.</p>
<p>For a non-spinning hole $E_{\\text{ISCO}} = \\sqrt{8/9}$ and $\\eta \\approx 5.7\\%$. For a prograde disc around a maximally spinning hole the ISCO moves down to $r = M$, $E_{\\text{ISCO}} = 1/\\sqrt3$ and $\\eta \\approx 42\\%$. Nuclear fusion in stars converts less than 1% of rest mass to energy. This is why accreting black holes power the brightest steady sources in the universe.</p>
<p>Kip Thorne showed in 1974 that accretion alone cannot quite spin a hole up to $a = M$. The hole preferentially swallows disc photons that carry angular momentum against the spin. The limit is about $a \\approx 0.998M$. At that spin the ISCO sits near $1.24M$ and the efficiency is about 32%, not 42%. Magnetic fields and thick discs can change these numbers, so treat them as the thin-disc benchmark.</p>`,
    },
    {
      title: 'Measured spins of real black holes',
      html: `<p>Spin is hard to measure, and quoted values carry real systematic uncertainty. Three methods dominate.</p>
<p><strong>Disc continuum fitting.</strong> The hotter the inner edge of the disc, the closer the ISCO, the higher the spin. It needs the hole's mass, distance and disc inclination. For Cygnus X-1, several continuum-fitting studies find $a/M > 0.95$. For GRS 1915+105, McClintock and colleagues found $a/M > 0.98$ in 2006. A study the same year by Middleton and colleagues found about $0.7$ for the same source, using different data and assumptions.</p>
<p><strong>X-ray reflection.</strong> The shape of the broadened iron line near 6.4 keV reveals how deep the disc reaches. Many active galactic nuclei come out with high spins by this method. It depends on the assumed disc geometry, and results can conflict with continuum fitting.</p>
<p><strong>Gravitational waves.</strong> LIGO and Virgo read spins from the waveform of merging holes. The remnant of GW150914 had a spin of about $0.67$. That value is set mainly by the orbital angular momentum of the merger. Spins of the black holes before merger are usually poorly constrained and often consistent with small values.</p>
<p>The Event Horizon Telescope images of M87* are consistent with a spinning hole, but do not pin the spin down tightly. The honest summary is this. Many black holes appear to spin fast, and very few spins are known to better than a few tens of percent.</p>`,
    },
    {
      title: 'Penrose process and Blandford–Znajek jets',
      html: `<p>Inside the ergosphere, an orbit can have <strong>negative energy</strong> as measured from far away. Roger Penrose pointed out in 1969 that this lets you mine a black hole. Send a particle in. Let it split inside the ergosphere so that one piece lands on a negative-energy orbit and falls through the horizon. Energy is conserved, so the other piece leaves with more energy than the original brought in. The hole pays the difference out of its rotational energy, and its spin drops.</p>
<p>The best possible case is a split right at the horizon into two light rays. It gives a fractional gain of $\\tfrac12\\left(\\sqrt{2M/r_+} - 1\\right)$. For an extremal hole, $r_+ = M$ and the gain is $(\\sqrt2 - 1)/2 \\approx 20.7\\%$. The demo in this scene splits a particle into two massive fragments a little further out. It gets less, about 13% at the Thorne limit, which the readout compares with the bound.</p>
<p>The Penrose process is too delicate to matter much in nature. The fragments would need relative speeds above half the speed of light. A magnetic version is thought to matter a great deal. In 1977 Roger Blandford and Roman Znajek showed that magnetic field lines threading a spinning horizon get wound up by frame dragging. They can then carry the hole's rotational energy away as a jet. Many astrophysicists think this powers the jets of quasars and of M87. That is well motivated by simulations, but still an active research question.</p>`,
    },
  ],
  challenges: [
    {
      id: 'isco-inside',
      title: 'Hug the hole',
      prompt: 'Spin the hole until the prograde ISCO lies inside $2.5M$.',
      hint: 'Raise <b>spin a</b> to about 0.9 or more. Watch the cyan curve in the inset plot dive toward $M$.',
      check: (s) => (s.iscoPro as number) < 2.5,
    },
    {
      id: 'co-rotate',
      title: 'Dragged along',
      prompt: 'Drop a particle with $L = 0$ and see it swing at least 90° round in the spin direction before it reaches the horizon.',
      hint: 'Set <b>angular momentum</b> to 0 and press <b>Reset</b>. More spin and a closer drop give a bigger swing.',
      check: (s) => s.touched === true && Math.abs(s.L as number) < 0.05 && s.status === 'captured' && (s.dphi as number) > Math.PI / 2,
    },
    {
      id: 'thorne',
      title: 'The Thorne limit',
      prompt: 'Push the spin to $a = 0.998M$, the most that disc accretion is thought to reach.',
      hint: 'Drag <b>spin a</b> all the way to the right.',
      check: (s) => (s.a as number) >= 0.998,
    },
    {
      id: 'penrose',
      title: 'Mine the hole',
      prompt: 'Run the Penrose demo to the end and get a fragment out with more energy than went in.',
      hint: 'Press <b>Penrose demo</b>. It needs a fast spin and raises it for you if needed.',
      check: (s) => (s.penroseGain as number) > 0,
    },
  ],
  caveats: `<p>The scene draws Boyer–Lindquist $r$ and $\\theta$ as if they were ordinary spherical coordinates. That keeps the horizon a sphere and the ergosphere a simple oblate shell. Real distances near a spinning hole are not like that, and other coordinate choices give other shapes.</p>
<p>The dust is not free-falling. Each grain turns at the local $\\Omega_{\\text{drag}}$ at fixed $r$ and $\\theta$, which is what a zero angular momentum observer does. Holding fixed $r$ needs a rocket. It is a map of the dragging rate, not a simulation of a disc. The dust and the particle also run on different clocks: the dust in far-away time $t$, the particle in its own proper time.</p>
<p>The test particle has no mass of its own and moves only in the equatorial plane. Off-plane orbits need the Carter constant and are not shown. The run stops just outside the horizon, where the coordinates fail.</p>
<p>The Penrose demo is a bookkeeping illustration. The split is instantaneous and elastic, with fragments of 0.1 of the parent's mass thrown apart at a chosen angle. No known natural process arranges this.</p>
<p>The efficiencies are for a thin, prograde disc that radiates everything before the ISCO. Real flows can differ by tens of percent.</p>`,
  further: [
    { label: 'Kerr (1963), Gravitational field of a spinning mass, Phys. Rev. Lett. 11, 237', url: 'https://doi.org/10.1103/PhysRevLett.11.237' },
    { label: 'Bardeen, Press & Teukolsky (1972), Rotating black holes, ApJ 178, 347', url: 'https://doi.org/10.1086/151796' },
    { label: 'Everitt et al. (2011), Gravity Probe B final results, Phys. Rev. Lett. 106, 221101', url: 'https://doi.org/10.1103/PhysRevLett.106.221101' },
    { label: 'Kerr metric on Wikipedia', url: 'https://en.wikipedia.org/wiki/Kerr_metric' },
  ],
};
