import type { TopicContent } from '../../core/types.ts';

export const content: TopicContent = {
  intuition: `
<p class="lead">Throw a ball and it traces a parabola. Newton explains this moment by moment: a force changes the velocity, and the velocity changes the position. There is a second way to say the same thing, and it looks at the whole flight at once.</p>
<p>Take any imagined path from the launch point to the landing point, taking the same time. For each instant, work out the kinetic energy minus the potential energy. Add these up over the whole flight. The total is called the <strong>action</strong>. The path the ball really takes is the one where the action is <em>stationary</em>. Small changes to the path do not change the action, to first order. For a thrown ball that stationary point is also the smallest action of all.</p>
<p>In the first view the amber curve is a made-up path. Drag its pink handles and watch the action readout. Every bump you add raises the action. Press <b>Relax</b> and the computer slides downhill in action, and the path settles onto the true parabola.</p>
<p>Light does something similar. In 1662 Pierre de Fermat showed that the bending of light at a water surface follows if light takes the path of <strong>least time</strong>. The second view lets you drag the point where a ray crosses into water. The straight line is shortest, but it is not fastest, because light is slower in water.</p>
<p>This raises an odd question. How does the ball, or the light, "know" which path is best before it has travelled? Quantum mechanics gives the answer. In Richard Feynman's picture the particle explores <strong>every path</strong>. Each path carries a little arrow that turns by an amount set by its action. Add all the arrows together. Far from the classical path the arrows point every which way and cancel. Near it they line up and reinforce. The third view shows this happening.</p>`,
  tryFirst: [
    'In <b>Least action</b>, drag a pink handle up and down. The action S is lowest when the amber path lies on the dashed cyan one.',
    'Press <b>Relax</b>. Watch the inset: the excess action falls by a factor of a million as the wiggles melt away.',
    'Switch to <b>Fermat</b> and drag the pink crossing point. The travel time is lowest where the angles obey Snell\'s law.',
    'Switch to <b>Feynman</b> and slide <b>ħ</b> down. Far paths turn dim and the phasor spiral curls up. Only paths near the classical one still count.',
  ],
  equation: {
    tex: 'S = \\int L\\,dt, \\quad \\delta S = 0, \\quad \\text{amplitude} = \\sum_{\\text{paths}} e^{iS/\\hbar}',
    caption: 'Classical mechanics picks the path where the action is stationary. Quantum mechanics adds a phase arrow for every path, and the stationary path is where those arrows agree.',
    terms: [
      { tex: 'S', name: 'Action', meaning: 'The total of $L = T - V$ over the whole path, in joule-seconds. The readout shows it for your trial path.', param: 'S' },
      { tex: 'L', name: 'Lagrangian', meaning: 'Kinetic minus potential energy, $\\tfrac12 m v^2 - m g y$ for the ball. The action of the true path is shown for comparison.', param: 'Scl' },
      { tex: '\\delta S = 0', name: 'Stationary action', meaning: 'Tiny changes to the true path leave S unchanged to first order. Relax finds this point by walking downhill in S.', param: 'relax' },
      { tex: '\\hbar', name: 'Reduced Planck constant', meaning: 'Sets how fast each arrow turns as the action grows. The slider uses toy units so the effect is visible.', param: 'hbar' },
      { tex: '\\sum_{\\text{paths}}', name: 'Sum over paths', meaning: 'Every path from start to end contributes, not only the classical one. The scene draws a random sample.', param: 'paths' },
      { tex: 'e^{iS/\\hbar}', name: 'Phase arrow', meaning: 'A unit arrow turned by the angle $S/\\hbar$. The readout shows how long the total arrow is, divided by the number of paths.', param: 'amp' },
    ],
  },
  physicsNotes: `
<h3>The action of a thrown ball</h3>
<p>A ball of mass $m$ moves sideways at a steady speed $v_x$ and vertically under gravity $g$. It leaves the ground at $t = 0$ and lands at $t = T$. For a trial height $y(t)$ with $y(0) = y(T) = 0$,</p>
$$S[y] = \\int_0^T \\left( \\tfrac12 m v_x^2 + \\tfrac12 m \\dot y^2 - m g y \\right) dt.$$
<p>Demand that a small change $\\delta y(t)$, zero at both ends, leaves $S$ unchanged. Integrating by parts gives the Euler–Lagrange equation</p>
$$\\frac{d}{dt}\\frac{\\partial L}{\\partial \\dot y} = \\frac{\\partial L}{\\partial y} \\;\\Rightarrow\\; m\\ddot y = -m g.$$
<p>That is Newton's law. Its solution through the two endpoints is $y = \\tfrac12 g\\,t(T - t)$, and its action is $S_{\\text{cl}} = \\tfrac12 m v_x^2 T - m g^2 T^3/24$. With $m = 1$ kg, $T = 1.4$ s and a 6 m throw this is 1.854 J·s. The 60-step discrete version in the scene gives 1.857 J·s.</p>
<h3>Why the parabola is a true minimum here</h3>
<p>Write any path as $y_{\\text{cl}} + \\delta$. Because the potential $m g y$ is linear in $y$, the cross terms vanish after integrating by parts, and</p>
$$S[y_{\\text{cl}} + \\delta] = S_{\\text{cl}} + \\tfrac12 m \\int_0^T \\dot\\delta^2\\,dt.$$
<p>The extra piece can never be negative. Every wiggle costs action. The tests check this identity on the discrete path to about nine digits.</p>
<h3>How Relax works</h3>
<p>The path is cut into 60 time steps. The action becomes an ordinary function of 59 free heights. Its gradient is $\\partial S/\\partial y_i = m(2y_i - y_{i-1} - y_{i+1})/\\Delta t - m g\\,\\Delta t$. Relax takes plain gradient-descent steps, $y_i \\to y_i - \\eta\\,\\partial S/\\partial y_i$, with a step size small enough to be stable. Sharp kinks vanish first. The broad sag of the path is the slowest to fix, which is why the inset curve starts steep and then flattens.</p>
<h3>Fermat and Snell</h3>
<p>Light leaves $A$ at height $a$ above a flat boundary and reaches $B$ at depth $b$ below it. It crosses at $x$. With speeds $c/n_1$ and $c/n_2$, the travel time is</p>
$$t(x) = \\frac{n_1\\sqrt{x^2 + a^2} + n_2\\sqrt{(D - x)^2 + b^2}}{c},$$
<p>where $D$ is the horizontal distance from $A$ to $B$. Setting $dt/dx = 0$ gives $n_1 \\sin\\theta_1 = n_2 \\sin\\theta_2$, Snell's law. The second derivative is always positive, so this crossing is the one fastest route.</p>
<h3>Paths and arrows</h3>
<p>Feynman's rule gives the amplitude to go from $A$ to $B$ as a sum over all paths of $e^{iS/\\hbar}$. The probability is the squared length of the total arrow. Near the classical path $S$ changes only at second order, so neighbouring arrows point the same way. Far away, $S$ changes quickly from path to path and the arrows cancel. The scene draws each path as the classical one plus a random wiggle in height and sideways position. Its extra action is exact: $\\tfrac12 m\\int|\\dot\\delta|^2 dt$.</p>`,
  deep: [
    {
      title: 'From Maupertuis to Hamilton',
      html: `<p>Pierre-Louis Moreau de Maupertuis announced a "principle of least action" in 1744. He saw it partly as evidence of economy in nature. His definition was vague. In the same year Leonhard Euler published a precise version for a single particle, in an appendix to his book on the calculus of variations.</p>
<p>Joseph-Louis Lagrange turned the idea into a general method. He introduced the $\\delta$ notation for small changes of a whole path and used it to build all of mechanics without drawing force diagrams. His <em>Mécanique analytique</em> appeared in 1788.</p>
<p>William Rowan Hamilton, in papers of 1834 and 1835, gave the form used today: the time integral of $T - V$ between fixed endpoints and fixed times is stationary. Hamilton was guided by an analogy with optics, and that analogy runs straight through to quantum mechanics.</p>
<p>Fermat came first, in 1662, with least time for light. The refraction law itself was found earlier by Ibn Sahl around 984, by Willebrord Snell in 1621 and by René Descartes in 1637.</p>`,
    },
    {
      title: 'Stationary, not necessarily least',
      html: `<p>The rule is $\\delta S = 0$. That makes the action a minimum, a maximum or a saddle, and nature does not care which. For the thrown ball it happens to be a minimum, because the potential is linear.</p>
<p>A mass on a spring shows the difference. Between fixed endpoints separated by less than half a period, the true path has the least action. Stretch the time beyond half a period and the true path becomes a saddle. Some nearby paths have lower action, others higher. The point where this switch happens is called a conjugate point.</p>
<p>Light shows it too. A ray reflecting inside an elliptical mirror between the two foci takes the same time on every route. Bend the mirror more strongly than the ellipse and the real reflection is the path of <em>longest</em> time among its neighbours. Fermat's principle is really a principle of stationary time.</p>`,
    },
    {
      title: 'How does the ball know? Stationary phase',
      html: `<p>A principle stated for the whole path seems to require knowing the end before starting. The classical answer is that it does not. The Euler–Lagrange equation is local. At each moment the ball only needs its present position and velocity.</p>
<p>The quantum answer is deeper. Every path contributes an arrow $e^{iS/\\hbar}$. Suppose paths are labelled by a distance $\\rho$ from the classical path. Then $S \\approx S_{\\text{cl}} + c\\,\\rho^2$, and the sum behaves like the integral $\\int e^{i c \\rho^2/\\hbar} d\\rho$. The arrows only agree while $c\\rho^2 \\lesssim \\hbar$. So the zone of paths that matter has a width that shrinks like $\\sqrt{\\hbar}$.</p>
<p>The scene measures this width as $\\rho^*$, the place where the running phasor sum is longest. The tests check that $\\rho^*$ shrinks in step with $\\sqrt{\\hbar}$, over five random seeds.</p>
<p>For everyday objects the ratio $S/\\hbar$ is enormous. A thrown baseball has an action of tens of joule-seconds, around $10^{35}$ times $\\hbar = 1.055 \\times 10^{-34}$ J·s. The zone of agreeing paths is then far too narrow to see, and only the classical path survives. That is the classical limit.</p>`,
    },
    {
      title: "Feynman's thesis and the double slit",
      html: `<p>In 1933 Paul Dirac noted that $e^{iS/\\hbar}$ seemed to play a role in quantum mechanics. Richard Feynman took the hint. His 1942 Princeton PhD thesis, supervised by John Wheeler, was titled <em>The Principle of Least Action in Quantum Mechanics</em>. He published the full sum-over-paths formulation in 1948 in <em>Reviews of Modern Physics</em>.</p>
<p>In the 1985 book <em>QED: The Strange Theory of Light and Matter</em> he explained it with no equations. Each path gets a stopwatch hand that turns as the particle travels. Add the hands tip to tail. The arrows moving along the paths in the scene are these stopwatch hands.</p>
<p>Two slits show the idea at its cleanest. Every path to a point on the screen goes through one slit or the other. Sum the arrows through slit 1, sum those through slit 2, and add the two. Where the two totals point the same way the screen is bright. Where they point opposite ways it is dark. Turn on <b>Paths through two slits</b> and move the detector point to watch the two chains swing. The fringe spacing is $\\lambda L/d$, and the tests confirm the path sum reproduces it. Shrink $\\hbar$ and the fringes become too fine to see, leaving two bright bands behind the slits, as for classical particles.</p>`,
    },
    {
      title: 'What the path integral really is',
      html: `<p>The sum over "all paths" is not a sum over a list. Between two points there are uncountably many paths, most of them jagged everywhere. Feynman defined the sum by chopping time into $N$ slices, integrating over the position at each slice, and letting $N$ grow. A normalising factor must be included at each slice for the limit to exist.</p>
<p>In real time this limit is still not a well-defined measure in the strict mathematical sense. Rotating time into imaginary values turns $e^{iS/\\hbar}$ into $e^{-S_E/\\hbar}$, which is well defined for many systems. That trick underlies lattice calculations in particle physics.</p>
<p>The path integral agrees with the Schrödinger equation wherever both apply. Its real power shows in quantum field theory, where it makes symmetries plain and leads straight to Feynman diagrams.</p>`,
    },
  ],
  challenges: [
    {
      id: 'relax',
      title: 'Relax to the true path',
      prompt: 'Bring the action of your path to within 1% of the action of the true path.',
      hint: 'In the Least action view, press Relax and watch the inset fall below the green 1% line. You can also drag the handles onto the dashed curve.',
      check: (s) => typeof s.dSrel === 'number' && s.dSrel < 0.01,
    },
    {
      id: 'snell',
      title: "Find Snell's angle",
      prompt: 'With a lower medium denser than air (n₂ at least 1.2), move the crossing point to the least-time spot, so θ₂ is within 0.3° of Snell\'s law.',
      hint: 'In the Fermat view, drag the pink dot along the boundary and watch the inset. The fastest crossing is not on the straight line from A to B. Slide to least time does it for you.',
      check: (s) => s.fermatTouched === true && typeof s.n2 === 'number' && s.n2 >= 1.2 && typeof s.snellErr === 'number' && s.snellErr < 0.3,
    },
    {
      id: 'classical-limit',
      title: 'Reach the classical limit',
      prompt: 'Shrink ħ until the surviving zone ρ* is below 0.25, with enough paths to resolve the phases.',
      hint: 'In the Feynman view with the slits off, slide ħ down to about 0.05 J·s. If the sampling readout says "too few paths", add more paths.',
      check: (s) => s.slits === false && s.hbarTouched === true && s.undersampled === false && typeof s.zone === 'number' && s.zone < 0.25,
    },
    {
      id: 'compare',
      title: 'Make the action bigger',
      prompt: 'After relaxing once, drag a handle to make a path whose action is at least 25% above the true path. Compare the numbers.',
      hint: 'Relax first, then pull one handle a metre or so up or down. Any bump raises S, because every wiggle adds kinetic energy.',
      check: (s) => s.compared === true,
    },
  ],
  caveats: `The projectile moves in one vertical dimension with a fixed sideways speed, so only the height is varied. Relax uses a 60-step discretisation, whose true-path action differs from the continuous value by about 0.2%. In the Fermat view n₁ is set to exactly 1. The Feynman view does not integrate over all paths. It draws a random sample: the classical path plus smooth wiggles made of five sine modes. The wiggle sizes are chosen so the paths spread evenly in √ΔS. That choice is a sampling device, not the true path-integral measure, and it makes the phasor spiral a clean Cornu spiral. The value of ħ is in toy units, roughly 10³² to 10³⁴ times the real one, so the quantum effects are visible. The two-slit view uses a fixed energy, a phase k(ℓ₁ + ℓ₂) per path, and no obliquity factor. Its screen curve sums over the slit width only.`,
  further: [
    { label: 'Feynman Lectures on Physics, Vol. II, Ch. 19: The Principle of Least Action', url: 'https://www.feynmanlectures.caltech.edu/II_19.html' },
    { label: 'R. P. Feynman, Space-Time Approach to Non-Relativistic Quantum Mechanics, Rev. Mod. Phys. 20, 367 (1948)', url: 'https://doi.org/10.1103/RevModPhys.20.367' },
    { label: 'Wikipedia: Stationary-action principle', url: 'https://en.wikipedia.org/wiki/Stationary-action_principle' },
    { label: "Wikipedia: Fermat's principle", url: 'https://en.wikipedia.org/wiki/Fermat%27s_principle' },
  ],
};
