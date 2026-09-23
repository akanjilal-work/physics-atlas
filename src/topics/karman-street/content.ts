import type { TopicContent } from '../../core/types.ts';

// Onset bracket used by the first challenge: a steady wake and a shedding wake no more than 20 apart in Re,
// with the midpoint within 10 of the textbook value 47.
function onsetFound(s: Record<string, number | boolean | string>): boolean {
  const lo = s.steadyReMax as number;
  const hi = s.shedReMin as number;
  if (!(lo > 0) || !(hi > 0) || hi <= lo || hi - lo > 20) return false;
  const mid = (lo + hi) / 2;
  return mid >= 37 && mid <= 57;
}

export const content: TopicContent = {
  intuition: `
<p class="lead">Wind blowing past a round pole does not flow smoothly around it. Behind the pole, the air rolls up into a swirl on one side, then the other, then the first side again. The swirls peel off one at a time and drift downstream in two staggered rows. That zigzag chain is a <strong>Kármán vortex street</strong>.</p>
<p>Each swirl that leaves gives the pole a small sideways shove. The shoves alternate left and right, so the pole is pushed back and forth at the rate the swirls leave. That is why a taut wire hums in the wind, why flags ripple, and why tall chimneys can sway.</p>
<p>The surprise is how regular it is. The rate depends on almost nothing but the wind speed and the pole's width. Double the wind and the swirls come twice as fast. Halve the width and they also come twice as fast. The pattern repeats so reliably that engineers use it to measure flow speed.</p>
<p>The other surprise is that it switches on suddenly. In a slow, syrupy flow the wake is calm and mirror-symmetric, with two small swirls parked behind the pole. Speed the flow up, or make the fluid less sticky, and at one point the calm wake starts to wobble by itself and never stops.</p>
<p>In the scene, the sheet is a slice of flowing fluid seen from above. <span style="color:#f5b642">Amber</span> marks fluid spinning counter-clockwise and <span style="color:#4fd1e8">cyan</span> marks clockwise spin. White dye is released just upstream of the obstacle and shows where the fluid goes. The corner plot tracks the sideways velocity at the probe behind the obstacle and finds its beat.</p>`,
  tryFirst: [
    'Watch the wake form. At first it is symmetric. After a few seconds it starts to wobble, and amber and cyan swirls peel off in turn.',
    'Read <b>St</b> in the corner plot once the street has settled. Compare it with 0.2.',
    'Drop <b>Re</b> to 30. The swirls stop shedding and two quiet eddies sit behind the cylinder.',
    'Switch the obstacle to <b>Airfoil</b>, or turn on <b>Paint obstacle</b> and draw your own shape.',
  ],
  equation: {
    tex: '\\text{St} = \\frac{f\\,D}{U} \\approx 0.2',
    caption: 'The Strouhal number. The shedding frequency scales with speed over width. The flow itself is set by the Reynolds number $\\text{Re} = UD/\\nu$.',
    terms: [
      { tex: '\\text{St}', name: 'Strouhal number', meaning: 'A pure number: how many swirl pairs leave while the fluid travels one obstacle width. The readout measures it from the probe signal.', param: 'St' },
      { tex: 'f', name: 'Shedding frequency', meaning: 'Full cycles of the sideways velocity at the probe, per unit time. One cycle is one swirl from each side. It is the peak of the spectrum in the corner plot.', param: 'f' },
      { tex: 'D', name: 'Obstacle width', meaning: 'The width of the obstacle across the flow. For a painted shape the page uses its full height across the stream.', param: 'obstacle' },
      { tex: 'U', name: 'Flow speed', meaning: 'The speed of the oncoming flow. Raising it speeds up the shedding, and at fixed $\\nu$ it also raises $\\text{Re}$.', param: 'U' },
      { tex: '0.2', name: 'The magic number', meaning: 'Measured for circular cylinders from Re of a few hundred up to about $2\\times10^5$. Near the onset it is lower, about 0.12 at $\\text{Re} = 50$.', param: 'StRef' },
    ],
  },
  physicsNotes: `
<h3>Why only Re matters</h3>
<p>For an incompressible fluid, the Navier-Stokes equations have one knob once you measure lengths in $D$ and speeds in $U$:</p>
$$\\frac{\\partial \\mathbf u}{\\partial t} + (\\mathbf u\\cdot\\nabla)\\mathbf u = -\\nabla p + \\frac{1}{\\text{Re}}\\nabla^2\\mathbf u, \\qquad \\nabla\\cdot\\mathbf u = 0, \\qquad \\text{Re} = \\frac{UD}{\\nu}.$$
<p>So any dimensionless answer, like the Strouhal number, can depend only on $\\text{Re}$ and on the shape. A wire in the wind and a pier in a river share the same wake if their Reynolds numbers match. The frequency then follows from $f = \\text{St}\\,U/D$.</p>
<h3>The regimes behind a circular cylinder</h3>
<p>Below $\\text{Re} \\approx 5$ the flow hugs the cylinder. From about 5 to 47 two steady eddies sit in the wake, mirror images of each other. Their length grows with $\\text{Re}$. Near $\\text{Re}_c \\approx 47$ this steady state becomes unstable. A small wobble grows by itself into a regular oscillation. Mathematically this is a <strong>Hopf bifurcation</strong>, and just above onset the oscillation amplitude grows like $\\sqrt{\\text{Re} - \\text{Re}_c}$. Up to about $\\text{Re} = 190$ the street is two-dimensional and perfectly periodic. Above that, the real wake develops three-dimensional structure, which a 2D model cannot show.</p>
<h3>How the simulation works</h3>
<p>The page uses the <strong>lattice Boltzmann method</strong>. Instead of solving for velocity directly, it tracks nine populations $f_i$ of fictitious particles at each grid cell, each moving along one of the lattice links $\\mathbf c_i$ (rest, four sides, four diagonals). Every step they stream to the neighbour cell, then relax toward a local equilibrium:</p>
$$f_i(\\mathbf x + \\mathbf c_i, t+1) = f_i - \\frac{1}{\\tau}\\big(f_i - f_i^{\\text{eq}}\\big), \\qquad f_i^{\\text{eq}} = w_i\\rho\\Big(1 + 3\\,\\mathbf c_i\\!\\cdot\\!\\mathbf u + \\tfrac92(\\mathbf c_i\\!\\cdot\\!\\mathbf u)^2 - \\tfrac32 u^2\\Big).$$
<p>Density and velocity are the sums $\\rho = \\sum f_i$ and $\\rho\\mathbf u = \\sum f_i\\mathbf c_i$. A Chapman-Enskog expansion shows this reproduces the Navier-Stokes equations at low Mach number, with viscosity</p>
$$\\nu = \\frac{\\tau - \\tfrac12}{3}$$
<p>in lattice units. The <b>Re</b> slider sets $\\nu$, and so $\\tau$. Walls use bounce-back: a population that would enter a solid cell is sent straight back. The inflow on the left and the top and bottom rows are held at the free stream. The right edge lets the wake leave.</p>
<h3>Measuring St</h3>
<p>A probe two widths behind the obstacle records the sideways velocity $v$ every 5 steps. On the centre line $v$ swings once per shedding cycle. The page removes the mean, applies a Hann window and computes a power spectrum over the settled part of the record. The peak gives $f$, and $\\text{St} = fD/U$.</p>`,
  deep: [
    {
      title: 'Von Kármán, 1911: why the street is staggered',
      html: `<p>In 1911 Theodore von Kármán was an assistant in Ludwig Prandtl's institute in Göttingen. By his own later account, a doctoral student, Karl Hiemenz, was trying to measure the steady flow behind a cylinder in a water channel and could not stop the wake from oscillating. Von Kármán suspected the oscillation was not a flaw of the channel but a property of the flow.</p>
<p>He modelled the wake as two infinite rows of point vortices, spinning in opposite directions. He showed that two rows placed side by side, vortex facing vortex, are always unstable. A staggered arrangement can be stable, but only for one spacing ratio:</p>
$$\\frac{h}{l} = \\frac{1}{\\pi}\\,\\text{arccosh}\\sqrt2 \\approx 0.281,$$
<p>where $h$ is the distance between the rows and $l$ the spacing along each row. Real wakes are not rows of point vortices and do not match this number exactly. Still, the analysis explained why wakes choose the zigzag pattern. The analysis appeared in 1911 and 1912, the second part with H. Rubach. Henri Bénard had photographed alternating vortices a few years earlier, and the pattern had been drawn long before, but von Kármán's name stuck.</p>`,
    },
    {
      title: 'Aeolian tones and singing wires',
      html: `<p>In 1878 Vincenc Strouhal spun thin wires through the air on a rotating arm and measured the pitch of the tone they made. He found that the frequency grew in proportion to the speed and fell in inverse proportion to the wire diameter, with a constant close to 0.185 in today's notation. In 1915 Lord Rayleigh tied these <strong>Aeolian tones</strong> to the vortices shed behind the wire and noted that the constant depends on the Reynolds number.</p>
<p>A quick estimate shows why wires sing and thick poles do not. For a 2 mm wire in a 10 m/s wind,</p>
$$f \\approx 0.2 \\times \\frac{10\\ \\text{m/s}}{0.002\\ \\text{m}} = 1000\\ \\text{Hz},$$
<p>well inside the range of hearing. The Reynolds number is about $10 \\times 0.002 / 1.5\\times10^{-5} \\approx 1300$, where St is close to 0.2. A 30 cm lamp post in the same wind sheds at about 7 Hz. You cannot hear that, but you can sometimes see the post tremble. An Aeolian harp works the same way. Its strings are driven by shedding and pick out the harmonics that lie close to the shedding frequency.</p>`,
    },
    {
      title: 'Cloud streets behind islands',
      html: `<p>Satellite images regularly show Kármán streets hundreds of kilometres long in the clouds downwind of steep islands. A well-known example is <strong>Guadalupe Island</strong>, off the Pacific coast of Baja California, Mexico. Its peaks rise more than a kilometre, through a flat deck of low stratocumulus cloud. Steady trade-like winds flow past, and the island sheds swirls that stir the cloud deck into alternating eddies. Other frequent examples are the Canary Islands, the Cape Verde Islands and Jan Mayen.</p>
<p>The likeness to the lab cylinder is real but loose. The air is stably stratified, and a temperature inversion caps the cloud layer, so the flow is close to two-dimensional there. The molecular Reynolds number is enormous. The relevant friction is turbulent mixing, which acts like a much larger effective viscosity. Studies of these streets find spacing ratios and shedding periods of the same order as the lab values, but the details depend on the inversion height and the wind profile.</p>`,
    },
    {
      title: 'Tacoma Narrows: flutter, not shedding resonance',
      html: `<p>The Tacoma Narrows Bridge in Washington State collapsed on 7 November 1940, four months after it opened. The film of the deck twisting is often shown as a Kármán vortex street driving a resonance. That explanation is wrong, or at best badly incomplete.</p>
<p>A shedding resonance would need the shedding frequency $f = \\text{St}\\,U/D$ to match a natural frequency of the deck, and it would only lock in over a narrow range of wind speeds. On the day of the collapse the wind was about 64 km/h, and the deck was twisting at about 0.2 Hz. The shedding frequency for that wind and deck depth was much higher. In 1991 K. Yusuf Billah and Robert Scanlan laid out the case in the <em>American Journal of Physics</em>. The failure was <strong>torsional aeroelastic flutter</strong>. Once the deck twists, the twist itself changes the airflow so that the wind pushes the twist further. The energy fed in per cycle exceeds what damping removes, and the motion grows with no forcing frequency at all. The thin, flexible, solid-sided deck made it especially prone to this.</p>
<p>Modern long bridges are tested in wind tunnels for flutter, and their decks are shaped and slotted to resist it.</p>`,
    },
    {
      title: 'Vortex-induced vibration and helical strakes',
      html: `<p>Real shedding problems do exist. The alternating side force on a body has amplitude $\\tfrac12\\rho U^2 D L\\,C_L$ per unit length $L$ of span, with $C_L$ of order 0.1 to 1. When $f$ approaches a natural frequency of the structure, the body starts to move. Its motion then organises the shedding along its length and pulls the shedding frequency onto its own. This <strong>lock-in</strong> makes vortex-induced vibration much stronger than a simple forced response. Tall chimneys, cables, heat-exchanger tubes and offshore risers can all fatigue this way.</p>
<p>The classic fix is a set of <strong>helical strakes</strong>, three thin fins wound around the top part of a chimney. They were developed by Christopher Scruton and colleagues at the UK National Physical Laboratory in the 1950s. The strakes make the separation point change along the height, so the shedding cannot stay in step over the whole length. Other remedies are perforated shrouds, tuned mass dampers, and simply making the structure stiff enough that its natural frequency sits well above $\\text{St}\\,U/D$ for any likely wind.</p>`,
    },
  ],
  challenges: [
    {
      id: 'onset',
      title: 'Find the onset',
      prompt: 'With the cylinder, find a steady wake and a shedding wake no more than 20 apart in Re. The midpoint must land within 10 of the textbook onset, Re ≈ 47.',
      hint: 'Each Re you test must settle before it counts (the status label says when). Try Re = 40, then Re = 55. Near the onset the wobble grows and dies very slowly, so be patient or raise the sim speed.',
      check: (s) => s.obstacle === 'cylinder' && onsetFound(s),
    },
    {
      id: 'strouhal',
      title: 'Measure the Strouhal number',
      prompt: 'Set Re between 120 and 200 with the cylinder, let the street settle, and read a measured St between 0.18 and 0.22.',
      hint: 'Change Re, then wait until the corner plot shows a clean peak. The measurement uses only the settled part of the probe record.',
      check: (s) => s.obstacle === 'cylinder' && (s.Re as number) >= 120 && (s.Re as number) <= 200 && s.stValid === true && (s.St as number) >= 0.18 && (s.St as number) <= 0.22,
    },
    {
      id: 'steady',
      title: 'A calm, symmetric wake',
      prompt: 'Bring Re below 40 with the cylinder and wait until the wake is steady and symmetric: no shedding at the probe.',
      hint: 'Slide Re to about 30. The old swirls wash downstream and two quiet eddies stay behind the cylinder. Turn on the dye to see them.',
      check: (s) => s.obstacle === 'cylinder' && (s.Re as number) < 40 && s.steady === true,
    },
    {
      id: 'paint',
      title: 'Paint your own shedder',
      prompt: 'Turn on painting, draw your own obstacle of at least 40 cells, and make it shed a street.',
      hint: 'Toggle <b>Paint obstacle</b>, press <b>Clear obstacle</b>, and drag on the sheet. A blob about as tall as the cylinder works well at Re above 100. Shift-drag erases.',
      check: (s) => s.obstacle === 'custom' && (s.painted as number) >= 40 && s.shedding === true,
    },
  ],
  caveats: `<p><strong>Two dimensions only.</strong> The model is a slice through an infinitely long cylinder. Real cylinder wakes turn three-dimensional above Re ≈ 190 and turbulent further on. The page's street stays tidy at every Re it allows.</p>
<p><strong>A narrow tunnel.</strong> The cylinder fills about a seventh of the tunnel height, and the top and bottom rows are held at the free-stream speed. This confinement speeds up the flow past the cylinder. It raises the measured St by roughly 10 to 15% above the free-stream value, and it shifts the onset a little. Compare the St readout with Williamson's fit to see the gap.</p>
<p><strong>Coarse grid.</strong> The cylinder is about 17 cells across and its edge is a staircase. The lattice Boltzmann method is weakly compressible, and the Mach number is about 0.17 here. The density readout shows how far the flow strays from incompressible. Near Re ≈ 250 the BGK scheme approaches its stability limit on this grid, so the slider stops there.</p>
<p><strong>Onset detection is slow.</strong> Close to Re = 47 the growth or decay of the wobble is very slow. The page calls a wake steady or shedding only after a fixed settling time, so a borderline Re can be misjudged.</p>`,
  further: [
    { label: 'Kármán vortex street on Wikipedia', url: 'https://en.wikipedia.org/wiki/K%C3%A1rm%C3%A1n_vortex_street' },
    { label: 'C. H. K. Williamson, Vortex dynamics in the cylinder wake, Annu. Rev. Fluid Mech. 28, 477 (1996)', url: 'https://doi.org/10.1146/annurev.fl.28.010196.002401' },
    { label: 'K. Y. Billah and R. H. Scanlan, Resonance, Tacoma Narrows bridge failure, and undergraduate physics textbooks, Am. J. Phys. 59, 118 (1991)', url: 'https://doi.org/10.1119/1.16590' },
    { label: 'Lattice Boltzmann methods on Wikipedia', url: 'https://en.wikipedia.org/wiki/Lattice_Boltzmann_methods' },
  ],
};
