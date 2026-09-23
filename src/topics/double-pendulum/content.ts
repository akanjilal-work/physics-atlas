import type { TopicContent } from '../../core/types.ts';

export const content: TopicContent = {
  intuition: `
<p class="lead">Hang a pendulum from the bottom of another pendulum and something strange happens. The rules stay simple, gravity and two rigid rods, yet the motion becomes wild and effectively unpredictable.</p>
<p>The scene shows <strong>two double pendulums</strong> released from almost exactly the same position. Pendulum B starts a tiny nudge $\\delta_0$ away from pendulum A. At first they move as one. Then, suddenly, they split and never agree again.</p>
<p>Nothing random is happening. Every step is fixed by Newton's laws. The problem is that <strong>any difference, however small, doubles again and again</strong>. A gap of a millionth of a radian grows to a full swing in seconds. That is what physicists mean by <em>chaos</em>: deterministic rules with sensitive dependence on the starting point.</p>
<blockquote>Chaos is when the present determines the future, but the approximate present does not approximately determine the future. <br/>Edward Lorenz</blockquote>
<p>The ring on the right is the pendulum's <strong>configuration space</strong>. Each arm angle wraps around a circle, and two circles together make the surface of a doughnut (a torus). Every possible pose of the pendulum is one point on that surface. Watch the two coloured dots start together and then wander to opposite sides.</p>
<p>This is why weather forecasts fade after about ten days, why planetary orbits cannot be predicted for billions of years, and why a real double pendulum never repeats the same dance twice.</p>`,
  tryFirst: [
    'Press <b>Reset</b> and watch the separation graph in the corner. On a log scale, steady doubling looks like a straight rising line.',
    'Drop both starting angles to about 10°. The two pendulums now stay together for as long as you like. Small swings are <em>not</em> chaotic.',
    'Switch <b>Experiment</b> to <b>Swarm</b>. Thirty-six pendulums start within a hair of each other and fan out like a peacock tail.',
    'Set the camera to <b>Torus</b> and follow the trajectory tangle across the doughnut.',
  ],
  equation: {
    tex: '\\left|\\delta(t)\\right| \\;\\approx\\; \\left|\\delta_0\\right|\\, e^{\\lambda t}',
    caption: 'The signature of chaos. A tiny initial difference grows exponentially until it is as large as the system itself.',
    terms: [
      { tex: '\\delta_0', name: 'Initial nudge', meaning: 'How far apart the two pendulums start, in radians. Set by the nudge slider.', param: 'delta' },
      { tex: '\\delta(t)', name: 'Separation', meaning: 'The largest angle difference between the two pendulums right now.', param: 'sep' },
      { tex: '\\lambda', name: 'Lyapunov exponent', meaning: 'The growth rate of small errors. Positive means chaos. Every $\\ln 2/\\lambda$ seconds the error doubles.', param: 'lyap' },
      { tex: 't', name: 'Time', meaning: 'Seconds since release.', param: 't' },
      { tex: 'E', name: 'Energy', meaning: 'With no friction, total energy stays constant, so the chaos is not coming from numerical drift. Watch the drift readout stay tiny.', param: 'energy' },
    ],
  },
  physicsNotes: `
<h3>Where the motion comes from</h3>
<p>The cleanest route is the Lagrangian $L = T - V$, kinetic minus potential energy. With point masses $m_1, m_2$ on rods $\\ell_1, \\ell_2$ and angles measured from straight down:</p>
$$T = \\tfrac12 (m_1+m_2)\\ell_1^2\\dot\\theta_1^2 + \\tfrac12 m_2 \\ell_2^2 \\dot\\theta_2^2 + m_2 \\ell_1 \\ell_2 \\dot\\theta_1 \\dot\\theta_2 \\cos(\\theta_1-\\theta_2)$$
$$V = -(m_1+m_2) g \\ell_1 \\cos\\theta_1 - m_2 g \\ell_2 \\cos\\theta_2$$
<p>The Euler–Lagrange equation $\\frac{d}{dt}\\frac{\\partial L}{\\partial \\dot\\theta_i} = \\frac{\\partial L}{\\partial \\theta_i}$ gives two coupled second-order equations. The coupling term $\\cos(\\theta_1-\\theta_2)$ is the troublemaker. It makes each arm's acceleration depend nonlinearly on the other's angle.</p>
<h3>How the simulation solves it</h3>
<p>The browser integrates the equations with a fourth-order Runge–Kutta method at a thousand steps per simulated second. The energy drift readout is the honesty check: if it stays near zero while the pendulums diverge, the divergence is physics, not rounding error.</p>`,
  deep: [
    {
      title: 'Why small swings are calm',
      html: `<p>For small angles, $\\sin\\theta \\approx \\theta$ and $\\cos(\\theta_1-\\theta_2) \\approx 1$. The equations become <em>linear</em>, and linear systems cannot be chaotic. The motion splits into two <strong>normal modes</strong>: both arms swinging together (in phase), and the arms swinging against each other (out of phase), each with its own fixed frequency.</p>
<p>For equal masses and lengths the two frequencies are $\\omega_\\pm = \\sqrt{(2 \\pm \\sqrt2)\\, g/\\ell}$. Their ratio is irrational, so the combined motion never exactly repeats, but nearby starts stay nearby forever. Nonlinearity is the gatekeeper of chaos.</p>`,
    },
    {
      title: 'Measuring chaos: the Lyapunov exponent',
      html: `<p>Take the logarithm of the headline equation: $\\ln|\\delta(t)| = \\ln|\\delta_0| + \\lambda t$. On a log plot, exponential growth is a straight line with slope $\\lambda$. That is the graph in the top-right corner of the scene.</p>
<p>The readout estimates $\\lambda \\approx \\frac1t \\ln\\frac{\\delta(t)}{\\delta_0}$ while the separation is still small. For the default setup it lands around one to three per second, so the error grows roughly tenfold every one to two seconds.</p>
<p>The growth stops when the separation reaches about a radian, simply because angles cannot differ by more than $\\pi$. After that the two pendulums are unrelated.</p>`,
    },
    {
      title: 'The predictability horizon',
      html: `<p>Solve for the time when an error of $\\delta_0$ reaches a tolerance $\\Delta$:</p>
$$t_{\\text{horizon}} = \\frac{1}{\\lambda}\\ln\\frac{\\Delta}{\\delta_0}$$
<p>The logarithm is the cruel part. Measure the starting angle <strong>a million times more precisely</strong> and you buy only $\\ln(10^6)/\\lambda \\approx 14/\\lambda$ extra seconds. Try it with the nudge slider: every factor of ten you remove adds the same small slice of time.</p>
<p>This is the same arithmetic that limits weather forecasts. Better sensors help, but only logarithmically.</p>`,
    },
    {
      title: 'Phase space, the torus, and why chaos needs room',
      html: `<p>The full state is four numbers $(\\theta_1, \\dot\\theta_1, \\theta_2, \\dot\\theta_2)$. Energy conservation pins the motion to a three-dimensional slice. The torus in the scene shows only the two angles, the <em>configuration</em> part.</p>
<p>The Poincaré–Bendixson theorem says a smooth flow in two dimensions cannot be chaotic. Trajectories there cannot cross, so they can only settle down or loop. With three or more dimensions, trajectories can stretch, fold and weave past each other forever. The double pendulum is one of the simplest mechanical systems with enough room.</p>`,
    },
    {
      title: 'A short history',
      html: `<p>Henri Poincaré found the first hints of chaos in 1890 while studying three gravitating bodies, and noticed that tiny differences in initial conditions could produce very large ones in the final result. The idea lay mostly dormant until Edward Lorenz rediscovered it in 1963, when rounding a weather simulation's input from six decimal places to three produced a completely different forecast. His talk title gave us the phrase <em>butterfly effect</em>.</p>`,
    },
  ],
  challenges: [
    {
      id: 'calm',
      title: 'Find the calm',
      prompt: 'Set both starting angles to 15° or less (in either direction) and let the twins run for 20 seconds while their separation stays below $10^{-3}$ rad.',
      hint: 'Small angles make the equations nearly linear. Try 10° and 5°.',
      check: (s) => s.mode === 'twin' && Math.abs(s.theta10 as number) <= 15 && Math.abs(s.theta20 as number) <= 15 && (s.t as number) >= 20 && (s.sep as number) < 1e-3,
    },
    {
      id: 'butterfly',
      title: 'The butterfly',
      prompt: 'With a nudge of $10^{-9}$ rad or smaller, get the two pendulums more than 1 radian (57°) apart.',
      hint: 'Keep the default 120° angles, set the nudge slider to −9 or lower, and wait. It takes longer than you might think, but not much longer.',
      check: (s) => s.mode === 'twin' && (s.deltaExp as number) <= -9 && (s.sep as number) > 1,
    },
    {
      id: 'flip',
      title: 'Over the top',
      prompt: 'Make the lower arm of pendulum A swing all the way over the top.',
      hint: 'Start with larger angles, or press Kick a few times to pump in energy.',
      check: (s) => s.flipped === true,
    },
    {
      id: 'swarm',
      title: 'Peacock tail',
      prompt: 'In Swarm mode, get the lower arms spread across more than 120°.',
      hint: 'The default settings get there. Watch the spread counter in the corner.',
      check: (s) => s.mode === 'swarm' && (s.spread as number) > (120 * Math.PI) / 180,
    },
  ],
  caveats: `<p>Rods are massless and perfectly rigid, the bobs are points, and the pivots have no friction unless you add it. Real pendulums have air drag, bearing friction and flexing rods, which slowly drain energy. The chaos survives all of these, but a real one eventually settles to rest.</p>
<p>The numerical integrator also has finite precision. For very long runs, round-off error acts like its own tiny nudge. That is not a bug in the simulation. It is chaos applying to the simulation too.</p>`,
  further: [
    { label: 'Strogatz, Nonlinear Dynamics and Chaos (textbook)', url: 'https://www.stevenstrogatz.com/books/nonlinear-dynamics-and-chaos-with-applications-to-physics-biology-chemistry-and-engineering' },
    { label: 'Lorenz, Deterministic Nonperiodic Flow (1963)', url: 'https://doi.org/10.1175/1520-0469(1963)020%3C0130:DNF%3E2.0.CO;2' },
    { label: 'Double pendulum on Wikipedia', url: 'https://en.wikipedia.org/wiki/Double_pendulum' },
  ],
};
