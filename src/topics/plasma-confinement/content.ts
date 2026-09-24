import type { TopicContent } from '../../core/types.ts';

export const content: TopicContent = {
  intuition: `
<p class="lead">To make fusion power on Earth you have to hold a gas hotter than the centre of the Sun. No wall can touch it. So we build a cage out of magnetic field.</p>
<p>Heat any gas far enough and its atoms lose their electrons. What is left is a <strong>plasma</strong>, a hot soup of free ions and electrons. It is often called the fourth state of matter. Stars are made of it, and so is most of the ordinary matter we can see. A plasma conducts electricity and responds to magnetic fields as a whole.</p>
<p>A charged particle in a magnetic field spirals along the field line and cannot easily cross it. So bend the field lines into a ring, a doughnut shape called a <strong>torus</strong>, and the particles should run round forever without touching anything. That is the idea behind the <strong>tokamak</strong>.</p>
<p>There is a catch. Coils wrapped around a ring are closer together on the inside than on the outside. The field is stronger near the hole of the doughnut and weaker at the rim. In that uneven, curved field the ions slowly drift up and the electrons drift down. The separated charges make an electric field, and that field pushes the whole plasma outward into the wall. Open the <b>Drift demo</b> and set the plasma current to zero to watch it happen.</p>
<p>The fix is a twist. Drive a current through the plasma itself. Its own field wraps around the ring the short way, and together with the coil field it turns every field line into a helix. A particle following a helix spends half its time on the top of the doughnut and half on the bottom. The upward drift on one side cancels the drift on the other. That is what the glowing lines in the cutaway show.</p>
<p>Holding the plasma is only half the job. It must also be dense enough, hot enough, and hold its heat long enough for fusion to keep it hot. The inset in the corner is the scoreboard, the <strong>Lawson diagram</strong>. Your settings are the green dot. Ignition is the red line.</p>`,
  tryFirst: [
    'Watch the glowing field lines in the cutaway. Each one is a helix that winds around the ring many times. Raise the <b>plasma current</b> and the winding gets tighter.',
    'Switch to <b>Drift demo</b> and drag the current to 0. Ions (amber) drift up, electrons (cyan) drift down, then both are pushed out to the wall.',
    'Bring the current back and press <b>Relaunch</b>. The same particles now stay inside.',
    'In the Lawson inset, raise the <b>confinement time</b> and <b>density</b> until the green dot crosses the red ignition line.',
    'Push the current high or the field low until the edge $q$ drops toward 1. A warning appears. Real machines stay well away from there.',
  ],
  equation: {
    tex: 'n\\,T\\,\\tau_E \\;\\ge\\; 3\\times10^{21}\\ \\text{keV\\,s\\,m}^{-3}',
    caption: 'The Lawson triple product for D-T ignition. Alpha particles from fusion must replace the heat the plasma loses. The magnetic cage is judged by the safety factor $q = rB_\\varphi/(RB_\\theta)$, the number of times a field line goes round the long way for each trip round the short way.',
    terms: [
      { tex: 'n', name: 'Density', meaning: 'Electrons (and fuel ions) per cubic metre. Tokamaks run near $10^{20}\\ \\text{m}^{-3}$, about a millionth of the density of air.', param: 'n' },
      { tex: 'T', name: 'Temperature', meaning: 'In keV. 1 keV is about 11.6 million kelvin. The D-T sweet spot is near 14 keV, roughly 160 million kelvin.', param: 'T' },
      { tex: '\\tau_E', name: 'Energy confinement time', meaning: 'How long the plasma holds its heat if the heating is switched off. It measures how good the magnetic cage is.', param: 'tau' },
      { tex: '3\\times10^{21}', name: 'Ignition threshold', meaning: 'The minimum of the ignition curve, reached near 14 keV. The readout shows your triple product against it.', param: 'triple' },
      { tex: '\\ge', name: 'Gain', meaning: 'Below the line, outside heating must make up the difference and the gain $Q$ is finite. On the line, $Q$ becomes infinite.', param: 'Q' },
    ],
  },
  physicsNotes: `
<h3>Where the triple product comes from</h3>
<p>Take a 50:50 mix of deuterium and tritium with electron density $n$, so each fuel species has density $n/2$. The reaction D + T gives a helium nucleus (an alpha particle, 3.5 MeV) and a neutron (14.1 MeV). The neutron escapes. The alpha is charged, stays in the field and heats the plasma. The alpha heating per unit volume is</p>
$$P_\\alpha = \\frac{n}{2}\\,\\frac{n}{2}\\,\\langle\\sigma v\\rangle\\,E_\\alpha = \\tfrac14 n^2\\langle\\sigma v\\rangle E_\\alpha$$
<p>The thermal energy of ions plus electrons is $3nT$. It leaks out on the time scale $\\tau_E$, so the loss is $3nT/\\tau_E$. Ignition means $P_\\alpha$ covers the loss:</p>
$$n\\,\\tau_E \\;\\ge\\; \\frac{12\\,T}{E_\\alpha\\,\\langle\\sigma v\\rangle}$$
<p>Multiply by $T$. The reactivity $\\langle\\sigma v\\rangle$ rises steeply with temperature, so $T^2/\\langle\\sigma v\\rangle$ has a minimum. With the Bosch and Hale fit for $\\langle\\sigma v\\rangle$ the minimum is $2.8\\times10^{21}\\ \\text{keV s m}^{-3}$ at 13.5 keV. That is the "about $3\\times10^{21}$" in the headline. The test suite checks this number.</p>
<h3>Fusion gain Q</h3>
<p>Below ignition, outside heating $P_h$ must make up the gap: $P_h + P_\\alpha = 3nT/\\tau_E$. Each reaction releases five times the alpha energy (17.6 MeV against 3.5 MeV). Write $f = n\\tau_E / (n\\tau_E)_{\\text{ign}}$, the fraction of the loss that alphas cover. Then</p>
$$Q = \\frac{P_{\\text{fus}}}{P_h} = \\frac{5f}{1-f}$$
<p>Breakeven, $Q = 1$, needs only $f = 1/6$. ITER aims for $Q = 10$, which needs $f = 2/3$. Ignition is $f = 1$ and $Q \\to \\infty$. The dashed curve in the inset is $Q = 1$.</p>
<h3>The safety factor</h3>
<p>The coils make a toroidal field $B_\\varphi$. Ampère's law around the ring gives $B_\\varphi = \\mu_0 N I_{\\text{coil}}/(2\\pi R)$, so it falls as $1/R$. The plasma current $I_p$ makes a poloidal field $B_\\theta = \\mu_0 I_p/(2\\pi a)$ at the edge. On a surface of minor radius $r$ a field line advances $\\Delta\\theta = B_\\theta\\,\\Delta s / r$ poloidally for $\\Delta\\varphi = B_\\varphi\\,\\Delta s/R$ toroidally. One poloidal turn therefore takes</p>
$$q = \\frac{r B_\\varphi}{R B_\\theta} \\qquad\\Longrightarrow\\qquad q_a = \\frac{2\\pi a^2 B_\\varphi}{\\mu_0 R I_p}$$
<p>toroidal turns. The scene uses a machine with $R = 3$ m and $a = 1$ m, so $q_a \\approx 1.67\\,B/I_p$ with $B$ in tesla and $I_p$ in MA.</p>
<h3>How the simulation works</h3>
<p>The field is an analytic large-aspect-ratio model with circular flux surfaces and a parabolic current profile. The poloidal field carries an extra factor $R_0/R$ so that $\\nabla\\cdot\\mathbf B = 0$ exactly. Field lines are traced with fourth-order Runge-Kutta. Their measured $q$ matches $q_{\\text{cyl}}/\\sqrt{1-\\varepsilon^2}$, the exact value for this field, to many digits. Particles are pushed with the Boris method in scaled units, with the electric field of the charge separation added in the pure toroidal case. The Lawson inset uses the Bosch and Hale D-T reactivity.</p>`,
  deep: [
    {
      title: 'Plasma basics: Debye length and plasma frequency',
      html: `<p>A plasma is not just a hot gas with charges in it. It acts collectively. Put a positive charge into it and the electrons crowd around and hide it. The screening distance is the <strong>Debye length</strong>:</p>
$$\\lambda_D = \\sqrt{\\frac{\\varepsilon_0 T_e}{n e^2}}$$
<p>For a fusion plasma with $n = 10^{20}\\ \\text{m}^{-3}$ and $T_e = 10$ keV, $\\lambda_D \\approx 74\\ \\mu\\text{m}$. The vessel is metres across, so the plasma is almost perfectly neutral on any scale that matters. About $10^8$ electrons sit inside each Debye sphere, which is why the collective picture works.</p>
<p>Displace the electrons and they spring back and overshoot. They oscillate at the <strong>plasma frequency</strong></p>
$$\\omega_{pe} = \\sqrt{\\frac{n e^2}{\\varepsilon_0 m_e}}, \\qquad f_{pe} \\approx 9\\sqrt{n}\\ \\text{Hz}$$
<p>At $10^{20}\\ \\text{m}^{-3}$ that is about 90 GHz, in the microwave band. The readouts compute both from your density and temperature. The drift demo uses a much weaker electric response than a real plasma, so the E×B loss is slow enough to watch. In a real plasma it is far faster.</p>`,
    },
    {
      title: 'Why a pure ring field fails, and how the twist fixes it',
      html: `<p>In a field that falls as $1/R$, a gyrating particle feels a slightly stronger field on the inner side of its orbit. Its circle is tighter there, so the orbit does not close and the guiding centre creeps vertically. The field lines are also curved, and the centrifugal force of motion along them adds a second drift the same way. Together:</p>
$$v_d = \\frac{v_\\parallel^2 + \\tfrac12 v_\\perp^2}{\\Omega R}, \\qquad \\Omega = \\frac{|q|B}{m}$$
<p>The direction depends on the sign of the charge. Ions go one way and electrons the other. The test suite checks this formula against the Boris simulation to about one percent.</p>
<p>The separated charge makes a vertical electric field $\\mathbf E$. Now every particle feels the drift $\\mathbf E\\times\\mathbf B/B^2$, which is the same for both charges and points outward, away from the hole. In a real device the whole plasma is lost very quickly. That is the drift demo with zero current.</p>
<p>Add a poloidal field and each field line spirals around the minor cross-section. A particle following it spends as long on the top as on the bottom. Its vertical drift moves it outward from its flux surface on one side and inward on the other, so the orbit stays close to a surface. Charge can also now flow along the field lines from top to bottom, which shorts out the separation. The scene sets the separation field to zero once there is a twist, for that reason. The confined orbits you see are slightly shifted circles in cross-section, and their width grows with $q$. That is one reason a stronger current confines better, up to the kink limit.</p>`,
    },
    {
      title: 'Kinks, disruptions and the limits on q',
      html: `<p>Current in the plasma brings its own trouble. A current-carrying column can buckle into a helix like a twisted rubber band. For the whole column this <strong>external kink</strong> is suppressed only if the field lines at the edge wind slowly enough, $q_a > 1$. That is the Kruskal-Shafranov limit, found independently by Martin Kruskal and Vitaly Shafranov in the 1950s.</p>
<p>In practice real tokamaks keep the edge $q$ above about 2 to 3. Below about 2, instabilities that grow at rational surfaces become violent, and the plasma can suffer a <strong>disruption</strong>: the confinement collapses in milliseconds and the current crashes into the wall, with large forces on the structure. In the core, $q$ can dip below 1, which triggers repeated small crashes called sawteeth.</p>
<p>The scene only flags these limits. The field and particles are fixed models, so no instability actually grows. A warning appears when $q_a < 2$ and turns red below 1. There are also pressure limits, set by the ratio of plasma to magnetic pressure $\\beta$, which the scene does not model.</p>`,
    },
    {
      title: 'Magnetic versus inertial confinement, and the record books',
      html: `<p>There are two ways to meet the Lawson criterion. <strong>Magnetic confinement</strong> holds a thin plasma, around $10^{20}$ particles per cubic metre, for seconds. <strong>Inertial confinement</strong> crushes a tiny fuel capsule to enormous density and lets it burn for a fraction of a nanosecond, held only by its own inertia.</p>
<ul>
<li><strong>JET</strong> (UK) set a fusion power record of 16 MW in 1997, with $Q \\approx 0.67$. In its final D-T campaign it produced 59 MJ in 2021 and then 69 MJ in October 2023, from about 0.2 mg of fuel. JET closed at the end of 2023.</li>
<li><strong>NIF</strong> (USA) reached ignition on 5 December 2022: 2.05 MJ of laser light on target produced 3.15 MJ of fusion energy. Later shots went higher, about 5.2 MJ in early 2024 and 8.6 MJ in 2025. The lasers draw far more energy from the grid than the target returns, so this is scientific gain, not a power plant.</li>
<li><strong>ITER</strong> in France is a tokamak with $R = 6.2$ m, 15 MA of plasma current and 5.3 T on axis. It aims for $Q = 10$, 500 MW of fusion power from 50 MW of heating. Its 2024 baseline plans deuterium operation in 2035 and D-T in 2039. ITER's schedule has slipped more than once, so treat these dates as plans.</li>
<li><strong>Stellarators</strong> twist the field with the coils themselves, so no plasma current is needed and there are no current disruptions. Lyman Spitzer invented the idea at Princeton in 1951. Wendelstein 7-X in Germany, with 50 non-planar superconducting coils, first made plasma in December 2015 and holds records for long stellarator pulses. The stellarator view in the scene is a simplified sketch, not W7-X's real shape.</li>
</ul>
<p>The historic markers in the Lawson inset are approximate. The tokamaks are placed at their reported ion temperature and fusion gain using the simple model here, with the D-T equivalent gain for JT-60U, which ran on deuterium. W7-X is placed from its reported 2018 triple product. NIF is shown just past the line because a 2021 shot was reported to exceed the Lawson criterion for ignition, but its $\\tau$ is a burn time of a fraction of a nanosecond, so it does not really belong on the same axes.</p>`,
    },
    {
      title: 'History, hard problems and the Sun',
      html: `<p>In 1950 Igor Tamm and Andrei Sakharov worked out a magnetic fusion reactor with a toroidal field and a current in the plasma. The Kurchatov Institute in Moscow built the first tokamak, T-1, in 1958. The name is a Russian acronym for a toroidal chamber with magnetic coils. At the 1968 Novosibirsk conference, Lev Artsimovich's team reported that T-3 had reached electron temperatures of about 1 keV, around ten million degrees, far beyond other machines. Western physicists were sceptical until a team from Culham in the UK measured it with laser scattering in 1969. Tokamaks then spread around the world.</p>
<p>Why is it still hard? The plasma is prone to instabilities and turbulence that carry heat out far faster than collisions alone. Disruptions can damage the machine. The 14 MeV neutrons damage the wall materials and make them radioactive. And tritium barely exists in nature, so a power plant must breed its own from lithium in a blanket around the plasma. No machine has yet done that at scale.</p>
<p>Many private companies now pursue fusion too, with compact high-field tokamaks, stellarators and other concepts. Some have raised large sums and announced ambitious timelines. Those timelines are plans, not results. None has yet shown net energy gain.</p>
<p>The Sun solves confinement with gravity. Its core holds plasma at about 15 million kelvin at enormous density, and it can afford to be slow: a proton waits billions of years on average to fuse. See the <a href="#/t/solar-fusion">solar fusion</a> topic. On Earth there is no such gravity, so we run hotter, use the fastest reaction, D-T, and replace gravity with magnetic fields or inertia.</p>`,
    },
  ],
  challenges: [
    {
      id: 'drift-loss',
      title: 'No twist, no plasma',
      prompt: 'Set the plasma current to zero and watch at least half of the particles drift into the wall.',
      hint: 'Drag <b>Plasma current</b> to 0. The Drift demo view shows the up and down separation best.',
      check: (s) => s.touched === true && (s.Ip as number) === 0 && (s.lostFrac as number) >= 0.5,
    },
    {
      id: 'confine',
      title: 'Ten transits',
      prompt: 'With a plasma current flowing, keep at least 90% of the particles confined while the lead ion goes 10 times around the ring. Raise the sim speed if you like.',
      hint: 'A current of 1.5 to 3 MA at 3 to 5 T works well. Too little current makes the orbits wide. Press <b>Relaunch</b> after changing settings.',
      check: (s) => s.touched === true && (s.Ip as number) > 0 && (s.transits as number) >= 10 && (s.confinedFrac as number) >= 0.9,
    },
    {
      id: 'ignite',
      title: 'Reach ignition',
      prompt: 'Move the green dot in the Lawson inset onto or above the ignition line.',
      hint: 'Keep the temperature between 10 and 20 keV and raise the confinement time and density. The triple product must reach about $3\\times10^{21}$.',
      check: (s) => (s.f as number) >= 1,
    },
    {
      id: 'kink',
      title: 'Too much twist',
      prompt: 'Push the edge safety factor down to about 1 and read the kink warning.',
      hint: '$q_a \\approx 1.67\\,B/I_p$. Try a low field with a large current.',
      check: (s) => (s.qEdge as number) <= 1.1 && s.kinkWarn === true,
    },
  ],
  caveats: `<p>The tokamak field is an analytic model with circular, concentric flux surfaces. Real tokamaks have D-shaped plasmas, a Shafranov shift, field ripple between coils, and currents that evolve. Nothing in the scene is unstable. The kink warning is a rule of thumb, not a simulation.</p>
<p>The particles use scaled units. The electron to ion mass ratio is 16, not about 3700, and gyroradii are much larger relative to the machine than in reality. The charge-separation field in the drift demo comes from a crude slab model with the plasma's response weakened by many orders of magnitude, so the loss takes seconds instead of a tiny fraction of a second. Particles do not collide or feel each other except through that one field.</p>
<p>The Lawson calculation ignores radiation losses, impurities, fuel dilution by helium ash and the shape of temperature and density profiles. Including them raises the bar. The historic markers are approximate and placed by the method described in the Deep Dive.</p>`,
  further: [
    { label: 'Lawson criterion on Wikipedia', url: 'https://en.wikipedia.org/wiki/Lawson_criterion' },
    { label: 'Tokamak on Wikipedia', url: 'https://en.wikipedia.org/wiki/Tokamak' },
    { label: 'Wendelstein 7-X on Wikipedia', url: 'https://en.wikipedia.org/wiki/Wendelstein_7-X' },
    { label: 'Wurzel and Hsu, Progress toward fusion energy breakeven and gain (arXiv)', url: 'https://arxiv.org/abs/2105.10954' },
  ],
};
