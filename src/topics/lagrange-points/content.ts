import type { TopicContent } from '../../core/types.ts';

export const content: TopicContent = {
  intuition: `
<p class="lead">A planet circles its star. Ride along with it and the two look frozen in place. In that turning view there are exactly five spots where a small third body could sit still and stay put. These are the <strong>Lagrange points</strong>.</p>
<p>At each spot three effects cancel: the pull of the star, the pull of the planet, and the outward fling you feel on a turning merry-go-round. Three of the points lie on the line through the two bodies. The other two, <strong>L4</strong> and <strong>L5</strong>, sit where a triangle with equal sides would put them, one ahead of the planet and one behind.</p>
<p>The scene draws those balancing acts as a landscape. The two pits are the star and the planet. The high circular ridge is where the pulls roughly balance. L1, L2 and L3 are mountain passes. L4 and L5 are the two <strong>hilltops</strong>.</p>
<p>Here is the surprise. A marble on a hilltop should roll off. Yet the white particle launched near L4 just circles the summit in a slow banana-shaped loop called a <strong>tadpole</strong>. What holds it there is not the landscape at all. It is the <strong>Coriolis effect</strong>, the same sideways push that turns hurricanes. As the particle starts to slide downhill it picks up speed, and Coriolis steers it sideways, around the hill instead of off it.</p>
<p>Jupiter's L4 and L5 hold thousands of real asteroids doing exactly this. The corner graph tracks the particle's angle from the planet, so you can read its motion at a glance.</p>`,
  tryFirst: [
    'Watch the default <b>Sun-Jupiter</b> run. The particle circles L4 in a tadpole. The corner graph swings back and forth but never reaches the planet line at 0°.',
    'Set <b>Nudge outward</b> to about 0.013 and raise the speed. The particle now sweeps past L3 and turns back before reaching Jupiter. That is a <b>horseshoe</b>.',
    'Pick <b>Earth-Moon</b>, launch from <b>L1</b> with a small kick, and watch the rose Hill curves. The particle slips through the neck and loops around the Moon.',
    'Pick <b>Above Routh</b> and launch from L4. The hilltop can no longer hold it.',
  ],
  equation: {
    tex: '\\Omega(x,y) \\,=\\, \\tfrac12\\left(x^2+y^2\\right) \\,+\\, \\frac{1-\\mu}{r_1} \\,+\\, \\frac{\\mu}{r_2}',
    caption: 'The effective potential in the frame that turns with the two masses. Distances are in units of their separation, and the frame turns once per $2\\pi$ time units. The Lagrange points are the five places where $\\nabla\\Omega = 0$.',
    terms: [
      { tex: '\\Omega', name: 'Effective potential', meaning: 'Height in the scene is $-\\Omega$, so hilltops are minima of $\\Omega$. A moving particle can only go where $2\\Omega \\ge C$, the Jacobi constant. The rose curves mark the edge.', param: 'jacobi' },
      { tex: '\\tfrac12\\left(x^2+y^2\\right)', name: 'Centrifugal term', meaning: 'The outward fling of the turning frame. It exists only in the rotating view. Switch to the inertial frame and it disappears, along with Coriolis.', param: 'inertial' },
      { tex: '\\frac{1-\\mu}{r_1}', name: 'Heavy mass', meaning: 'Gravity of the star (or Earth), with mass $1-\\mu$, at distance $r_1$. The presets pick a real pair.', param: 'preset' },
      { tex: '\\frac{\\mu}{r_2}', name: 'Light mass', meaning: 'Gravity of the planet (or Moon), with mass fraction $\\mu$. Raising $\\mu$ deepens its pit and pushes L1 and L2 outward.', param: 'mu' },
      { tex: 'x,\\,y', name: 'Launch point', meaning: 'Where the particle starts. The nudge moves it off the chosen Lagrange point along the line from the centre.', param: 'dr' },
    ],
  },
  physicsNotes: `
<h3>The equations of motion</h3>
<p>In the turning frame the particle feels the slope of $\\Omega$ plus the Coriolis force. The Coriolis terms are the $2\\dot y$ and $-2\\dot x$:</p>
$$\\ddot x - 2\\dot y = \\frac{\\partial \\Omega}{\\partial x}, \\qquad \\ddot y + 2\\dot x = \\frac{\\partial \\Omega}{\\partial y}$$
<p>The heavy mass sits at $(-\\mu, 0)$ and the light one at $(1-\\mu, 0)$. The particle is too small to move them. That is what "restricted" means.</p>
<h3>The Jacobi constant</h3>
<p>Energy is not conserved in a turning frame, but one combination is:</p>
$$C = 2\\Omega(x,y) - \\left(\\dot x^2 + \\dot y^2\\right)$$
<p>Since speed squared cannot be negative, the particle is confined to where $2\\Omega \\ge C$. The boundary, where the speed would drop to zero, is the <strong>zero-velocity</strong> or Hill curve. In the scene it is a flat slice through the landscape at height $-C/2$. The shaded rose zone is forbidden.</p>
<h3>How the scene solves it</h3>
<p>The particle is stepped with classical fourth-order Runge-Kutta. The step is $10^{-3}$ time units, about 6300 steps per orbit, and it shrinks near either mass. The <strong>C drift</strong> readout shows how far $C$ has moved from its launch value. It stays near $10^{-12}$ or better, so what you see is physics and not numerical error.</p>
<h3>Finding the points</h3>
<p>On the $x$ axis $\\partial\\Omega/\\partial y = 0$ by symmetry. So L1, L2 and L3 are the three zeros of $\\partial\\Omega/\\partial x$, one in each gap around the masses. The scene finds each by bisection. L4 and L5 are exact: each is one unit from both masses, at $(\\tfrac12 - \\mu, \\pm\\tfrac{\\sqrt3}{2})$.</p>`,
  deep: [
    {
      title: 'Euler, Lagrange and the five points',
      html: `<p>In 1767 Leonhard Euler found three-body motions where the bodies stay on a turning straight line. Those are the collinear points L1, L2 and L3. In 1772 Joseph-Louis Lagrange won a prize of the Paris Academy with his essay on the three-body problem. It showed that three bodies at the corners of an equilateral triangle can also turn rigidly, for any masses. For a tiny third body those corners are L4 and L5.</p>
<p>The triangle result is exact and needs no small-mass assumption. The positions of L1 to L3 have no neat formula. For small $\\mu$ they sit close to the light mass at distance about the Hill radius:</p>
$$d \\approx h\\left(1 \\mp \\tfrac{h}{3}\\right), \\qquad h = \\left(\\tfrac{\\mu}{3}\\right)^{1/3}$$
<p>For the Sun and Earth, $h \\approx 0.01$, so L1 and L2 lie about 1.5 million km from Earth. L3 sits on the far side of the star, just outside the planet's orbit.</p>`,
    },
    {
      title: 'Why a hilltop can be stable',
      html: `<p>L4 and L5 are maxima of $-\\Omega$. With the potential alone, anything there would roll away. The Coriolis force changes that. Linearise the equations of motion about L4. Solutions go as $e^{\\lambda t}$ with</p>
$$\\lambda^4 + \\lambda^2 + \\tfrac{27}{4}\\,\\mu(1-\\mu) = 0$$
<p>All four roots are purely imaginary, so the motion only oscillates, when $27\\,\\mu(1-\\mu) < 1$. That gives <strong>Routh's critical ratio</strong>:</p>
$$\\mu < \\mu_R = \\tfrac12\\left(1 - \\sqrt{\\tfrac{23}{27}}\\right) \\approx 0.03852$$
<p>The condition for general masses was found by Gascheau in 1843 and by Routh in 1875. Sun-Jupiter ($\\mu \\approx 0.00095$) and Earth-Moon ($\\mu \\approx 0.0122$) both pass. The two roots give two motions: a fast epicycle close to one orbit long and a slow drift around the hill. For small $\\mu$ the slow period is about $2\\pi/\\sqrt{27\\mu/4}$, roughly 12 Jupiter orbits or 150 years for the Trojans. The test suite checks this against the simulation.</p>
<p>Two honest caveats. Linear stability is only the first step. For the planar problem, KAM theory later showed that L4 is also stable in the full nonlinear sense for $\\mu$ below the limit, except at a few special ratios. And the collinear points are always unstable, for any $\\mu$.</p>`,
    },
    {
      title: 'Tadpoles and horseshoes',
      html: `<p>Nudge the particle a little from L4 and it traces a <strong>tadpole</strong>: a slow loop around the hilltop, stretched along the orbit. Nudge it more and the loop grows until it wraps past L3 and reaches the other side. It still never passes the planet. It turns back just short of it, so the path is a <strong>horseshoe</strong> that encloses L3, L4 and L5.</p>
<p>Both shapes are seen in nature. Jupiter's Trojans are tadpoles. Saturn's moons Janus and Epimetheus share almost the same orbit in a horseshoe-like dance. They swap inner and outer lanes about every four years. Near Earth, the asteroid 3753 Cruithne follows a horseshoe-like path relative to our planet.</p>
<p>The Hill curves only fence the motion in. They do not set its shape. A particle launched from rest near L4 has $C$ just above $C_{L4}$, so a small rose island around the summit is forbidden. The particle touches that island at its turning points and circles it. Whether the loop is a tadpole or a horseshoe is decided by the dynamics, not by the fence. For Sun-Jupiter, launched from rest, the switch comes at an outward nudge of about 0.013. Push much further and the particle is no longer shielded from the planet. It makes close passes and its path turns chaotic.</p>`,
    },
    {
      title: 'Trojans and the Lucy mission',
      html: `<p>In 1906 Max Wolf found the first asteroid near Jupiter's L4, later named 588 Achilles. By convention, asteroids at L4 are named after Greek heroes of the Trojan War and those at L5 after Trojans. More than ten thousand Jupiter Trojans are now known. Trojans of Mars and Neptune have been found too, and Earth has at least two small ones, 2010 TK7 and 2020 XL5.</p>
<p>NASA's <strong>Lucy</strong> spacecraft launched in October 2021 to visit them. It is due to reach its first Trojan in 2027 and the binary pair Patroclus and Menoetius at L5 in 2033. The Trojans may be leftovers from the early Solar System, so they record how the giant planets formed and moved.</p>
<p>The model here is idealised. Real Trojans also feel Saturn and follow inclined, eccentric orbits. Some of them are lost over billions of years.</p>`,
    },
    {
      title: 'Parking spacecraft: SOHO at L1 and JWST at L2',
      html: `<p>The collinear points are unstable, but only mildly. A spacecraft can orbit near one of them with small, regular engine burns. Missions fly large <strong>halo</strong> or Lissajous orbits around the point rather than sitting on it.</p>
<p>The Sun-Earth L1 point lies about 1.5 million km toward the Sun. The solar observatory <strong>SOHO</strong>, launched in 1995, has watched the Sun from there without interruption by Earth's shadow for decades. The Sun-Earth L2 point lies the same distance on the far side. The <strong>James Webb Space Telescope</strong> arrived in orbit around L2 in January 2022. There the Sun, Earth and Moon all stay on one side, so a single sunshield keeps the telescope cold.</p>
<p>Low-energy transfers between these points, along the invariant tubes that leave L1 and L2, let spacecraft move around the Earth-Moon system on very little fuel. The Genesis mission used this idea. The Earth-Moon L1 escape in the scene is a small taste of those tubes.</p>`,
    },
  ],
  challenges: [
    {
      id: 'tadpole',
      title: 'Tame a Trojan',
      prompt: 'Launch from L4 and keep the particle in a tadpole for 20 orbital periods, with a swing of at least 10° around L4.',
      hint: 'Sun-Jupiter works well. Use a nudge between 0.003 and 0.011 and no kick, then press Launch. Raise the sim speed to wait less.',
      check: (s) => s.touched === true && s.from === 'L4' && (s.tadpoleOrbits as number) >= 20 && (s.swing as number) >= 10,
    },
    {
      id: 'escape',
      title: 'Through the neck',
      prompt: 'Launch from L1 and make the particle escape, ending at least 0.2 units away from L1.',
      hint: 'Sitting exactly on L1 it stays put. Give it any small kick or nudge. Earth-Moon with the Hill curves on shows the open neck.',
      check: (s) => s.touched === true && s.from === 'L1' && (s.maxDist as number) >= 0.2,
    },
    {
      id: 'routh',
      title: 'Past Routh',
      prompt: 'Set $\\mu$ above the Routh limit $0.03852$ and launch from L4. Watch it drift at least 0.3 units away from L4.',
      hint: 'Pick the Above Routh preset, or drag $\\mu$ above 0.0385. A small nudge is enough.',
      check: (s) => s.touched === true && s.from === 'L4' && (s.mu as number) > 0.0385209 && (s.maxDist as number) >= 0.3,
    },
    {
      id: 'horseshoe',
      title: 'Horseshoe',
      prompt: 'Get a horseshoe orbit: the particle passes L3, turns back before the planet, and passes L3 again.',
      hint: 'Sun-Jupiter from L4 with a nudge near 0.013. Or launch from L3 with a tiny nudge of 0.003. Speed up the sim.',
      check: (s) => s.touched === true && s.horseshoe === true,
    },
  ],
  caveats: `<p>This is the circular restricted problem. The two masses follow exact circles and the particle has no mass, so it cannot pull on them. Everything moves in one plane. Real planets have eccentric orbits, other planets tug on the Trojans, and sunlight pushes on small dust grains. None of that is here.</p>
<p>The surface height is $-\\Omega$ on a stretched scale, so the shallow features near the ridge show up. The pits are cut off flat near each mass. Some books add a constant $\\mu(1-\\mu)/2$ to $\\Omega$, which shifts every Jacobi constant by $\\mu(1-\\mu)$. The physics is the same.</p>
<p>The particle stops if it comes within 0.004 units of a mass or goes beyond 4 units. These are drawing limits, not real radii.</p>`,
  further: [
    { label: 'Lagrange point on Wikipedia', url: 'https://en.wikipedia.org/wiki/Lagrange_point' },
    { label: 'NASA, What is a Lagrange point?', url: 'https://science.nasa.gov/resource/what-is-a-lagrange-point/' },
    { label: 'NASA Lucy mission', url: 'https://science.nasa.gov/mission/lucy/' },
    { label: 'Jupiter trojan on Wikipedia', url: 'https://en.wikipedia.org/wiki/Jupiter_trojan' },
  ],
};
