import type { TopicContent } from '../../core/types.ts';

export const content: TopicContent = {
  intuition: `
<p class="lead">Hold a spinning bicycle wheel by one end of its axle and let go of the other end. You expect it to drop. Instead it swings slowly sideways, around and around, and stays up.</p>
<p>The scene shows a gyroscope: a heavy wheel on an axle, resting on a pivot at the top of a stand. Only one end is supported. Gravity pulls down on the wheel. Without spin, it simply falls off the stand. With spin, it <strong>precesses</strong>: the axle sweeps around the stand in a slow horizontal circle.</p>
<p>The secret is that a spinning wheel carries <strong>angular momentum</strong>, drawn as the white arrow along the axle. A twist, called a torque, does not make the wheel tip in the direction it is pushed. It changes the angular momentum arrow, and it changes it <em>in the direction of the twist</em>. Gravity's twist here points sideways (the amber arrow). So the axle moves sideways, not down.</p>
<p>Look closely at the cyan path of the axle tip. It is not a smooth circle. The axle bobs up and down as it goes around. That bobbing is called <strong>nutation</strong>. Depending on how you launch the wheel, the path traces loops, sharp cusps, or gentle waves.</p>
<p>The faster the wheel spins, the slower it precesses and the smaller the bobbing gets. Stop the spin and the magic is gone: it falls like any other weight.</p>`,
  tryFirst: [
    'Watch the white L arrow. The amber arrow at its tip shows which way it is being pushed. The axle follows that push, sideways.',
    'Set <b>Launch</b> to <b>Cusp</b>. This is the wheel let go from rest. The tip dips, stops, dips again, and draws a row of sharp points.',
    'Drag <b>Spin rate</b> up to 200 rad/s. The circle slows down and the wiggles shrink to almost nothing.',
    'Turn on <b>Stop the wheel</b>. With no spin, the gyroscope just falls onto its stand.',
  ],
  equation: {
    tex: '\\boldsymbol\\tau = \\frac{d\\mathbf L}{dt}, \\qquad \\Omega = \\frac{mgl}{I_3\\,\\omega_3}',
    caption: 'Torque changes angular momentum in its own direction. For a fast wheel this gives a steady precession rate that falls as the spin rises.',
    terms: [
      { tex: '\\boldsymbol\\tau', name: 'Torque', meaning: 'The twist from gravity about the pivot, $\\boldsymbol\\tau = \\mathbf r \\times m\\mathbf g$. It is horizontal and at right angles to the axle.', param: 'tau' },
      { tex: '\\mathbf L', name: 'Angular momentum', meaning: 'Mostly the spin of the wheel, $L_3 = I_3\\omega_3$, pointing along the axle.', param: 'L3' },
      { tex: '\\Omega', name: 'Precession rate', meaning: 'How fast the axle sweeps around the stand, in radians per second. The readout measures the average from the simulation.', param: 'omegaMeas' },
      { tex: 'm', name: 'Wheel mass', meaning: 'Sets the weight. Here $I_3$ also grows with $m$, so mass cancels out of $\\Omega$.', param: 'mass' },
      { tex: 'l', name: 'Arm length', meaning: 'Distance from the pivot to the wheel centre. A longer arm means more torque and faster precession.', param: 'arm' },
      { tex: '\\omega_3', name: 'Spin rate', meaning: 'How fast the wheel turns about its axle. Double it and $\\Omega$ halves.', param: 'spin' },
    ],
  },
  physicsNotes: `
<h3>Why a push down turns it sideways</h3>
<p>Put the pivot at the origin. The wheel's centre of mass sits at $\\mathbf r = l\\,\\hat{\\mathbf e}_3$ along the axle. Gravity pulls with $m\\mathbf g$ straight down. The torque about the pivot is</p>
$$\\boldsymbol\\tau = \\mathbf r \\times m\\mathbf g$$
<p>A cross product is perpendicular to both of its inputs. So $\\boldsymbol\\tau$ is perpendicular to the axle and perpendicular to vertical. It is horizontal and sideways. Newton's law for rotation says $d\\mathbf L = \\boldsymbol\\tau\\,dt$. For a fast wheel, $\\mathbf L$ points along the axle, so each small change nudges the axle sideways. The tip of $\\mathbf L$ keeps chasing a torque that keeps turning with it. That is a circle.</p>
<p>The size of that circle's rate follows from geometry. In time $dt$ the horizontal part of $\\mathbf L$, of length $L\\sin\\theta$, turns through $d\\phi = \\tau\\,dt / (L\\sin\\theta)$. With $\\tau = mgl\\sin\\theta$ and $L \\approx I_3\\omega_3$, the $\\sin\\theta$ cancels and</p>
$$\\Omega = \\frac{d\\phi}{dt} = \\frac{mgl}{I_3\\,\\omega_3}$$
<p>The tilt does not matter in this fast-top limit. Neither does the mass here, because the wheel's $I_3 = m r_g^2$ grows with $m$ too. The readouts show $|\\boldsymbol\\tau|$ and $L_3$ scaling together when you change the mass.</p>
<h3>How the simulation works</h3>
<p>Nothing in the code assumes precession. The wheel is a rigid symmetric body with moments $I_1$ (about the pivot, across the axle) and $I_3$ (along the axle). Euler's equations with the gravity torque are integrated in the body frame, and the orientation is a unit quaternion. A fourth-order Runge–Kutta step of 0.1 ms is used, many times per frame.</p>
<p>Three quantities must stay fixed: the energy $E$, the vertical angular momentum $L_z$ (gravity's torque is horizontal), and the spin momentum $L_3$ (the torque is perpendicular to the axle). The drift readouts track the first two. Precession, nutation and the fall all come out of the equations by themselves.</p>`,
  deep: [
    {
      title: 'Nutation: loops, cusps and waves',
      html: `<p>The fast-top formula is an average. The exact motion adds a fast nodding of the axle, called nutation. Its angular frequency, for a fast wheel, is</p>
$$\\omega_{\\text{nut}} \\approx \\frac{I_3\\,\\omega_3}{I_1}$$
<p>which is set by the spin, not by gravity. The corner graph shows the tilt $\\theta$ rising and falling at this rate.</p>
<p>What shape the tip traces depends on the sideways speed at launch, $\\dot\\phi_0$. In the fast-top limit the precession rate swings evenly about the steady value $\\Omega$, between $\\dot\\phi_0$ and $2\\Omega - \\dot\\phi_0$.</p>
<ul>
<li><b>Cusp</b> ($\\dot\\phi_0 = 0$): let go from rest. The tip stops dead at the top of every nod, which draws a sharp point. This is what a real gyroscope does when you release it.</li>
<li><b>Loop</b> ($\\dot\\phi_0 < 0$): launched backwards. The tip briefly runs the wrong way and draws a loop.</li>
<li><b>Wave</b> ($\\dot\\phi_0 > 0$): launched forwards. The tip never stops and draws a smooth wave.</li>
<li><b>Steady</b>: launched at exactly the right rate. There is no nutation at all.</li>
</ul>
<p>For a release from rest the nod depth is $\\Delta\\theta \\approx 2 I_1 m g l \\sin\\theta_0 / (I_3\\omega_3)^2$. It falls with the <em>square</em> of the spin. That is why a fast gyroscope looks like it precesses perfectly smoothly. Real wheels also lose nutation to friction in the pivot, so it fades after a few seconds. This model has no friction, so it keeps going.</p>
<p>The exact steady precession rate solves $I_1\\cos\\theta\\,\\dot\\phi^2 - I_3\\omega_3\\dot\\phi + mgl = 0$. The Steady launch uses its slower root. At $\\theta = 90°$ it equals $mgl/(I_3\\omega_3)$ exactly.</p>`,
    },
    {
      title: 'Conserved quantities and the sleeping top',
      html: `<p>Describe the axle by its tilt $\\theta$ from vertical and its heading $\\phi$. Three quantities never change:</p>
$$E = \\tfrac12 I_1(\\dot\\theta^2 + \\dot\\phi^2\\sin^2\\theta) + \\tfrac12 I_3\\omega_3^2 + mgl\\cos\\theta$$
$$L_z = I_1\\dot\\phi\\sin^2\\theta + I_3\\omega_3\\cos\\theta, \\qquad L_3 = I_3\\omega_3$$
<p>Eliminating $\\dot\\phi$ leaves a one-dimensional problem for $\\theta$ in an effective potential. The axle is trapped between two turning angles. That band is the nutation.</p>
<p>Now stand the axle straight up, like a spinning top. Is upright stable? Linearize about $\\theta = 0$. Small tilts grow or wobble according to $I_1 s^2 - i I_3\\omega_3 s - mgl = 0$. The roots stay oscillatory only when</p>
$$\\omega_3^2 > \\frac{4 I_1\\, m g l}{I_3^2}$$
<p>Above this threshold the top <em>sleeps</em>: it stands upright and barely seems to move. Below it, the slightest tilt grows. A real top slows through friction until it crosses the threshold. Then it starts to wobble and fall. Try it here: set the tilt to 2°, and move the spin either side of the threshold readout.</p>`,
    },
    {
      title: 'Where gyroscopes matter, and where they do not',
      html: `<p><b>Bicycles.</b> A popular story says bikes stay up because the wheels act as gyroscopes. That is mostly wrong. In 2011 Kooijman and colleagues built a bicycle whose wheels had their gyroscopic effect cancelled by counter-spinning wheels, and a slightly negative trail, so there was no caster effect either. It still balanced itself when pushed at the right speed. Wheel gyroscopics play a part in some bike designs, but steering geometry and mass distribution matter more, and the rider does most of the work.</p>
<p><b>Gyrocompasses.</b> A spinning wheel that is allowed to feel gravity's torque will slowly settle with its axle horizontal and in the north-south line, pointing to true north. Unlike a magnetic compass it is not fooled by a steel hull. Hermann Anschütz-Kaempfe in Germany and Elmer Sperry in the United States built the first practical ship gyrocompasses in the early 1900s.</p>
<p><b>Spacecraft.</b> A satellite cannot push against anything. A control moment gyroscope (CMG) holds a fast wheel in a motorised gimbal. Tilting the wheel changes its angular momentum, and by $\\boldsymbol\\tau = d\\mathbf L/dt$ the spacecraft turns the other way. The International Space Station steers with four CMGs whose wheels spin at about 6,600 rpm.</p>`,
    },
    {
      title: 'The Earth is a gyroscope too',
      html: `<p>The Earth spins and bulges at the equator. The Sun and Moon pull harder on the near side of that bulge, which gives a torque that tries to stand the tilted axis upright. Like the wheel in the scene, the axis does not straighten. It precesses.</p>
<p>The axis stays tilted about 23.4° and sweeps around a full cone once every <strong>roughly 25,800 years</strong>. That is about 50 arcseconds per year. Hipparchus noticed the effect in the second century BCE by comparing his star positions with older records. Today Polaris lies near the celestial pole. In roughly 12,000 years the pole will lie near Vega.</p>
<p>The Earth also nods. The Moon's orbit itself turns with an 18.6-year period, which makes the torque wobble. James Bradley found this nutation in the 1700s. Note the difference from the scene: Earth's nutation is driven by a changing torque, while the wheel's nutation is a free motion that depends only on how it was launched.</p>`,
    },
    {
      title: 'Why not just use τ = dL/dt everywhere?',
      html: `<p>The headline equation is exact. What is approximate is the step $\\mathbf L \\approx I_3\\omega_3\\,\\hat{\\mathbf e}_3$. The moment the axle starts to move sideways, the whole body also rotates about a horizontal axis. That adds a small extra piece to $\\mathbf L$, of size about $I_1\\dot\\phi\\sin\\theta$, that does not lie along the axle.</p>
<p>That extra piece is the source of nutation, and of the small differences between the measured and predicted precession you see at low spin. The ratio that decides whether the simple picture works is roughly</p>
$$\\frac{I_1\\,mgl}{(I_3\\,\\omega_3)^2}$$
<p>which compares the gravity energy scale with the spin energy scale. When it is small, the wheel is a "fast top" and $\\Omega = mgl/(I_3\\omega_3)$ is excellent. Try the challenge below and watch the difference readout shrink as you raise the spin.</p>`,
    },
  ],
  challenges: [
    {
      id: 'formula',
      title: 'Match the formula',
      prompt: 'Get the measured precession rate within 5% of $mgl/(I_3\\omega_3)$, and keep it there for at least 4 seconds of simulated time without falling.',
      hint: 'The formula assumes a fast wheel. Raise the spin, or pick the Cusp or Steady launch.',
      check: (s) => s.touched === true && s.fell === false && (s.spin as number) > 0 && (s.t as number) >= 4 && (s.omegaErr as number) < 0.05,
    },
    {
      id: 'cusp',
      title: 'Sharp points',
      prompt: 'Make the axle tip draw cusps: sharp points where it stops dead, with a nutation depth of at least 3°.',
      hint: 'Release the wheel from rest: choose the Cusp launch, or set φ̇₀ to 0. If the depth is too small, lower the spin.',
      check: (s) => s.touched === true && s.shape === 'cusp' && (s.nutDepthDeg as number) >= 3 && (s.t as number) >= 2 && s.fell === false,
    },
    {
      id: 'fall',
      title: 'Not enough spin',
      prompt: 'Reduce the spin until the gyroscope can no longer hold itself up and falls onto the stand.',
      hint: 'With the default launch, somewhere below 50 rad/s the nods get deep enough to hit the stand. Stopping the wheel completely is the extreme case.',
      check: (s) => s.touched === true && s.fell === true,
    },
    {
      id: 'halve',
      title: 'Double the spin',
      prompt: 'Let a run settle for 4 seconds and note the precession. Then double the spin, keeping everything else the same, and let it settle again. Show that the precession halves.',
      hint: 'Try 100 rad/s then 200 rad/s with the Cusp launch. The page remembers your earlier runs.',
      check: (s) => s.halved === true,
    },
  ],
  caveats: `<p>The wheel and axle form one rigid, perfectly symmetric body, and the axle is massless. The pivot is a frictionless point. Real gyroscopes have bearing friction and air drag, so they slow down, their nutation dies away within seconds, and they spiral lower as they precess.</p>
<p>The stand is only a picture. The simulation stops when the wheel's rim would touch the stand or the floor, instead of modelling the collision.</p>
<p>The wheel's spin is drawn much slower than the true rate so the spokes stay readable on screen. Everything else is drawn at true speed, scaled by the slow-motion control.</p>`,
  further: [
    { label: 'Precession (Wikipedia)', url: 'https://en.wikipedia.org/wiki/Precession' },
    { label: 'Kooijman et al., A bicycle can be self-stable without gyroscopic or caster effects, Science (2011)', url: 'https://doi.org/10.1126/science.1201959' },
    { label: 'Axial precession of the Earth (Wikipedia)', url: 'https://en.wikipedia.org/wiki/Axial_precession' },
    { label: 'Lagrange top and the heavy symmetric top (Wikipedia)', url: 'https://en.wikipedia.org/wiki/Lagrange,_Euler,_and_Kovalevskaya_tops' },
  ],
};
