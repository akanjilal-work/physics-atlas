import type { TopicContent } from '../../core/types.ts';

export const content: TopicContent = {
  intuition: `
<p class="lead">Put a speck of dust in water and look through a microscope. It never sits still. It shivers and wanders, forever, with nothing pushing it that you can see.</p>
<p>The push is there. Water is made of molecules, and they are moving fast. A huge number of them strike the grain every second, from every side. Almost all the hits cancel out. The leftover imbalance is small and random, and it changes all the time. That leftover is the jitter.</p>
<p>The <strong>micro view</strong> shows a cartoon of this. A heavy glowing grain sits in a box of small, fast molecules. Each flash on its surface is one collision, one real kick. No single kick moves it much. Together they make it wander.</p>
<p>The <strong>macro view</strong> zooms out until the molecules vanish. Fifty grains start at the same point and each one takes its own random walk. The cloud spreads, but slowly. To go twice as far a grain needs <em>four</em> times as long. The violet sphere tracks that rule.</p>
<p>The surprise is how much this tells you. From the speed of the spreading, the temperature, the grain size and the stickiness of the water, you can work out Avogadro’s number, the count of molecules in a mole. Jean Perrin did roughly that around 1908. It was one of the most convincing proofs that atoms are real.</p>`,
  tryFirst: [
    'Watch the flashes in the <b>micro view</b>. Each one is a molecule bouncing off the grain. Look at the corner trace: the grain velocity jumps at every hit.',
    'Switch <b>View</b> to <b>Macro</b>. Fifty grains spread from one point. The inset plots their mean squared distance against time on log scales.',
    'In the inset, the left part rises with slope 2 and the right part with slope 1. The bend sits at the memory time $m/\\gamma$, marked by the dashed line.',
    'Raise the <b>viscosity</b>. The cloud spreads more slowly, and the bend moves to shorter times.',
    'Switch to <b>Perrin</b>, raise the speed, and watch an estimate of Avogadro’s number appear from the grains alone.',
  ],
  equation: {
    tex: '\\langle r^2\\rangle = 6Dt,\\quad D = \\frac{k_BT}{6\\pi\\eta a}',
    caption: 'Einstein’s result for a grain in 3D, at times much longer than its velocity memory. The mean squared distance grows in proportion to time, not time squared. The rate is set by temperature against friction.',
    terms: [
      { tex: '\\langle r^2\\rangle', name: 'Mean squared displacement', meaning: 'Square each grain’s distance from its start, then average over the grains. The typical distance is its square root, so it grows like $\\sqrt t$.', param: 'msd' },
      { tex: 't', name: 'Time', meaning: 'Simulated seconds since the grains were released. The macro model runs faster than real time. See the clock readout.', param: 't' },
      { tex: 'D', name: 'Diffusion coefficient', meaning: 'How fast the cloud spreads, in $\\mu\\text{m}^2/\\text{s}$. The readout compares the value measured from the grains with the Stokes–Einstein prediction.', param: 'Dmeas' },
      { tex: 'k_BT', name: 'Thermal energy', meaning: 'Temperature times Boltzmann’s constant. It sets how hard the molecules kick. Double $T$ and $D$ doubles, if the viscosity stays fixed.', param: 'T' },
      { tex: '\\eta', name: 'Viscosity', meaning: 'How sticky the fluid is. Water at room temperature is about 1 mPa·s. Honey is thousands of times higher.', param: 'eta' },
      { tex: 'a', name: 'Grain radius', meaning: 'Bigger grains feel more drag, $\\gamma = 6\\pi\\eta a$, so they wander more slowly.', param: 'a' },
    ],
  },
  physicsNotes: `
<h3>The Langevin equation</h3>
<p>In 1908 Paul Langevin split the force from the fluid into two parts. One is smooth drag, $-\\gamma v$. The other is a rapidly changing random force. Written for a small time step:</p>
$$m\\,d\\mathbf v = -\\gamma\\,\\mathbf v\\,dt + \\sqrt{2\\gamma k_BT}\\;d\\mathbf W$$
<p>Here $d\\mathbf W$ is a random step of Brownian noise with variance $dt$ per component. The strength $2\\gamma k_BT$ is not a free choice. It is fixed by requiring the grain to reach thermal equilibrium, with $\\tfrac12 m\\langle v^2\\rangle = \\tfrac32 k_BT$. That link between the drag and the noise is the first example of the <strong>fluctuation–dissipation theorem</strong>.</p>
<h3>Two regimes</h3>
<p>The velocity forgets its past over the memory time $\\tau = m/\\gamma$. Solving the equation for grains that start with thermal speeds gives Ornstein’s formula:</p>
$$\\langle r^2\\rangle = 6\\,\\frac{k_BT}{m}\\,\\tau^2\\left(\\frac t\\tau - 1 + e^{-t/\\tau}\\right)$$
<p>For $t \\ll \\tau$ this is $\\langle r^2\\rangle \\approx (3k_BT/m)\\,t^2$. The grain coasts in a straight line, which is the <strong>ballistic</strong> regime. For $t \\gg \\tau$ it becomes $6Dt$ with $D = k_BT/\\gamma$, which is the <strong>diffusive</strong> regime. That is the Einstein relation. Put in Stokes drag $\\gamma = 6\\pi\\eta a$ and you get the headline equation.</p>
<h3>How the simulation works</h3>
<p>The macro view solves the Langevin equation with the exact Ornstein–Uhlenbeck step. Position and velocity change by a pair of correlated Gaussian random numbers whose variances are known in closed form. The step can be any size without bias. It starts at $\\tau/100$ and grows with time, so the plot covers more than ten decades. The grains have density 1.05 g/cm³, like a polystyrene bead.</p>
<p>The micro view is separate. It is a hard-sphere model in made-up units: an ideal gas of molecules that only collide with the grain and the walls. Each collision is elastic, so energy is conserved to rounding error. The readout shows the grain’s average kinetic energy divided by a molecule’s. Equipartition says it should approach 1.</p>`,
  deep: [
    {
      title: 'Einstein’s argument in three lines',
      html: `<p>Einstein’s 1905 paper balanced two currents in a suspension of grains. Gravity or any other steady force $F$ drives a drift, with speed $F/\\gamma$ set by drag. Diffusion drives a current down the concentration gradient, $-D\\,\\partial n/\\partial x$. In equilibrium the grains must follow the Boltzmann distribution, $n \\propto e^{-Fx/k_BT}$. The two currents cancel only if</p>
$$D = \\frac{k_BT}{\\gamma}$$
<p>He also showed that a random walk of independent steps gives $\\langle x^2\\rangle = 2Dt$ along each axis. In 3D the three axes add to $6Dt$. Marian Smoluchowski reached the same result independently in 1906, by counting molecular impacts. His first formula differed from Einstein’s by a numerical factor.</p>`,
    },
    {
      title: 'Why this proved atoms exist',
      html: `<p>In 1827 the Scottish botanist Robert Brown watched tiny particles released from pollen grains jiggle in water. Strictly, they came from inside the pollen, not whole grains. He saw the same motion in fine particles of inorganic matter, so it was not a sign of life. For decades nobody could explain it.</p>
<p>Around 1900 many chemists found atoms useful, but serious scientists, including Wilhelm Ostwald and Ernst Mach, doubted that they were real. Einstein’s formula gave a test. Write $k_B = R/N_A$, where $R$ is the gas constant from ordinary gas laws:</p>
$$N_A = \\frac{RT}{6\\pi\\eta a D}$$
<p>Everything on the right is measurable with a microscope, a thermometer and a viscometer. If matter were continuous, there would be no jitter at all and no finite $N_A$. Jean Perrin tracked grains of gamboge and mastic resin, whose sizes he measured with care. He also used the height distribution of grains settling in a column, and other methods. Different methods gave consistent values of $N_A$, close to modern ones. Ostwald accepted atoms around 1909. Perrin received the 1926 Nobel Prize in Physics for his work on the discontinuous structure of matter.</p>
<p>The <b>Perrin</b> view is a teaching reconstruction of the idea, not of his data. It marks each grain every 30 seconds, seen from above, and joins the dots, like his published drawings. The 2D steps give $\\langle \\Delta x^2 + \\Delta z^2\\rangle = 4D\\,\\Delta t$. The estimate of $N_A$ is only approximate. With few steps it is noisy. In this simulation the answer is also built in, because the computer already knows $k_B$. Perrin had only real grains.</p>`,
    },
    {
      title: 'The ballistic regime: a century to see it',
      html: `<p>Einstein’s $6Dt$ is a long-time law. At very short times a grain carries momentum, so it moves in straight lines and $\\langle r^2\\rangle \\propto t^2$. For a 1 μm bead in water the memory time $m/\\gamma$ is under a tenth of a microsecond. The thermal speed during that time is a few millimetres per second, yet the grain covers only nanometres before it forgets.</p>
<p>That is far too fast for any 19th-century microscope. Resolving it took laser traps and fast detectors. Around 2010 the group of Mark Raizen at the University of Texas measured the instantaneous velocity of a Brownian bead in air, and later similar measurements were made in liquids. Move the probe slider in the inset to the left of the dashed line to find this regime in the simulation.</p>
<p>In a real liquid the crossover is not a pure exponential. The fluid near the grain has its own inertia, which adds mass and leaves a slow tail in the velocity memory that decays as $t^{-3/2}$. The simple Langevin model leaves this out.</p>`,
    },
    {
      title: 'Fluctuation and dissipation',
      html: `<p>The same molecules that jostle the grain also slow it down. Drag and noise are two faces of one process. This is why the noise strength in the Langevin equation must be $2\\gamma k_BT$. Any other value would heat or cool the grain away from the temperature of the fluid.</p>
<p>The idea is general. In 1928 John Johnson measured random voltage noise in resistors and Harry Nyquist explained it. A resistor $R$ at temperature $T$ carries noise $\\langle V^2\\rangle = 4k_BTR\\,\\Delta f$ in a bandwidth $\\Delta f$. The resistance is the dissipation. The voltage noise is the fluctuation. Herbert Callen and Theodore Welton proved a general form of the theorem in 1951.</p>`,
    },
    {
      title: 'Where Brownian motion shows up',
      html: `<ul>
<li><b>Inside cells.</b> Proteins and small molecules move mostly by diffusion. Over a bacterium’s length of about a micrometre that takes a small fraction of a second. Across a large nerve cell it would take far too long, so cells use motor proteins to carry cargo instead.</li>
<li><b>Finance.</b> In 1900, five years before Einstein, Louis Bachelier modelled stock prices as a random walk in his thesis. A related model, geometric Brownian motion, underlies the Black–Scholes option formula of 1973. Real price changes have fatter tails than a Gaussian, so the model is an approximation.</li>
<li><b>Sensors.</b> Thermal noise limits sensitive instruments. It sets the noise floor of resistors, the jitter of atomic force microscope tips and the thermal noise in the mirror coatings of gravitational wave detectors.</li>
<li><b>Mathematics.</b> Norbert Wiener gave Brownian motion a rigorous definition in the 1920s. The Wiener process $W$ in the Langevin equation is named after him.</li>
</ul>`,
    },
  ],
  challenges: [
    {
      id: 'diffusive',
      title: 'Slope one',
      prompt: 'In the macro view, set the probe to a time at least 100 times the memory time $m/\\gamma$ and measure an MSD slope of $1 \\pm 0.1$.',
      hint: 'Drag the probe slider far to the right of the dashed line, then wait until the curve reaches past the probe. More grains give a steadier slope.',
      check: (s) => s.slopeValid === true && (s.probeT as number) >= 100 * (s.tau as number) && Math.abs((s.slope as number) - 1) <= 0.1,
    },
    {
      id: 'double-t',
      title: 'Twice as hot',
      prompt: 'Run at one temperature for at least 2 simulated seconds. Then double the temperature, keep viscosity and radius fixed, and measure a $D$ that is twice as large (within 20%).',
      hint: 'Try 200 K, wait, then 400 K. The ratios appear in the readout. Use 150 grains or more to cut the noise.',
      check: (s) => s.refSame === true && s.dValid === true && Math.abs((s.tRatio as number) - 2) <= 0.1 && Math.abs((s.dRatio as number) - 2) <= 0.4,
    },
    {
      id: 'ballistic',
      title: 'Before it forgets',
      prompt: 'Find the ballistic regime: measure an MSD slope between 1.9 and 2.1.',
      hint: 'Move the probe to the left of the dashed $m/\\gamma$ line. A bigger grain or a thinner fluid moves the line right, which gives you more room.',
      check: (s) => s.slopeValid === true && (s.slope as number) >= 1.9 && (s.slope as number) <= 2.1,
    },
    {
      id: 'perrin',
      title: 'Count the molecules',
      prompt: 'In the Perrin view, collect at least 30 grain steps and estimate Avogadro’s number to within a factor of 2.',
      hint: 'Each grain adds one step every 30 simulated seconds. Raise the speed and the number of grains.',
      check: (s) => s.view === 'perrin' && (s.perrinN as number) >= 30 && (s.NAratio as number) >= 0.5 && (s.NAratio as number) <= 2,
    },
  ],
  caveats: `<p>The macro model treats each grain as a sphere with Stokes drag and white noise. It leaves out hydrodynamic memory and the added mass of the fluid around the grain, which change the short-time crossover in real liquids. Grains do not interact with each other or with walls, and gravity is off.</p>
<p>The temperature slider does not change the viscosity. In real water, heating lowers the viscosity a lot, so $D$ rises faster than $T$. Water also freezes and boils well inside the slider range. Treat the fluid as an idealized bath.</p>
<p>The micro view is a cartoon in arbitrary units. Real water molecules are thousands of times smaller than the grain and far more numerous, they collide with each other constantly, and a liquid is not an ideal gas. The box has walls, which a real suspension does not. The Perrin estimate is a teaching reconstruction with approximate numbers, not a replay of his measurements.</p>`,
  further: [
    { label: 'Einstein (1905), Annalen der Physik 17, 549', url: 'https://doi.org/10.1002/andp.19053220806' },
    { label: 'Uhlenbeck and Ornstein (1930), On the theory of the Brownian motion', url: 'https://doi.org/10.1103/PhysRev.36.823' },
    { label: 'Jean Perrin, Nobel Prize in Physics 1926', url: 'https://www.nobelprize.org/prizes/physics/1926/summary/' },
    { label: 'Brownian motion on Wikipedia', url: 'https://en.wikipedia.org/wiki/Brownian_motion' },
  ],
};
