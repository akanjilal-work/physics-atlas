import type { TopicContent } from '../../core/types.ts';

export const content: TopicContent = {
  intuition: `
<p class="lead">An open string has two loose ends. In string theory those ends cannot just hang in empty space. They must sit on something. That something is a <strong>D-brane</strong>, a surface where open strings end.</p>
<p>The glowing sheets in the scene are D-branes. Each short, wiggling string has both ends on one sheet. Its ends slide around the surface like beads on a table, but they can never lift off. Other strings reach across the gap from one sheet to another. A stretched string stores energy in its length, like a stretched rubber band. By $E = mc^2$ that energy is mass. <strong>The wider the gap, the heavier the string.</strong></p>
<p>Now slide two sheets together. The stretched string between them gets shorter and lighter. When the sheets touch, it has no length left and its mass drops to zero. At that moment something remarkable happens. The massless strings join the ones already living on each sheet, and together they behave like the <strong>force carriers of a larger symmetry</strong>. Two separate $U(1)$ forces, each like electromagnetism, merge into one richer $U(2)$ force, the kind of structure behind the weak and strong nuclear forces.</p>
<p>That is the surprise. <strong>Gauge symmetry comes from geometry.</strong> How many forces exist, and what kind they are, is set by how many branes sit on top of each other. Pull the sheets apart and the extra force carriers become heavy. That is the string version of the Higgs mechanism.</p>
<p>Closed loops have no ends, so nothing holds them to a brane. They drift off into the space around it, called the <strong>bulk</strong>. Closed strings include the graviton. The <strong>Brane world</strong> view turns this into a bold idea. Maybe our whole universe is a brane. Light and matter are open strings stuck to it. Gravity is a closed string that leaks away, which might be why it is so weak.</p>
<p>Keep two things in mind. D-branes are central to modern string theory, but nothing about them has been seen in an experiment. And the scene is a cartoon. Real strings and branes are quantum objects, and the brane world is speculation.</p>`,
  tryFirst: [
    'Drag the <b>y₂</b> slider toward <b>y₁</b>. Watch the stretched string shrink and the banner switch to <b>U(1)×U(1) → U(2)</b>.',
    'You can also grab a sheet in the scene and drag it sideways.',
    'Set <b>N</b> to 4 and press <b>Stack all</b>, then <b>Spread out</b>. Watch the grid in the corner split into blocks. Each block on the diagonal is one $U(k)$.',
    'Switch the view to <b>Brane world</b>. Open strings stay on the sheet. Closed loops rise off it and leave.',
  ],
  equation: {
    tex: "M = \\frac{y}{2\\pi\\alpha'}",
    caption: "The mass of a string stretched a distance y between two branes, in units with α' = 1. A stack of k coincident branes carries a U(k) gauge symmetry, so the full group is a product of U(k) over the stacks, with Σk² massless force carriers.",
    terms: [
      { tex: 'M', name: 'Stretched-string mass', meaning: 'Mass of the lightest string reaching between two separated stacks. It plays the role of a W boson. It is zero only when the branes coincide.', param: 'mW' },
      { tex: 'y', name: 'Brane separation', meaning: 'Distance between the two branes, measured across the gap. Drag the brane sliders to change it.', param: 'y2' },
      { tex: "\\frac{1}{2\\pi\\alpha'}", name: 'String tension', meaning: 'Energy per unit length of the string, $T = 1/(2\\pi\\alpha\')$. Mass is tension times length, like a stretched spring.' },
      { tex: "\\alpha'", name: 'Regge slope', meaning: "The single constant of string theory. $\\sqrt{\\alpha'}$ is the string length. The scene uses $\\alpha' = 1$, so distances are in string lengths." },
      { tex: '\\textstyle\\sum k^2', name: 'Massless vectors', meaning: 'A stack of $k$ branes has $k^2$ massless strings, one for each ordered pair of branes in the stack. That is the size of $U(k)$.', param: 'vectors' },
    ],
  },
  physicsNotes: `
<h3>Two kinds of ends</h3>
<p>Each direction of space gives the string end a choice. A <strong>Neumann</strong> condition, $\\partial_\\sigma X = 0$, lets the end move freely along that direction. A <strong>Dirichlet</strong> condition, $X = \\text{const}$, pins it. A D$p$-brane is the surface where the end has Neumann conditions in $p$ space directions and Dirichlet conditions in the rest. The "D" stands for Dirichlet. In the scene, the transverse direction across the gap is Dirichlet and the two directions along each sheet are Neumann. Look at the beads. They move over the sheet but never leave it.</p>
<h3>Where the mass comes from</h3>
<p>A string with its two ends pinned a distance $y$ apart has a minimum length $y$. Its energy is at least tension times length, $T y$ with $T = 1/(2\\pi\\alpha')$. The quantum open bosonic string adds the vibrations:</p>
$$M^2 = \\left(\\frac{y}{2\\pi\\alpha'}\\right)^2 + \\frac{N-1}{\\alpha'}$$
<p>At oscillator level $N = 1$ the state is a vector particle and the second term vanishes. Its mass is exactly the headline $M = y/(2\\pi\\alpha')$. When $y = 0$ it is massless, like a photon or a gluon. The superstring version removes the $N = 0$ tachyon and keeps the same massless vectors.</p>
<h3>Chan–Paton labels and the gauge group</h3>
<p>With $N$ branes, each end of an open string carries a label saying which brane it sits on. An oriented string from brane $i$ to brane $j$ is one of $N^2$ sectors $(i, j)$. Those labels fill an $N \\times N$ matrix, exactly like the gauge field of $U(N)$ Yang–Mills theory. The grid in the corner of the scene is that matrix. Cells between coincident branes are massless and light up. Each lit block on the diagonal is a $U(k)$ factor. Cells between separated stacks are massive W-like strings. Pull stacks apart and the symmetry breaks from $U(N)$ down to a product of smaller groups.</p>`,
  deep: [
    {
      title: 'Polchinski 1995: branes are real objects',
      html: `<p>Dirichlet conditions appeared in 1989 in work by Jin Dai, Robert Leigh and Joseph Polchinski, and separately by Petr Hořava. They follow from T-duality, which the <a href="#/t/vibrating-strings">vibrating strings</a> page explores. Swap a circle of radius $R$ for one of radius $\\alpha'/R$ and an open string's Neumann condition around the circle turns into a Dirichlet one. The ends get stuck on a hyperplane. So branes are forced on you once open strings and compact dimensions are both present.</p>
<p>At first these surfaces looked like rigid backgrounds. In 1995 Polchinski showed they are <strong>dynamical objects</strong>. They can move, bend and vibrate, and their fluctuations are exactly the open strings attached to them. He also showed that a D$p$-brane carries charge under a $(p+1)$-form field from the Ramond–Ramond (RR) sector of type II superstrings. Those charges had been predicted by duality arguments, but no string state carried them. D-branes filled the gap.</p>
<p>A D$p$-brane has tension $T_p = \\dfrac{1}{g_s (2\\pi)^p \\alpha'^{(p+1)/2}}$. The factor $1/g_s$ makes branes very heavy when the string coupling $g_s$ is small. That is why they were invisible in ordinary string perturbation theory. Parallel identical branes feel no net force. Attraction through gravity and the dilaton exactly cancels RR repulsion. That is why the branes in the scene can be slid around at no cost.</p>`,
    },
    {
      title: 'The second superstring revolution',
      html: `<p>Before 1995 there were five separate superstring theories. In 1995 Edward Witten and others argued that they are linked by <strong>dualities</strong>, and that they are corners of one larger framework called M-theory, which lives in 11 dimensions. Strong coupling in one theory maps to weak coupling in another.</p>
<p>These maps only work if every theory contains heavy objects that carry the right charges. Under S-duality of type IIB, the fundamental string trades places with the D1-brane. The strong-coupling limit of type IIA grows an eleventh dimension, and its D0-branes become the momentum modes around it. D-branes supplied exactly the missing objects, with exactly the predicted tensions. Their discovery turned a set of conjectures into a tightly checked web.</p>`,
    },
    {
      title: 'U(N) Yang–Mills on a brane stack',
      html: `<p>Witten showed in 1995 that the massless open strings on $N$ coincident D$p$-branes are described at low energy by <strong>$U(N)$ super Yang–Mills theory</strong> in $p+1$ dimensions. The $(p+1)$ directions along the brane give the gauge field $A_\\mu$. The $9-p$ transverse directions give $N \\times N$ matrices of scalar fields $\\Phi^I$.</p>
<p>The brane positions are the eigenvalues of those matrices. Separating the branes gives the scalar a nonzero value, $\\langle \\Phi \\rangle = \\text{diag}(y_1, \\ldots, y_N)/(2\\pi\\alpha')$. That is a Higgs vacuum expectation value. The off-diagonal gauge fields pick up mass $|y_i - y_j|/(2\\pi\\alpha')$, which is exactly the stretched-string mass. The Higgs mechanism of field theory and the geometry of branes are the same statement.</p>
<p>Something odd follows. When branes sit on top of each other, their positions are matrices that need not commute. Space itself stops having ordinary coordinates at very short distances. Ideas like the matrix model of M-theory grew from this.</p>`,
    },
    {
      title: 'Strominger–Vafa: counting black hole microstates',
      html: `<p>Bekenstein and Hawking found that a black hole has entropy $S = A/4G$, one quarter of its horizon area in Planck units. Entropy normally counts microscopic states. For decades nobody knew what a black hole's microstates were.</p>
<p>In 1996 Andrew Strominger and Cumrun Vafa built a special five-dimensional black hole out of $Q_1$ D1-branes, $Q_5$ D5-branes and $n$ units of momentum. At weak coupling it is a brane system, and they counted its states with the gauge theory on the branes. At strong coupling the same charges form a black hole. The two answers matched exactly:</p>
$$S = 2\\pi\\sqrt{Q_1 Q_5 n} = \\frac{A}{4G}.$$
<p>This was the first microscopic derivation of black hole entropy. It works for extremal, supersymmetric black holes, where the counting is protected as the coupling changes. Real astrophysical black holes are neither, and a matching count for them is still open.</p>`,
    },
    {
      title: 'Brane worlds, AdS/CFT and the honest status',
      html: `<p><strong>Brane worlds.</strong> If our universe is a 3-brane, the Standard Model particles are open strings stuck to it, and only gravity explores the extra dimensions. In 1998 Nima Arkani-Hamed, Savas Dimopoulos and Gia Dvali (ADD) used this to address why gravity is so weak. With $n$ extra dimensions of size $R$, the observed Planck mass obeys $M_{\\text{Pl}}^2 \\sim M_*^{2+n} R^n$. The fundamental scale $M_*$ could be as low as a TeV if $R$ is large. Gravity would then only look weak because its field lines dilute into the bulk. Below the distance $R$, Newton's law would steepen from $1/r^2$ to $1/r^{2+n}$. The inset in the Brane world view draws this.</p>
<p>Experiments have looked hard. Torsion-balance tests find the inverse-square law holding down to about 50 micrometres. The LHC has searched for gravitons escaping into the bulk and for tiny black holes, and found none, pushing $M_*$ above several TeV in most versions. A TeV-scale ADD world is now tightly squeezed. Randall and Sundrum proposed a warped alternative in 1999.</p>
<p><strong>AdS/CFT.</strong> In 1997 Juan Maldacena looked at $N$ coincident D3-branes in two ways. As a gauge theory, they give $\\mathcal{N}=4$ super Yang–Mills with gauge group $SU(N)$. As a source of gravity, they bend space into $AdS_5 \\times S^5$. He proposed that the two descriptions are the same physics. This holographic duality is now one of the most used tools in theoretical physics.</p>
<p><strong>Status.</strong> D-branes are mathematically central to string theory. They underpin the dualities, the black hole counting and holography. None of that is experimental evidence. No brane, string or extra dimension has been observed.</p>`,
    },
  ],
  challenges: [
    {
      id: 'u3',
      title: 'Build U(3)',
      prompt: 'Stack exactly three branes on top of each other so a $U(3)$ factor appears in the gauge group.',
      hint: 'Set N to 3 and press <b>Stack all</b>. Or, with N = 4, drag three sliders to the same value. Nearby values snap together.',
      check: (s) => String(s.group).split('×').includes('U(3)'),
    },
    {
      id: 'spread',
      title: 'Break it all',
      prompt: 'With at least three branes, separate every one of them so the group is $U(1)^N$.',
      hint: 'Set N to 3 or 4 and press <b>Spread out</b>. Every stretched string is now massive. This is the fully Higgsed phase.',
      check: (s) => (s.N as number) >= 3 && s.clusters === s.N,
    },
    {
      id: 'heavy',
      title: 'A heavy W',
      prompt: "Make some stretched string heavier than $M = 0.8/\\sqrt{\\alpha'}$.",
      hint: 'Mass grows with separation, $M = y/2\\pi$. You need a gap bigger than about 5. Put one brane near −3 and another near +3.',
      check: (s) => (s.heaviest as number) > 0.8,
    },
    {
      id: 'escape',
      title: 'Gravity leaks',
      prompt: 'In the <b>Brane world</b> view, watch a closed string leave our brane and escape into the bulk.',
      hint: 'Switch the view and wait a few seconds. Make sure closed strings are switched on and the scene is not paused.',
      check: (s) => s.escaped === true,
    },
  ],
  caveats: `<p><strong>Speculative physics.</strong> D-branes are a firm part of string theory as mathematics. String theory itself is unconfirmed, and no brane has been observed. The brane world is a proposal that experiments have already squeezed hard.</p>
<p><strong>A cartoon of quantum objects.</strong> The strings are drawn as classical waves with ends that obey the right boundary conditions. Real strings are quantum objects near the string length and have no definite shape. Each glowing string stands for a whole sector of states, not one particle.</p>
<p><strong>Simplified geometry.</strong> Branes are drawn as 2D sheets separated along one axis. Real D$p$-branes have $p$ from 0 to 9 space dimensions and live in 10 dimensions with several transverse directions. The mass readouts use the classical formula $M = y/(2\\pi\\alpha')$, which is exact only for the massless vector level and at weak coupling.</p>`,
  further: [
    { label: 'Polchinski, Dirichlet-Branes and Ramond-Ramond Charges (1995)', url: 'https://arxiv.org/abs/hep-th/9510017' },
    { label: 'Witten, Bound States of Strings and p-Branes (1995)', url: 'https://arxiv.org/abs/hep-th/9510135' },
    { label: 'Strominger and Vafa, Microscopic Origin of the Bekenstein-Hawking Entropy (1996)', url: 'https://arxiv.org/abs/hep-th/9601029' },
    { label: 'Maldacena, The Large N Limit of Superconformal Field Theories and Supergravity (1997)', url: 'https://arxiv.org/abs/hep-th/9711200' },
    { label: 'Arkani-Hamed, Dimopoulos and Dvali, The Hierarchy Problem and New Dimensions at a Millimeter (1998)', url: 'https://arxiv.org/abs/hep-ph/9803315' },
    { label: 'Tong, Lectures on String Theory, chapter on D-branes (free notes)', url: 'https://www.damtp.cam.ac.uk/user/tong/string.html' },
  ],
};
