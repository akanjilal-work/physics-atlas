import type { TopicContent } from '../../core/types.ts';

export const content: TopicContent = {
  intuition: `
<p class="lead">Two stars pulling on each other trace the same ellipse forever. Newton solved that case exactly in 1687. Add a third body and the tidy answer disappears.</p>
<p>The rules do not change. Each body is pulled toward each of the others, harder when they are close. Yet with three bodies the pulls keep shifting, energy sloshes back and forth, and the motion can become <strong>chaotic</strong>. Tiny differences in the start grow until they decide everything.</p>
<p>The scene opens on a rare exception, the <strong>figure-eight</strong>. Three equal masses chase each other around one looping track and come back to the same spot every 6.33 time units. It is a perfect, stable dance. It is also a needle in a haystack. Almost every other start looks nothing like it.</p>
<p>Look for the faint <strong>ghost</strong> bodies. They run the same simulation with one body moved by a tiny amount $\\delta$. The graph in the corner tracks how far apart the two runs are, on a log scale. On the figure-eight the gap stays tiny. Switch to the <strong>Pythagorean</strong> start and watch it climb until the real run and the ghost tell completely different stories.</p>
<p>Very often a three-body system ends the same way. Two bodies pair up in a tight binary and fling the third away for good. The status readout tells you when that happens.</p>`,
  tryFirst: [
    'Watch the figure-eight for a few loops. The <b>periods</b> readout counts each return to the start.',
    'Pick <b>Pythagorean</b>. Three bodies start at rest. Watch the corner graph climb and wait for one body to be thrown out.',
    'Pick <b>Lagrange</b> and press <b>Nudge</b>. The spinning triangle holds for a while, then falls apart.',
    'Raise <b>Tilt</b> on any preset. The bodies leave the grid plane and the motion becomes fully 3D.',
  ],
  equation: {
    tex: '\\ddot{\\mathbf r}_i \\,=\\, \\sum_{j\\ne i} G\\, m_j\\, \\frac{\\mathbf r_j - \\mathbf r_i}{\\left|\\mathbf r_j - \\mathbf r_i\\right|^3}',
    caption: 'Newton’s law of gravity for each of the three bodies. Three coupled equations, nine coordinates, and no general formula for the answer.',
    terms: [
      { tex: '\\ddot{\\mathbf r}_i', name: 'Acceleration', meaning: 'How fast body $i$’s velocity changes. The simulation adds up these accelerations in tiny time steps. Watch the clock $t$.', param: 't' },
      { tex: '\\sum_{j\\ne i}', name: 'Both partners', meaning: 'Each body feels the other two at once. With one partner the sum has a single term and the problem is solvable. The second term is what breaks it.', param: 'm3' },
      { tex: 'G\\, m_j', name: 'Pull strength', meaning: 'Heavier partners pull harder. Here $G = 1$ and body 1 sets the mass unit. The mass sliders change $m_2$ and $m_3$.', param: 'm2' },
      { tex: '\\mathbf r_j - \\mathbf r_i', name: 'Direction', meaning: 'An arrow from body $i$ to body $j$, in full 3D. Tilt gives the bodies out-of-plane speed, so these arrows leave the grid plane.', param: 'tilt' },
      { tex: '\\left|\\mathbf r_j - \\mathbf r_i\\right|^3', name: 'Distance', meaning: 'The cube keeps the inverse-square law once the direction arrow is divided out. Halve the distance and the pull grows four times. Close passes are violent, so the integrator shrinks its step there.', param: 'rmin' },
    ],
  },
  physicsNotes: `
<h3>What is conserved</h3>
<p>Three bodies in 3D need 18 numbers: a position and a velocity for each. The motion keeps ten quantities fixed. These are the total energy, the three components of momentum, the three components of angular momentum, and the steady drift of the centre of mass.</p>
$$E = \\sum_i \\tfrac12 m_i v_i^2 \\, - \\sum_{i<j} \\frac{G m_i m_j}{r_{ij}}, \\qquad \\mathbf L = \\sum_i m_i\\, \\mathbf r_i \\times \\mathbf v_i$$
<p>With two bodies these laws pin the motion down completely and the orbit is a conic section. With three there are not enough of them to do that. In 1887 Heinrich Bruns proved that no further algebraic conserved quantities exist. Poincaré then extended the result to a broad class of analytic ones.</p>
<h3>How the simulation solves it</h3>
<p>The scene integrates the equations with Yoshida’s fourth-order symplectic method. A symplectic method respects the geometry of Hamiltonian motion, so energy errors stay bounded over long runs and do not creep upward. The time step is a small fraction of the shortest orbital time of any pair. It shrinks automatically during a close pass and grows again afterwards.</p>
<p>The energy and angular momentum drift readouts are the honesty check. They measure how far these quantities have wandered from their starting values. If they stay tiny while the ghost runs away, the divergence is chaos and not numerical error.</p>`,
  deep: [
    {
      title: 'Newton’s two bodies against three',
      html: `<p>For two bodies, subtract their equations. The difference $\\mathbf r = \\mathbf r_2 - \\mathbf r_1$ obeys a single equation with a fixed centre:</p>
$$\\ddot{\\mathbf r} = -\\frac{G(m_1+m_2)}{r^3}\\,\\mathbf r$$
<p>Energy and angular momentum turn this into a formula. The orbit is an ellipse, parabola or hyperbola, with period $T = 2\\pi\\sqrt{a^3/G(m_1+m_2)}$. The test suite checks this simulation against that period to about one part in $10^{11}$.</p>
<p>With three bodies, the same trick leaves two coupled relative vectors that each feel a moving source. There is no fixed centre to orbit and no way to split the problem into independent pieces. Energy can flow between the pairs, and it does.</p>`,
    },
    {
      title: 'Poincaré and the birth of chaos',
      html: `<p>In 1887 King Oscar II of Sweden offered a prize for a convergent series solution of the $n$-body problem. Henri Poincaré won in 1889 with a study of the restricted three-body problem. A colleague then found a gap in the argument. Fixing it, Poincaré discovered that some orbits near an unstable periodic orbit form an endlessly folded tangle. He paid for the first printing to be destroyed and published the corrected memoir in 1890.</p>
<p>That tangle is the first known picture of chaos. Poincaré wrote that small differences in the initial conditions produce very great ones in the final phenomena. The ghost in this scene is that sentence made visible.</p>`,
    },
    {
      title: 'Why there is no general formula, and Sundman’s series',
      html: `<p>"No closed-form solution" needs care. Bruns and Poincaré showed there are no extra conserved quantities of the usual kind, so the problem cannot be reduced to quadratures like the two-body case.</p>
<p>Yet a solution in series form does exist. In 1912 Karl Sundman found a power series, in a cleverly rescaled time variable, that converges for all time whenever the total angular momentum is not zero. It is a real theorem and a real answer to King Oscar’s question. It is also useless in practice. Estimates suggest around $10^{8\\,000\\,000}$ terms for ordinary accuracy. Qiudong Wang extended the result to $n$ bodies in 1991.</p>
<p>So the honest statement is this. The three-body problem has no formula built from familiar functions, and chaos means small errors grow exponentially. Numerical integration, with checks like the drift readouts, is how people actually study it.</p>`,
    },
    {
      title: 'Special solutions: Euler, Lagrange and the figure-eight',
      html: `<p>A few exact solutions do exist. In 1767 Euler found orbits where the three bodies stay on a rotating straight line. In 1772 Lagrange found the rotating <strong>equilateral triangle</strong>, which works for any three masses. The Lagrange preset uses equal masses, where the triangle is unstable. It only survives when one mass dominates, roughly $(m_1+m_2+m_3)^2 > 27\\,(m_1 m_2 + m_2 m_3 + m_3 m_1)$. The Trojan asteroids that share Jupiter’s orbit sit near such a triangle with the Sun.</p>
<p>The <strong>figure-eight</strong> was found numerically by Cris Moore in 1993 and proved to exist by Alain Chenciner and Richard Montgomery in 2000. Its initial conditions, used in the preset, are $\\mathbf r_1 = -\\mathbf r_2 = (0.97000436, -0.24308753)$, $\\mathbf r_3 = 0$ and $\\mathbf v_1 = \\mathbf v_2 = -\\mathbf v_3/2$ with $\\mathbf v_3 = (-0.93240737, -0.86473146)$. The period is about 6.3259. Unusually, it is stable, which is why it keeps its shape even with a small nudge.</p>
<p>Since 2013, computer searches have turned up many new periodic families, first a dozen, then hundreds, then thousands. Each one is a rare island of order in a sea of chaotic starts.</p>`,
    },
    {
      title: 'Ejections, slingshots and real triples',
      html: `<p>A three-body encounter trades energy between the bodies. When two come close, the third can steal energy and leave faster than it arrived. The <strong>Pythagorean problem</strong> of Burrau (1913) shows the typical ending. Masses 3, 4 and 5 start at rest at the corners of a 3-4-5 triangle. After a long chaotic dance, computed by Szebehely and Peters in 1967, the mass-3 body is thrown out and the other two leave as a tight binary. The scene reproduces that outcome near $t \\approx 64$.</p>
<p>Spacecraft use the same exchange on purpose. In a <strong>gravity assist</strong>, a probe swings past a planet and leaves with extra speed relative to the Sun, while the planet slows by an unmeasurably small amount. Voyager 2 used this to visit all four giant planets.</p>
<p>Real triples survive when they are <strong>hierarchical</strong>: a tight pair plus a distant third body. The Moon orbits well inside Earth’s zone of control against the Sun, about a quarter of the way out, so the Sun only perturbs it. Alpha Centauri A and B orbit each other every 80 years, while Proxima circles the pair about 13 000 times farther from the Sun than Earth is. The system that inspired Liu Cixin’s novel is in fact quite orderly.</p>
<p>The Solar System itself is chaotic over long times. Jacques Laskar’s calculations give a Lyapunov time of about 5 million years for the inner planets. Beyond a few tens of millions of years, precise positions cannot be predicted. In about 1% of his runs Mercury’s orbit becomes unstable within 5 billion years.</p>`,
    },
  ],
  challenges: [
    {
      id: 'figure8',
      title: 'Hold the eight',
      prompt: 'On the figure-eight preset, press Reset and let it run for 3 full periods while the energy drift stays below $10^{-6}$.',
      hint: 'Keep equal masses and zero tilt, then just wait. The periods readout counts returns to the starting shape.',
      check: (s) => s.touched === true && s.preset === 'figure8' && (s.periods as number) >= 3 && (s.eDrift as number) < 1e-6,
    },
    {
      id: 'lagrange',
      title: 'Break the triangle',
      prompt: 'Pick the Lagrange preset, set $\\delta \\le 10^{-6}$, press Nudge, and watch the triangle change shape by more than 50%.',
      hint: 'Equal masses make the triangle unstable. A nudge of a millionth takes about 4 turns to grow.',
      check: (s) => s.preset === 'lagrange' && s.kicked === true && (s.deltaExp as number) <= -6 && (s.distortion as number) > 0.5,
    },
    {
      id: 'eject',
      title: 'Throw one out',
      prompt: 'Make the system eject a body for good.',
      hint: 'The Pythagorean preset does it near $t = 64$. Random starts often do it sooner.',
      check: (s) => (s.ejected as number) >= 1,
    },
    {
      id: 'butterfly',
      title: 'Butterfly in orbit',
      prompt: 'With the ghost on and $\\delta \\le 10^{-8}$, get the ghost separation above 1.',
      hint: 'The figure-eight is stable, so pick a chaotic start. Pythagorean and Random both work.',
      check: (s) => s.ghost === true && (s.deltaExp as number) <= -8 && (s.sep as number) > 1,
    },
  ],
  caveats: `<p>The bodies are point masses that obey Newton’s law of gravity exactly. There is no relativity, no tides, no radiation and no collisions. Real stars would merge or be torn apart in passes much closer than their radii, and general relativity matters in the tightest binaries.</p>
<p>The integrator works in double precision with a finite step. Its relative energy error stays around $10^{-8}$ or smaller for the presets, but chaos amplifies any error, including round-off. After the ghost separates, the real run is also only a representative path, not the exact one. The overall behaviour, such as which body is ejected, is reliable only while the drift readouts stay tiny.</p>`,
  further: [
    { label: 'Chenciner and Montgomery, A remarkable periodic solution of the three-body problem (2000)', url: 'https://arxiv.org/abs/math/0011268' },
    { label: 'Šuvakov and Dmitrašinović, Three classes of Newtonian three-body planar periodic orbits (2013)', url: 'https://arxiv.org/abs/1303.0181' },
    { label: 'Laskar, Is the Solar System stable? (2012)', url: 'https://arxiv.org/abs/1209.5996' },
    { label: 'Three-body problem on Wikipedia', url: 'https://en.wikipedia.org/wiki/Three-body_problem' },
  ],
};
