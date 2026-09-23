import type { TopicContent } from '../../core/types.ts';

export const content: TopicContent = {
  intuition: `
<p class="lead">String theory was once hoped to predict one universe, with every constant of nature fixed by pure mathematics. Instead it seems to allow an enormous number of possible universes. Each one has its own particles, its own forces and its own energy of empty space. Physicists call this collection the <strong>string landscape</strong>.</p>
<p>Picture a mountain range. Each valley is a possible <em>vacuum</em>, a stable state that empty space could settle into. The height of a valley floor is the energy of empty space in that universe. We measure that energy as the <strong>cosmological constant</strong> $\\Lambda$, the thing that makes the expansion of our universe speed up.</p>
<p>The scene shows a <strong>toy</strong> version with two fields instead of hundreds. The glowing green ball is our universe, resting in one valley. A valley is stable but not forever. Quantum mechanics lets the universe <strong>tunnel</strong> through a mountain into a lower valley. It does not happen everywhere at once. A tiny bubble of the new vacuum appears somewhere and then grows at nearly the speed of light. Press <b>Tunnel</b> and watch the inset.</p>
<p>Now the surprise. Our measured $\\Lambda$ is positive but absurdly small, about 120 orders of magnitude below the natural scale of gravity. Nobody knows a principle that makes it so small. The landscape offers an uncomfortable answer. If there are enough valleys, a few of them will have a tiny $\\Lambda$ just by chance. Switch to <b>Flux discretuum</b> to see how a handful of whole numbers can produce many finely spaced values.</p>
<p>Be clear about the status. Nobody has shown that the landscape exists in the form described here. The famous count of $10^{500}$ valleys is a rough estimate, not a measurement. Many physicists think the idea explains nothing, because it can be fitted to almost any observation. That argument is still open.</p>`,
  tryFirst: [
    'Press <b>Tunnel</b>. A bubble nucleates in the inset and its wall races toward the speed of light. Then the ball drops into the pink-ringed valley.',
    'Drag <b>Wall tension σ</b> up and watch the rate readout. Doubling σ multiplies the exponent B by 16.',
    'Change the <b>Random seed</b> or <b>Number of wells</b> to build a new landscape. Amber valleys have Λ above zero, cyan valleys below.',
    'Switch <b>View</b> to <b>Flux discretuum</b> and raise <b>Number of fluxes J</b> from 3 to 7. Watch green points pile up on the Λ = 0 shell.',
  ],
  equation: {
    tex: '\\Lambda \\;=\\; \\Lambda_0 \\;+\\; \\tfrac12 \\sum_{i=1}^{J} n_i^{2}\\, q_i^{2}',
    caption: 'The Bousso–Polchinski formula. A negative bare value plus a sum of flux energies. Each whole-number choice of the nᵢ is a different vacuum.',
    terms: [
      { tex: '\\Lambda', name: 'Cosmological constant', meaning: 'The energy of empty space in the chosen vacuum. Ours is tiny and positive. Click a point in the lattice to read its value.', param: 'lam' },
      { tex: '\\Lambda_0', name: 'Bare value', meaning: 'A large negative contribution from everything except the fluxes. In the toy it is fixed at $-2$.', param: 'lam0' },
      { tex: 'n_i', name: 'Flux integers', meaning: 'Whole numbers that count how many units of flux wrap each hidden cycle. Here each runs from $-2$ to $2$.', param: 'sel' },
      { tex: 'q_i', name: 'Charges', meaning: 'The energy step size for each flux. Unequal, incommensurate charges are what make the spacing of $\\Lambda$ fine.', param: 'q' },
      { tex: '\\sum_{i=1}^{J}', name: 'Sum over J fluxes', meaning: 'More fluxes give exponentially more vacua, $5^J$ here, and more of them land near zero.', param: 'J' },
    ],
  },
  physicsNotes: `
<h3>The tunnelling rate</h3>
<p>A universe in a higher valley is a <em>false vacuum</em>. It decays by forming a bubble of the lower vacuum. The rate per unit volume has the form</p>
$$\\Gamma \\approx A\\, e^{-B}, \\qquad B = \\frac{27\\pi^2 \\sigma^4}{2\\,\\varepsilon^3}.$$
<p>Here $\\sigma$ is the <strong>tension</strong> of the bubble wall, the energy cost per unit area of the wall, and $\\varepsilon$ is the <strong>energy density difference</strong> between the two vacua. This is Coleman's thin-wall result from 1977, with gravity switched off. Because $B$ sits in an exponent, small changes matter enormously. Double the tension and $B$ grows sixteen-fold. Double the drop and $B$ falls eight-fold. The prefactor $A$ is set to one toy unit in the scene.</p>
<h3>Where the formula comes from</h3>
<p>In imaginary time the bubble is a four-dimensional ball of radius $R$. Its interior gains $-\\tfrac12\\pi^2 R^4 \\varepsilon$ from the lower energy and its wall costs $2\\pi^2 R^3 \\sigma$, since $2\\pi^2 R^3$ is the area of a 3-sphere. So</p>
$$B(R) = -\\tfrac12 \\pi^2 \\varepsilon R^4 + 2\\pi^2 \\sigma R^3.$$
<p>Setting $dB/dR = 0$ gives the critical radius $R_0 = 3\\sigma/\\varepsilon$. Putting it back gives the formula above. Smaller bubbles collapse and larger ones grow.</p>
<h3>After nucleation</h3>
<p>Continuing back to real time, the wall follows $r^2 - t^2 = R_0^2$ in units with $c = 1$. It starts at rest and its speed $t/\\sqrt{R_0^2 + t^2}$ approaches the speed of light. An observer outside gets essentially no warning. The inset shows this curve.</p>
<h3>The toy landscape</h3>
<p>The terrain is $V(\\varphi_1, \\varphi_2) = V_0 + b(\\varphi_1^2 + \\varphi_2^2) - \\sum_k A_k\\, e^{-|\\varphi - c_k|^2/2s_k^2}$, a gentle bowl with random Gaussian wells. The code finds every local minimum with gradient descent and Newton steps, and keeps only points where the gradient vanishes and the curvature is positive in every direction. The drop $\\varepsilon$ is taken as the height difference to the nearest lower valley, times the energy scale slider. None of these numbers come from string theory.</p>`,
  deep: [
    {
      title: 'Why fluxes make a discretuum',
      html: `<p>In string theory the hidden six dimensions can carry <strong>fluxes</strong>, generalisations of magnetic field lines that thread closed cycles of the hidden space. Like magnetic flux through a superconducting ring, each flux is quantised, so it is a whole number $n_i$ times a basic unit. Each flux adds energy proportional to $n_i^2$. Bousso and Polchinski (2000) turned this into the formula above.</p>
<p>Think of the $n_i$ as a point on a $J$-dimensional grid. The condition $\\Lambda = 0$ is $\\sum_i n_i^2 q_i^2 = 2|\\Lambda_0|$, the surface of an ellipsoid. Vacua with small $|\\Lambda|$ are grid points lying in a thin shell around that surface. That is the green shell in the scene. The number of grid points in the shell grows roughly like the shell's area, which grows as $r^{J-1}$. With a single flux the values of $\\Lambda$ are coarse and none may land near zero. With many fluxes and unequal charges, the values crowd together.</p>
<p>Bousso and Polchinski estimated that of order a hundred fluxes with modest charges could give a spacing finer than the observed $\\Lambda$, even when $|\\Lambda_0|$ is of Planck size. The scene uses at most seven fluxes, each from $-2$ to $2$, so it shows the trend, not the real numbers.</p>
<p>Fluxes can also change. A charged membrane can nucleate as a bubble and lower one $n_i$ by one unit. This is the same bubble physics as in the landscape view. It was first studied by Brown and Teitelboim in 1987 and 1988.</p>`,
    },
    {
      title: 'From toy to string theory: KKLT and the count of vacua',
      html: `<p>Real string compactifications have hundreds of <strong>moduli</strong>, fields that set the size and shape of the hidden space. If they stay massless they would show up as new long-range forces, which are not seen. Fluxes give many of them a potential. In 2003 Kachru, Kallosh, Linde and Trivedi (KKLT) proposed a recipe that fixes all of them in type IIB string theory. Fluxes fix the shape moduli. Quantum effects on branes fix the overall size. This gives a vacuum with negative energy. Adding anti-D3-branes then lifts the energy to a small positive value, a de Sitter vacuum like ours.</p>
<p>Counting the possible flux choices led to the famous figure. With a few hundred cycles and each flux taking roughly ten values, the count comes to about $10^{500}$. This is a commonly quoted estimate, not a measurement. Other constructions give very different numbers. For one F-theory geometry, Taylor and Wang (2015) estimated about $10^{272{,}000}$ flux vacua.</p>
<p>No one has written down a single fully controlled example of such a vacuum that matches our world in every detail. Each step of KKLT, especially the anti-brane uplift, has been questioned and defended in a long debate.</p>`,
    },
    {
      title: 'Weinberg, anthropics and eternal inflation',
      html: `<p>In 1987 Steven Weinberg asked a simple question. If $\\Lambda$ could take many values, which values allow observers? A large positive $\\Lambda$ makes space expand so fast that matter never clumps into galaxies. He found that $\\Lambda$ could not be much larger than the density of matter at the time galaxies formed. That predicted a small but non-zero value. In 1998 two supernova teams found that the expansion of the universe is speeding up, consistent with a positive $\\Lambda$ of roughly the size his argument allowed.</p>
<p>The landscape supplies the many values his argument needs. It also needs a way to <em>realise</em> them. <strong>Eternal inflation</strong>, studied by Vilenkin (1983) and Linde (1986), does this. In a false vacuum with positive energy, space expands faster than bubbles can eat it. Bubbles of other vacua keep forming forever, each a separate universe with its own constants. Leonard Susskind's 2003 paper <em>The Anthropic Landscape of String Theory</em> made this combined picture widely known.</p>
<p>A hard open problem is the <strong>measure problem</strong>. In an infinite, eternally inflating spacetime every allowed outcome happens infinitely often, so it is unclear how to compute the probability of anything. Different reasonable rules give different answers.</p>`,
    },
    {
      title: 'The swampland: a counterpoint',
      html: `<p>In 2005 Cumrun Vafa proposed a different way to look at the problem. Many effective theories that look consistent at low energy might not come from any theory of quantum gravity. He called these the <strong>swampland</strong>, as opposed to the landscape of theories that do. The program looks for general rules. One example is the weak gravity conjecture, which says gravity must be the weakest force for some charged particle.</p>
<p>In 2018 Obied, Ooguri, Spodyneiko and Vafa conjectured that stable de Sitter vacua might not exist in string theory at all. If that is right, then KKLT-type vacua fail, and the positive $\\Lambda$ we see must instead be slowly changing dark energy. The conjecture is disputed and has been revised. It shows that even the existence of the landscape's most important valleys is not settled.</p>`,
    },
    {
      title: 'Honest status and edge cases of the formula',
      html: `<p><strong>What is solid.</strong> Vacuum decay by bubble nucleation is well-established quantum field theory. Coleman's formula is exact in the thin-wall limit, where $\\varepsilon$ is small compared with the barrier height. Flux quantisation in string theory is also well understood.</p>
<p><strong>Where gravity matters.</strong> Coleman and De Luccia (1980) added gravity. It changes $B$ and can forbid some decays completely. For example, decay from flat space into a vacuum with negative energy is blocked when the wall tension is large enough compared with $\\varepsilon$. The scene ignores gravity.</p>
<p><strong>What is speculative.</strong> Whether string theory really has vast numbers of long-lived de Sitter vacua, how to assign probabilities across them, and whether anthropic reasoning explains anything are all contested. No agreed testable prediction has come from the landscape. Possible hints, such as signs of an ancient bubble collision in the cosmic microwave background, have been searched for and not found.</p>`,
    },
  ],
  challenges: [
    {
      id: 'tunnel',
      title: 'Fall to a lower vacuum',
      prompt: 'Make the universe tunnel into a lower valley.',
      hint: 'Press Tunnel in the Toy landscape section and wait for the bubble to grow.',
      check: (s) => (s.tunnels as number) >= 1,
    },
    {
      id: 'slow',
      title: 'An effectively eternal false vacuum',
      prompt: 'Raise the wall tension until the tunnelling rate $\\Gamma$ falls below $10^{-50}$ toy units.',
      hint: 'B grows as $\\sigma^4$. Push Wall tension σ toward 1 and read the rate. A smaller energy difference helps too.',
      check: (s) => (s.sigma as number) > 0.5 && (s.logRate as number) <= -50,
    },
    {
      id: 'fine',
      title: 'Find a nearly flat universe',
      prompt: 'In the flux view, select a vacuum with $|\\Lambda| < 0.01$.',
      hint: 'You need enough fluxes for any vacuum to reach the shell. Raise J to 6 or 7, then click bright green points and read the selected Λ.',
      check: (s) => (s.absLam as number) < 0.01,
    },
    {
      id: 'grow',
      title: 'More fluxes, more near-zero vacua',
      prompt: 'Raise the number of fluxes until more than 5% of all vacua have $|\\Lambda| < 0.1$.',
      hint: 'Keep the charge scale near 0.45 and step J upward. Watch the share readout and the green band in the histogram.',
      check: (s) => (s.J as number) >= 5 && (s.frac as number) > 0.05,
    },
  ],
  caveats: `<p>Both views are <strong>toy models</strong> in made-up units. The landscape has two fields, while real compactifications have hundreds of moduli. Its valleys are random Gaussians chosen to look like a landscape, not solutions of string theory. The tunnelling rate uses the flat-space thin-wall formula with the prefactor set to one, and ignores gravity. The Tunnel button skips the wait, which the formula says is about $e^{B}$ toy time units.</p>
<p>The flux view uses at most seven fluxes with values from $-2$ to $2$. Real models would need of order a hundred or more. With more than three fluxes, each point sits at its true flux radius, so the Λ = 0 shell is exact, but its direction on screen is only a projection. The value $\\Lambda_0 = -2$ is arbitrary. The number $10^{500}$ is a commonly quoted rough estimate, not a result of this toy or of any measurement.</p>`,
  further: [
    { label: 'Bousso and Polchinski, Quantization of four-form fluxes (2000)', url: 'https://arxiv.org/abs/hep-th/0004134' },
    { label: 'Kachru, Kallosh, Linde and Trivedi, de Sitter vacua in string theory (2003)', url: 'https://arxiv.org/abs/hep-th/0301240' },
    { label: 'Weinberg, Anthropic bound on the cosmological constant (1987)', url: 'https://doi.org/10.1103/PhysRevLett.59.2607' },
    { label: 'String theory landscape on Wikipedia', url: 'https://en.wikipedia.org/wiki/String_theory_landscape' },
  ],
};
