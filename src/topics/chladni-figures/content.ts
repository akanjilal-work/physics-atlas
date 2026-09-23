import type { TopicContent } from '../../core/types.ts';

export const content: TopicContent = {
  intuition: `
<p class="lead">Sprinkle sand on a thin metal plate and draw a violin bow down its edge. The plate sings, and the sand leaps off parts of the plate and runs into thin lines. In a second or two a sharp, symmetric drawing appears. Change the note and the drawing changes with it.</p>
<p>These drawings are called <strong>Chladni figures</strong>, after Ernst Chladni, who published them in 1787. The lines are the places where the plate does not move at all, called <strong>nodal lines</strong>. Everywhere else the plate flexes up and down hundreds of times a second and flings the grains away. A grain that happens to land on a still line stays there. Over many hops the sand collects on the lines and draws them.</p>
<p>The surprise is how picky the plate is. A plate only rings strongly at special frequencies, its <strong>resonances</strong>. Between them it barely moves, and the sand just sits where it fell. Slide the frequency slowly and watch: nothing, nothing, then a pattern snaps into place, then nothing again. The graph in the corner shows why. Each spike is one resonance, and the sand only moves when the curve rises above the dashed line, where the plate shakes harder than gravity.</p>
<p>In the scene the plate is steel, 24 cm across and 1 mm thick. Its motion is slowed down and hugely exaggerated so you can see it. The real motion is a fraction of a millimetre at hundreds of hertz.</p>`,
  tryFirst: [
    'Watch the sand for a few seconds. It is on a resonance and the figure draws itself. Then press <b>Reset sand</b> and watch it happen again.',
    'Nudge the <b>Fine tune</b> slider by half a percent. The plate goes quiet and the sand freezes. Press <b>Snap to nearest mode</b> to get it back.',
    'Press <b>next ▶</b> a few times to step through the resonances. Higher notes draw busier figures.',
    'Switch <b>Shape</b> to <b>Circle</b>. Round plates draw diameters and rings instead of grids.',
  ],
  equation: {
    tex: 'D\\,\\nabla^4 w = \\rho h\\,\\omega^2\\, w',
    caption: 'A thin plate vibrating in a pure mode. Bending stiffness on the left pushes back against the plate\'s inertia on the right. Only special pairs of shape $w$ and frequency $\\omega$ satisfy it together with the edge conditions.',
    terms: [
      { tex: 'D', name: 'Flexural rigidity', meaning: 'How hard the plate is to bend, $D = Eh^3/12(1-\\nu^2)$. It grows with the cube of the thickness $h$, so a plate twice as thick rings an octave higher.', param: 'D' },
      { tex: '\\nabla^4 w', name: 'Bending (biharmonic) term', meaning: 'The Laplacian applied twice. It measures how sharply the curvature of the plate changes. More nodal lines mean tighter wiggles and a much larger value.', param: 'mode' },
      { tex: '\\rho h', name: 'Mass per area', meaning: 'Density times thickness. For 1 mm steel it is about 7.85 kg per square metre.', param: 'rhoh' },
      { tex: '\\omega', name: 'Angular frequency', meaning: '$\\omega = 2\\pi f$. Set by the frequency slider. The equation only has a solution at the resonant values.', param: 'freq' },
      { tex: 'w', name: 'Displacement', meaning: 'How far each point of the plate moves up or down. Sand hops where the acceleration $\\omega^2 |w|$ beats gravity, and rests where $w = 0$.', param: 'accel' },
    ],
  },
  physicsNotes: `
<h3>Where the equation comes from</h3>
<p>A thin plate resists bending, not stretching. Bending a strip by curvature $\\kappa$ costs energy $\\tfrac12 D\\kappa^2$ per area. Add up the bending energy of the whole plate, add the kinetic energy $\\tfrac12\\rho h\\,\\dot w^2$, and ask for the motion that makes the action stationary. The result is the Kirchhoff plate equation $D\\nabla^4 w + \\rho h\\,\\ddot w = 0$. For a motion $w(x,y)\\cos\\omega t$ it becomes the headline equation.</p>
<p>Because the equation is fourth order, each edge needs two conditions. A clamped edge has $w = 0$ and zero slope. A free edge, like Chladni's plates, has zero bending moment and zero effective shear force. Those free-edge conditions are what make the square plate hard to solve exactly.</p>
<h3>The dimensionless frequency</h3>
<p>Every plate of the same shape and edge type shares one set of numbers,</p>
$$\\Omega = \\omega a^2 \\sqrt{\\rho h / D},$$
<p>where $a$ is the side of the square or the radius of the circle. The readout shows $\\Omega$ for the nearest mode. For the clamped circle the frequency equation is $J_n(\\lambda) I_n'(\\lambda) - I_n(\\lambda) J_n'(\\lambda) = 0$ with $\\Omega = \\lambda^2$. Its first roots are $\\lambda = 3.196$ and $4.611$.</p>
<h3>Chladni's approximation for the square</h3>
<p>A classic shortcut writes the square-plate modes as</p>
$$w \\approx \\cos\\frac{n\\pi x}{a}\\cos\\frac{m\\pi y}{a} \\pm \\cos\\frac{m\\pi x}{a}\\cos\\frac{n\\pi y}{a}.$$
<p>This is an approximation. It solves $\\nabla^4 w = \\Omega^2 w$ with $\\Omega = \\pi^2(n^2+m^2)$, but it meets the wrong edge conditions (zero slope instead of zero moment). Its nodal lines still look much like the real figures, which is why it is popular. Its frequencies are poor: for the $(1,1)$ mode it gives $2\\pi^2 \\approx 19.7$ against the true $13.47$. Turn on the amber overlay to compare it with the computed lines.</p>
<h3>How the page solves it</h3>
<p><strong>Square, free edges.</strong> The Ritz method. The plate shape is written as a sum of products $X_i(x)X_j(y)$ of free-free beam modes, 12 in each direction. Minimising energy turns the equation into a matrix eigenproblem. The basis is split into parts that are symmetric or antisymmetric under swapping $x$ and $y$, which gives every mode a clean $(m,n)\\pm$ name. The first three values, 13.48, 19.68 and 24.35, sit within 0.5% of Leissa's reference values 13.47, 19.60 and 24.27. Ritz values always sit slightly above the true ones.</p>
<p><strong>Circle.</strong> Exact solutions $w = [J_n(\\lambda r) + C\\, I_n(\\lambda r)]\\cos n\\theta$ built from ordinary and modified Bessel functions. The edge conditions fix $C$ and $\\lambda$.</p>
<p><strong>Driving and sand.</strong> The bow or shaker pushes at one point. Each mode responds like a damped oscillator with amplitude $F_k/(\\omega_k^2-\\omega^2+2i\\zeta\\omega_k\\omega)$, and the plate shape is the sum. A grain hops wherever the local acceleration $\\omega^2|w|$ exceeds $g$, and lands a random distance away that grows with $|w|$. Grains where the plate is quieter than $g$ stay put.</p>`,
  deep: [
    {
      title: 'Why sand finds the nodes',
      html: `<p>A grain resting on a plate stays put as long as the plate's downward acceleration is less than $g$. Once the local acceleration $\\omega^2 |w|$ exceeds $g$, the plate drops away faster than gravity can follow, and the grain is thrown into the air. It lands somewhere else, roughly at random.</p>
<p>Grains just below the threshold cannot take off, but while the plate rings they still rattle and slide a little. The model gives them a smaller step, also proportional to $|w|$. This pulls the sand from the edges of the quiet band onto the line itself.</p>
<p>The result is a random walk whose step size depends on position. Near an antinode the steps are large. Near a nodal line they shrink to zero. A walker spends most of its time where it moves slowest, so the grains pile up along the lines. The test suite checks this: after a few hundred hops the density of grains near the nodes is more than three times the average, and almost no grains are left at the antinodes.</p>
<p>The width of the sand lines depends on the drive. Stronger drive shrinks the region where the plate is quieter than gravity, so the lines get thinner. Try the <b>Drive strength</b> slider.</p>
<p>Very fine powder behaves differently. In 1831 Michael Faraday showed that light dust such as lycopodium gathers at the <em>antinodes</em>. The vibrating plate drives small circulating air currents that carry the dust there. In a vacuum the effect goes away.</p>`,
    },
    {
      title: 'Napoleon, Sophie Germain and the plate equation',
      html: `<p>Ernst Chladni published his figures in <em>Entdeckungen über die Theorie des Klanges</em> (Discoveries in the Theory of Sound) in Leipzig in 1787. He toured Europe with his plates, and in Paris he demonstrated them to Napoleon. Prompted by Napoleon, the Paris Academy of Sciences offered a prize for a mathematical theory of vibrating elastic surfaces that would agree with experiment.</p>
<p>Sophie Germain, who had taught herself mathematics, was the only entrant in 1811. Her first memoir had errors. Lagrange, one of the judges, corrected her calculation and arrived at a fourth-order equation that he thought might describe the figures. She tried again and received an honourable mention in 1813. On her third attempt, in 1816, she won. She was the first woman to win a prize from the Paris Academy.</p>
<p>Her work still had gaps. The right edge conditions took decades more. Poisson proposed three conditions for a free edge, one more than a fourth-order equation allows. Gustav Kirchhoff settled it in 1850 by combining two of them into the effective shear condition used today. Solving the free square plate in practice waited until 1909, when Walther Ritz used it to introduce the approximation method that now carries his name.</p>`,
    },
    {
      title: 'Degenerate modes and the ± combinations',
      html: `<p>A square looks the same after swapping $x$ and $y$. So if a shape with $m$ lines one way and $n$ the other is a mode, its mirror image is one too. When the two have the same frequency, any mixture of them is also a mode.</p>
<p>For a free plate, the bending terms couple the two versions, and the sum and difference split apart in frequency. The $(0,2)-$ mode, with nodal lines along both diagonals, rings at $\\Omega = 19.6$. The $(0,2)+$ mode, with a closed ring-like line, rings at $24.3$. These are two different notes, and Chladni heard them as such.</p>
<p>Some pairs stay exactly degenerate because of symmetry. When $m$ and $n$ have different parity, the $+$ and $-$ versions share a frequency. The bow then decides the mixture, so the figure you see depends on where you bow. Chladni used this, pressing a finger on the plate to force a node and choose the figure.</p>
<p>The circular plate has the same effect. Each mode with $n$ nodal diameters comes as a $\\cos n\\theta$ and $\\sin n\\theta$ pair at one frequency. The driver picks the orientation. Its diameters line up so that the driving point sits on an antinode.</p>`,
    },
    {
      title: 'Violins, guitars and plate tuning',
      html: `<p>Instrument makers use Chladni figures to tune the wooden plates of violins and guitars before gluing them together. The free plate is held over a loudspeaker, sprinkled with glitter or tea leaves, and swept in frequency. The maker scrapes wood away until the figures appear at the desired pitches and look symmetric.</p>
<p>The American researcher and violin maker Carleen Hutchins made this method popular from the 1960s onward. She paid special attention to free-plate modes 2 and 5 of a violin plate. Mode 2 shows an X of crossing lines, and mode 5 shows a closed ring. On the square plate here the $(0,2)-$ and $(0,2)+$ modes are their close cousins. How much the method improves the finished instrument is still debated among makers.</p>
<p>Engineers use the same physics without sand. Laser vibrometers and holographic interferometry map mode shapes of car panels, turbine blades and circuit boards, so that resonances can be kept away from the forces the part will feel.</p>`,
    },
    {
      title: 'Quantum eigenstates, and cymatics honestly',
      html: `<p>A Chladni figure is a picture of an <strong>eigenfunction</strong>: a shape that a linear operator only rescales. Quantum mechanics is full of them. A particle trapped in a square box has standing-wave states $\\psi \\propto \\sin(n\\pi x/a)\\sin(m\\pi y/a)$ with nodal lines where it is never found. In 1993 a scanning tunnelling microscope imaged electron standing waves inside a ring of 48 iron atoms, the quantum corral. It looks strikingly like a Chladni plate.</p>
<p>The analogy has limits. The Schrödinger equation contains $\\nabla^2$, the plate equation $\\nabla^4$. Oddly, both give the same kind of dispersion, frequency growing as wavenumber squared: $\\omega = k^2\\sqrt{D/\\rho h}$ for bending waves and $E = \\hbar^2k^2/2m$ for a free particle. The sand also has no quantum counterpart. It is a classical record of where the motion is small.</p>
<p><strong>Cymatics.</strong> The Swiss physician Hans Jenny coined the word in the 1960s for patterns made by sound in sand, liquids and pastes. His photographs and many videos since are beautiful. Some popular claims go much further, saying certain frequencies heal, or that the patterns reveal hidden meaning in sound. No good evidence supports these. The figures depend on the plate's shape, material, edges and the driving point, which is exactly what the equation above predicts.</p>`,
    },
  ],
  challenges: [
    {
      id: 'resonate',
      title: 'Draw a figure',
      prompt: 'Find a resonance yourself and let the sand gather until the sand-at-nodes readout reaches 2.2 times uniform.',
      hint: 'Drag the frequency slider slowly and watch the spikes in the corner graph. When the dot goes above the dashed line, use <b>Fine tune</b> or <b>Snap to nearest mode</b>.',
      check: (s) => s.touched === true && s.onRes === true && (s.nodeRatio as number) >= 2.2,
    },
    {
      id: 'cross',
      title: 'Make a cross',
      prompt: 'On the square plate, find a figure made of two straight nodal lines crossing at the centre, either along the middle lines or along the diagonals.',
      hint: 'These are the two lowest notes of the free square. Try mode $(1,1)$, or $(0,2)$ with the minus combination, then press <b>Go to this mode</b>.',
      check: (s) => s.shape === 'square' && s.onRes === true && (s.nodeRatio as number) >= 2 && ((s.modeA === 1 && s.modeB === 1) || (s.modeA === 0 && s.modeB === 2 && s.modeSign === -1)),
    },
    {
      id: 'ring',
      title: 'Sand in a ring',
      prompt: 'Switch to the circle and find a mode with no nodal diameters and at least one nodal circle, so the sand forms a ring.',
      hint: 'Set <b>Nodal diameters</b> to 0 and <b>Nodal circles</b> to 1, then press <b>Go to this mode</b>. Either edge type works.',
      check: (s) => s.shape === 'circle' && s.onRes === true && s.modeA === 0 && (s.modeB as number) >= 1 && (s.nodeRatio as number) >= 2,
    },
    {
      id: 'calm',
      title: 'Nothing happens',
      prompt: 'Show that between resonances the sand stays scattered. Press <b>Reset sand</b>, then keep the plate below the dashed line for 10 seconds.',
      hint: 'Pick a frequency between two spikes in the graph, or nudge <b>Fine tune</b> about 1% off a peak, then press <b>Reset sand</b> and wait.',
      check: (s) => s.touched === true && (s.calmTime as number) >= 10 && (s.nodeRatio as number) < 1.3,
    },
  ],
  caveats: `<p><strong>Thin, linear plate.</strong> The model is Kirchhoff plate theory. It ignores shear deformation and rotary inertia, which matter only when the waves get as short as a few plate thicknesses. It assumes small motion, so the plate's frequencies do not shift with amplitude.</p>
<p><strong>Ritz accuracy.</strong> The square-plate frequencies come from a finite basis. They are slightly high, by about 0.5% for the lowest modes and more for the highest ones shown. The shapes are accurate enough to draw the figures.</p>
<p><strong>Support and damping.</strong> Real Chladni plates are clamped at a small area near the centre. Here the square plate is perfectly free, which shifts some frequencies. Damping is one number, $\\zeta = 0.001$, for every mode. Real plates vary from mode to mode.</p>
<p><strong>Sand.</strong> Grains are points that hop independently when the local acceleration beats $g$. Below that they rattle with a small step, a stand-in for sliding on the tilting plate. There is no air, no bouncing between grains, no rolling, and the sand's mass does not load the plate. The drive is calibrated so that the hop ratio reads as plate acceleration over $g$, not from a measured bow force.</p>
<p><strong>Display.</strong> The motion is shown in slow motion at about 1.6 Hz and exaggerated by a large factor. The sound button plays the true drive frequency.</p>`,
  further: [
    { label: 'Ernst Chladni (Wikipedia)', url: 'https://en.wikipedia.org/wiki/Ernst_Chladni' },
    { label: 'Sophie Germain (Wikipedia)', url: 'https://en.wikipedia.org/wiki/Sophie_Germain' },
    { label: 'Kirchhoff–Love plate theory (Wikipedia)', url: 'https://en.wikipedia.org/wiki/Kirchhoff%E2%80%93Love_plate_theory' },
    { label: 'Cymatics (Wikipedia)', url: 'https://en.wikipedia.org/wiki/Cymatics' },
  ],
};
