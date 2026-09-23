import type { TopicContent } from '../../core/types.ts';

export const content: TopicContent = {
  intuition: `
<p class="lead">Spin a rattleback one way and it spins smoothly. Spin it the other way and it slows down, starts to rock and rattle, stops, and then spins off in the opposite direction. It looks like a toy that disobeys physics. It does not.</p>
<p>A rattleback is a long, boat-shaped piece of wood, stone or plastic with a curved bottom. It is also called a <strong>celt</strong> (said "selt"), after the archaeologists' word for a prehistoric stone axe head. Stories say that old polished axe heads were found to behave this way, and that this gave the toy its name. Those stories are hard to trace to any source, so treat them as folklore.</p>
<p>The secret is a small twist. The curved bottom has a long direction and a short direction. The mass inside is lined up along a slightly different direction, turned by a small <strong>skew angle</strong> $\\delta$. In the scene the <span style="color:#f5b642">amber stripe</span> runs along the curved shape and the <span style="color:#4fd1e8">cyan line</span> shows the mass axis. That mismatch makes the toy <strong>chiral</strong>. Like a screw, it has a handedness, and so it prefers one direction of spin.</p>
<p>When it spins the "wrong" way, the rolling contact with the table quietly feeds energy out of the spin and into a <strong>pitching</strong> motion, where the two ends bob up and down. The pitching grows, the spin dies, and then the pitching hands its energy back as spin in the preferred direction. Tap one end of a resting rattleback and the same handoff turns the pitching straight into spin.</p>
<p>Watch the inset. The <span style="color:#5ee39a">green</span> spin curve falls through zero while the <span style="color:#f5b642">amber</span> pitch swells and fades. Energy is only being moved around. The table's grip is what lets it move.</p>`,
  tryFirst: [
    'Watch the default run. The spin starts clockwise, the pitch trace swells, and the spin comes back counterclockwise. The <b>spin reversal time</b> readout records the moment.',
    'Drag <b>Initial spin</b> to +4. That is the preferred direction for $\\delta > 0$. The spin carries on with hardly a shiver for a long time.',
    'Set <b>Skew angle δ</b> to 0. The toy is now mirror symmetric and neither direction reverses.',
    'Set the spin near 0 and press <b>Tap an end</b>. The pitching alone makes it start to spin.',
  ],
  equation: {
    tex: '\\dot P = -\\lambda k\\,n\\,P,\\quad \\dot R = k\\,n\\,R,\\quad \\dot n = k\\,(\\lambda P^2 - R^2)',
    caption: 'The reduced model of Moffatt and Tokieda (2008), rewritten here with time and amplitudes unscaled. It governs slow spin $n$, pitch amplitude $P$ and roll amplitude $R$. Sign conventions differ between papers. The coupling $k$ exists only because of the skew, $k \\propto \\sin 2\\delta$. The simulation itself solves the full nonlinear rolling equations, and the readouts show that it obeys these rules.',
    terms: [
      { tex: 'n', name: 'Spin rate', meaning: 'Rotation about the vertical, in rad/s. Positive is counterclockwise seen from above. Its sign decides which mode grows.', param: 'spin0' },
      { tex: 'k', name: 'Skew coupling', meaning: 'Proportional to $\\sin 2\\delta$. It is zero for a mirror-symmetric toy and flips sign when the skew is mirrored. That sign is the chirality.', param: 'delta' },
      { tex: '\\lambda', name: 'Pitch-roll ratio', meaning: 'The square of the ratio of the pitching and rolling frequencies, $\\lambda = (\\omega_P/\\omega_R)^2$. It is set by the shape. A long toy has $\\lambda$ well above 1, so pitching feeds on spin much faster than rolling does.', param: 'lambda' },
      { tex: '-\\lambda k n', name: 'Pitch growth rate', meaning: 'Positive when $k n < 0$. That is the "wrong" spin direction, where pitching grows exponentially and drains the spin. The readout is computed from the full linearized equations.', param: 'sigmaP' },
      { tex: 'k n', name: 'Roll growth rate', meaning: 'Has the opposite sign and is about $\\lambda$ times weaker. In the preferred direction rolling grows, but slowly.', param: 'sigmaR' },
    ],
  },
  physicsNotes: `
<h3>What the headline says</h3>
<p>For one sign of $k n$ the pitch grows and the roll decays. For the other sign it is the reverse. Whichever mode grows takes its energy from the spin, and the third equation drives $n$ toward the sign that pitching prefers. Multiply each equation by its variable and add them. The right-hand sides cancel, so</p>
$$n^2 + P^2 + R^2 = \\text{const}.$$
<p>That is the energy handoff in scaled form. Spin, pitch and roll trade one pot of energy between them. With $\\delta = 0$, $k$ vanishes and nothing is traded.</p>
<h3>The model the scene runs</h3>
<p>The simulation does not use the reduced model. It solves the full equations of a rigid semi-ellipsoid rolling without slipping on a flat table, the same Newton-Euler system used by Kane and Levinson (1982) and by Lindberg and Longman (1983). Let $\\mathbf r$ run from the centre of mass to the contact point, and let $\\hat{\\boldsymbol\\gamma}$ be the upward vertical, both written in body axes. No slip means the centre of mass moves at $\\mathbf v = \\mathbf r \\times \\boldsymbol\\omega$. Eliminating the unknown contact force between Newton's and Euler's laws gives</p>
$$\\big[\\mathbf I + m(r^2\\mathbf 1 - \\mathbf r\\mathbf r^{\\mathsf T})\\big]\\dot{\\boldsymbol\\omega} = -\\boldsymbol\\omega\\times\\mathbf I\\boldsymbol\\omega + m\\,\\mathbf r\\times\\big(\\dot{\\mathbf r}\\times\\boldsymbol\\omega + \\boldsymbol\\omega\\times\\mathbf v + g\\hat{\\boldsymbol\\gamma}\\big),\\qquad \\dot{\\hat{\\boldsymbol\\gamma}} = \\hat{\\boldsymbol\\gamma}\\times\\boldsymbol\\omega.$$
<p>The skew enters only through $\\mathbf I$. Its principal axes are turned by $\\delta$ from the curvature axes, which gives a product of inertia $I_{xy} = (A-B)\\sin\\delta\\cos\\delta$. The body is 4 cm wide, 2 cm deep and 12 to 28 cm long, with a mass of 200 g. The code integrates with fourth-order Runge-Kutta at 2000 steps per simulated second, carrying the attitude as a unit quaternion. With friction off, the energy drift readout stays near $10^{-9}$ or better. The contact height error compares the integrated height of the centre of mass with the height the attitude requires. It stays at the nanometre level.</p>
<p>The growth rate readouts come from linearizing the full equations about steady spin at the current rate. Their ratio is close to $-\\lambda$, as the headline predicts.</p>`,
  deep: [
    {
      title: 'Where the angular momentum goes',
      html: `<p>A spinning toy that reverses by itself looks like it breaks conservation of angular momentum. It would, if nothing pushed on it. But the table pushes on it at the contact point, with an upward normal force and a sideways grip force.</p>
<p>Take angular momentum about a fixed point on the table. Gravity and the normal force are vertical, so their torques about that point are horizontal. They cannot change the vertical spin. The grip force is horizontal and acts at a point on the table, a horizontal distance away. Its torque is vertical. So the <strong>grip force is what changes the spin</strong>. The Earth takes up the opposite angular momentum, far too little to notice.</p>
<p>The grip does no work, because the contact point is not sliding. That is why energy can still be conserved while the spin reverses. On a truly frictionless surface the toy would slide instead of roll, and it would not reverse.</p>`,
    },
    {
      title: 'Why the skew makes it chiral',
      html: `<p>Mirror the toy in a vertical plane through its long axis. A symmetric toy ($\\delta = 0$) looks the same in the mirror, but clockwise and counterclockwise spins swap. So a symmetric toy cannot prefer either direction. Whatever happens for one spin must happen for the other.</p>
<p>With $\\delta \\ne 0$ the mirror image has skew $-\\delta$, which is a different toy. The only rule left is that the toy with $+\\delta$ spinning one way behaves like the toy with $-\\delta$ spinning the other way. The tests check this in the full model. The growth rates at $(n, \\delta)$ match those at $(-n, -\\delta)$ exactly, and the rates at $\\delta = 0$ are zero.</p>
<p>Two misalignments matter: the long axis of the curvature and the long axis of the mass. If either set of axes is circular, the angle between them has no meaning and the effect disappears. So you need both an elongated bottom and a skewed mass. In the scene, making the shape rounder lowers $\\lambda$ and brings the pitch and roll rates closer together.</p>`,
    },
    {
      title: 'Estimating the reversal time',
      html: `<p>Spinning the wrong way, the pitch grows like $P_0\\, e^{\\sigma_P t}$ with $\\sigma_P = \\lambda |k n|$. The spin barely changes until the pitch is large enough to hold a good share of the energy. So the reversal time is roughly</p>
$$t_{\\text{rev}} \\approx \\frac{1}{\\lambda |k n|}\\,\\ln\\frac{P_{\\text{big}}}{P_0}.$$
<p>Two things follow. A faster spin reverses sooner, because $\\sigma_P$ grows with $|n|$. And the reversal time depends only on the logarithm of the starting wobble $P_0$. A thousand times smaller wobble only adds about $7/\\sigma_P$. The scene starts every run with a wobble of 0.01 rad/s in pitch and in roll. A different choice would shift the reversal time a little, not remove it. A tap sets $P_0$ large, which is why tapping a wrongly spinning rattleback makes it reverse almost at once.</p>`,
    },
    {
      title: 'History: from celts to chiral dynamics',
      html: `<p>The first analysis came from Gilbert Walker, in "On a dynamical top", published in the <em>Quarterly Journal of Pure and Applied Mathematics</em> in 1896. Walker, later famous in meteorology, linearized the rolling equations. He showed that the effect comes from the misalignment of the inertia axes and the curvature axes.</p>
<p>Hermann Bondi returned to the problem in 1986 in the <em>Proceedings of the Royal Society A</em>. Garcia and Hubbard (1988) compared a nonlinear model with experiments on real rattlebacks. Moffatt and Tokieda (2008) reduced the dynamics to the three-variable system in the headline, and called it a prototype of chiral dynamics.</p>
<p>The name is a mix-up worth knowing. A celt is an archaeologist's term for a stone or bronze axe or chisel head. It has nothing to do with the Celts. According to Moffatt and Tokieda, the word itself entered use through an error in copies of the Latin Bible. The claim that 19th-century archaeologists found reversing stone celts is repeated often but lacks a clear source.</p>`,
    },
    {
      title: 'Friction and repeated reversals',
      html: `<p>With no losses, the model never settles. After a wrong-way reversal the spin runs the preferred way. Then the weak roll instability slowly takes over and can reverse it again. The toy keeps trading energy between spin, pitch and roll, reversing back and forth over long times. Let the simulation run with friction off and you can see it.</p>
<p>Real rattlebacks lose energy to rolling resistance, air and sound, and the rattle damps quickly. The slow roll instability usually runs out of energy first, so a real toy reverses once and then spins down. Some rattlebacks are made to reverse in both directions, where the roll effect is strong enough to be seen.</p>
<p>The friction toggle adds a small resisting couple proportional to the angular velocity. It is a crude stand-in for all these losses. It is not the grip at the contact, which is always on. Turn it on and spin the preferred way. The slow roll instability never gets going before the spin fades.</p>`,
    },
  ],
  challenges: [
    {
      id: 'wrong-way',
      title: 'Spin it the wrong way',
      prompt: 'Choose your own start against the preferred direction and watch the spin reverse.',
      hint: 'The preferred direction readout names the good way. Set the initial spin to the other sign, at least 1 rad/s, and wait for the reversal time to appear.',
      check: (s) => s.touched === true && (s.preferredSign as number) !== 0 && (s.spin0 as number) * (s.preferredSign as number) <= -1 && s.reversed === true,
    },
    {
      id: 'right-way',
      title: 'Spin it the right way',
      prompt: 'Spin it at least 2 rad/s in the preferred direction and let it run 8 simulated seconds with no reversal.',
      hint: 'With the default skew, positive spin is preferred. Do not tap it.',
      check: (s) => s.touched === true && (s.spin0 as number) * (s.preferredSign as number) >= 2 && (s.t as number) >= 8 && s.reversed === false && s.tapped === false,
    },
    {
      id: 'no-skew',
      title: 'Remove the twist',
      prompt: 'Set the skew angle to exactly 0, spin it either way at 2 rad/s or more, and run 8 seconds. It should never reverse.',
      hint: 'Drag the skew slider to 0.00°. Now neither direction is special.',
      check: (s) => s.touched === true && Math.abs(s.deltaDeg as number) < 0.01 && Math.abs(s.spin0 as number) >= 2 && (s.t as number) >= 8 && s.reversed === false && s.tapped === false,
    },
    {
      id: 'tap',
      title: 'Tap it to start a spin',
      prompt: 'Start from (almost) no spin and tap an end. Get the toy spinning at more than 0.5 rad/s.',
      hint: 'Set initial spin between −0.2 and 0.2 rad/s, keep a nonzero skew, and press Tap an end once or twice.',
      check: (s) => s.tapped === true && Math.abs(s.spin0 as number) < 0.2 && (s.maxSpinAfterTap as number) > 0.5,
    },
  ],
  caveats: `
<p>The body is a uniform solid semi-ellipsoid. The skew is imposed by turning its inertia tensor by $\\delta$, while real rattlebacks get it from a twisted hull or off-axis weights. The contact never slips and the toy never leaves the table. Real toys can skid or bounce while they rattle. The "friction" toggle is a single viscous couple, a rough stand-in for rolling resistance and air drag. The headline equation is a leading-order reduced model for small spin, small amplitudes and small skew. The scene solves the full nonlinear equations, which agree with it only in that limit. Reversal times depend on the size of the starting wobble, which here is a fixed small value. The sizes and mass are illustrative, not those of a particular toy.</p>`,
  further: [
    { label: 'Rattleback (Wikipedia)', url: 'https://en.wikipedia.org/wiki/Rattleback' },
    { label: 'Garcia and Hubbard (1988), Spin reversal of the rattleback: theory and experiment', url: 'https://doi.org/10.1098/rspa.1988.0078' },
    { label: 'Bondi (1986), The rigid body dynamics of unidirectional spin', url: 'https://doi.org/10.1098/rspa.1986.0052' },
    { label: 'Moffatt and Tokieda (2008), Celt reversals: a prototype of chiral dynamics (PDF)', url: 'https://www.damtp.cam.ac.uk/user/hkm2/PDFs/Moffatt_Tokieda_2008_PRSEA_138_361.pdf' },
  ],
};
