import type { TopicContent } from '../../core/types.ts';

export const content: TopicContent = {
  intuition: `
<p class="lead">Picture a grid of tiny magnets. Each one can only point up or down, and each one would like to agree with its four neighbours. Heat pushes the other way. It jiggles every magnet at random. The whole story of this page is that tug of war between agreement and noise.</p>
<p>When it is hot, noise wins. The magnets flip back and forth and the grid is a salt-and-pepper mess with no overall direction. When it is cold, agreement wins. One direction spreads until almost every magnet points the same way, and the grid becomes a magnet as a whole. Nothing outside told it which way to choose. It picked a side by itself.</p>
<p>The surprise is how sharp the switch is. You might expect the order to fade in gently as you cool. Instead it appears at one exact temperature, called the <strong>critical temperature</strong> $T_c$. Above it, no net magnetization at all. Below it, a definite one. That sudden change of character is a <strong>phase transition</strong>, the same kind of thing as water boiling or iron losing its magnetism when heated past 770 °C.</p>
<p>In the scene, each tile is one magnet. <span style="color:#fb7a4b">Raised orange</span> tiles point up. <span style="color:#5b9cf0">Sunken blue</span> tiles point down. The page starts right at $T_c$. Look closely. There are orange islands inside blue lakes inside bigger orange islands, at every size from a single tile to the whole grid. Zoom in or out and the pattern looks much the same. That is what sitting at a critical point looks like.</p>
<p>Press <b>Quench</b> to drop the temperature suddenly. Small patches merge into bigger ones until one colour wins. Press <b>Heat</b> and the order melts away.</p>`,
  tryFirst: [
    'Look at the grid at $T_c$. Find patches of every size, from single tiles to regions spanning the lattice.',
    'Press <b>Quench</b>. Watch small domains merge into large ones, and the $m(t)$ trace climb toward $\\pm1$.',
    'Press <b>Heat</b>, then drag <b>T</b> slowly down past $T_c$. Watch the live dot trace out the curve in the corner plot.',
    'Below $T_c$, drag the field <b>h</b> against the magnetization. It resists, then flips all at once.',
  ],
  equation: {
    tex: 'H = -J\\sum_{\\langle ij\\rangle} s_i s_j \\; - \\; h\\sum_i s_i, \\qquad P(\\{s\\}) \\propto e^{-H/k_B T}',
    caption: 'The energy of a spin configuration, and the Boltzmann weight that says how often each configuration appears at temperature T.',
    terms: [
      { tex: 'H', name: 'Energy', meaning: 'The total energy of one arrangement of all the spins. The readout shows it per spin, $e = H/N$, next to Onsager\'s exact value.', param: 'energy' },
      { tex: 's_i s_j', name: 'Neighbour agreement', meaning: 'Each spin $s_i$ is $+1$ or $-1$. The sum runs over nearest-neighbour pairs on the $L \\times L$ grid. Agreeing pairs lower the energy by $J$, and disagreeing pairs raise it by $J$.', param: 'L' },
      { tex: 'J', name: 'Coupling', meaning: 'How strongly neighbours want to agree. Here $J = 1$ sets the unit of energy and temperature.' },
      { tex: 'h', name: 'External field', meaning: 'A field that favours up spins when positive and down spins when negative. It lets you push the magnetization around and see hysteresis.', param: 'h' },
      { tex: '\\sum_i s_i', name: 'Magnetization', meaning: 'Up spins minus down spins. Divided by $N$ it is $m$, which runs from $-1$ to $+1$.', param: 'm' },
      { tex: 'e^{-H/k_B T}', name: 'Boltzmann weight', meaning: 'High-energy arrangements are exponentially rare. Raising $T$ makes them less rare, which is how heat fights order.', param: 'T' },
    ],
  },
  physicsNotes: `
<h3>How the simulation samples the Boltzmann weight</h3>
<p>There are $2^N$ arrangements of $N$ spins. For a $128 \\times 128$ grid that is $2^{16384}$, far too many to list. Instead the page takes a random walk through arrangements that visits each one with probability $e^{-H/T}$. This is <strong>Markov chain Monte Carlo</strong>.</p>
<p><b>Metropolis</b> (1953) picks a random spin and proposes to flip it. The energy change is $\\Delta E = 2 s_i \\big(J\\sum_{j} s_j + h\\big)$, summed over the four neighbours. The flip is accepted with probability</p>
$$A = \\min\\big(1, e^{-\\Delta E/T}\\big).$$
<p>The ratio of forward and backward acceptances is exactly $e^{-\\Delta E/T}$. That is <strong>detailed balance</strong>, and it guarantees the walk settles into the Boltzmann distribution. One <em>sweep</em> is $N$ attempts, so each spin gets about one try.</p>
<p><b>Wolff</b> (1989) grows a whole cluster of aligned spins, adding each aligned neighbour with probability $p = 1 - e^{-2J/T}$, then flips the cluster at once. Near $T_c$ it moves huge regions in one step. With a field on, the flip is accepted with a Metropolis test on the field energy $2 h s n$ for a cluster of $n$ spins.</p>
<h3>What the readouts measure</h3>
<p>The page keeps a window of the last 400 sweeps. From it, the <b>specific heat</b> and <b>susceptibility</b> per spin come from fluctuations:</p>
$$C = \\frac{N\\big(\\langle e^2\\rangle - \\langle e\\rangle^2\\big)}{T^2}, \\qquad \\chi = \\frac{N\\big(\\langle m^2\\rangle - \\langle |m|\\rangle^2\\big)}{T}.$$
<p>Using $|m|$ is the standard choice on a finite grid, since a small system can flip its whole magnetization now and then. Both quantities peak near $T_c$. The exact results to compare with are</p>
$$T_c = \\frac{2J}{\\ln(1+\\sqrt2)} \\approx 2.269, \\qquad M(T) = \\big(1 - \\sinh^{-4}(2J/T)\\big)^{1/8} \\text{ for } T < T_c.$$
<p>The energy is updated after every flip rather than recomputed. The energy check readout recomputes it from scratch once a second and shows the difference. It stays at rounding error.</p>`,
  deep: [
    {
      title: 'From Lenz and Ising to Peierls: does order survive?',
      html: `<p>Wilhelm Lenz proposed the model in 1920 and gave it to his student Ernst Ising. Ising solved the one-dimensional chain in his 1924 thesis and published it in 1925. He found <strong>no phase transition</strong> at any temperature above zero. He then guessed, wrongly, that higher dimensions would not order either.</p>
<p>The one-dimensional case fails for a simple reason. In a chain, a single broken bond splits the chain into an up part and a down part. That costs a fixed energy $2J$, but the break can sit in any of $N$ places. The entropy gain $k_B T \\ln N$ always wins for a long chain, so the chain chops itself into domains at any $T > 0$.</p>
<p>In 1936 Rudolf Peierls showed that two dimensions are different. A down island inside an up sea is bounded by a wall. A wall of length $\\ell$ costs $2J\\ell$. The number of such walls grows at most like $3^\\ell$. So the weight of long walls is roughly</p>
$$3^{\\ell}\\, e^{-2J\\ell/k_BT},$$
<p>which shrinks with $\\ell$ at low enough $T$. Large islands are then rare and the order survives. His argument had a gap, which Robert Griffiths and Roland Dobrushin closed independently in the 1960s. It gives a lower bound on $T_c$, not its value.</p>`,
    },
    {
      title: 'Onsager\'s exact solution',
      html: `<p>In 1941 Hendrik Kramers and Gregory Wannier found a symmetry that maps the high-temperature model onto the low-temperature one. If there is a single transition, it must sit at the self-dual point $\\sinh(2J/k_BT_c) = 1$. That gives $T_c \\approx 2.269\\,J/k_B$.</p>
<p>In 1944 Lars Onsager computed the full free energy of the 2D model at zero field. It was the first exact proof that simple local rules can produce a sharp phase transition. The specific heat does not jump. It diverges like $-\\ln|T - T_c|$. The exact energy per spin at $T_c$ is $-\\sqrt2\\,J$, and the energy readout converges to it.</p>
<p>Onsager announced the spontaneous magnetization formula in 1949 without a proof. C. N. Yang published the first derivation in 1952. Near $T_c$ it behaves as $M \\propto (T_c - T)^{1/8}$, which is why the curve in the corner plot drops almost vertically at $T_c$.</p>
<p>No exact solution is known for the 2D model in a field, or for the 3D model at all. Those are studied by simulation, series expansions and the conformal bootstrap.</p>`,
    },
    {
      title: 'Critical opalescence, scale invariance and universality',
      html: `<p>Near a critical point, fluctuations are correlated over a distance $\\xi$ that grows without bound, $\\xi \\propto |T - T_c|^{-\\nu}$. At $T_c$ itself there is no typical size left. Domains of every size appear together, which is the self-similar pattern you see in the scene at $T_c$.</p>
<p>Fluids show the same thing. Near the liquid-gas critical point of carbon dioxide, about 31 °C and 74 bar, density patches of all sizes form. Once they reach the wavelength of light they scatter it, and the clear fluid turns milky. This <strong>critical opalescence</strong> was studied by Thomas Andrews in 1869 and explained by Smoluchowski in 1908 and Einstein in 1910.</p>
<p>Close to $T_c$ quantities follow power laws, and the exponents do not depend on the details. They depend only on dimension and on the symmetry of the order parameter. For the 2D Ising model they are exact:</p>
$$\\beta = \\tfrac18, \\quad \\nu = 1, \\quad \\gamma = \\tfrac74, \\quad \\alpha = 0\\ (\\text{log}), \\quad \\delta = 15, \\quad \\eta = \\tfrac14.$$
<p>This sameness is called <strong>universality</strong>. A liquid-gas critical point in 3D has the same exponents as the 3D Ising model, with $\\beta \\approx 0.326$, $\\nu \\approx 0.630$ and $\\gamma \\approx 1.237$. Water, carbon dioxide, binary liquid mixtures and uniaxial magnets all share them. Density plays the role of $m$. The 2D values above apply to genuinely two-dimensional systems, such as a gas adsorbed as a single layer on a surface.</p>
<p>On a finite grid the divergence is cut off by the grid size. The peak of $\\chi$ grows as $L^{\\gamma/\\nu} = L^{7/4}$. Try it with the <b>L</b> control at $T_c$.</p>`,
    },
    {
      title: 'Quenches, coarsening and hysteresis',
      html: `<p>After a sudden quench below $T_c$, the grid does not order at once. Small domains form everywhere and then merge. With single-spin dynamics like Metropolis, the typical domain size grows roughly as $t^{1/2}$. Walls straighten because curved walls cost extra energy. On a periodic square grid the process sometimes gets stuck in <strong>stripes</strong> that wrap around the lattice. At zero temperature this happens in roughly a third of quenches. At finite temperature stripes do decay, but slowly. Press <b>Quench</b> again or switch to Wolff if you get one.</p>
<p>A field below $T_c$ shows <strong>hysteresis</strong>. Point $h$ against the magnetization and nothing happens at first. The ordered state is metastable. To flip, a droplet of reversed spins must grow past a critical size, where the field energy gained by its area beats the wall energy of its edge. Weak fields need big droplets, which are exponentially rare. Stronger fields need small ones, so the flip comes quickly and all at once. The field needed to flip in a given time depends on temperature and on how fast you sweep $h$. Real magnets add pinning by defects and grain boundaries, which widens their hysteresis loops.</p>
<p>Metropolis also suffers <strong>critical slowing down</strong>. Near $T_c$ its correlation time grows as $L^z$ with $z \\approx 2.17$ in 2D. Wolff cluster moves reduce $z$ to a small value, which is why the Wolff option makes the $T_c$ challenge much faster.</p>`,
    },
    {
      title: 'Connections: magnets and neural networks',
      html: `<p><strong>Magnets.</strong> In iron, each atom carries a magnetic moment from its electron spins. The tendency of neighbours to align comes from the quantum exchange interaction, not from magnetic attraction, which is far too weak. Heated past its Curie temperature of 770 °C (1043 K), iron loses its spontaneous magnetization. Real moments can point in any direction, so iron is closer to the Heisenberg model than to Ising. The Ising model fits materials with a strong easy axis, where moments really can only point up or down.</p>
<p><strong>Neural networks.</strong> In 1982 John Hopfield described a network of on-off neurons with symmetric couplings $J_{ij}$ and energy $E = -\\tfrac12\\sum_{ij} J_{ij} s_i s_j$. That is an Ising energy with couplings set by a learning rule instead of by neighbours. Stored patterns become low-energy states, and updating neurons one at a time runs downhill to the nearest stored pattern. A network of $N$ neurons can recall about $0.14N$ random patterns before memories blur. Adding a temperature gives the Boltzmann machine of Hinton and Sejnowski. Hopfield and Geoffrey Hinton shared the 2024 Nobel Prize in Physics for this line of work.</p>`,
    },
  ],
  challenges: [
    {
      id: 'quench',
      title: 'Quench into order',
      prompt: 'Quench the grid from a hot state to a temperature below $T_c$ and let it order until $|m| > 0.9$.',
      hint: 'Press <b>Quench</b> and raise <b>sweeps per frame</b>. If the grid gets stuck in stripes, quench again or switch to Wolff.',
      check: (s) => s.quenched === true && (s.T as number) < 2.269 && Math.abs(s.m as number) > 0.9,
    },
    {
      id: 'melt',
      title: 'Melt the order',
      prompt: 'Heat the grid above $T = 3$ and get the averaged $\\langle|m|\\rangle$ below 0.1.',
      hint: 'Press <b>Heat</b> or drag <b>T</b> above 3. Small grids fluctuate more, so use $L \\ge 32$ and wait for the average to settle.',
      check: (s) => s.touched === true && (s.T as number) > 3 && (s.samples as number) >= 100 && (s.absM as number) < 0.1 && Math.abs(s.h as number) < 0.05,
    },
    {
      id: 'critical',
      title: 'Domains of every size',
      prompt: 'Sit within 0.06 of $T_c$ with $h = 0$ and $L \\ge 32$ until the susceptibility $\\chi$ reaches $0.006\\,L^{7/4}$. That large $\\chi$ means fluctuations span the whole grid.',
      hint: 'Press <b>Go to T_c</b>, switch the algorithm to <b>Wolff</b>, and wait for the window to fill. Metropolis gets there too, but slowly.',
      check: (s) => s.touched === true && Math.abs((s.T as number) - 2.2691853) <= 0.06 && Math.abs(s.h as number) < 0.01 && (s.L as number) >= 32 && (s.samples as number) >= 200 && (s.chi as number) >= 0.006 * Math.pow(s.L as number, 1.75),
    },
    {
      id: 'flip',
      title: 'Flip it with a field',
      prompt: 'Below $T_c$, start with a strongly magnetized grid ($|m| > 0.8$) and use the field $h$ to reverse it to $|m| > 0.8$ the other way.',
      hint: 'Quench to order first. Then drag <b>h</b> against the magnetization. At $T = 1.5$, try $|h|$ around 0.4 or more.',
      check: (s) => s.fieldFlip === true,
    },
  ],
  caveats: `<p><strong>A cartoon of a magnet.</strong> Real spins are quantum and can point in any direction. Real crystals have defects, long-range dipole forces and more than two dimensions. The Ising model keeps only the part that matters near the transition: two states and local agreement.</p>
<p><strong>Finite grid.</strong> A grid of $L \\times L$ spins cannot have a true phase transition. The sharp corner at $T_c$ is rounded over a range of order $1/L$. Above $T_c$ the measured $\\langle|m|\\rangle$ stays slightly above zero, of order $1/L$ rather than exactly 0. The Onsager curves are for an infinite grid at $h = 0$.</p>
<p><strong>Dynamics are not real time.</strong> Monte Carlo sweeps sample the equilibrium distribution correctly, but the path between states is invented. Metropolis dynamics resemble real relaxation in some ways, like coarsening. Wolff dynamics are purely a computational shortcut. Averages over 400 sweeps also carry statistical error, most of all near $T_c$.</p>`,
  further: [
    { label: 'Ising model on Wikipedia', url: 'https://en.wikipedia.org/wiki/Ising_model' },
    { label: 'L. Onsager, Crystal statistics I, Phys. Rev. 65, 117 (1944)', url: 'https://doi.org/10.1103/PhysRev.65.117' },
    { label: 'U. Wolff, Collective Monte Carlo updating for spin systems, Phys. Rev. Lett. 62, 361 (1989)', url: 'https://doi.org/10.1103/PhysRevLett.62.361' },
    { label: 'J. J. Hopfield, Neural networks and physical systems with emergent collective computational abilities, PNAS 79, 2554 (1982)', url: 'https://doi.org/10.1073/pnas.79.8.2554' },
  ],
};
