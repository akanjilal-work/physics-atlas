import type { TopicContent } from '../../core/types.ts';

export const content: TopicContent = {
  intuition: `
<p class="lead">In 1963 a meteorologist wrote down three short equations for air rising and sinking in a heated layer. He expected the solution to settle down or repeat. It did neither. It traced a two-winged shape that never repeats and never stops.</p>
<p>The glowing line in the scene is one solution. It is a single point moving through a three-dimensional space of possible states. It loops around one wing a few times, then flips to the other wing, then back. The number of loops before each flip looks random. Nothing random is in the equations.</p>
<p>The coloured dust is a <strong>swarm</strong> of about a thousand starting points packed into a tiny ball. At first they travel together like one dot. Within a few loops the ball stretches into a thread, the thread is folded over itself, and the swarm spreads across both wings. Where you end up depends on digits you could never measure. This is the <em>butterfly effect</em>, and the shape itself is why people call it that.</p>
<p>The swarm spreads out, yet it never fills space. Every blob of starting points shrinks in volume as it moves. The dust ends up on a thin, endlessly layered surface. That surface is the <strong>strange attractor</strong>.</p>
<p>Now turn the $\\rho$ slider down, which weakens the heating. Below about 24.7 the flow can calm down. The line spirals into one of the two centres of the wings and stops, and the air settles into steady rolls. Turn $\\rho$ up to 99.96 or 160 and the chaos gives way to a closed loop that repeats forever. Chaos has islands of order.</p>`,
  tryFirst: [
    'Press <b>Release swarm</b> and watch the tiny ball of dust smear across both wings. The wing split readout shows how it divides.',
    'Drag <b>ρ</b> down to 15. The fixed points C± turn green, meaning stable, and the line spirals into one of them.',
    'Pick the <b>ρ = 99.96</b> preset. After a short settling time the corner map collapses to a few dots, the sign of a periodic orbit.',
    'Watch the λ readout. It is the growth rate of a tiny gap between two nearby runs, and it hovers near 0.9 at the classic values.',
  ],
  equation: {
    tex: '\\dot x = \\sigma\\,(y - x), \\qquad \\dot y = x\\,(\\rho - z) - y, \\qquad \\dot z = x\\,y - \\beta\\,z',
    caption: 'The Lorenz equations. Three variables, two products, and the classic choice σ = 10, ρ = 28, β = 8/3.',
    terms: [
      { tex: '\\sigma\\,(y - x)', name: 'Prandtl number σ', meaning: 'Pulls $x$ toward $y$. In the convection model $\\sigma$ is the ratio of the fluid’s viscosity to its heat diffusivity. Lorenz used 10.', param: 'sigma' },
      { tex: 'x\\,(\\rho - z)', name: 'Heating ρ', meaning: 'The driving term. $\\rho$ is the Rayleigh number divided by its value at the onset of convection. Below 1 the fluid stays still. The classic value is 28.', param: 'rho' },
      { tex: '\\beta\\,z', name: 'Geometry β', meaning: 'Damps $z$. It depends on the width of the convection rolls. The classic $8/3$ matches the rolls that start convecting first.', param: 'beta' },
      { tex: 'x\\,y,\\; x\\,z', name: 'Nonlinear products', meaning: 'The only nonlinear terms. They stretch and fold the flow. Without them the system is linear and cannot be chaotic. The λ readout measures the stretching.', param: 'lyap' },
      { tex: '\\dot x, \\dot y, \\dot z', name: 'Flow speed', meaning: 'How fast the state moves. The speed readout falls to zero when the motion settles onto a fixed point.', param: 'speed' },
    ],
  },
  physicsNotes: `
<h3>Fixed points and when they change</h3>
<p>Set all three rates to zero. The origin is always a solution. It means no motion and a straight-line temperature profile. For $\\rho > 1$ two more appear, one for each direction of roll:</p>
$$C_\\pm = \\left(\\pm\\sqrt{\\beta(\\rho-1)},\\; \\pm\\sqrt{\\beta(\\rho-1)},\\; \\rho-1\\right)$$
<p>Their stability comes from the Jacobian, the matrix of partial derivatives. At the origin its eigenvalues turn positive at $\\rho = 1$, where convection starts. At $C_\\pm$ a pair of complex eigenvalues crosses into the right half-plane at the Hopf point</p>
$$\\rho_H = \\frac{\\sigma(\\sigma+\\beta+3)}{\\sigma-\\beta-1} = \\frac{470}{19} \\approx 24.74 \\quad (\\sigma=10,\\ \\beta=8/3).$$
<p>The fixed-point markers in the scene turn green when stable and red when unstable. Their colours flip as you cross these two values of $\\rho$.</p>
<h3>Volume always shrinks</h3>
<p>Add up the diagonal of the Jacobian and you get the divergence of the flow:</p>
$$\\nabla\\cdot\\mathbf f = -\\sigma - 1 - \\beta \\approx -13.67.$$
<p>It is the same at every point. Any blob of starting states loses volume by a factor $e^{-13.67\\,t}$. So the attractor has zero volume, even though the swarm spreads over it.</p>
<h3>How the simulation solves it</h3>
<p>Every point moves with classical fourth-order Runge–Kutta at a fixed step of 0.005 time units. The λ readout follows a reference run and a twin started $10^{-8}$ away. Every 0.05 time units it logs how much the gap grew, then shrinks the gap back to $10^{-8}$. The running average of those logs is the largest Lyapunov exponent. A second, faster background run does this and also records each peak of $z$ for the corner map.</p>`,
  deep: [
    {
      title: 'Where the equations came from',
      html: `<p>Edward Lorenz worked at MIT on long-range weather prediction. In 1962 Barry Saltzman had written a model of <strong>Rayleigh–Bénard convection</strong>, a fluid layer heated from below, keeping seven Fourier modes. Lorenz noticed that most of the modes died away. He kept just three and published the result in 1963 as <em>Deterministic Nonperiodic Flow</em> in the Journal of the Atmospheric Sciences.</p>
<p>In his model, $x$ is proportional to the speed of the convective overturning. $y$ measures the temperature difference between rising and sinking fluid. $z$ measures how far the vertical temperature profile bends away from a straight line. $\\sigma$ is the Prandtl number, $\\rho$ is the heating relative to the onset of convection, and $\\beta = 4/(1+a^2)$ depends on the roll shape. With $a^2 = 1/2$, the rolls that go unstable first, $\\beta = 8/3$.</p>
<p>Lorenz had found sensitive dependence earlier, when a rerun from rounded numbers drifted away from the original. The 1963 paper showed that the nonperiodic behaviour was built into the equations. The phrase <em>butterfly effect</em> came later, from the title of a talk he gave in 1972.</p>`,
    },
    {
      title: 'Why the trajectory never crosses itself',
      html: `<p>The right-hand sides are smooth polynomials. By the existence and uniqueness theorem for ODEs, each point in space has exactly one future and one past. If two paths met at a point, they would have to be the same path. So a trajectory can only cross itself if it is a closed loop, which is exactly what periodic motion is.</p>
<p>In the picture the line seems to cross itself all the time. That is the flat screen. Orbit the camera and the strands slide past each other at different depths. The Poincaré–Bendixson theorem says that in two dimensions this rule leaves room only for fixed points and cycles. Chaos needs a third dimension so that paths can weave past each other.</p>
<p>The price is strange geometry. The two wings look like surfaces that merge where they join. They cannot really merge, since paths cannot cross. Lorenz concluded there must be an infinite complex of surfaces, each extremely close to one of the two merging surfaces.</p>`,
    },
    {
      title: 'Strange attractors and a dimension of about 2.06',
      html: `<p>Stretching along one direction and shrinking faster across another gives three Lyapunov exponents. At the classic values they are about $+0.906$, $0$ and $-14.57$. Their sum must equal the divergence, $-13.67$, and it does.</p>
<p>The Kaplan–Yorke formula turns these into a dimension:</p>
$$D_{KY} = 2 + \\frac{\\lambda_1}{|\\lambda_3|} \\approx 2 + \\frac{0.906}{14.57} \\approx 2.06.$$
<p>Measurements of the correlation dimension, by Grassberger and Procaccia in 1983, give a similar 2.05. The attractor is thicker than a surface and far thinner than a solid. A slice across a wing shows a Cantor-like stack of sheets rather than a single line.</p>
<p>The corner map shows a trick from the 1963 paper. Lorenz took each peak $z_n$ of the $z$ signal and plotted the next peak $z_{n+1}$ against it. The points fall close to a single curve with a sharp top. Its slope is steeper than 1 everywhere, so small differences grow at each step. That is a one-dimensional picture of the chaos.</p>`,
    },
    {
      title: 'The road from calm to chaos as ρ grows',
      html: `<p>For $\\rho < 1$ every orbit decays to the origin. Between 1 and about 13.93 almost every orbit spirals into $C_+$ or $C_-$. Near $\\rho \\approx 13.93$ a homoclinic explosion creates unstable periodic orbits and a set of chaotic orbits that is not yet attracting. Orbits wander chaotically for a while before settling, which is called transient chaos.</p>
<p>At about $\\rho \\approx 24.06$ the strange attractor becomes attracting. Until $\\rho_H \\approx 24.74$ it coexists with the still-stable $C_\\pm$. The Hopf bifurcation at $\\rho_H$ is subcritical, so beyond it no nearby stable cycle takes over and the motion stays chaotic.</p>
<p>At larger $\\rho$ chaos is broken by <strong>periodic windows</strong>, where a stable closed orbit takes over. The presets use two: $\\rho = 99.96$, where the cycle repeats after six $z$ peaks that come in two nearly equal groups of three, and $\\rho = 160$, where it repeats after two. The test suite checks both by counting distinct peaks and by confirming the Lyapunov exponent is close to zero. These windows are narrow. Nudge $\\rho$ a little outside them and the chaos returns.</p>`,
    },
    {
      title: 'Tucker’s proof: is it really chaotic?',
      html: `<p>Pictures and exponents are numerical evidence, not proof. Round-off error could in principle create a strange attractor that the real equations do not have. In 1998 Stephen Smale put the question on his list of problems for the next century, as problem 14. Does the Lorenz system at the classic values really have a strange attractor?</p>
<p>Warwick Tucker answered yes in 2002. His proof combines interval arithmetic, which bounds every rounding error rigorously, with normal-form analysis near the origin, where the flow is too slow for a computer to follow safely. He showed that the true flow has the structure of the <em>geometric Lorenz model</em> studied in the 1970s. That model has a robust strange attractor.</p>
<p>It is a computer-assisted proof. The computer does not approximate the answer here. It checks a long list of rigorous inequalities, each with guaranteed error bounds.</p>`,
    },
  ],
  challenges: [
    {
      id: 'wings',
      title: 'Cover both wings',
      prompt: 'Press <b>Release swarm</b> and let it spread until at least 35% of the points sit on each wing.',
      hint: 'Keep ρ in the chaotic range, such as the classic 28. The swarm needs a few loops. A smaller ball takes longer, since the gap must grow from a smaller start.',
      check: (s) => s.swarmUser === true && (s.wingMin as number) >= 0.35 && (s.swarmSpread as number) > 3,
    },
    {
      id: 'settle',
      title: 'Calm the flow',
      prompt: 'Find a value of $\\rho$ where the motion stops on a fixed point, with flow speed below 0.05.',
      hint: 'Below $\\rho_H \\approx 24.74$ the centres of the wings become stable. Try 10 to 15 and wait about fifteen seconds. Just below 24.74 the chaos can linger for a long time.',
      check: (s) => s.settled === true,
    },
    {
      id: 'lyap',
      title: 'Measure the chaos',
      prompt: 'At the classic values σ = 10, ρ = 28, β = 8/3, press <b>Measure λ</b> and let it run for at least 150 time units. Get within 10% of 0.906.',
      hint: 'If you changed a slider, press the Classic preset first. The estimate wobbles at first, then settles as it averages over more loops.',
      check: (s) => s.lyapManual === true && s.classic === true && (s.lyapT as number) >= 150 && Math.abs((s.lyap as number) - 0.906) <= 0.0906,
    },
    {
      id: 'window',
      title: 'Find a periodic window',
      prompt: 'Find a value of $\\rho$ above 30 where the motion locks onto a repeating loop. The corner map should collapse to a few dots.',
      hint: 'Chaos at large ρ has gaps. The two presets are known windows. Others exist too, and you can hunt for them with the slider.',
      check: (s) => s.periodic === true && (s.rho as number) > 30,
    },
  ],
  caveats: `<p>The Lorenz equations are a drastic cut-down of real convection. They keep three Fourier modes out of infinitely many. For real fluids at $\\rho = 28$ the truncation is not accurate, and real convection at that heating does not look like the butterfly. The model is a faithful picture of chaos in a simple ODE, not a weather model.</p>
<p>The simulation uses finite-precision numbers. Any single long trajectory differs from the exact one after a few dozen time units, because chaos amplifies rounding error. Statistical properties like $\\lambda$, the shape of the attractor and the Lorenz map are robust to this. Tucker’s proof is what guarantees the attractor itself is real.</p>
<p>The λ readout is a finite-time average, so it wobbles by a few percent. The periodic detector counts distinct $z$ peaks in a short record, so a very long cycle or a slow transient can fool it.</p>`,
  further: [
    { label: 'Lorenz, Deterministic Nonperiodic Flow (1963)', url: 'https://doi.org/10.1175/1520-0469(1963)020%3C0130:DNF%3E2.0.CO;2' },
    { label: 'Lorenz system on Wikipedia', url: 'https://en.wikipedia.org/wiki/Lorenz_system' },
    { label: 'Smale’s problems (problem 14 and Tucker’s answer)', url: 'https://en.wikipedia.org/wiki/Smale%27s_problems' },
    { label: 'Strogatz, Nonlinear Dynamics and Chaos (textbook)', url: 'https://www.stevenstrogatz.com/books/nonlinear-dynamics-and-chaos-with-applications-to-physics-biology-chemistry-and-engineering' },
  ],
};
