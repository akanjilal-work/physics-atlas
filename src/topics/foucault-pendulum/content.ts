import type { TopicContent } from '../../core/types.ts';

export const content: TopicContent = {
  intuition: `
<p class="lead">Hang a heavy ball on a very long wire and set it swinging. Leave it for an hour. The line it swings along has turned, and nobody touched it.</p>
<p>In 1851 Léon Foucault did exactly this in Paris. Nothing pushed the pendulum sideways. The swing kept its direction in space, and <strong>the floor turned underneath it</strong>, because the floor is fixed to a spinning Earth. It became the most famous proof that the Earth spins, done indoors without looking at the sky.</p>
<p>The scene shows a pendulum in a domed hall like the Panthéon. As the bob swings it draws a trace in the sand. Watch the trace fan out into a star. Around the edge stands a ring of small pegs. One by one the swinging bob knocks them over as its plane creeps round.</p>
<p>The surprise is the speed. At the North Pole the plane turns once per day. In Paris it takes about 32 hours. At the equator it does not turn at all. The rate depends on how much of the Earth's spin points straight up where you stand, and that is set by your latitude.</p>
<p>Real Earth rotation is slow, so the scene has two dials. <b>Time acceleration</b> runs the clock faster. <b>Exaggerated Ω</b> spins the Earth faster than reality so the star pattern appears within seconds. Set it back to 1× for the true effect.</p>`,
  tryFirst: [
    'Watch the sand trace. Each new swing is drawn slightly clockwise from the last. The cyan dashed line is the prediction $\\Omega\\sin\\varphi$.',
    'Switch the frame to <b>Inertial view</b>. Now the swing stays put and the floor, pegs and sand turn beneath it.',
    'Press the <b>Equator</b> preset. The trace stays a single line forever.',
    'Press <b>Sydney</b>. The star now grows counterclockwise.',
  ],
  equation: {
    tex: '\\omega_{\\text{precession}} = \\Omega_\\oplus \\sin\\varphi',
    caption: 'The swing plane turns at the local vertical part of the Earth’s spin. Clockwise seen from above in the north, counterclockwise in the south.',
    terms: [
      { tex: '\\omega_{\\text{precession}}', name: 'Precession rate', meaning: 'How fast the swing plane turns relative to the floor. The readouts give it as a period: predicted, and measured from the simulation.', param: 'Tmeas' },
      { tex: '\\Omega_\\oplus', name: 'Earth’s spin', meaning: '$7.2921\\times10^{-5}$ rad/s, one turn per sidereal day of 23.934 h. The exaggeration slider multiplies it.', param: 'exag' },
      { tex: '\\sin\\varphi', name: 'Latitude factor', meaning: 'The share of the Earth’s spin that points along your local vertical. 1 at the North Pole, 0 at the equator, negative in the south.', param: 'lat' },
      { tex: 'T = \\dfrac{23.934\\ \\text{h}}{\\sin\\varphi}', name: 'Precession period', meaning: 'The time for one full turn of the plane. About 31.8 h in Paris.', param: 'Tpred' },
    ],
  },
  physicsNotes: `
<h3>Newton's law on a turning floor</h3>
<p>Work in coordinates fixed to the ground: $x$ east, $y$ north, $z$ up. The ground turns with angular velocity $\\vec\\Omega = \\Omega(0, \\cos\\varphi, \\sin\\varphi)$. Newton's law picks up two extra terms:</p>
$$\\ddot{\\vec r} = \\vec g - 2\\,\\vec\\Omega\\times\\dot{\\vec r} - \\vec\\Omega\\times(\\vec\\Omega\\times\\vec r) + \\lambda\\,\\vec r$$
<p>The first extra term is the <strong>Coriolis</strong> force. The second is the <strong>centrifugal</strong> force. The last term is the wire tension, which keeps the bob at distance $L$ from the pivot.</p>
<h3>Why only $\\sin\\varphi$ matters</h3>
<p>For small swings the bob moves almost horizontally. The Coriolis force on a horizontal velocity has a horizontal part set only by $\\Omega_z = \\Omega\\sin\\varphi$:</p>
$$\\ddot x = -\\omega_0^2 x + 2\\Omega_z \\dot y, \\qquad \\ddot y = -\\omega_0^2 y - 2\\Omega_z \\dot x, \\qquad \\omega_0^2 = g/L$$
<p>In a frame turning at $-\\Omega_z$ about the vertical these become two plain, uncoupled oscillators. So the swing is an ordinary pendulum in that frame, and seen from the ground its plane turns at $-\\Omega_z$. The horizontal part of $\\vec\\Omega$ only pushes the bob up and down a tiny amount.</p>
<h3>How the simulation works</h3>
<p>The browser integrates the full 3D equation above, not the small-swing version, with fourth-order Runge–Kutta at 200 steps per swing. The tension $\\lambda$ is solved at every step. The swing plane is measured from the principal axis of $\\omega_0^2\\,\\vec r\\vec r + \\vec u\\vec u$, where $\\vec u$ is the horizontal velocity seen from the non-turning frame. The honesty check is the <strong>Jacobi integral</strong>, the energy that is conserved on a steadily turning floor:</p>
$$J = \\tfrac12 |\\dot{\\vec r}|^2 + g z - \\tfrac12 |\\vec\\Omega\\times\\vec r|^2$$`,
  deep: [
    {
      title: 'Foucault in 1851',
      html: `<p>Léon Foucault first tried the experiment in his cellar in early 1851, with a wire about 2 m long. In February 1851 he showed an 11 m pendulum in the Meridian Room of the Paris Observatory. A few weeks later he hung a 28 kg bob on a 67 m wire from the dome of the Panthéon. That pendulum swings once every 16.4 s, and its plane turns about 11.3° per hour, a full circle in about 31.8 h.</p>
<p>Check the number: $23.934\\ \\text{h} / \\sin 48.85^\\circ = 23.934 / 0.7530 = 31.79\\ \\text{h}$. The Try It challenge asks you to measure it.</p>
<p>A long wire and a heavy bob matter in practice. A long wire gives a slow swing that loses little energy per cycle. A heavy bob is hard for air currents to push. Real Foucault pendulums also need care at the pivot, because any preferred direction there makes the swing elliptical and adds a false precession.</p>`,
    },
    {
      title: 'Why sin(latitude): two pictures',
      html: `<p><strong>The spin-vector picture.</strong> The Earth's spin vector points along its axis. Split it into a part along your local vertical, $\\Omega\\sin\\varphi$, and a part along the ground pointing north, $\\Omega\\cos\\varphi$. Your floor turns about the vertical at $\\Omega\\sin\\varphi$, like a record player. The northward part tilts the floor over the course of a day, but it does not twist it under the pendulum. At the pole the floor is a full turntable. At the equator it only tilts.</p>
<p><strong>The geometric picture.</strong> Carry an arrow around a circle of latitude, always keeping it as parallel as the curved surface allows. This is called parallel transport. When you get back, the arrow has turned by the solid angle of the polar cap inside your circle, $2\\pi(1-\\sin\\varphi)$. Relative to the local compass directions this is a turn of $-2\\pi\\sin\\varphi$ per day. For a slow spin, the swing plane behaves like such a transported arrow. Its daily turn is a property of the curved Earth, called <em>holonomy</em>, and not of the pendulum.</p>
<p>The globe in the corner shows your site riding round its latitude circle, with the amber arrow for the local vertical.</p>`,
    },
    {
      title: 'Edge cases: equator, south, and big swings',
      html: `<p><strong>Equator.</strong> The Earth's spin lies flat along the ground, so $\\sin\\varphi = 0$ and the plane does not turn. The simulation shows a tiny wobble from second-order effects of the swing, well below 0.1% of the Paris rate.</p>
<p><strong>Southern hemisphere.</strong> $\\sin\\varphi$ changes sign, so the plane turns counterclockwise. The same geometry holds, but the spin now points down into the floor instead of up out of it.</p>
<p><strong>Big swings.</strong> A released pendulum does not move in a perfect straight line. Coriolis gives it a thin ellipse with width about $(\\Omega_z/\\omega_0)$ times its length. A spherical pendulum on an ellipse precesses on its own, at a rate close to $\\tfrac38\\,\\omega_0\\,ab/L^2$ for semi-axes $a$ and $b$. For a release from rest this shifts the rate by a fraction of about $\\tfrac38\\theta_0^2$, where $\\theta_0$ is the release angle in radians. At 4° that is 0.2%, which is why the measured period sits slightly off the prediction. Keep the swing small and the effect fades.</p>
<p><strong>Large exaggeration.</strong> When Ω is exaggerated by 1000× the centrifugal term makes the effective gravity slightly different in the north–south and east–west directions. The swing then turns a little elliptical and the measured rate drifts a few percent from $\\Omega\\sin\\varphi$. That is real physics of a fast-turning floor, not a bug.</p>`,
    },
    {
      title: 'Coriolis in the weather',
      html: `<p>The same factor $2\\Omega\\sin\\varphi$, called the Coriolis parameter $f$, steers the wind. Air flowing toward a low-pressure centre is deflected to the right in the north and to the left in the south. So hurricanes and other large storms spin counterclockwise in the north and clockwise in the south.</p>
<p>Because $f$ vanishes at the equator, tropical cyclones almost never form within about 5° of it. Near the equator there is nothing to start the spin.</p>
<p>Coriolis matters when a flow lasts long compared with a day and covers a large distance. The ratio of the two effects is the Rossby number $\\text{Ro} = U/(fL)$. For a storm hundreds of kilometres across, Ro is about 1 or less and rotation dominates.</p>`,
    },
    {
      title: 'The bathtub myth',
      html: `<p>You may have heard that sinks drain one way in the north and the other way in the south. For an ordinary sink this is false. Take water moving at 1 cm/s in a basin 30 cm wide. With $f \\approx 10^{-4}$ /s, the Rossby number is about 300. The Earth's effect is hundreds of times weaker than the swirl left over from filling the basin, the shape of the drain and a nudge of your hand.</p>
<p>It can be seen, but only with great care. In 1962 Ascher Shapiro at MIT used a large, symmetric tank and let the water settle for about a day before draining it. The vortex then turned counterclockwise, as Coriolis predicts in the north. A later experiment in Sydney found the opposite sense. Your kitchen sink is not that experiment.</p>`,
    },
  ],
  challenges: [
    {
      id: 'pole',
      title: 'One turn per sidereal day',
      prompt: 'Go to the North Pole with Ω at its real value (1×). Run until the plane has turned at least 15°, and get a measured period within 2% of 23.93 h.',
      hint: 'Press the North Pole preset, then Real Ω. Push the time acceleration to the top.',
      check: (s) => (s.lat as number) >= 89.5 && s.exag === 1 && Math.abs(s.rotDeg as number) >= 15 && Math.abs((s.Tmeas as number) / 23.934 - 1) < 0.02,
    },
    {
      id: 'equator',
      title: 'Nothing at the equator',
      prompt: 'At the equator, let the Earth turn through at least 90° while the swing plane turns less than 1°.',
      hint: 'Press the Equator preset. The globe shows how far the Earth has turned. Exaggerated Ω and time acceleration both help.',
      check: (s) => Math.abs(s.lat as number) < 0.5 && (s.earthDeg as number) >= 90 && Math.abs(s.rotDeg as number) < 1,
    },
    {
      id: 'south',
      title: 'Down under',
      prompt: 'Show that the plane turns the other way in the south. Get at least 30° of counterclockwise rotation at a southern latitude.',
      hint: 'Try the Sydney preset. Counterclockwise shows as "ccw" in the rotation readout.',
      check: (s) => (s.lat as number) < -5 && (s.rotDeg as number) <= -30,
    },
    {
      id: 'paris',
      title: 'Foucault’s number',
      prompt: 'In Paris with real Ω (1×), measure the precession period within 2% of 31.8 h. Let the plane turn at least 15° first.',
      hint: 'Press Paris, then Real Ω, then raise the time acceleration. 15° takes about 80 minutes of Earth time.',
      check: (s) => Math.abs((s.lat as number) - 48.85) < 0.3 && s.exag === 1 && Math.abs(s.rotDeg as number) >= 15 && Math.abs((s.Tmeas as number) / 31.8 - 1) < 0.02,
    },
  ],
  caveats: `<p>The pivot is perfect, and there is no air drag, so the swing never dies down. Real Foucault pendulums lose energy and need a gentle electromagnetic push, and a slightly uneven pivot makes them elliptical. The Earth is treated as a sphere turning at a steady rate, with gravity pointing straight down. The small wobble of Earth's axis and the Moon's tides are ignored.</p>
<p>The horizontal swing is drawn enlarged so that it fills the floor. The bob's angle from vertical is not to scale. The <b>Inertial view</b> removes only the vertical part of the Earth's spin. That is truly inertial at the poles. Elsewhere the floor still tilts slowly in space, which the view does not show.</p>
<p>Exaggerating Ω is a teaching device. Above a few hundred times, the centrifugal term starts to distort the swing, as described in the Deep Dive.</p>`,
  further: [
    { label: 'Foucault pendulum on Wikipedia', url: 'https://en.wikipedia.org/wiki/Foucault_pendulum' },
    { label: 'Coriolis force on Wikipedia', url: 'https://en.wikipedia.org/wiki/Coriolis_force' },
    { label: 'Holonomy and parallel transport on Wikipedia', url: 'https://en.wikipedia.org/wiki/Holonomy' },
    { label: 'Léon Foucault on Wikipedia', url: 'https://en.wikipedia.org/wiki/L%C3%A9on_Foucault' },
  ],
};
