import type { TopicContent } from '../../core/types.ts';

export const content: TopicContent = {
  intuition: `
<p class="lead">A smoke ring is a spinning doughnut of air that pushes itself along. Nothing propels it. The loop moves because every piece of it is carried by the swirl made by all the other pieces.</p>
<p>Look at a ring from the side and cut it in half. You see two small whirlpools spinning in opposite directions. Between them the air rushes forward, and each whirlpool is dragged along by the flow of its partner. Around the whole loop this adds up to a steady glide. The glowing tube in the scene is that spinning core. The grey haze around it is smoke, carried only by the flow the core makes.</p>
<p>The surprise comes with two rings. Line them up one behind the other and the rear ring feels the front ring's flow pulling it inward. It shrinks, and a smaller ring moves faster. Meanwhile the front ring is pushed outward, grows and slows down. The rear ring catches up and <strong>threads right through</strong> the front one. Now the roles swap, and the game repeats. This is called <strong>leapfrogging</strong>.</p>
<p>Point two rings at each other instead and they cannot pass. Each one stretches the other outward, so both grow wide and slow down as they close in. A ring that hits a wall behaves the same way, because a flat wall acts like a mirror ring coming the other way.</p>
<p>You meet these rings in smoke from a pipe, in the puffs some volcanoes blow, in the silvery bubble rings that dolphins make and chase, in the jet a jellyfish squirts to swim, and inside your heart. Each time the left ventricle fills, blood rushing through the mitral valve rolls up into a ring.</p>`,
  tryFirst: [
    'Watch the default <b>Leapfrog</b> run and the radius graph in the corner. The two curves cross each time one ring passes through the other.',
    'Pick <b>Single</b> and compare <b>U measured</b> with <b>U Kelvin</b>. Then double <b>Γ</b> and compare again.',
    'Pick <b>Collision</b>. Two rings meet head on, spread wide and almost stop.',
    'Pick <b>Wall</b>. The faint ring behind the wall is the mirror image that stands in for the wall.',
    'Turn the <b>smoke</b> off to see the bare vortex cores, then on again to see what the eye actually sees.',
  ],
  equation: {
    tex: '\\mathbf u(\\mathbf x) = \\frac{\\Gamma}{4\\pi}\\oint \\frac{d\\mathbf l \\times (\\mathbf x - \\mathbf x\')}{|\\mathbf x - \\mathbf x\'|^3}',
    caption: 'The Biot–Savart law for a vortex filament. Every piece $d\\mathbf l$ of the loop makes the fluid swirl around it, and the swirls from all the pieces add up. It is the same law that gives the magnetic field of a wire loop, with circulation in place of current.',
    terms: [
      { tex: '\\mathbf u(\\mathbf x)', name: 'Fluid velocity', meaning: 'How fast the fluid moves at the point $\\mathbf x$. Evaluated on the filament itself, it tells the filament where to go next. The ring speed readout shows the result.', param: 'U' },
      { tex: '\\Gamma', name: 'Circulation', meaning: 'The strength of the spin: the flow speed summed once around a loop that threads the core. Every velocity in the problem is proportional to it.', param: 'gamma' },
      { tex: '\\oint d\\mathbf l', name: 'The filament', meaning: 'A sum over the whole closed loop. A bigger ring has its far side farther away, so it pushes itself along more slowly.', param: 'R' },
      { tex: '\\mathbf x - \\mathbf x\'', name: 'Separation', meaning: 'The vector from a piece of filament at $\\mathbf x\'$ to the point $\\mathbf x$. Another ring nearby adds its own loop to the sum, which is what makes two rings interact.', param: 'sep' },
      { tex: '|\\mathbf x - \\mathbf x\'|^3', name: 'Distance cubed, and the core', meaning: 'The influence falls off with distance. On the filament itself it would blow up. A real vortex has a core of finite radius $a$, and that core sets how fast the ring moves.', param: 'a' },
    ],
  },
  physicsNotes: `
<h3>Why a ring moves itself</h3>
<p>For a straight vortex line the integral gives the familiar swirl $u = \\Gamma/(2\\pi r)$ around the line, and the line itself stays put. Bend the line into a circle and the pieces no longer cancel. Near any point of the ring, the rest of the ring is curved to one side, and its swirl adds up to a push along the axis. The sum diverges logarithmically as you approach the filament, so the core size $a$ enters the answer. Kelvin's result for a thin ring with a uniformly spinning core is</p>
$$U = \\frac{\\Gamma}{4\\pi R}\\left(\\ln\\frac{8R}{a} - \\frac14\\right)$$
<p>The speed is proportional to $\\Gamma$. It falls roughly as $1/R$, so small rings are fast. The thinner the core, the faster the ring, but only through a logarithm. Halving $a$ adds just $\\ln 2$ to the bracket.</p>
<h3>How the simulation works</h3>
<p>Each ring is a closed polygon of 96 or 128 points. The velocity of every point is the Biot–Savart sum over every segment of every ring. The $1/|\\mathbf r|^3$ is softened to $1/(|\\mathbf r|^2 + \\delta^2)^{3/2}$, the Rosenhead–Moore core. With $\\delta = a\\,e^{-3/4} \\approx 0.47a$ this smoothed law reproduces Kelvin's formula for a core of radius $a$. The points move with classical fourth-order Runge–Kutta at a fixed step.</p>
<p>Straight segments cut the corners of a curved filament. Near each point the polygon misses a slice of the ring's own pull, which is worth about 10% of the speed at this resolution. The code adds that slice back with a local correction computed from the polygon's curvature. With it, a lone ring matches Kelvin's formula to better than 1%. The smoke is a few thousand passive tracer points moved by the same velocity field.</p>
<h3>What stays fixed</h3>
<p>The total <strong>impulse</strong> $\\mathbf P = \\tfrac12\\sum\\Gamma\\oint \\mathbf x \\times d\\mathbf l$ is conserved in an unbounded fluid. For coaxial rings it is $\\pi\\Gamma(R_A^2 + R_B^2)$ along the axis. When the rear ring shrinks during leapfrogging, the front ring must grow to keep that sum constant. The impulse readout tracks the drift, which stays near 0.1%. A wall is different. It pushes on the fluid, so the impulse there is not conserved.</p>`,
  deep: [
    {
      title: 'Helmholtz, Kelvin and the circulation theorem',
      html: `<p>Hermann von Helmholtz published the laws of vortex motion in 1858. In a fluid with no viscosity, vortex lines move with the fluid, and the strength of a vortex tube is the same all along its length. So a vortex line cannot simply end inside the fluid. It must close on itself, as a ring does, or end on a boundary. Helmholtz also described two coaxial rings passing through each other in turn.</p>
<p>William Thomson, later Lord Kelvin, recast this as a statement about circulation. In 1869 he showed that for an ideal fluid with conservative forces and a density fixed by the pressure, the circulation around any loop that moves with the fluid never changes:</p>
$$\\frac{D\\Gamma}{Dt} = 0, \\qquad \\Gamma = \\oint_{C(t)} \\mathbf u \\cdot d\\mathbf l$$
<p>That is why the scene can give each ring a fixed $\\Gamma$ and let it move. It is also why, strictly, an ideal fluid can never create or destroy a vortex ring. Real rings are born where viscosity acts, at the sharp edge of a nozzle or a mouth, and they fade as viscosity spreads their cores.</p>`,
    },
    {
      title: 'Vortex atoms, and how knot theory began',
      html: `<p>In 1867 Peter Guthrie Tait showed Kelvin a box that fired smoke rings. The rings bounced off each other and wobbled like elastic bodies, yet never broke. Kelvin proposed that atoms might be tiny knotted vortex rings in an all-filling ether. Helmholtz's laws would make them permanent. Different knots would be different elements, and their vibrations would give the spectral lines.</p>
<p>To build a periodic table of knots, Tait, with Thomas Kirkman and Charles Little, set out to list every distinct knot by its number of crossings. The vortex atom idea faded by around 1900, after the discovery of the electron and the failure of ether theories. The knot tables survived and became one of the starting points of knot theory, now a branch of topology with uses in DNA biology and quantum field theory.</p>
<p>This belongs to history. Vortex atoms are not part of modern physics. The echo is real, though. In 2013 Dustin Kleckner and William Irvine made knotted and linked vortex loops in water and filmed them untying themselves through reconnection.</p>`,
    },
    {
      title: 'Leapfrogging, and why it does not last',
      html: `<p>Take two identical rings on one axis. The front ring's flow at the rear ring points inward and forward, so the rear ring shrinks and speeds up. The rear ring's flow at the front ring points outward, so the front ring grows and slows. Impulse conservation ties them together: $R_A^2 + R_B^2$ stays fixed. The radius graph shows the two curves swapping like a see-saw.</p>
<p>Closer rings interact more strongly and swap faster. Rings that start several radii apart still leapfrog, but slowly. Try a gap of 1.5 radii and wait.</p>
<p>In the lab, leapfrogging is hard to see more than a couple of times. Real cores are thick and the rings mix and merge. The thin-filament model itself shows that the dance is unstable to wobbles around the ring. Here the rings start perfectly round, so the wobble grows only from rounding error. After many passes you may see the rings go lumpy. That lumpiness is a real instability of the model, not a bug.</p>`,
    },
    {
      title: 'Collisions and walls',
      html: `<p>A flat wall with no friction is equivalent to a mirror image: a ring of opposite circulation approaching from the far side. So a ring hitting a wall is exactly half of a head-on collision, and the tests check that the two runs agree to round-off.</p>
<p>As the rings close in, each one's flow stretches the other outward. The radius grows, the speed $\\sim \\ln(8R/a)/R$ drops, and the rings creep toward each other ever more slowly. In the thin-core model the gap closes to roughly the core size. Then the model has nothing more to say. In real fluids the story continues. Viscosity lets the cores cut and reconnect into small rings flung outward. A ring at a real wall peels a layer of opposite spin off the wall, which makes a secondary ring and often makes the main ring bounce back. The scene stops when the cores get closer than one polygon segment.</p>`,
    },
    {
      title: 'Rings in nature: jellyfish, hearts, dolphins and volcanoes',
      html: `<p>A jellyfish contracts its bell and pushes out a slug of water. The water rolls up into a vortex ring, and the ring's impulse is the thrust. Lab studies with a piston pushing fluid out of a tube found that a ring stops growing once the pushed column is about four tube diameters long. Push longer and the extra fluid trails behind as a wasteful jet. This <em>formation number</em> near 4 (Gharib, Rambod and Shariff, 1998) is a useful guide to efficient pulsed propulsion in animals.</p>
<p>The same roll-up happens in the heart. During filling, blood jets through the mitral valve into the left ventricle and forms a vortex ring. Researchers have proposed measures of how well that ring forms as indicators of heart health.</p>
<p>Dolphins and beluga whales blow air into a ring they have made, which gives a silver ring of bubbles. The air collects in the low pressure core, so the bubbles trace the vortex just like the glowing tube here. Mount Etna and some other volcanoes sometimes puff out steam rings from a narrow vent, smoke rings on a giant scale.</p>`,
    },
  ],
  challenges: [
    {
      id: 'wide-leapfrog',
      title: 'Leapfrog from afar',
      prompt: 'Start two rings at least 1.5 radii apart and make them leapfrog at least twice.',
      hint: 'Keep the Leapfrog preset, drag the separation slider to 1.5 or more, and wait. Wide rings interact gently, so each pass takes a while. Raise the sim speed if you are impatient.',
      check: (s) => s.preset === 'leapfrog' && (s.sepOverR as number) >= 1.5 - 1e-9 && (s.passes as number) >= 2,
    },
    {
      id: 'double-gamma',
      title: 'Twice the spin, twice the speed',
      prompt: 'Measure a single ring\'s speed, then double $\\Gamma$ with the same $R$ and $a$ and measure again. The speed should double too.',
      hint: 'Pick Single, wait about 2 time units for a measurement, then move Γ to twice its value (for example 1 to 2) and wait again.',
      check: (s) => (s.gammaRatio as number) >= 1.95 && Math.abs((s.speedRatio as number) / (s.gammaRatio as number) - 1) < 0.03,
    },
    {
      id: 'collide',
      title: 'Head on',
      prompt: 'Collide two rings head on and watch them spread to at least 1.5 times their starting radius.',
      hint: 'Pick Collision and let it run. The rings grow fastest in the last moments before they meet.',
      check: (s) => s.preset === 'collision' && (s.growth as number) >= 1.5,
    },
    {
      id: 'thin-fast',
      title: 'Thin beats fat',
      prompt: 'With the same $\\Gamma$ and $R$, measure a fat ring and a ring with a core at most half as thick. Show the thin one is faster.',
      hint: 'In Single, measure with a core of 0.2, then drop the core size to 0.1 or below and measure again. The gain is only logarithmic, so look closely at the numbers.',
      check: (s) => (s.coreRatio as number) >= 2 && s.thinFaster === true,
    },
  ],
  caveats: `<p>The fluid is ideal: no viscosity, incompressible, infinite. Real rings spread their cores, lose circulation and slow down, and none of that happens here. Each core is modelled as a thin filament with a fixed size. In reality a core changes thickness as the ring stretches, since the core volume is conserved. The core never deforms in cross-section here either.</p>
<p>Kelvin's formula holds only for thin rings, where $a$ is much smaller than $R$. For fat cores the scene still runs, but the formula and the simulation are both only approximate. The model cannot follow what happens when two cores touch. Reconnection, secondary vortices at a wall and rebound need viscosity, so the scene stops there. The wall has no friction, which a real wall does.</p>`,
  further: [
    { label: 'Vortex ring on Wikipedia', url: 'https://en.wikipedia.org/wiki/Vortex_ring' },
    { label: "Kelvin's circulation theorem on Wikipedia", url: 'https://en.wikipedia.org/wiki/Kelvin%27s_circulation_theorem' },
    { label: 'Gharib, Rambod and Shariff, A universal time scale for vortex ring formation (1998)', url: 'https://doi.org/10.1017/S0022112097008410' },
    { label: 'Kleckner and Irvine, Creation and dynamics of knotted vortices (2013)', url: 'https://doi.org/10.1038/nphys2560' },
  ],
};
