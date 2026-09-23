import type { TopicContent } from '../../core/types.ts';

export const content: TopicContent = {
  intuition: `
<p class="lead">Pluck a guitar string and it can ring in many ways. It can swing as one smooth arc, or split into two, three or more wiggling segments. Each pattern is a different note. String theory makes a bold guess: the particles of nature are notes of one tiny, vibrating string.</p>
<p>In this picture an electron and a photon are not different things. They are the <strong>same string playing different notes</strong>. More wiggles take more energy. By $E = mc^2$, more energy means a <strong>heavier particle</strong>. Watch the loop in the scene. Raise the harmonic and count the wiggles. The ladder in the corner shows the mass climbing with it.</p>
<p>The biggest surprise is at the bottom of the ladder. The simplest vibration of a closed loop behaves exactly like a <strong>graviton</strong>, the particle that would carry gravity. Nobody put gravity in by hand. It falls out of the maths. That is the main reason physicists take strings seriously.</p>
<p>The theory only works if space has more dimensions than the three we see. Where would they hide? Switch the view to <strong>Extra dimension</strong>. A long line with a tiny circle at every point is really a thin tube. Press <strong>Zoom out</strong> and the tube shrinks into what looks like a plain line. A garden hose seen from an aeroplane looks one-dimensional too.</p>
<p>A string on that tube can do two things a point particle cannot. It can <strong>travel around</strong> the circle, and it can <strong>wrap around</strong> it like a rubber band. Swap a small circle for a large one and swap the two behaviours, and the list of particle masses comes out <em>exactly the same</em>. Strings cannot tell a circle of radius $R$ from one of radius $1/R$.</p>
<p>Keep one thing in mind throughout. String theory is a beautiful and well-studied mathematical framework. It has <strong>not been confirmed by any experiment</strong>. The loop you see is also a cartoon: a real string would be a quantum object, far smaller than anything we can probe.</p>`,
  tryFirst: [
    'Step the <b>Harmonic</b> slider from 1 to 6. Count the wiggles and watch the mass ladder in the corner climb.',
    'Turn off <b>Closed loop</b> to get an open string. Its ends are pinned to two small plates, like a guitar string on its bridge.',
    'Switch <b>View</b> to <b>Extra dimension</b>, then press <b>Zoom out</b>. The tube becomes a line.',
    'Zoom back in, drag the <b>Radius R</b> slider, then press <b>Swap R ↔ 1/R</b>. The mass levels in the corner do not move. Only their colours swap.',
  ],
  equation: {
    tex: "M^2 = \\left(\\frac{n}{R}\\right)^2 + \\left(\\frac{wR}{\\alpha'}\\right)^2 + \\frac{2}{\\alpha'}\\left(N + \\tilde N - 2\\right)",
    caption: "The mass of a closed bosonic string on a circle of radius R. Units with α' = 1. Only states with N − Ñ = n·w exist.",
    terms: [
      { tex: 'M^2', name: 'Mass squared', meaning: 'The mass of the particle this string state looks like, seen from the large dimensions. Negative means a tachyon, an instability.', param: 'M2' },
      { tex: '\\frac{n}{R}', name: 'Momentum', meaning: 'A string moving around the circle has quantised momentum $n/R$ with integer $n$. Small circles make this expensive.', param: 'n' },
      { tex: "\\frac{wR}{\\alpha'}", name: 'Winding', meaning: "A string wrapped $w$ times around the circle is stretched. Its tension $1/(2\\pi\\alpha')$ times its length $2\\pi R w$ gives energy $wR/\\alpha'$. Large circles make this expensive.", param: 'w' },
      { tex: 'R', name: 'Radius', meaning: 'Size of the hidden circle. Momentum costs $1/R$ and winding costs $R$, so swapping $R \\to 1/R$ and $n \\leftrightarrow w$ changes nothing.', param: 'R' },
      { tex: 'N', name: 'Right-moving vibrations', meaning: 'Total excitation level of the waves running one way around the loop. The $-2$ is the zero-point energy of the bosonic string.', param: 'N' },
      { tex: '\\tilde N', name: 'Left-moving vibrations', meaning: 'Excitation level of the waves running the other way. Level matching demands $N - \\tilde N = n w$.', param: 'Nt' },
    ],
  },
  physicsNotes: `
<h3>Where the formula comes from</h3>
<p>A string sweeps out a sheet in spacetime, not a line. The simplest action is its area, the Nambu–Goto action, with tension $T = 1/(2\\pi\\alpha')$. In a convenient gauge each coordinate obeys the ordinary wave equation on the string, so a closed loop carries waves that run left and right independently:</p>
$$X(\\sigma, t) = X_L(t + \\sigma) + X_R(t - \\sigma)$$
<p>Each wave splits into Fourier harmonics with frequency equal to the harmonic number. Quantising turns each harmonic into a ladder of quanta. $N$ counts the total right-moving level, weighted by harmonic, and $\\tilde N$ does the same for the left movers.</p>
<h3>Adding the circle</h3>
<p>Now let one direction be a circle of radius $R$. Two new numbers appear. The momentum around the circle must fit a whole number of wavelengths, so it is $n/R$. The string can also wrap $w$ times, and a wrapped string has energy $wR/\\alpha'$ from its stretched length. Add the squares and the oscillator energy and you get the headline equation.</p>
<h3>Level matching</h3>
<p>Nothing picks out a starting point on a closed loop. Rotating the label $\\sigma$ must be harmless, and that requires $N - \\tilde N = n w$. The scene tells you when your chosen state breaks this rule. Such a state does not exist.</p>
<h3>What the scene simplifies</h3>
<p>The bosonic string used here is the simplest version. It is a teaching model, not a candidate for our universe. The glowing loop is a classical wave, while the masses come from the quantum theory.</p>`,
  deep: [
    {
      title: 'Why a string and not a point?',
      html: `<p>Quantum field theory treats particles as points. When two points meet, the interaction happens at a single spacetime location. For gravity this is a disaster. Loop calculations produce infinities that cannot be absorbed into a finite list of constants, so the theory loses predictive power at the Planck scale, about $10^{-35}$ m.</p>
<p>Strings smear the interaction out. Two loops join into one along a smooth surface, like a pair of trousers. There is no sharp vertex where everything piles up. In the string calculations done so far, the short-distance infinities that plague point-particle gravity do not appear, because the string length $\\sqrt{\\alpha'}$ acts as a natural cutoff.</p>
<p>The spectrum of a closed string always contains a massless state of spin 2. At the massless level $N = \\tilde N = 1$, one left-moving and one right-moving quantum combine into a two-index tensor. Its symmetric traceless part is the graviton. At low energy its interactions reproduce Einstein's general relativity. Gravity is not optional in string theory. It is required.</p>`,
    },
    {
      title: 'Kaluza, Klein and the hidden circle',
      html: `<p>In 1921 Theodor Kaluza wrote Einstein's equations in five dimensions instead of four. The extra components of the metric behaved exactly like Maxwell's electromagnetism. In 1926 Oskar Klein asked why nobody sees the fifth dimension, and answered that it is curled into a tiny circle.</p>
<p>A field on a circle must fit whole wavelengths around it. Its momentum there is $n/R$, and from four dimensions each value of $n$ looks like a separate particle of mass $|n|/R$. This is the <strong>Kaluza–Klein tower</strong>. The spacing is $1/R$. A tiny circle makes even the first rung enormously heavy, which is why it would be invisible. As $R$ grows, the rungs crowd together into a continuum and the dimension becomes an ordinary, visible direction. Drag $R$ up and watch the cyan bars in the corner bunch together.</p>`,
    },
    {
      title: 'T-duality and a smallest size',
      html: `<p>A point particle on a circle only has momentum. A closed string also has winding. Look at the mass formula under the swap</p>
$$R \\to \\frac{\\alpha'}{R}, \\qquad n \\leftrightarrow w.$$
<p>The momentum term $(n/R)^2$ turns into $(wR/\\alpha')^2$ and the other way round. The oscillator term does not change, and neither does the level-matching rule $N - \\tilde N = n w$. The whole spectrum is identical. This goes beyond masses: the full interacting theories on the two circles are the same theory.</p>
<p>So a circle smaller than $\\sqrt{\\alpha'}$ is physically the same as a larger one. Shrinking past the string length does not give you access to shorter distances. That suggests the string length is a minimum meaningful size.</p>
<p>At the <strong>self-dual radius</strong> $R = \\sqrt{\\alpha'}$ something special happens. States with $n = \\pm1$, $w = \\pm1$ and one unit of oscillation become massless vectors. With the two ordinary massless vectors of the circle they form the gauge bosons of an $SU(2) \\times SU(2)$ symmetry. Extra massless scalars with $n = \\pm 2$ or $w = \\pm 2$ appear too. The symmetry is enhanced exactly at the point where the two descriptions meet.</p>`,
    },
    {
      title: 'Why 26, why 10, and the tachyon',
      html: `<p>The $-2$ in the headline equation is the zero-point energy of the string's vibrations, summed over its transverse directions. Keeping the quantum theory consistent with special relativity fixes it, and that only works in <strong>26 spacetime dimensions</strong> for the bosonic string. The same $-2$ makes the ground state $N = \\tilde N = 0$ a <strong>tachyon</strong> with $M^2 = -4/\\alpha'$. It signals that this vacuum is unstable. Find it at the bottom of the spectrum in the corner, drawn in red.</p>
<p>The bosonic string also has no fermions, so it cannot describe electrons or quarks. <strong>Superstrings</strong> add fermionic partners on the worldsheet. The critical dimension drops to <strong>10</strong>. Spacetime supersymmetry removes the tachyon and the spectrum starts at zero mass. There are five consistent superstring theories, linked by dualities such as the one on this page. They are thought to be limits of a single framework called M-theory, which lives in 11 dimensions.</p>`,
    },
    {
      title: 'Calabi–Yau spaces, holography and the honest status',
      html: `<p><strong>Compactification.</strong> To get four large dimensions from ten, six must curl up. To keep some supersymmetry at low energy they are usually taken to form a Calabi–Yau space, a six-dimensional shape with special curvature. Its holes and handles would decide how many families of particles exist and how they interact. The circle on this page is the simplest cartoon of that idea.</p>
<p><strong>Holography.</strong> In 1997 Juan Maldacena found that string theory in a curved anti-de Sitter space is equivalent to an ordinary quantum field theory without gravity living on its boundary. This AdS/CFT correspondence is one of the most productive ideas in modern theoretical physics. It is now a tool for studying black holes, strongly coupled plasmas and quantum information, whether or not strings describe our universe.</p>
<p><strong>The honest status.</strong> No experiment has confirmed string theory. The string length is thought to be near the Planck length, far below the roughly $10^{-19}$ m that colliders resolve. The equations appear to allow an enormous number of possible vacua, estimated at $10^{500}$ or more. This <em>landscape</em> makes firm predictions hard. Experiments still constrain the ideas. The LHC has searched for Kaluza–Klein gravitons and microscopic black holes and found none, ruling out large extra dimensions below a few TeV in many models. Torsion-balance tests find Newton's inverse-square law holding down to about 50 micrometres. Any extra dimension must be smaller than that, or hidden from gravity too.</p>`,
    },
  ],
  challenges: [
    {
      id: 'self-dual',
      title: 'The self-dual circle',
      prompt: 'Tune the radius to the self-dual value $R = \\sqrt{\\alpha\'} = 1$, within 0.02.',
      hint: 'Use the Extra dimension view and drag the R slider to the middle. This is the one radius that is its own dual. Extra massless states appear here.',
      check: (s) => Math.abs((s.R as number) - 1) < 0.02,
    },
    {
      id: 'matched',
      title: 'Build a real state',
      prompt: 'Pick a state with both momentum and winding ($n \\neq 0$, $w \\neq 0$) that obeys level matching $N - \\tilde N = n w$.',
      hint: 'Try $n = 1$, $w = 1$, then choose $N = 1$ and $\\tilde N = 0$. Watch the level-matching readout.',
      check: (s) => (s.n as number) !== 0 && (s.w as number) !== 0 && s.matched === true,
    },
    {
      id: 'swap',
      title: 'Two circles, one spectrum',
      prompt: 'Press <b>Swap R ↔ 1/R</b> and confirm the mass of your state does not change.',
      hint: 'Any $R$ and any state will do. Watch the M² readout and the bars in the corner before and after.',
      check: (s) => s.swapOk === true,
    },
    {
      id: 'zoom',
      title: 'Hide a dimension',
      prompt: 'Zoom out until the cylinder looks like a plain line.',
      hint: 'Switch to the Extra dimension view and press <b>Zoom out</b>.',
      check: (s) => s.zoomedOut === true,
    },
  ],
  caveats: `<p><strong>Speculative physics.</strong> String theory is an unconfirmed theoretical framework. The mass formula, T-duality and the graviton are solid results inside the theory. Whether the theory describes nature is unknown.</p>
<p><strong>A classical cartoon.</strong> The glowing loop is a classical wave drawn at a visible size. A real string would be a quantum object near $10^{-35}$ m and would not have a definite shape. The mass ladder in the vibration view pairs harmonic $k$ with the lightest state that contains it, which hides the huge number of other states at each level.</p>
<p><strong>Bosonic simplifications.</strong> The formula is for the closed bosonic string, which needs 26 dimensions, has a tachyon and has no fermions. Only one extra dimension is drawn, and the other 22 are ignored. Real proposals use superstrings in 10 dimensions with six curled into a Calabi–Yau space.</p>`,
  further: [
    { label: 'Zwiebach, A First Course in String Theory (textbook)', url: 'https://doi.org/10.1017/CBO9780511841682' },
    { label: 'Tong, Lectures on String Theory (free notes)', url: 'https://www.damtp.cam.ac.uk/user/tong/string.html' },
    { label: 'T-duality on Wikipedia', url: 'https://en.wikipedia.org/wiki/T-duality' },
    { label: 'Kaluza–Klein theory on Wikipedia', url: 'https://en.wikipedia.org/wiki/Kaluza%E2%80%93Klein_theory' },
  ],
};
