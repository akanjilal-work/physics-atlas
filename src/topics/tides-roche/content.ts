import type { TopicContent } from '../../core/types.ts';
import { ROCHE_FLUID } from './physics.ts';

export const content: TopicContent = {
  intuition: `
<p class="lead">The Moon pulls on all of Earth. But it pulls a little harder on the side facing it and a little less on the far side. That small difference stretches the planet, raises the tides, slows our day, and can tear a moon apart.</p>
<p>Start with the <strong>Tides</strong> view. The blue shell is the ocean, with its height blown up millions of times. It bulges in <strong>two</strong> places: toward the Moon, and directly away from it. The near bulge is easy. The far bulge surprises most people.</p>
<p>Here is the trick. Earth as a whole falls toward the Moon with the pull felt at its centre. The near-side water is pulled harder than that, so it gets ahead. The far-side water is pulled less, so it gets left behind. Measured from Earth's centre, both ends move <em>outward</em>. Switch the arrows to <b>raw pull</b> and then to <b>tidal</b> to watch that subtraction happen.</p>
<p>Earth turns under the two bulges once a day, so most coasts get two high tides a day. The Sun does the same thing at a bit under half the strength. When the Sun and Moon line up, the bulges add and you get big <strong>spring tides</strong>. At right angles they partly cancel and give small <strong>neap tides</strong>.</p>
<p>The <strong>Roche</strong> view pushes the idea to the limit. Bring a moon close enough and the stretch beats the moon's own gravity. A moon held together only by gravity then smears into an arc and then a ring. Saturn's rings sit inside this line.</p>
<p>The <strong>Locking</strong> view shows the slow side of tides. Friction has already stopped the Moon's own spin relative to Earth, which is why we always see the same face. The same friction is still slowing Earth's spin and pushing the Moon away.</p>`,
  tryFirst: [
    'Switch <b>Arrows</b> between <b>raw pull</b> and <b>tidal</b>. The raw pull points at the Moon everywhere. Subtract the pull at Earth’s centre and the far side points away.',
    'Drag <b>Sun angle</b> to 0°, then to 90°. Watch the tide range readout and the tide gauge in the corner.',
    'Pull the <b>Moon distance</b> in to 40 Earth radii. The tide grows as $1/d^3$, so it more than triples.',
    'In the <b>Roche</b> view, set <b>Orbit radius</b> to 0.7 and press <b>Launch</b>. The moon stretches, sheds an arc, and winds into a ring.',
    'In the <b>Locking</b> view, press <b>Spin up Moon</b> and watch the spin fall back to one turn per orbit.',
  ],
  equation: {
    tex: 'a_{\\text{tide}} \\approx \\frac{2\\,G M\\, r}{d^{3}}',
    caption: `The tidal acceleration: the difference in pull across a body of radius $r$ at distance $d$ from a mass $M$. When the stretch beats self-gravity the body comes apart. For a fluid moon that happens inside the Roche limit, $d_R \\approx ${ROCHE_FLUID.toFixed(2)}\\,R_M\\,(\\rho_M/\\rho_m)^{1/3}$.`,
    terms: [
      { tex: 'a_{\\text{tide}}', name: 'Tidal acceleration', meaning: 'How much harder the near side is pulled than the centre. For the Moon at Earth’s surface it is about $1.1\\times10^{-6}$ m/s², roughly a ten-millionth of $g$.', param: 'atide' },
      { tex: 'M', name: 'Tide-raising mass', meaning: 'The Moon or the Sun. The Sun is 27 million times heavier than the Moon but 390 times farther away. Mass wins linearly, distance wins as the cube, so the Sun’s tide ends up at 0.46 of the Moon’s.', param: 'ratio' },
      { tex: 'r', name: 'Size of the stretched body', meaning: 'Distance from the body’s centre, here Earth’s radius. Bigger bodies are stretched harder. The arrows show the field at the surface.', param: 'arrows' },
      { tex: 'd^{3}', name: 'Distance, cubed', meaning: 'Gravity falls as $1/d^2$. The <em>difference</em> across a body falls one power faster. Halve the distance and the tide grows eightfold.', param: 'moonDist' },
      { tex: '2', name: 'Factor of two', meaning: 'It comes from the slope of $1/d^2$, which is $-2/d^3$. Points off to the side are squeezed inward at half this strength.', param: 'range' },
    ],
  },
  physicsNotes: `
<h3>Where the formula comes from</h3>
<p>A mass $M$ at distance $d$ pulls the centre of Earth with $GM/d^2$. A point a distance $r$ closer feels $GM/(d-r)^2$. The tide is the difference:</p>
$$a_{\\text{tide}} = \\frac{GM}{(d-r)^2} - \\frac{GM}{d^2} = \\frac{2GMr}{d^3}\\Big(1 + \\tfrac{3}{2}\\tfrac{r}{d} + \\dots\\Big).$$
<p>On the far side the sign of $r$ flips and the result is the same size, pointing away. At the sides the pull converges toward the centre and gives a squeeze of $GMr/d^3$. The full pattern is a stretch along the line to the Moon and a squeeze around the waist.</p>
<h3>Height of the equilibrium tide</h3>
<p>If the ocean could settle instantly into the tidal field, its surface would follow the tidal potential. The height at angle $\\psi$ from the sub-Moon point is</p>
$$h(\\psi) = \\frac{M}{M_\\oplus}\\Big(\\frac{R_\\oplus}{d}\\Big)^{3} R_\\oplus\\;\\frac{3\\cos^2\\psi - 1}{2}.$$
<p>For the Moon the peak is about 36 cm and the range about 54 cm. The Sun adds a copy 0.46 times as large. Spring tides reach about $1.46$ and neap tides about $0.54$ of the lunar value, a ratio near 2.7. The scene draws this shape, exaggerated millions of times.</p>
<h3>The Roche limit</h3>
<p>Put a small body of radius $a$ and mass $m$ at distance $d$. Balance the tidal stretch $2GMa/d^3$ against its surface gravity $Gm/a^2$ and write masses as densities. You get the <strong>rigid</strong> limit</p>
$$d = 2^{1/3} R_M \\Big(\\frac{\\rho_M}{\\rho_m}\\Big)^{1/3} \\approx 1.26\\, R_M \\Big(\\frac{\\rho_M}{\\rho_m}\\Big)^{1/3}.$$
<p>A fluid moon is worse off. It stretches into an egg, which makes the tide stronger at its tips and its own grip weaker. Roche's calculation for a fluid in synchronous orbit gives a coefficient near 2.44.</p>
<h3>How the scene computes it</h3>
<p>The Tides view evaluates the exact field difference at each arrow and the equilibrium height at each ocean vertex. The Roche view is a toy N-body model with 300 particles, direct summation, softened gravity, and soft contacts. It uses a fixed leapfrog step. The largest-clump readout counts the biggest group of touching particles.</p>`,
  deep: [
    {
      title: 'The far-side bulge, done properly',
      html: `<p>A common story says the far bulge is thrown out by the Earth-Moon system spinning around its shared centre of mass. That is half right and easy to get wrong.</p>
<p>Earth does circle the barycentre, which sits about 4,700 km from Earth's centre, inside the planet. But that motion is a <em>revolution without rotation</em>. Every point on Earth traces a circle of the same size. So every point feels the same centrifugal term, and at the centre it exactly cancels the Moon's pull. What is left everywhere is the Moon's pull minus the Moon's pull at the centre. That is the difference field, and it is symmetric: out on both ends.</p>
<p>A cleaner way to see it: forget rotation and think of Earth in free fall toward the Moon. In a falling frame the uniform part of gravity vanishes. Only the non-uniform part, the tide, remains. The Sun raises tides on Earth the same way, even though Earth circles the Sun and not the other way round.</p>
<p>Earth's daily spin is a separate matter. It does flatten the planet at the poles, but it is symmetric about the axis and does not make tides.</p>`,
    },
    {
      title: 'Real oceans: two tides a day, and the Bay of Fundy',
      html: `<p>The Moon moves along its orbit while Earth turns, so a given place meets the Moon again after about 24 hours 50 minutes. With two bulges, high water comes about every 12 hours 25 minutes. That is the M2 tide, and it dominates most coasts.</p>
<p>Real oceans cannot keep up with the equilibrium bulges. Water in a basin sloshes with its own natural periods. Continents block the way. The Coriolis effect turns the tide into a wave that rotates around points of zero range, called amphidromic points. The Moon's tilt relative to the equator makes the two daily tides unequal, and some coasts, such as parts of the Gulf of Mexico, see only one high tide a day.</p>
<p>Resonance can make tides huge. Canada's <strong>Bay of Fundy</strong> has a natural sloshing period close to the 12.4 hour lunar tide. Its range reaches about 16 m, the largest in the world. Open-ocean ranges are usually well under a metre, close to the equilibrium value in the scene.</p>`,
    },
    {
      title: 'Tidal locking and the lengthening day',
      html: `<p>A moon spinning faster than it orbits drags its tidal bulge along. The bulge is then off the line to the planet, so the planet's gravity gives it a torque. Friction inside the moon turns that spin energy into heat. The spin slows until the moon turns exactly once per orbit, with its long axis pointing at the planet. The Moon reached this state long ago. It turns once every 27.3 days, the same as its orbit. Slight wobbles called librations let us see about 59% of its surface over time.</p>
<p>Earth has not locked yet. It spins once a day while the Moon takes a month, so Earth's bulge is carried <em>ahead</em> of the Moon. The Moon's pull on that bulge brakes Earth's spin. The bulge pulls the Moon forward in return, so the Moon slowly climbs outward. Angular momentum moves from Earth's spin to the Moon's orbit.</p>
<p>Laser ranging to the reflectors left by Apollo astronauts and Soviet rovers measures the recession at about <strong>3.8 cm per year</strong>. Tidal friction alone lengthens the day by about 2.3 milliseconds per century. The observed rate is lower, near 1.8, mainly because Earth's shape is still rebounding from the last ice age.</p>
<p>Rocks record this. Tidal rhythmites, layered sediments laid down by tides, from South Australia's Elatina Formation point to about 400 days per year and a 21.9 ± 0.4 hour day 620 million years ago (Williams 2000). The mean recession since then was about 2.2 cm per year. Today's rate is unusually high, probably because today's ocean basins happen to resonate well with the tide. The Locking view gets 22.1 hours from angular momentum conservation alone, inside the error bar.</p>`,
    },
    {
      title: 'Roche, rings, and a comet that came apart',
      html: `<p>Édouard Roche, a French astronomer, calculated the limit in 1848. His result explains why no large moon orbits close to a giant planet, and why ring systems sit close in.</p>
<p><strong>Saturn's rings</strong> are mostly water ice and lie inside the fluid Roche limit for ice, about 2.2 Saturn radii by the formula here. The outer edge of the main rings is near 2.27 Saturn radii. Small moons such as Pan and Daphnis live inside the rings. The limit applies to bodies held together by their own gravity. Small objects with some material strength can survive inside it.</p>
<p><strong>Comet Shoemaker-Levy 9</strong> passed within Jupiter's Roche limit in July 1992 and broke into a string of more than 20 fragments. The fragments hit Jupiter one after another between 16 and 22 July 1994, the first collision between Solar System bodies ever observed.</p>
<p><strong>Io</strong> shows tides as a heat source. Orbital resonances with Europa and Ganymede keep its orbit slightly elliptical, so Jupiter's tide on Io rises and falls every orbit. The flexing heats the interior. Peale, Cassen and Reynolds predicted active volcanism in a paper published in early March 1979, days before Voyager 1 images revealed erupting plumes. Io is the most volcanically active body known.</p>`,
    },
    {
      title: 'Where did Saturn’s rings come from? An open question',
      html: `<p>The rings are almost certainly debris inside the Roche limit, where it cannot gather into a moon. How and when that debris got there is debated.</p>
<p>The case for <strong>young rings</strong>: Cassini's final orbits in 2017 measured the ring mass at about 40% of the moon Mimas (Iess et al. 2019). Interplanetary dust constantly falls on the rings, yet the ice is still very clean. With that little mass, the rings should have darkened if they were billions of years old. Dust measurements from Cassini put their exposure age at no more than a few hundred million years (Kempf et al. 2023). One proposed source is a moon destabilised and torn apart roughly 100 to 200 million years ago (Wisdom et al. 2022).</p>
<p>The case for <strong>old rings</strong>: ring particles may clean themselves, and ring material is recycled and spread over time. A recent study (Hyodo, Genda and Madeira) argued that fast dust impacts mostly vaporise and do not stick, so ancient rings could still look young. Older origin ideas, such as ice stripped from a large moon spiralling into Saturn early on (Canup 2010), remain in play.</p>
<p>Both camps agree the rings sit inside the Roche limit. The disagreement is about age, and it is not settled.</p>`,
    },
  ],
  challenges: [
    {
      id: 'spring',
      title: 'Spring tide',
      prompt: 'In the Tides view, line up the Sun and Moon so their bulges add. Get the Sun within 5° of the Earth-Moon line, on either side.',
      hint: 'Set Sun angle to 0° (new moon) or 180° (full moon). Both give spring tides, because each body raises two opposite bulges.',
      check: (s) => s.view === 'tides' && Math.abs(Math.sin(((s.sunAngle as number) * Math.PI) / 180)) < Math.sin((5 * Math.PI) / 180),
    },
    {
      id: 'neap',
      title: 'Neap tide',
      prompt: 'Now set the Sun at a right angle to the Moon, within 5°, so the solar bulges fill the lunar low tides.',
      hint: 'Sun angle 90° or 270°. That is first or last quarter Moon. Compare the tide range with the spring value.',
      check: (s) => s.view === 'tides' && Math.abs(Math.cos(((s.sunAngle as number) * Math.PI) / 180)) < Math.sin((5 * Math.PI) / 180),
    },
    {
      id: 'shred',
      title: 'Make a ring',
      prompt: 'In the Roche view, tear a rubble-pile moon apart until its largest clump holds less than half of its particles.',
      hint: 'Set Orbit radius to 0.8 or less and press Launch. Anything inside about 0.9 should break up here.',
      check: (s) => s.view === 'roche' && s.body === 'rubble' && (s.clump as number) < 0.5,
    },
    {
      id: 'rigid',
      title: 'Solid survivor',
      prompt: 'Keep a dense solid moon (density 3 g/cm³ or more) whole inside the fluid Roche limit for 3 orbits, without losing a single surface grain.',
      hint: 'Switch Moon body to Solid, raise the density, and pick an orbit radius between about 0.7 and 0.95. A rigid body only sheds grains below its own, smaller limit.',
      check: (s) => s.view === 'roche' && s.body === 'rigid' && (s.density as number) >= 3 && (s.orbit as number) < 1 && (s.intactOrbits as number) >= 3,
    },
  ],
  caveats: `<p>The Tides view shows the <em>equilibrium</em> tide: the shape the ocean would take if it responded instantly and covered the whole planet. Real tides are waves shaped by basins, coastlines, depth and Earth's rotation. The Moon and Sun are held in Earth's equatorial plane, the ocean height is exaggerated millions of times, and the distances are not to scale.</p>
<p>The Roche view is a toy. It uses 300 softened particles instead of a real rubble pile, has no friction between grains, and keeps the planet fixed. Breakup happens near 0.9 to 1.0 of the fluid limit here, which is close to Roche's number, but the exact value depends on the toy's settings. The solid moon is a perfectly rigid sphere with loose grains on top. Because it spins once per orbit, grains lift off slightly outside the 1.26 limit, near $3^{1/3} \\approx 1.44$ in the same units, and the scene shows both lines. Real solid bodies also have material strength.</p>
<p>The Locking view's spin-down runs on a made-up clock with a simple friction law. Nobody knows exactly how long the Moon took to lock. The day-length counter uses angular momentum conservation with the Moon's distance interpolated in a straight line between 620 million years ago and today. It ignores the Sun's tidal torque and changes in Earth's shape.</p>`,
  further: [
    { label: 'Roche limit on Wikipedia', url: 'https://en.wikipedia.org/wiki/Roche_limit' },
    { label: 'Williams (2000), Geological constraints on the Precambrian history of Earth’s rotation and the Moon’s orbit', url: 'https://doi.org/10.1029/1998RG900016' },
    { label: 'Dickey et al. (1994), Lunar Laser Ranging: a continuing legacy of the Apollo program', url: 'https://doi.org/10.1126/science.265.5171.482' },
    { label: 'Iess et al. (2019), Measurement and implications of Saturn’s gravity field and ring mass', url: 'https://doi.org/10.1126/science.aat2965' },
  ],
};
