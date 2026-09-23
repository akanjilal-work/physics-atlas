import type { TopicContent } from '../../core/types.ts';

export const content: TopicContent = {
  intuition: `
<p class="lead">A magnet cannot speed up a moving charge or slow it down. It can only turn it. That one rule builds spirals, traps and the northern lights.</p>
<p>A magnetic field pushes sideways on a moving charge, always at right angles to its motion. A push at right angles changes direction but never speed. So in a steady field a charge moves in a circle. Give it some speed along the field too and the circle stretches into a <strong>helix</strong>, a corkscrew wrapped around a field line.</p>
<p>The scene opens with a bundle of those corkscrews. The amber particle is the one you steer. The cyan ones start with the same speed but tilt their velocity at different angles to the field. The steep ones coil tightly along the field. The flat ones circle almost in place.</p>
<p>Now squeeze the field. Near a strong magnet the field lines crowd together, and a spiralling charge feels a gentle push back toward weaker field. If it spirals steeply enough, the push stops it and turns it around. That is a <strong>magnetic mirror</strong>. Two mirrors facing each other make a bottle. Earth is a natural bottle. Its field is strong at the poles and weak above the equator, so charged particles can bounce from pole to pole for a long time. Those trapped particles form the <strong>Van Allen belts</strong>.</p>
<p>A bottle with mirrors at each end still leaks. Particles aimed too closely along the field slip through the end. The leaky range of directions is called the <strong>loss cone</strong>. In the Earth view, particles in the loss cone reach the upper atmosphere, and the green ring glows where they land. Real aurora need extra help from the magnetosphere, which the Deep Dive explains.</p>`,
  tryFirst: [
    'Compare <b>r measured</b> with <b>r predicted</b>. Then double the mass. The helix grows but the picture is rescaled, so watch the numbers.',
    'Flip the <b>charge sign</b>. Every spiral turns the other way.',
    'Pick <b>Crossed E, B</b>. Every particle drifts sideways at the same speed, whatever its orbit looks like.',
    'Pick <b>Mirror</b>. Particles above the loss cone bounce. The ones below it turn red and leave through a coil.',
    'Pick <b>Earth dipole</b> and wait. Trapped particles bounce pole to pole and slowly drift around the planet.',
  ],
  equation: {
    tex: '\\mathbf F \\;=\\; q\\left(\\mathbf E \\,+\\, \\mathbf v \\times \\mathbf B\\right)',
    caption: 'The Lorentz force on a charge $q$. In a uniform magnetic field it makes a circle of radius $r = m v_\\perp/(qB)$, travelled at the angular frequency $\\omega = qB/m$.',
    terms: [
      { tex: '\\mathbf F', name: 'Force', meaning: 'The magnetic part is always at right angles to the velocity. It bends the path but does no work, so kinetic energy stays fixed. The energy drift readout checks this.', param: 'eDrift' },
      { tex: 'q', name: 'Charge', meaning: 'Its size sets how hard the field pushes. Its sign sets which way the particle circles. Ions and electrons gyrate in opposite senses.', param: 'charge' },
      { tex: '\\mathbf E', name: 'Electric field', meaning: 'Pushes along its own direction and can change the speed. Set it in the crossed view, where it makes every orbit drift at $E/B$.', param: 'E' },
      { tex: '\\mathbf v', name: 'Velocity', meaning: 'Only moving charges feel a magnetic force. Faster particles make bigger circles.', param: 'speed' },
      { tex: '\\mathbf v \\times \\mathbf B', name: 'Cross product', meaning: 'Only the part of the velocity across the field, $v_\\perp = v\\sin\\alpha$, feels a force. The pitch angle $\\alpha$ splits the motion into circling and sliding along $\\mathbf B$.', param: 'pitch' },
      { tex: '\\mathbf B', name: 'Magnetic field', meaning: 'A stronger field makes tighter, faster circles. Both $r$ and the period shrink as $1/B$.', param: 'B' },
    ],
  },
  physicsNotes: `
<h3>Circles, helices and the cyclotron frequency</h3>
<p>Take $\\mathbf E = 0$ and a uniform $\\mathbf B$. The force $q\\mathbf v\\times\\mathbf B$ is perpendicular to $\\mathbf v$, so $\\frac{d}{dt}\\tfrac12 m v^2 = \\mathbf F\\cdot\\mathbf v = 0$. Speed is constant. The part of the velocity along $\\mathbf B$ feels nothing. The part across it, $v_\\perp$, is turned by a force of fixed size $qv_\\perp B$. That is uniform circular motion, so set it equal to the centripetal force:</p>
$$\\frac{m v_\\perp^2}{r} = q v_\\perp B \\quad\\Longrightarrow\\quad r = \\frac{m v_\\perp}{qB}, \\qquad \\omega = \\frac{v_\\perp}{r} = \\frac{qB}{m}, \\qquad T = \\frac{2\\pi m}{qB}$$
<p>The period does not depend on the speed. Fast particles make bigger circles but take the same time to go round. That fact is the whole idea behind the cyclotron.</p>
<h3>Drifts</h3>
<p>Add a uniform $\\mathbf E$ at right angles to $\\mathbf B$. Move to a frame travelling at $\\mathbf v_E = \\mathbf E\\times\\mathbf B/B^2$. There the electric force cancels and the particle simply circles. Back in the lab, the circle slides along at</p>
$$v_E = \\frac{E}{B}$$
<p>Charge and mass have dropped out. Every particle drifts together. Any slow force does something similar. Gravity, a field gradient or curved field lines each push the guiding centre sideways. In Earth's field the gradient and curvature drifts carry ions west and electrons east.</p>
<h3>How the simulation solves it</h3>
<p>The scene uses the <strong>Boris method</strong>, introduced by Jay Boris in 1970 and still the workhorse of plasma codes. Each step gives half an electric kick, then rotates the velocity about $\\mathbf B$, then gives the other half kick. The rotation is built so it can never change the length of the velocity vector. In a pure magnetic field the energy is therefore conserved to round-off, even with large steps. The energy drift readout sits near $10^{-15}$.</p>
<p>Boris is not perfect. With few steps per turn it rotates by $2\\arctan(\\omega\\Delta t/2)$ instead of $\\omega\\Delta t$, so the period and radius come out a little large. Lower <b>Boris steps per gyration</b> and watch the measured values drift from the formula while the energy stays exact. Each particle uses a fixed step, set by the strongest field it will meet. A fixed step keeps the method time-symmetric, which is what keeps the magnetic moment steady over thousands of bounces.</p>`,
  deep: [
    {
      title: 'Lorentz, Lawrence and the cyclotron',
      html: `<p>Oliver Heaviside worked out the magnetic force on a moving charge in 1889. Hendrik Lorentz gave the full electric plus magnetic form in 1895, and the force carries his name.</p>
<p>In 1929 Ernest Lawrence saw a use for the speed-independent period $T = 2\\pi m/(qB)$. Put ions between two hollow D-shaped electrodes inside a magnet. Flip the voltage across the gap every half period. Each time an ion crosses the gap it gains energy, moves to a bigger circle, and still arrives back at the gap exactly in step. With M. Stanley Livingston he built a working cyclotron a few inches across in 1931, and it reached about 80 keV. Lawrence received the 1939 Nobel Prize in Physics.</p>
<p>The trick fails at high energy. Relativity replaces $m$ with $\\gamma m$, so fast particles slow their rotation and fall out of step. Synchrocyclotrons and synchrotrons fix this by changing the frequency or the field as the particles speed up.</p>`,
    },
    {
      title: 'Velocity selectors and mass spectrometers',
      html: `<p>Crossed fields pass particles straight through only when the electric and magnetic forces cancel, $qE = qvB$, so at exactly $v = E/B$. That is the pure drift in this scene, seen from the lab. J.J. Thomson used balanced crossed fields in 1897 to measure the charge-to-mass ratio of cathode rays, which showed they were particles far lighter than atoms.</p>
<p>A magnetic field then sorts particles by mass. At a fixed speed, $r = mv/(qB)$ grows with $m/q$, so different isotopes land in different places. Arthur Dempster built an early magnetic-sector instrument in 1918. Francis Aston's mass spectrograph of 1919 revealed isotopes in many stable elements, and he received the 1922 Nobel Prize in Chemistry. Modern instruments add many designs, but the radius formula in the caption is still at the heart of the magnetic ones.</p>`,
    },
    {
      title: 'Mirrors, the magnetic moment and fusion',
      html: `<p>When the field changes slowly compared with one gyration, the quantity</p>
$$\\mu = \\frac{m v_\\perp^2}{2B}$$
<p>stays almost constant. It is the magnetic moment of the little current loop the particle makes. It is an <em>adiabatic invariant</em>, conserved approximately but very well. The readout <b>lead μ / μ₀</b> tracks it.</p>
<p>Energy is exactly conserved too. As the particle moves into stronger field, $v_\\perp^2 = 2\\mu B/m$ must grow, so $v_\\parallel$ must shrink. If $v_\\parallel$ reaches zero the particle turns around. In terms of the pitch angle, $\\sin^2\\alpha / B$ is constant, so a particle launched at $B_{\\min}$ reflects if</p>
$$\\sin^2\\alpha > \\frac{B_{\\min}}{B_{\\max}} \\equiv \\sin^2\\alpha_{\\text{loss}}$$
<p>Everything inside the cone $\\alpha < \\alpha_{\\text{loss}}$ escapes. The test suite checks the two-coil field against this rule: two degrees above the cone the particle is trapped, two degrees below it leaks out.</p>
<p>Mirror machines were an early route to fusion. The loss cone is their weakness. Collisions keep kicking ions into the cone, so the plasma leaks out of the ends faster than it can be heated. Most programmes turned instead to the <strong>tokamak</strong>, first developed in the Soviet Union from ideas of Igor Tamm and Andrei Sakharov. A tokamak bends the field into a ring, so field lines have no ends to leak from. A current in the plasma twists the lines into helices, which cancels the drifts that would otherwise push particles into the wall. ITER, now being built in France, is a tokamak. Mirror research continues on a smaller scale, helped by stronger superconducting magnets.</p>`,
    },
    {
      title: 'The Van Allen belts',
      html: `<p>Explorer 1, the first US satellite, launched on 31 January 1958. It carried a Geiger counter from James Van Allen's group at the University of Iowa. At high altitude the count rate sometimes dropped to zero. Van Allen's team concluded that the radiation was so intense it swamped the counter. Explorer 3 confirmed it a few weeks later. Earth is wrapped in belts of trapped energetic particles.</p>
<p>Carl Størmer had already worked out, in the early 1900s, that a dipole field could trap charged particles. The trapped motion has three parts on three very different time scales, as in the dipole view:</p>
<ul>
<li><strong>Gyration</strong> around a field line. For a typical belt electron, well under a millisecond per turn.</li>
<li><strong>Bounce</strong> from one hemisphere to the other between mirror points. Roughly a tenth of a second to a second.</li>
<li><strong>Drift</strong> around the planet, ions westward and electrons eastward. Minutes to hours for one lap.</li>
</ul>
<p>The inner belt holds mostly energetic protons, the outer belt mostly energetic electrons. Their radiation matters for satellites and astronauts. In a dipole, the loss cone seen at the equator of shell $L$ satisfies $\\sin^2\\alpha_{\\text{loss}} = 1/(L^3\\sqrt{4-3/L})$. At $L = 3$ it is about 8.4°, so most particles are trapped.</p>
<p>The dipole view uses scaled numbers. A real belt electron circles with a radius of kilometres around a planet 6400 km in radius, and the time scales are far more separated. The scene shrinks the planet so you can see all three motions at once.</p>`,
    },
    {
      title: 'How aurora really form',
      html: `<p>The scene draws a green ring where loss-cone particles from the $L = 3$ shell would reach the ground. That is the right geometry for precipitation, but it is not the whole story of the aurora, and the ring is not where real aurora appear.</p>
<p>Real aurora glow when electrons with energies of roughly a few hundred eV to tens of keV hit the upper atmosphere, about 100 to 300 km up. Oxygen gives the common green line at 557.7 nm and the higher red glow at 630 nm. Nitrogen adds blue and purple. The auroral ovals sit around 65° to 70° magnetic latitude. Their field lines reach far out into the magnetosphere, well beyond the $L = 3$ shell in the scene.</p>
<p>Simple leakage from trapped belts is not enough. The <strong>diffuse aurora</strong> comes mainly from electrons in the outer magnetosphere that plasma waves scatter into the loss cone. The bright, shifting <strong>discrete arcs</strong> come from electrons that are <em>accelerated</em> down the field lines, by electric fields aligned with $\\mathbf B$ a few thousand kilometres up and by Alfvén waves. The energy comes from the solar wind, fed in through magnetic reconnection and released in storms and substorms. The loss cone decides which particles can reach the atmosphere. The magnetosphere decides how many arrive and with what energy.</p>`,
    },
  ],
  challenges: [
    {
      id: 'radius',
      title: 'Big orbit, right answer',
      prompt: 'In the <b>Uniform B</b> view, set up a lead particle whose formula gyroradius $r = mv_\\perp/(qB)$ is at least 2.5, and let it turn once so the measured radius agrees with the formula to within 2%.',
      hint: 'Raise the mass or speed, or lower B. Keep the pitch angle well above zero so $v_\\perp$ is large.',
      check: (s) => s.view === 'uniform' && (s.rPred as number) >= 2.5 && s.rValid === true && Math.abs((s.rMeas as number) / (s.rPred as number) - 1) < 0.02,
    },
    {
      id: 'exb',
      title: 'Pure drift',
      prompt: 'In the <b>Crossed E, B</b> view, launch the lead particle so it does not gyrate at all. It should glide in a straight line at right angles to both fields.',
      hint: 'The lead starts moving across B in the drift direction. Set the pitch to 90° and make the speed equal to E/B, for example E = 0.5 and B = 1 with speed 0.5.',
      check: (s) => s.view === 'crossed' && (s.vD as number) >= 0.05 && (s.gyroRes as number) < 0.03 && (s.vParRes as number) < 0.03 && (s.t as number) > 0.5,
    },
    {
      id: 'trap',
      title: 'Ten bounces',
      prompt: 'In the <b>Mirror</b> view, keep the lead particle trapped for 10 reflections.',
      hint: 'Its pitch angle must be above the loss-cone angle. A higher mirror ratio makes the cone narrower.',
      check: (s) => s.view === 'mirror' && (s.leadBounces as number) >= 10 && s.leadLost === false,
    },
    {
      id: 'lose',
      title: 'Through the loss cone',
      prompt: 'Lose the lead particle through the loss cone, in the <b>Mirror</b> or the <b>Earth dipole</b> view.',
      hint: 'Set its pitch angle below the loss-cone readout. In the dipole the cone is only about 8°.',
      check: (s) => (s.view === 'mirror' || s.view === 'dipole') && s.leadLost === true,
    },
  ],
  caveats: `<p>Motion is non-relativistic. Real belt electrons are often relativistic, which changes the gyration frequency to $qB/(\\gamma m)$. The particles do not collide, radiate, or feel each other, and they do not change the field. Real mirror plasmas and real belts are shaped by all of these.</p>
<p>The dipole is a pure, untilted dipole in scaled units. Earth's field is compressed by the solar wind on the day side and stretched into a long tail on the night side. The planet is drawn far too small next to the orbits so that gyration, bounce and drift fit on one screen. The atmosphere is treated as a hard surface at the planet's radius. The aurora ring marks where the $L = 3$ shell meets the ground, not the real auroral oval.</p>
<p>The coils are ideal thin current loops. With large gyroradii the adiabatic picture breaks down, and particles can scatter across the loss-cone boundary. That is real physics too, but it means the loss cone is sharp only when orbits are small compared with the field's scale.</p>`,
  further: [
    { label: 'Lorentz force on Wikipedia', url: 'https://en.wikipedia.org/wiki/Lorentz_force' },
    { label: 'Van Allen radiation belt on Wikipedia', url: 'https://en.wikipedia.org/wiki/Van_Allen_radiation_belt' },
    { label: 'Magnetic mirror on Wikipedia', url: 'https://en.wikipedia.org/wiki/Magnetic_mirror' },
    { label: 'Qin et al., Why is Boris algorithm so good? (2013)', url: 'https://doi.org/10.1063/1.4818428' },
  ],
};
