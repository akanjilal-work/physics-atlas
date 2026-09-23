import type { TopicContent } from '../../core/types.ts';

export const content: TopicContent = {
  intuition: `
<p class="lead">In 1905 Einstein started from two simple claims. The laws of physics are the same for everyone moving steadily. And everyone measures the same speed of light, no matter how fast they move. Take both seriously and time itself has to bend.</p>
<p>The scene is a <strong>spacetime diagram</strong>. Time runs up. Two directions of space lie flat. A light flash from the centre spreads as a growing circle, so over time it sweeps out a <strong>cone</strong>. Nothing can travel faster than light, so nothing can leave that cone.</p>
<p>Two people start at the centre. The cyan one stays at rest, so their path through spacetime, their <em>worldline</em>, goes straight up. The amber one flies off in a rocket, so their worldline tilts. The dots on each line mark one second on that person's own watch. <strong>The rocket's dots are spaced farther apart.</strong> Its clock ticks slower as seen from the ground.</p>
<p>The green curves connect all events that are the same amount of watch time from the start. Both people's dots land on the same curves. Neither watch is broken. They simply took different routes through spacetime.</p>
<p>The flat sheets are each person's <strong>“now”</strong>. The rest observer's “now” is level. The rocket's “now” is tilted. Two lightning bolts strike at the same moment for the ground. On the rocket's tilted sheet, the bolt in front has already struck and the one behind has not. Who is right? Both are. Turn on <strong>Boosted view</strong> and the whole picture shifts into the rocket's point of view. The light cone does not move at all.</p>`,
  tryFirst: [
    'Drag <b>β</b> toward 0.9 and watch the amber tick marks spread out along the tilted worldline.',
    'Switch on <b>Boosted view</b>. Every event slides into the rocket frame. The rocket stands upright, the light cone stays put, and the front lightning strike drops below the rear one.',
    'Turn on <b>Hyperbolae</b> and check that each tick, cyan or amber, sits on a green curve.',
    'Change <b>View</b> to <b>Light clock</b>. The moving photon runs a longer zig-zag path, so the moving clock counts fewer ticks.',
  ],
  equation: {
    tex: '(c\\,\\Delta\\tau)^2 = (c\\,\\Delta t)^2 - \\Delta x^2 - \\Delta y^2',
    caption: 'The spacetime interval. Observers disagree about time and distance separately, but they all agree on this combination. It is the proper time a clock measures between two events.',
    terms: [
      { tex: '\\Delta\\tau', name: 'Proper time', meaning: 'Time ticked off by a clock that travels between the two events. For the rocket, $\\Delta\\tau = \\Delta t/\\gamma$.', param: 'tau' },
      { tex: '\\Delta t', name: 'Coordinate time', meaning: 'Time between the events on the rest observer\'s clock.', param: 't' },
      { tex: '\\Delta x', name: 'Distance along x', meaning: 'How far the rocket moves in that time. $\\Delta x = \\beta c\\,\\Delta t$, set by the speed slider.', param: 'beta' },
      { tex: '\\Delta y', name: 'Distance along y', meaning: 'The second space direction. Boosts along x leave it unchanged.' },
      { tex: 'c', name: 'Speed of light', meaning: 'The same for everyone. The light cone is the set of events with zero interval from the origin. It never changes under a boost.', param: 'cone' },
    ],
  },
  physicsNotes: `
<h3>The Lorentz factor</h3>
<p>For a clock moving at $v = \\beta c$, put $\\Delta x = \\beta c\\,\\Delta t$ and $\\Delta y = 0$ into the interval:</p>
$$c^2\\Delta\\tau^2 = c^2\\Delta t^2(1-\\beta^2) \\quad\\Rightarrow\\quad \\Delta\\tau = \\frac{\\Delta t}{\\gamma}, \\qquad \\gamma = \\frac{1}{\\sqrt{1-\\beta^2}}$$
<p>At $\\beta = 0.6$, $\\gamma = 1.25$. At $\\beta = 0.8$, $\\gamma = 5/3$. At $\\beta = 0.99$, $\\gamma \\approx 7.09$. As $\\beta$ approaches 1, $\\gamma$ grows without limit.</p>
<h3>The Lorentz transformation</h3>
<p>An event at $(t, x, y)$ for the rest observer sits at $(t', x', y')$ for a rocket moving at $\\beta$ along $x$:</p>
$$ct' = \\gamma\\,(ct - \\beta x), \\qquad x' = \\gamma\\,(x - \\beta ct), \\qquad y' = y$$
<p>Plug these into the interval and the $\\gamma$ and $\\beta$ terms cancel. That is why every observer agrees on $\\Delta\\tau$, and why the light cone ($\\Delta\\tau = 0$) is the same for all. The Boosted view applies exactly this map to every event in the scene.</p>
<h3>Reading the diagram</h3>
<p>Units have $c = 1$: one grid square is one light-second across and one second tall. Light moves at 45°. A worldline steeper than 45° is slower than light. The rocket's plane of simultaneity is the set $t' = \\text{const}$. In rest coordinates that is $ct = \\beta x + ct'/\\gamma$, a plane tilted by the same angle as the worldline, mirrored across the light cone.</p>`,
  deep: [
    {
      title: 'Two postulates and the light clock',
      html: `<p>Einstein's postulates:</p>
<ol><li>The laws of physics take the same form in every inertial frame.</li><li>The speed of light in vacuum is the same, $c$, in every inertial frame.</li></ol>
<p>Now build a clock from light. Two mirrors face each other a distance $D$ apart. A photon bounces between them. One tick is one round trip.</p>
<ol>
<li>In the clock's own frame the photon goes straight up and down. A one-way trip takes $\\Delta\\tau = D/c$.</li>
<li>Watch the same clock fly past at speed $v$. During one trip the mirrors move sideways by $v\\,\\Delta t$. The photon must follow a slanted path to meet them.</li>
<li>That path is the hypotenuse of a right triangle with sides $D$ and $v\\,\\Delta t$. Its length is $c\\,\\Delta t$, because light still moves at $c$ (postulate 2).</li>
<li>Pythagoras gives $(c\\,\\Delta t)^2 = D^2 + (v\\,\\Delta t)^2$.</li>
<li>Replace $D$ with $c\\,\\Delta\\tau$ and solve: $\\Delta t = \\Delta\\tau / \\sqrt{1 - v^2/c^2} = \\gamma\\,\\Delta\\tau$.</li>
</ol>
<p>The moving clock takes longer per tick. By postulate 1, any other kind of clock riding along must agree with the light clock, or you could tell you were moving. So all moving clocks run slow, including hearts and atoms. Step 4 rearranged is the headline interval.</p>`,
    },
    {
      title: 'Relativity of simultaneity: the train and the lightning',
      html: `<p>A train rushes along a platform. Lightning hits the front and the back of the train at the same moment, as judged by someone on the platform. That observer stands halfway between the strikes, and both flashes reach them together.</p>
<p>A passenger sits at the middle of the train. While the light travels, the passenger moves toward the front flash and away from the rear one. So the front flash reaches them first. Light moves at $c$ in the train frame too, and the passenger was at the midpoint. So the passenger must conclude that the front strike really did happen first.</p>
<p>For strikes a distance $\\Delta x$ apart that are simultaneous on the platform, the Lorentz transformation gives the time gap on the train:</p>
$$\\Delta t' = -\\gamma\\,\\beta\\,\\Delta x / c$$
<p>In the scene the strikes are 4 light-seconds apart. At $\\beta = 0.6$ the front strike leads by 3 seconds. The gap readout shows this, and the Boosted view shows it directly. No signal could link the two strikes, since they lie outside each other's light cones. So the order never causes a paradox.</p>`,
    },
    {
      title: 'Length contraction',
      html: `<p>To measure a moving rod, you mark both of its ends <em>at the same time</em>. But “the same time” depends on the frame. Mark the ends simultaneously in the rest frame and you find the length</p>
$$L = \\frac{L_0}{\\gamma}$$
<p>where $L_0$ is the length in the rod's own frame. Only the direction of motion shrinks. Sizes across the motion stay the same, which is why $y' = y$.</p>
<p>In the Light clock view the moving clock's body is drawn at $L_0/\\gamma$. The mirror gap does not shrink, because it lies across the motion. At $\\beta = 0.8$ the moving clock is 60% as wide as the one at rest.</p>`,
    },
    {
      title: 'Why nothing outruns light',
      html: `<p>Pick two events. If one lies inside the other's light cone, the interval is positive. Every observer agrees on which came first, and one can cause the other. If they lie outside each other's cones, the interval is negative. A suitable boost can reverse their order.</p>
<p>A signal faster than light would link two such events. Then some observer would see the effect before the cause. With a second fast signal you could send a message into your own past. Relativity avoids this by making $c$ a limit. The energy of a massive object is $\\gamma m c^2$, which grows without bound as $v \\to c$.</p>
<p>Velocities also add in a way that respects the limit. If the rocket fires a probe at speed $u'$ forward, the ground sees</p>
$$u = \\frac{u' + v}{1 + u'v/c^2}$$
<p>So $0.5c$ plus $0.5c$ gives $0.8c$, and $0.9c$ plus $0.9c$ gives about $0.994c$. Adding $c$ to anything gives $c$. In the diagram, two boosts in a row equal one boost with the combined speed. The light cone never tips over.</p>`,
    },
    {
      title: 'Evidence: muons, flying clocks and GPS',
      html: `<p><strong>Muons.</strong> Cosmic rays create muons high in the atmosphere. At rest, a muon lives about 2.2 microseconds on average. Even at nearly $c$ that is only about 660 m of travel. Yet plenty reach sea level. In 1963 Frisch and Smith counted about 560 muons per hour on Mount Washington, 1,900 m up, and about 410 per hour at sea level. Without time dilation only a few dozen should have survived the trip. The numbers fit $\\gamma \\approx 9$.</p>
<p><strong>Hafele–Keating, 1971.</strong> Four caesium atomic clocks flew around the world on commercial jets, once eastward and once westward, then were compared with clocks at the US Naval Observatory. The eastward clocks lost about 59 nanoseconds and the westward clocks gained about 273. Predictions that combine special relativity with gravity's effect matched within the error bars.</p>
<p><strong>GPS.</strong> Satellites orbit at about 3.9 km/s. Special relativity makes their clocks lose about 7 microseconds per day. They also sit higher in Earth's gravity, and general relativity makes them gain about 45 microseconds per day. The net is about +38 microseconds per day. The satellite clocks are tuned slightly slow before launch to cancel it. Left alone, the error would grow at about 10 km of position per day.</p>`,
    },
  ],
  challenges: [
    {
      id: 'gamma2',
      title: 'Double the factor',
      prompt: 'Reach a Lorentz factor of $\\gamma \\geq 2$.',
      hint: 'Solve $1/\\sqrt{1-\\beta^2} = 2$. You need $\\beta \\geq \\sqrt3/2 \\approx 0.87$.',
      check: (s) => (s.gamma as number) >= 2,
    },
    {
      id: 'half',
      title: 'Half the time',
      prompt: 'Make the rocket clock read less than half of the rest clock, with more than 1 second on the rest clock.',
      hint: 'You need $\\tau/t = 1/\\gamma \\leq 0.5$. Keep the Boosted view off, or use the Light clock view, and let time run.',
      check: (s) => (s.t as number) > 1 && (s.ratio as number) <= 0.5,
    },
    {
      id: 'front',
      title: 'Front strike first',
      prompt: 'With the lightning shown and $\\beta \\geq 0.5$, switch to the rocket frame and see the front strike happen first.',
      hint: 'Turn on Lightning and Boosted view. After the transition, the front strike sits lower in the diagram, so it is earlier.',
      check: (s) => s.frontFirst === true && (s.beta as number) >= 0.5,
    },
    {
      id: 'sixty',
      title: 'Sixty percent',
      prompt: 'Set the speed so a moving object is contracted to 60% of its rest length.',
      hint: 'You need $1/\\gamma = 0.6$, so $\\gamma = 5/3$. That is a 3-4-5 triangle.',
      check: (s) => Math.abs((s.contraction as number) - 0.6) <= 0.01,
    },
  ],
  caveats: `<p>The scene shows flat spacetime only. Gravity is left out, so this is special relativity and not general relativity. The GPS numbers above need both.</p>
<p>Both observers move at constant speed forever. There are no acceleration phases, so the rocket never turns around and the twin paradox is not shown here.</p>
<p>The diagram shows where and when events happen, not what anyone would see. A real fast traveller would also see light bent toward the direction of motion (aberration), colours shifted (Doppler effect) and brightness changed. None of those visual effects are drawn. Only one space direction takes part in the boost, and the third space dimension is left out so time can point up.</p>`,
  further: [
    { label: 'Einstein, On the Electrodynamics of Moving Bodies (1905, English)', url: 'https://www.fourmilab.ch/etexts/einstein/specrel/www/' },
    { label: 'Taylor and Wheeler, Spacetime Physics (free PDF)', url: 'https://www.eftaylor.com/spacetimephysics/' },
    { label: 'Frisch and Smith, Measurement of the Relativistic Time Dilation Using μ-Mesons (1963)', url: 'https://doi.org/10.1119/1.1969340' },
    { label: 'Ashby, Relativity in the Global Positioning System (Living Reviews)', url: 'https://doi.org/10.12942/lrr-2003-1' },
  ],
};
