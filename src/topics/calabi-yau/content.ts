import type { TopicContent } from '../../core/types.ts';

export const content: TopicContent = {
  intuition: `
<p class="lead">The previous topic ended with a question. String theory needs ten dimensions, and we see four. Where are the other six? The usual answer is that they are curled up so small that nothing we can build could notice them. This page is about the shape they would curl into, and why that shape matters so much.</p>
<p>A tiny circle is the simplest hiding place. But six hidden dimensions can form far richer shapes, with holes, handles and twists. The idea is that <strong>every point of ordinary space carries one of these tiny shapes</strong>. Switch the view to <strong>Compactification</strong> and press <strong>Zoom in and out</strong>. From far away you see a plain grid of points. Up close, each point turns out to hold a small curled shape.</p>
<p>Here is the surprise. The shape is not just a hiding place. A string moving through it vibrates in ways the shape allows, and those vibrations are the particles we would see. So the <strong>holes of the hidden shape would decide the laws of physics</strong>: how many families of particles exist, and how strongly they interact. Count the holes and you could, in principle, count the quarks.</p>
<p>Not any shape works. To keep a symmetry called supersymmetry, the shape must be a very special kind called a <strong>Calabi–Yau manifold</strong>. The main view shows a famous picture of one. It is a surface cut out by a simple equation, drawn with Andrew Hanson's method. Each coloured patch is one piece of the surface. Watch the patches slide through each other as the projection angle turns.</p>
<p>Be careful with what you are looking at. A real Calabi–Yau shape has six dimensions. The surface on screen is a <strong>two-dimensional slice</strong> of it, which lives in four dimensions, <strong>projected down to three</strong> so a screen can show it. The places where it seems to cut through itself are shadows of the projection. And no experiment has yet shown that extra dimensions exist at all.</p>`,
  tryFirst: [
    'Let the surface turn. The <b>Projection angle α</b> mixes two hidden directions into the third screen axis. Patches that seem to cross do not really touch.',
    'Step the <b>Degree n</b> from 2 to 6. Watch the <b>genus</b> readout. It counts the holes of the finished surface.',
    'Turn on <b>One patch only</b> to see a single piece. The whole surface is n² copies of it, rotated by roots of unity.',
    'Switch <b>View</b> to <b>Compactification</b> and press <b>Zoom in and out</b>.',
    'Pick different shapes under <b>Manifold</b> and read the Hodge diamond in the corner. Look for one that gives three generations.',
  ],
  equation: {
    tex: 'z_1^{\\,n} + z_2^{\\,n} = 1 \\quad (\\text{a 2D slice})',
    caption: 'The curve drawn in the scene. With n = 5 it is a slice of the quintic threefold z₁⁵ + z₂⁵ + z₃⁵ + z₄⁵ + z₅⁵ = 0 in CP⁴, the best known Calabi–Yau shape.',
    terms: [
      { tex: 'z_1', name: 'First complex coordinate', meaning: 'A complex number, so two real directions. The scene draws $\\mathrm{Re}\\,z_1$ across the screen and mixes $\\mathrm{Im}\\,z_1$ into depth through the angle $\\alpha$.', param: 'alpha' },
      { tex: 'z_2', name: 'Second complex coordinate', meaning: 'Two more real directions. $\\mathrm{Re}\\,z_2$ is drawn upward. Its imaginary part shares the depth axis with $\\mathrm{Im}\\,z_1$, weighted by $\\sin\\alpha$.', param: 'alpha' },
      { tex: 'n', name: 'Degree', meaning: 'The power in the equation. It sets the topology: the finished surface has genus $g = (n-1)(n-2)/2$, and Hanson\'s picture needs $n^2$ patches.', param: 'n' },
      { tex: '1', name: 'The frozen coordinates', meaning: 'In the quintic, the other three coordinates are held fixed and folded into this constant. That is what makes the picture a slice. Pick the full threefold under Manifold to see its Hodge numbers.', param: 'manifold' },
      { tex: '\\text{a 2D slice}', name: 'What you see', meaning: 'One complex equation in two complex unknowns leaves one complex dimension, a real surface. The real Calabi–Yau has three complex dimensions, six real ones.', param: 'view' },
    ],
  },
  physicsNotes: `
<h3>The Calabi–Yau condition</h3>
<p>A compact six-dimensional space $K$ is Calabi–Yau when it is <strong>Kähler</strong> (its complex structure and its metric fit together smoothly), <strong>Ricci-flat</strong> ($R_{ij} = 0$, so it solves Einstein's vacuum equations on its own), and has vanishing first Chern class, $c_1 = 0$. Calabi guessed in 1957 that the topological condition $c_1 = 0$ is enough to guarantee a Ricci-flat Kähler metric. Yau proved it in 1977. Ricci-flat Kähler in six dimensions is the same as holonomy inside $SU(3)$, and that is exactly what leaves one quarter of the supersymmetry unbroken in four dimensions.</p>
<h3>Hanson's method</h3>
<p>Write $\\xi = x + iy$. Because $\\cosh^2\\xi - \\sinh^2\\xi = 1$, the choice</p>
$$z_1 = e^{2\\pi i k_1/n}\\,(\\cosh\\xi)^{2/n}, \\qquad z_2 = e^{2\\pi i k_2/n}\\,(-i\\sinh\\xi)^{2/n}$$
<p>gives $z_1^n = \\cosh^2\\xi$ and $z_2^n = -\\sinh^2\\xi$, so $z_1^n + z_2^n = 1$ exactly. The strip $x \\in [-a, a]$, $y \\in [0, \\pi/2]$ gives one patch. The phases $k_1, k_2 \\in \\{0, \\dots, n-1\\}$ run over the $n$-th roots of unity, so there are $n^2$ patches. The four real numbers $(\\mathrm{Re}\\,z_1, \\mathrm{Im}\\,z_1, \\mathrm{Re}\\,z_2, \\mathrm{Im}\\,z_2)$ are projected to three:</p>
$$(\\mathrm{Re}\\,z_1,\\ \\mathrm{Re}\\,z_2,\\ \\cos\\alpha\\,\\mathrm{Im}\\,z_1 + \\sin\\alpha\\,\\mathrm{Im}\\,z_2).$$
<h3>Counting holes with Chern classes</h3>
<p>For a degree-$d$ hypersurface $X$ in $\\mathbb{CP}^m$, the adjunction formula gives the total Chern class $c(X) = (1+H)^{m+1}/(1+dH)$. The first Chern class vanishes when $d = m + 1$. That is the Calabi–Yau condition, and it picks out the cubic curve in $\\mathbb{CP}^2$ and the quintic in $\\mathbb{CP}^4$. For the quintic, the $H^3$ coefficient is $10 - 5\\cdot10 + 25\\cdot5 - 125 = -40$. Integrating over $X$ multiplies by $d = 5$:</p>
$$\\chi(\\text{quintic}) = 5 \\times (-40) = -200 = 2\\,(h^{1,1} - h^{2,1}) = 2\\,(1 - 101).$$
<p>The number 101 has a direct meaning. A quintic polynomial in five variables has 126 coefficients. Changes of coordinates remove 25 of them. The 101 that remain are the ways to deform the shape.</p>`,
  deep: [
    {
      title: 'Why six dimensions, and why so special',
      html: `<p>Superstring theory is only consistent in ten spacetime dimensions. We see four. The other six must be compact, curled into a closed space, and small. If they were large, gravity would leak into them and Newton's inverse-square law would fail at the distance where they open up. Tests find no such failure down to tens of micrometres.</p>
<p>In 1985 Candelas, Horowitz, Strominger and Witten asked which six-dimensional shapes are allowed if the four large dimensions should keep one unit of supersymmetry, the $N = 1$ supersymmetry that many hoped would appear at the LHC. Their answer was a Ricci-flat Kähler manifold with $SU(3)$ holonomy. Mathematicians already knew these spaces. Eugenio Calabi had conjectured in 1957 that they exist whenever a simple topological test is passed. Shing-Tung Yau proved it in 1977, work that earned him the Fields Medal in 1982. Physicists named the spaces after both of them.</p>
<p>Yau's proof shows the metric exists, but not what it looks like. No explicit Ricci-flat metric is known on any compact Calabi–Yau threefold. Today people approximate them numerically, including with neural networks.</p>`,
    },
    {
      title: 'How holes become particles',
      html: `<p>A field on the hidden space splits into modes, just as a string on a circle splits into momentum states. The modes with zero energy are the light particles we could see. The number of zero modes of each kind is counted by the <strong>Hodge numbers</strong> $h^{1,1}$ and $h^{2,1}$, which count independent holes of different types. The Hodge diamond in the corner of the scene lists them all.</p>
<p>In the simplest heterotic $E_8 \\times E_8$ construction, the standard embedding, each $(2,1)$ hole gives a family of particles and each $(1,1)$ hole gives an anti-family. The net number of families, or <strong>generations</strong>, is</p>
$$N_{\\text{gen}} = |h^{2,1} - h^{1,1}| = \\tfrac{1}{2}|\\chi|.$$
<p>Nature has three generations: the electron, muon and tau families. The quintic gives 100. In 1986 Tian and Yau built a manifold with $\\chi = -6$ by dividing a shape with $\\chi = -18$ by a free $\\mathbb{Z}_3$ symmetry. It gives exactly 3, and for a while it looked very promising. Particle masses and mixings come from <strong>Yukawa couplings</strong>, which are integrals of three zero-mode wavefunctions over the hidden space. Where the modes overlap strongly, the coupling is large.</p>
<p>Modern models use more general gauge bundles and branes, and there the count comes from an index theorem instead of $|\\chi|/2$. Several constructions reproduce the particle content of the Standard Model exactly. None has yet predicted a quantity that was then measured.</p>`,
    },
    {
      title: 'Mirror symmetry and counting curves',
      html: `<p>Around 1989 physicists noticed that Calabi–Yau shapes seem to come in pairs. For each shape with Hodge numbers $(h^{1,1}, h^{2,1})$ there is a <strong>mirror</strong> with the two numbers swapped, so $\\chi$ flips sign. Pick the mirror quintic in the Manifold control: $(101, 1)$ instead of $(1, 101)$. A string cannot tell the two apart. Every physical answer computed on one equals an answer on the other, even though the shapes look nothing alike.</p>
<p>In 1991 Candelas, de la Ossa, Green and Parkes turned this into a calculating machine. On one side the answer is a hard counting problem: how many rational curves of degree $d$ lie on the quintic? On the mirror side it is a much easier integral. They predicted the whole sequence:</p>
$$n_1 = 2875, \\quad n_2 = 609\\,250, \\quad n_3 = 317\\,206\\,375, \\ \\dots$$
<p>The count of lines, 2875, was classical. The conics had been counted in 1986. For cubics, two mathematicians using standard methods first got a different number. They later found an error in their computer code, and the corrected result matched the physicists. Mirror symmetry for the quintic was proved around 1996 by Givental and by Lian, Liu and Yau. A physical duality had produced true theorems that mathematicians had no other way to reach.</p>`,
    },
    {
      title: 'The landscape and moduli',
      html: `<p>There are many Calabi–Yau threefolds. Kreuzer and Skarke listed 473,800,776 four-dimensional reflexive polytopes, each giving at least one such shape, with over 30,000 distinct pairs of Hodge numbers. Nobody knows whether the total number of topologies is finite.</p>
<p>Each shape also comes with <strong>moduli</strong>: $h^{1,1}$ numbers that set sizes and $h^{2,1}$ that set the shape. Left free, each modulus is a massless scalar field in four dimensions. It would carry a new long-range force, and none is seen. So the moduli must be fixed, or <strong>stabilized</strong>. Magnetic-like fluxes threading the holes, and quantum effects, can do this. The KKLT construction of 2003 is the best known attempt to reach a stable vacuum with a small positive vacuum energy. Whether it fully works is still debated.</p>
<p>Different flux choices give different vacua. A rough estimate from around 2004 gives about $10^{500}$ of them, a figure quoted often. A later count on a single geometry reached around $10^{272\\,000}$. These are estimates, not firm results. Each vacuum could have its own particle content and constants. This is the <strong>landscape problem</strong>. With so many options, it is hard to extract a sharp prediction, and some argue for anthropic reasoning instead. Others suspect most of these vacua are inconsistent, the so-called swampland.</p>`,
    },
    {
      title: 'Reading the picture honestly',
      html: `<p><strong>What is drawn.</strong> The curve $z_1^n + z_2^n = 1$ lives in $\\mathbb{C}^2$, which is four real dimensions. The scene keeps $\\mathrm{Re}\\,z_1$ and $\\mathrm{Re}\\,z_2$, and blends the two imaginary parts into one depth axis. Turning $\\alpha$ changes the blend. Apparent self-crossings are artefacts of that projection.</p>
<p><strong>Missing points.</strong> The strip is cut off at $|x| \\le a$, because the surface runs off to infinity. Adding $n$ points at infinity closes it up into a compact surface of genus $g = (n-1)(n-2)/2$. For $n = 2$ that is a sphere. For $n = 3$ it is a torus, the one-dimensional Calabi–Yau. For $n = 5$ it has genus 6.</p>
<p><strong>The $n = 5$ slice.</strong> The quintic threefold is $z_1^5 + \\dots + z_5^5 = 0$ in $\\mathbb{CP}^4$. Set $z_5 = 1$ and freeze $z_3$ and $z_4$. What remains is $z_1^5 + z_2^5 = c$, and a rescaling sets $c = 1$. So the $n = 5$ picture is a real 2D slice of a real 6D shape. It shows the local texture of the quintic, not its global form, and it carries none of the Ricci-flat metric.</p>
<p><strong>The lattice.</strong> In the Compactification view, the small shapes sit only at lattice points so they stay visible. In the theory there would be one at every point of space, about $10^{-35}$ m across, and all of them would be the same shape.</p>`,
    },
  ],
  challenges: [
    {
      id: 'torus',
      title: 'Find the torus',
      prompt: 'Set the degree to $n = 3$ and confirm the finished surface has genus 1.',
      hint: 'Drag <b>Degree n</b> to 3 and read the genus. A cubic curve is a torus, the simplest compact Calabi–Yau shape.',
      check: (s) => s.n === 3 && s.genus === 1,
    },
    {
      id: 'three-gen',
      title: 'Three generations',
      prompt: 'Select a manifold whose simple heterotic compactification gives exactly 3 generations.',
      hint: 'You need $|\\chi| = 6$. Try the manifold Tian and Yau built by dividing a larger shape by $\\mathbb{Z}_3$.',
      check: (s) => s.gens === 3,
    },
    {
      id: 'half-turn',
      title: 'A full half turn',
      prompt: 'Sweep the projection angle $\\alpha$ through at least 180° by hand and watch the patches pass through each other.',
      hint: 'Turn off <b>Auto-rotate</b>, then drag <b>Projection angle α</b> slowly from one end toward the other. After a half turn the depth axis shows $-\\mathrm{Im}\\,z_1$ instead of $\\mathrm{Im}\\,z_1$.',
      check: (s) => (s.alphaSweep as number) >= Math.PI,
    },
    {
      id: 'zoom',
      title: 'Every point of space',
      prompt: 'Zoom from the lattice of ordinary space down to a single hidden shape.',
      hint: 'Switch <b>View</b> to <b>Compactification</b> and press <b>Zoom in and out</b>.',
      check: (s) => s.zoomReached === true,
    },
  ],
  caveats: `<p><strong>Speculative physics.</strong> Calabi–Yau manifolds are established mathematics. That our universe has six hidden dimensions shaped like one is an unconfirmed idea from string theory. No experiment has seen extra dimensions, supersymmetric partners or strings.</p>
<p><strong>A slice of a projection.</strong> The surface is a real two-dimensional slice of a six-dimensional shape. It lives in four dimensions and is projected to three, which creates the apparent self-crossings. It is cut off before infinity, and it is drawn with the flat metric of $\\mathbb{C}^2$, not the Ricci-flat metric Yau's theorem guarantees. Nobody knows that metric in closed form.</p>
<p><strong>Simplified counting.</strong> The rule $N_{\\text{gen}} = |\\chi|/2$ holds only in the simplest heterotic construction. The Hodge numbers in the table come from the literature, and the scene checks each one against a Chern class computation or a known quotient. The landscape counts are rough estimates.</p>`,
  further: [
    { label: 'Candelas, Horowitz, Strominger, Witten, Vacuum configurations for superstrings (1985)', url: 'https://doi.org/10.1016/0550-3213(85)90602-9' },
    { label: 'Candelas, de la Ossa, Green, Parkes, A pair of Calabi–Yau manifolds (1991)', url: 'https://doi.org/10.1016/0550-3213(91)90292-6' },
    { label: 'Yau and Nadis, The Shape of Inner Space (book)', url: 'https://en.wikipedia.org/wiki/The_Shape_of_Inner_Space' },
    { label: 'Calabi–Yau manifold on Wikipedia', url: 'https://en.wikipedia.org/wiki/Calabi%E2%80%93Yau_manifold' },
  ],
};
