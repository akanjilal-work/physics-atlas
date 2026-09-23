import type { TopicContent } from '../../core/types.ts';

export const content: TopicContent = {
  intuition: `
<p class="lead">Two twins say goodbye. One stays on Earth. The other flies to a distant star at high speed and comes straight back. When they meet again, the traveller is younger. Not by a trick of light or a slow watch. Their bodies really have lived through fewer years.</p>
<p>Here is the puzzle. Motion is relative. From the ship, it is Earth that rushes away and comes back. So why can't the traveller say the Earth twin is the young one? Somebody has to be wrong, and relativity says nobody is. That is the paradox.</p>
<p>The answer is that the two twins are <strong>not in the same situation</strong>. The Earth twin sits in one steady frame the whole time. The traveller has to turn around. Going out, they ride one frame. Coming back, they ride a different one. That switch is what breaks the symmetry.</p>
<p>The scene is a <strong>spacetime diagram</strong>. Time runs up, distance runs sideways, and light moves at 45°. Earth's path, its <em>worldline</em>, is the straight cyan line. The traveller's path is the bent amber line. Dots mark birthdays on each twin's own clock. Count them. The amber line has fewer.</p>
<p>The pink lines show what the traveller calls “now” back on Earth. Watch them at the turnaround. They swing up Earth's line and skip a big stretch of Earth's history. That jump is where the “missing” years hide.</p>
<p>Below the diagram, a small ship flies out and back while the two floating clocks count years. At the top, the reunion label gives the final score.</p>`,
  tryFirst: [
    'Let the trip play to the end. At β = 0.8 and 4 light-years, Earth ages 10 years and the traveller only 6.',
    'Turn on <b>Birthday pulses</b>. On the way out the traveller hears Earth birthdays slowly. On the way back they pour in. Both twins agree on every count.',
    'Switch the <b>Turnaround</b> to <b>Constant acceleration</b>. The corner becomes a smooth curve, and the pink “now” lines fan across Earth time instead of jumping.',
    'Press <b>Galactic centre at 1 g</b>. The traveller gets there and back in about 40 years of their own life. Earth waits over 53,000.',
  ],
  equation: {
    tex: '\\tau = \\int \\sqrt{1 - \\frac{v(t)^2}{c^2}}\\;dt',
    caption: 'Proper time. Each twin\'s clock adds up the time along their own path. Moving fast shrinks every slice of it. The Earth twin has v = 0, so their τ is just t.',
    terms: [
      { tex: '\\tau', name: 'Proper time', meaning: 'The years the traveller actually lives, measured by any clock they carry.', param: 'tauTrav' },
      { tex: 'dt', name: 'Earth time', meaning: 'Slices of time in Earth\'s frame. Adding them all up gives the Earth twin\'s age $T$.', param: 'tEarth' },
      { tex: 'v(t)', name: 'Speed profile', meaning: 'How fast the traveller moves at each moment. Set by the cruise speed, the distance, and the acceleration.', param: 'beta' },
      { tex: '\\sqrt{1 - v^2/c^2}', name: 'Clock rate', meaning: 'How fast the traveller\'s clock runs compared with Earth\'s. It equals $1/\\gamma$. At cruise it is fixed by the γ readout.', param: 'gamma' },
      { tex: 'T - \\tau', name: 'Age gap', meaning: 'Not in the equation itself, but the point of it. The integral is always less than $T$ for any path that moves.', param: 'gap' },
      { tex: 'a', name: 'Acceleration', meaning: 'In the smooth mode it shapes $v(t)$ near the start, the turn, and the end. It sets how fast the speed changes, not how fast the clock runs.', param: 'a' },
    ],
  },
  physicsNotes: `
<h3>The instant turnaround</h3>
<p>Fly out at speed $\\beta$ to distance $D$ and straight back. Earth waits $T = 2D/\\beta$. The speed is constant on each leg, so the integral is easy:</p>
$$\\tau = \\frac{T}{\\gamma} = T\\sqrt{1-\\beta^2}$$
<p>At $\\beta = 0.8$, $\\gamma = 5/3$. With $D = 4$ light-years, $T = 10$ years and $\\tau = 6$ years.</p>
<h3>Constant proper acceleration</h3>
<p>A ship that feels a steady push $a$ does not gain speed at a steady rate. Its <em>rapidity</em> $\\eta = \\operatorname{atanh}\\beta$ grows steadily instead: $\\eta = a\\tau$. Starting from rest at Earth, the path is a hyperbola:</p>
$$t = \\frac{1}{a}\\sinh(a\\tau), \\qquad x = \\frac{1}{a}\\big(\\cosh(a\\tau) - 1\\big)$$
<p>Invert the first one and you get the traveller's clock after Earth time $t$: $\\tau = \\frac1a \\operatorname{asinh}(at)$. The simulation builds the whole trip out of these pieces. Burn, coast, burn to a stop, burn back, coast, burn to a stop. Every position and clock reading comes from exact formulas, not from stepping a solver.</p>
<p>The readout <b>∫√(1−v²)dt vs exact</b> checks the headline equation directly. It integrates the speed profile numerically with Simpson's rule and compares with the closed form.</p>
<h3>Units</h3>
<p>Everything uses $c = 1$. Time is in years and distance in light-years. One $g$ is $9.81\\ \\text{m/s}^2$, which is almost exactly $1.03$ light-years per year squared. That coincidence is why a 1 g ship reaches near light speed in about a year of ship time.</p>`,
  deep: [
    {
      title: 'Why it is not symmetric',
      html: `<p>Relativity says every <em>inertial</em> observer, one who feels no force, can call themselves at rest. The Earth twin is inertial the whole time (we ignore Earth's gravity and orbit here). The traveller is not. To come home they must change from the outbound frame to the inbound frame. They feel it. A cup on the ship's table would slide.</p>
<p>But acceleration is not what ages you. Switch to <b>Constant acceleration</b> and look at the readout <b>gap earned while coasting</b>. For a long trip with short burns it is most of the gap. Stretch the coasting phase and the gap grows. Raise $a$ so the burns get shorter and the gap settles toward the instant-turnaround value. A harder push does not add extra ageing. The burns matter because they change which path you take through spacetime. The clock rate itself only depends on speed.</p>
<p>This is the <em>clock hypothesis</em>. An ideal clock's rate depends on its speed alone, never on its acceleration. Muons in storage rings, pushed around a circle with about $10^{18}\\,g$, confirm it (see the evidence section).</p>`,
    },
    {
      title: 'Three ways to see the missing years',
      html: `<p><strong>1. The jump in “now”.</strong> On the way out, the traveller's line of simultaneity tilts up with slope $\\beta$. On the way back it tilts down. At an instant turnaround the traveller's “now” on Earth jumps by</p>
$$\\Delta t_{\\text{jump}} = 2\\beta D.$$
<p>For $\\beta = 0.8$ and $D = 4$ that is 6.4 years. On each leg the traveller reckons that Earth clocks run slow, by the same factor $\\gamma$ that Earth sees for them. There is no contradiction until the turnaround, and then the jump makes up the difference. The pink band on Earth's worldline shows it.</p>
<p><strong>2. Counting birthday pulses.</strong> Each twin sends a flash of light every year of their own life. Nothing about this depends on simultaneity. A receding source's flashes arrive stretched by the Doppler factor, and an approaching one's arrive squeezed:</p>
$$\\text{receding: } \\sqrt{\\frac{1-\\beta}{1+\\beta}}, \\qquad \\text{approaching: } \\sqrt{\\frac{1+\\beta}{1-\\beta}}.$$
<p>The difference is <em>when</em> each twin hears the switch. The traveller hears the fast rate from the turnaround onward, so half of their trip. Earth only hears it once the light from the turnaround gets home, near the very end. At $\\beta = 0.8$ the factors are $1/3$ and $3$. The traveller hears $3 \\times \\tfrac13 + 3 \\times 3 = 10$ Earth birthdays. Earth hears $9 \\times \\tfrac13 + 1 \\times 3 = 6$ from the traveller. Both counts match the ages exactly.</p>
<p><strong>3. Proper time is path length.</strong> The equation at the top is a length. In ordinary flat space, the straight line between two points is the shortest path. In spacetime the minus sign flips it. The straight worldline between two events has the <em>longest</em> proper time. Any detour, however it is shaped, ages you less. It is the triangle inequality run backwards:</p>
$$\\tau_{AC} \\;\\ge\\; \\tau_{AB} + \\tau_{BC}.$$
<p>Turn on <b>Hyperbolae of equal proper time</b>. Each green curve collects every event that is a given number of proper years from departure. The traveller's outbound birthdays sit on them. Earth's straight line climbs through them fastest.</p>`,
    },
    {
      title: 'Real trips at 1 g',
      html: `<p>A ship that pushes at a comfortable $1\\,g$ the whole way, accelerating for the first half and braking for the second, covers distance $d$ in ship time</p>
$$\\tau = \\frac{2}{a}\\operatorname{acosh}\\!\\Big(1 + \\frac{a d}{2}\\Big).$$
<p><strong>Alpha Centauri</strong>, 4.37 light-years away, takes about 3.6 years of ship time and 6.0 years of Earth time one way. The round trip is 7.2 years for the crew and 12.0 for Earth. Peak speed is 0.95 c.</p>
<p><strong>The galactic centre</strong>, about 26,700 light-years away, takes only about 20 years of ship time one way. The crew would come home after 40 years of their own lives to find more than 53,000 years had passed. Peak $\\gamma$ is near 14,000. Both presets in the panel run these trips.</p>
<p>These numbers ignore fuel. A perfect photon rocket needs a mass ratio of $e^{\\eta}$ for each burn, where $\\eta$ is the rapidity gained. For Alpha Centauri that is about 6.4 per burn, so about 1,600 for the four burns of the round trip. For the galactic centre it is about 27,500 per burn. The physics of time is solid. The engineering is not.</p>`,
    },
    {
      title: 'Evidence: flying clocks, spinning muons and GPS',
      html: `<p><strong>Hafele–Keating (1971).</strong> Four caesium clocks flew around the world twice on airliners, once eastward and once westward, and were compared with clocks at the US Naval Observatory. The eastward clocks lost about 59 ns and the westward ones gained about 273 ns. Theory predicted −40 ± 23 ns and +275 ± 21 ns. The results combine speed effects with gravity, since the planes flew higher than the ground clocks. It is a literal round-trip twin experiment.</p>
<p><strong>Muon storage ring (CERN, 1977).</strong> Bailey and colleagues circulated muons at $\\gamma \\approx 29.3$ in a ring 14 m across. At rest a muon lives 2.2 μs. In the ring they lived 64.4 μs, matching $\\gamma$ to about one part in a thousand. The muons were constantly accelerated toward the centre, about $10^{18}\\,g$, yet their clocks ran slow by the speed factor only. They are travelling twins that come back every lap.</p>
<p><strong>GPS.</strong> Satellite clocks move at about 3.9 km/s, so speed alone slows them by about 7 μs per day. Weaker gravity at their altitude speeds them up by about 45 μs per day. The net +38 μs per day is built into the satellite clock rates before launch. Without it, positions would drift by kilometres per day.</p>`,
    },
    {
      title: 'Edge cases and common objections',
      html: `<p><strong>“Just use the traveller's frame.”</strong> There is no single inertial traveller frame for the whole trip. You can build an accelerated frame for the traveller. In it, a uniform “gravitational field” appears during the burns, and Earth clocks, high up in that field, run fast. That gives the same answer. It is a consistent description, but it needs more care than the Earth frame.</p>
<p><strong>Light-speed limit.</strong> As $\\beta \\to 1$, the amber path hugs the violet light lines and $\\tau \\to 0$. Light itself ages not at all between emission and absorption. The violet diamond marks the edge: every possible round trip lies inside it.</p>
<p><strong>Where the lines of “now” cross.</strong> Far behind an accelerating ship, its lines of simultaneity would cross each other and even run Earth's time backwards. That happens beyond a distance of $c^2/a$ (about one light-year at 1 g) on the far side of the push. In the trips shown here Earth is always on the near side, so Earth's “now” only moves forward.</p>`,
    },
  ],
  challenges: [
    {
      id: 'ten-years',
      title: 'A decade younger',
      prompt: 'Set up a trip where the traveller comes home at least 10 years younger than the Earth twin.',
      hint: 'Either go faster or go farther. At β = 0.8 the traveller keeps 60% of Earth time, so you need Earth to age at least 25 years.',
      check: (s) => (s.finalGap as number) >= 10,
    },
    {
      id: 'double',
      title: 'Exactly twice',
      prompt: 'Make Earth age exactly twice as much as the traveller (ratio 2 ± 0.02).',
      hint: 'In the instant mode the ratio is just γ. Solve $\\gamma = 2$ for β. It is $\\sqrt{3}/2$.',
      check: (s) => Math.abs((s.ratio as number) - 2) <= 0.02,
    },
    {
      id: 'one-g',
      title: 'Ride at 1 g',
      prompt: 'Complete a constant-acceleration trip at 1 g to a turnaround at least 4 light-years away.',
      hint: 'Switch the turnaround to Constant acceleration, keep a at 1.00 g, set D to 4 ly or more, and let it play to reunion. Raise the playback speed if you are impatient.',
      check: (s) => s.mode === 'accel' && Math.abs((s.a as number) - 1) <= 0.025 && (s.D as number) >= 4 && s.completed === true,
    },
    {
      id: 'count',
      title: 'Count the birthdays',
      prompt: 'With birthday pulses shown, play a trip to reunion. Check that each twin receives exactly as many pulses as the other twin has aged in whole years.',
      hint: 'Turn on Birthday pulses and press Play. Watch the two pulse readouts at reunion. Compare them with the two ages.',
      check: (s) =>
        s.completed === true && s.pulses === true &&
        s.rxTrav === Math.floor((s.T as number) + 1e-9) && s.rxEarth === Math.floor((s.tauTotal as number) + 1e-9),
    },
  ],
  caveats: `<p>This is special relativity in flat spacetime. There is no gravity, so Earth's own gravity, its orbit around the Sun, and the pull of the destination star are all left out. The motion is one-dimensional, straight out and straight back.</p>
<p>The instant turnaround is an idealisation. No real ship can reverse its velocity in zero time. The smooth mode uses constant proper acceleration, which is the simplest realistic profile, but it ignores the fuel needed to sustain it. The twins are treated as ideal clocks whose rate depends only on speed. Experiments support this, but real bodies at 1 g for decades would face radiation, dust impacts and much else.</p>`,
  further: [
    { label: 'Taylor & Wheeler, Spacetime Physics (textbook)', url: 'https://www.eftaylor.com/spacetimephysics/' },
    { label: 'Hafele & Keating, Around-the-World Atomic Clocks (Science, 1972)', url: 'https://doi.org/10.1126/science.177.4044.166' },
    { label: 'Bailey et al., Measurements of relativistic time dilatation for positive and negative muons (Nature, 1977)', url: 'https://doi.org/10.1038/268301a0' },
    { label: 'The relativistic rocket (Usenet Physics FAQ)', url: 'https://math.ucr.edu/home/baez/physics/Relativity/SR/Rocket/rocket.html' },
    { label: 'Twin paradox on Wikipedia', url: 'https://en.wikipedia.org/wiki/Twin_paradox' },
  ],
};
