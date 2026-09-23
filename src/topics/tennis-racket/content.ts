import type { TopicContent } from '../../core/types.ts';

export const content: TopicContent = {
  intuition: `
<p class="lead">In 1985 the cosmonaut Vladimir Dzhanibekov was unpacking cargo on the Salyut 7 space station. He flicked a wing nut off a bolt and watched it spin away. Every few seconds it flipped over, spun the other way round for a while, then flipped back. Nothing touched it.</p>
<p>You can see the same thing at home. Toss a phone or a book into the air spinning end over end, about the axis that runs across its width. It almost always comes down with a half twist, face flipped. Spin it about its long axis, or flat like a pizza, and it stays steady.</p>
<p>Every rigid object has <strong>three special axes</strong>. One has the least resistance to turning (axis 1, <span style="color:#4fd1e8">cyan</span>), one has the most (axis 3, <span style="color:#a78bfa">violet</span>), and one sits in between (axis 2, <span style="color:#f5b642">amber</span>). Spin about the least or the most and the motion is stable. Spin about the <strong>middle</strong> axis and the tiniest wobble grows until the object turns over.</p>
<p>In the scene, the white arrow is the <strong>angular momentum</strong> $L$. With no outside push it never changes, so it stays fixed and vertical. The object tumbles around it. Watch the amber axis. It starts pointing up along $L$, then swings through to point down, then comes back.</p>
<p>The sphere on the right explains why. It shows $L$ as seen by the object itself. The pink trail is where the tip of $L$ wanders on the body. Around axes 1 and 3 the paths are small closed loops. At axis 2 the red curves cross in an X. A point balanced there is like a marble on a saddle. The slightest nudge sends it sliding off along the red curve to the far side.</p>
<p>This is not chaos and not randomness. The flip repeats on a fixed schedule that you can compute exactly.</p>`,
  tryFirst: [
    'Watch the amber axis and the flip counter. The sparkline in the corner shows the axis-2 component of $L$ jumping between up and down.',
    'Change <b>Spin axis</b> to 1 or 3. The object now spins calmly for as long as you like, even with a large nudge.',
    'Drag <b>Nudge</b> down by a factor of 1000. The flips come only a little later. The wait grows with the logarithm of the nudge.',
    'Set <b>Camera</b> to <b>Sphere</b> and watch the pink polhode trail hug the red separatrix through the saddle points.',
  ],
  equation: {
    tex: '\\ddot{\\epsilon} = \\Omega^2\\,\\frac{(I_2-I_1)(I_3-I_2)}{I_1 I_3}\\,\\epsilon',
    caption: 'A small tilt $\\epsilon$ away from steady spin about the middle axis. The coefficient is positive when $I_1 < I_2 < I_3$, so $\\epsilon$ grows like $e^{\\sigma t}$ instead of oscillating.',
    terms: [
      { tex: '\\epsilon', name: 'Perturbation', meaning: 'How far the spin starts from the pure axis, as a fraction of $\\Omega$. Set by the nudge slider.', param: 'pert' },
      { tex: '\\Omega', name: 'Spin rate', meaning: 'Angular speed about the chosen axis, in rad/s. Everything scales with it. Double $\\Omega$ and the flips come twice as often.', param: 'omega' },
      { tex: 'I_1, I_2, I_3', name: 'Principal moments', meaning: 'Resistance to turning about each body axis, fixed by the shape. Axis 2 is the middle one.', param: 'preset' },
      { tex: '\\substack{I_2-I_1\\\\ I_3-I_2}', name: 'The sign that matters', meaning: 'Both factors are positive for the middle axis, so the coefficient is positive and the tilt grows. For axis 1 or 3 one factor flips sign and the tilt only wobbles.', param: 'axis' },
      { tex: '\\sigma', name: 'Growth rate', meaning: 'The square root of the coefficient, $\\sigma = \\Omega\\sqrt{(I_2-I_1)(I_3-I_2)/(I_1 I_3)}$. The tilt grows by a factor $e$ every $1/\\sigma$ seconds.', param: 'sigma' },
    ],
  },
  physicsNotes: `
<h3>Euler's equations</h3>
<p>Work in the body frame, along the principal axes. With no torque, the angular velocity $\\boldsymbol\\omega$ obeys</p>
$$I_1\\dot\\omega_1 = (I_2-I_3)\\,\\omega_2\\omega_3,\\quad I_2\\dot\\omega_2 = (I_3-I_1)\\,\\omega_3\\omega_1,\\quad I_3\\dot\\omega_3 = (I_1-I_2)\\,\\omega_1\\omega_2.$$
<p>Spin steadily about axis 2 at rate $\\Omega$ and add small $\\omega_1, \\omega_3$. To first order $\\omega_2$ stays at $\\Omega$, and the other two couple:</p>
$$I_1\\dot\\omega_1 = (I_2-I_3)\\,\\Omega\\,\\omega_3,\\qquad I_3\\dot\\omega_3 = (I_1-I_2)\\,\\Omega\\,\\omega_1.$$
<p>Differentiate the first and substitute the second. That gives the headline equation for $\\epsilon = \\omega_1/\\Omega$. Repeat for axis 1 or 3 and one factor changes sign. The coefficient turns negative and the solution is a bounded wobble.</p>
<h3>How the simulation solves it</h3>
<p>The browser integrates Euler's equations with fourth-order Runge–Kutta at 2000 steps per simulated second. It carries the orientation as a unit quaternion $q$ with $\\dot q = \\tfrac12\\, q \\otimes (0, \\boldsymbol\\omega)$, stepped in the same RK4 and renormalized. The inertia of each preset comes from its parts, using the box, cylinder and hoop formulas and the parallel-axis theorem. The energy and $|L|$ drift readouts show that the flips come from the equations and not from numerical error.</p>`,
  deep: [
    {
      title: 'Two conserved quantities, two surfaces',
      html: `<p>A free rigid body conserves its kinetic energy and its angular momentum. In body coordinates $L_i = I_i\\omega_i$, and</p>
$$L_1^2 + L_2^2 + L_3^2 = |L|^2, \\qquad \\frac{L_1^2}{I_1} + \\frac{L_2^2}{I_2} + \\frac{L_3^2}{I_3} = 2E.$$
<p>The first is a sphere. The second is an ellipsoid with semi-axes $\\sqrt{2EI_i}$. The tip of $L$ must lie on both, so it moves along their intersection. That curve is the <strong>polhode</strong>, the pink trail in the scene.</p>
<p>Near the ends of the longest and shortest ellipsoid axes, the intersections are small closed loops around axes 3 and 1. Those are the stable spins. The borderline case is $2E = |L|^2/I_2$. Then the ellipsoid touches the sphere exactly at $\\pm$ axis 2, and the intersection becomes two great circles crossing there:</p>
$$L_3 = \\pm\\sqrt{\\frac{1/I_1 - 1/I_2}{1/I_2 - 1/I_3}}\\; L_1.$$
<p>These red curves are the <strong>separatrix</strong>. They divide loops around axis 1 from loops around axis 3.</p>`,
    },
    {
      title: 'Why the middle axis is a saddle',
      html: `<p>On the sphere of fixed $|L|$, energy is a smooth function with six critical points, the $\\pm$ principal axes. Energy $|L|^2/(2I)$ is largest at $\\pm$ axis 1 and smallest at $\\pm$ axis 3. So these are a peak and a valley, and the motion circles them on level curves.</p>
<p>At $\\pm$ axis 2 the energy goes down toward axis 3 and up toward axis 1. That makes axis 2 a <strong>saddle point</strong>. A trajectory that starts near it follows the level curve through the saddle, which is the separatrix. It is carried all the way round to the opposite point, $-$axis 2. In the object's frame, $L$ has reversed. In space $L$ is fixed, so it is the object that has turned over.</p>
<p>Any smooth function on a sphere must also have saddle points when it has two separate maxima and two separate minima. So every body with three different moments has an unstable middle axis. You cannot design it away without making two moments equal.</p>`,
    },
    {
      title: 'Periodic, deterministic, and exactly solvable',
      html: `<p>The flips are not random. Euler's equations for a free body can be solved exactly with Jacobi elliptic functions. For spin near axis 2, the time between flips is</p>
$$T_{\\text{flip}} = \\frac{2K(k)}{p} \\;\\approx\\; \\frac{2}{\\sigma}\\ln\\frac{C}{\\epsilon},$$
<p>where $K$ is the complete elliptic integral and $p \\to \\sigma$ close to the separatrix. The constant $C$ is of order one and depends on the shape and on how the nudge is split between axes 1 and 3. The <em>predicted interval</em> readout uses the exact formula. The <em>measured interval</em> should agree to a fraction of a percent.</p>
<p>The logarithm explains the everyday experience. A thousand times smaller nudge only adds $2\\ln(1000)/\\sigma \\approx 14/\\sigma$ seconds. Real objects are never perfectly aligned, so the flip always comes, and on a reliable schedule. A tossed racket or phone also turns about its long axis by roughly a half turn during the flip. That twist was analysed by Ashbaugh, Chicone and Cushman in 1991.</p>`,
    },
    {
      title: 'Dzhanibekov, Salyut 7 and the story that followed',
      html: `<p>Dzhanibekov flew to Salyut 7 in June 1985 on Soyuz T-13, to repair a station that had lost power. His wing nut flipped every few seconds. The observation became widely known only years later. The behaviour itself was already textbook physics. Euler wrote down the equations in the 1760s and Poinsot gave the geometric picture in 1834. It was simply hard to see on Earth, because gravity pulls a thrown object to the floor before many flips can happen.</p>
<p>Claims that the effect predicts a sudden flip of the whole Earth are not correct. The Earth spins about its axis of largest moment, which is the stable one, and it is not a rigid body.</p>`,
    },
    {
      title: 'A different rule when energy is lost: Explorer 1',
      html: `<p>Everything above assumes a perfectly rigid body with no losses. Real bodies flex, and flexing turns a little kinetic energy into heat. Angular momentum cannot leave without an outside torque, so $|L|$ stays fixed while $E$ slowly falls. Energy at fixed $|L|$ is lowest for spin about axis 3. So a body that dissipates drifts, over many turns, toward spin about its <strong>largest</strong> moment. This is the <strong>major-axis rule</strong>.</p>
<p>The first American satellite, Explorer 1, showed it in 1958. It was a long thin cylinder spun about its long axis, which is the axis of least moment. Its flexible wire antennas dissipated energy. Soon after launch it had changed into a tumbling end-over-end spin about a major axis. Ronald Bracewell and Owen Garriott explained the change using this energy argument.</p>
<p>The two effects are related but distinct. The Dzhanibekov flip needs no energy loss, is periodic and reversible, and involves the middle axis. The major-axis rule needs energy loss, is one-way, and makes even axis 1 unstable over long times. The simulation here has no dissipation, so axis 1 stays stable forever.</p>`,
    },
  ],
  challenges: [
    {
      id: 'three-flips',
      title: 'Three flips',
      prompt: 'Spin about axis 2 and watch the object turn over at least 3 times.',
      hint: 'The defaults already do this. If it seems slow, raise the spin rate or the nudge.',
      check: (s) => s.axis === 2 && (s.flips as number) >= 3,
    },
    {
      id: 'steady',
      title: 'Rock steady',
      prompt: 'Spin about axis 1 or axis 3 with a nudge of at least $10^{-2}$, and keep it from flipping for 30 seconds of simulated time.',
      hint: 'Pick axis 1 or 3, set the nudge slider to −2 or higher, and wait. Raise the sim speed to wait less.',
      check: (s) => (s.axis === 1 || s.axis === 3) && (s.pertExp as number) >= -2 - 1e-9 && (s.t as number) >= 30 && s.flips === 0,
    },
    {
      id: 'slow-flip',
      title: 'Slow the flip',
      prompt: 'Spinning about axis 2, make the measured time between flips at least twice what the T-handle gives at the same spin rate and nudge.',
      hint: 'The growth rate $\\sigma$ shrinks when $I_2$ comes close to $I_1$ or to $I_3$. Try the wing nut, or choose Custom and push the $I_2$ slider toward either end.',
      check: (s) => s.axis === 2 && (s.flips as number) >= 2 && (s.interval as number) > 0 && (s.interval as number) >= 2 * (s.refInterval as number),
    },
    {
      id: 'whisper',
      title: 'A whisper of a nudge',
      prompt: 'Set the nudge to $2\\times 10^{-4}$ or smaller and still see two flips about axis 2.',
      hint: 'Drag the nudge slider to the left end. The wait only grows with the logarithm of the nudge, so it is not much longer.',
      check: (s) => s.axis === 2 && (s.pert as number) <= 2.0001e-4 && (s.flips as number) >= 2,
    },
  ],
  caveats: `<p>The body is perfectly rigid, there is no gravity, no air and no energy loss. Under these conditions the flip repeats forever. A real object on Earth falls after one or two flips, and a real object in orbit slowly loses energy by flexing, which brings in the major-axis rule described in the Deep Dive.</p>
<p>The preset inertias come from idealized parts: solid cylinders, boxes and a thin hoop. They are close to real objects but not measured from them. The custom slider keeps $I_3 \\le 2I_1$, which guarantees the moments belong to a real uniform box. The box in the scene is drawn with those exact proportions.</p>
<p>The flip count uses hysteresis. A flip counts only when the axis-2 part of $L$ passes half of $|L|$ in the opposite direction, so small wobbles are ignored.</p>`,
  further: [
    { label: 'Tennis racket theorem (Wikipedia)', url: 'https://en.wikipedia.org/wiki/Tennis_racket_theorem' },
    { label: 'Polhode (Wikipedia)', url: 'https://en.wikipedia.org/wiki/Polhode' },
    { label: "Poinsot's ellipsoid (Wikipedia)", url: 'https://en.wikipedia.org/wiki/Poinsot%27s_ellipsoid' },
    { label: 'Explorer 1 (Wikipedia)', url: 'https://en.wikipedia.org/wiki/Explorer_1' },
  ],
};
