import type { TopicContent } from '../../core/types.ts';

export const content: TopicContent = {
  intuition: `
<p class="lead">A ball in a bowl rolls back and forth. Shrink the ball to the size of an atom and two strange things happen. It can only hold certain energies, evenly spaced like the rungs of a ladder. And it can never sit perfectly still at the bottom.</p>
<p>Almost everything in nature behaves like this near its resting point. Pull an atom in a molecule, a string, or a crystal a little away from where it wants to be, and it feels a push back that grows with the distance. That is a spring. Its energy curve is a parabola, the bowl drawn in the scene. So the quantum oscillator is not one special system. It is the first approximation to nearly every stable system there is.</p>
<p>The rungs on the back wall are the only energies the particle may have: $\\tfrac12$, $1\\tfrac12$, $2\\tfrac12$ and so on, in units of $\\hbar\\omega$. The lowest rung does not sit on the floor of the bowl. That gap is the <strong>zero-point energy</strong>. A particle that sat exactly at the bottom, exactly at rest, would have a sharp position and a sharp momentum at once. The uncertainty principle forbids that, so some jiggle always remains.</p>
<p>The glowing spiral is the wave $\\psi(x,t)$. Its radius is the size of the wave and its colour is the phase. The cyan curve on the back wall is $|\\psi|^2$, where you are likely to find the particle. The amber ball is an ordinary classical particle for comparison.</p>
<p>Watch what moves. A single rung, an <em>eigenstate</em>, only spins its colour. Its $|\\psi|^2$ never changes at all. To make the particle actually swing you have to mix rungs. The best mix, a <strong>coherent state</strong>, swings exactly like the classical ball and never spreads out. It is how laser light behaves.</p>`,
  tryFirst: [
    'The scene opens on a coherent state. Watch the green dot $\\langle x\\rangle$ ride along with the amber ball, and the $\\Delta x$ trace in the corner stay flat.',
    'Switch <b>State</b> to <b>Eigenstate n</b>. The spiral keeps spinning its colours, but the cyan $|\\psi|^2$ freezes. Count the gaps where it touches zero. There are exactly $n$.',
    'Push <b>Level n</b> up to 25. The cyan curve starts to hug the amber classical curve, which peaks at the turning points where a real ball slows down.',
    'Set <b>View</b> to <b>Wigner phase space</b>. Every state turns rigidly, clockwise, once per period. Try <b>n = 1</b> and look for the rose dip below zero.',
  ],
  equation: {
    tex: 'E_n = \\hbar\\omega\\left(n + {\\color{#f5b642}\\tfrac{1}{2}}\\right)',
    caption: 'The energy levels of a quantum oscillator are evenly spaced by $\\hbar\\omega$. The highlighted $\\tfrac12$ is the zero-point energy: even the lowest level is not zero.',
    terms: [
      { tex: 'E_n', name: 'Energy of level n', meaning: 'The only energies the oscillator can have. For a superposition the readout shows the average $\\langle E\\rangle = \\sum_n |c_n|^2 E_n$.', param: 'E' },
      { tex: 'n', name: 'Quantum number', meaning: 'Counts the rungs, $n = 0, 1, 2, \\dots$ It also counts the nodes, the places where $\\psi_n$ is zero. Check the nodes readout.', param: 'n' },
      { tex: '\\tfrac12', name: 'Zero-point energy', meaning: 'Energy is $\\tfrac12(\\Delta x^2 + \\Delta p^2)$ plus the energy of the mean motion. That is at least $\\Delta x\\,\\Delta p$, and uncertainty makes $\\Delta x\\,\\Delta p \\ge \\tfrac12$. So $E \\ge \\tfrac12$.', param: 'dxdp' },
      { tex: '\\hbar\\omega', name: 'Energy quantum', meaning: 'The rung spacing. It is Planck\'s reduced constant times the classical angular frequency. The scene uses units where $\\hbar\\omega = 1$.' },
      { tex: '\\omega', name: 'Angular frequency', meaning: 'Sets the tick of the clock. The Wigner surface turns once every $2\\pi/\\omega$, the same period as the classical ball.', param: 'view' },
    ],
  },
  physicsNotes: `
<h3>The equation</h3>
<p>The potential is $V(x) = \\tfrac12 m\\omega^2 x^2$. In units with $\\hbar = m = \\omega = 1$ the Schrödinger equation reads</p>
$$i\\,\\partial_t \\psi = -\\tfrac12 \\partial_x^2 \\psi + \\tfrac12 x^2 \\psi .$$
<p>Its stationary solutions are the Hermite functions $\\psi_n(x) = (2^n n! \\sqrt{\\pi})^{-1/2} H_n(x)\\, e^{-x^2/2}$, with energies $E_n = n + \\tfrac12$. The scene never evaluates $H_n$ directly, because the polynomials grow huge. It uses the stable recurrence</p>
$$\\psi_{n+1} = \\sqrt{\\tfrac{2}{n+1}}\\, x\\, \\psi_n - \\sqrt{\\tfrac{n}{n+1}}\\, \\psi_{n-1},$$
<p>starting from $\\psi_0 = \\pi^{-1/4} e^{-x^2/2}$.</p>
<h3>Time evolution is exact</h3>
<p>Any state is a sum $\\psi = \\sum_n c_n \\psi_n$. Each term just turns its phase at its own rate, $c_n(t) = c_n\\, e^{-iE_n t}$. No step-by-step integration is needed, so there is no numerical drift. The norm readout is a grid integral of the rebuilt $|\\psi|^2$. It stays at 1 because the $\\psi_n$ are orthonormal on the grid to about $10^{-15}$.</p>
<p>Because all spacings are whole multiples of $\\omega$, every state repeats its $|\\psi|^2$ after one classical period $2\\pi/\\omega$. Only an overall phase differs. That is special to this potential.</p>
<h3>States on the menu</h3>
<ul>
<li><b>Eigenstate n</b>: one rung. $|\\psi_n|^2$ is frozen in time. It has $n$ nodes.</li>
<li><b>Two levels</b>: $(\\psi_n + \\psi_m)/\\sqrt2$. The density sloshes at the beat frequency $|n-m|\\,\\omega$.</li>
<li><b>Coherent $\\alpha$</b>: $c_n = e^{-|\\alpha|^2/2}\\alpha^n/\\sqrt{n!}$, so $|c_n|^2$ is a Poisson distribution with mean $|\\alpha|^2$. The packet is the ground state shifted to $\\langle x\\rangle = \\sqrt2|\\alpha|\\cos(t - \\arg\\alpha)$. Its width stays $\\Delta x = 1/\\sqrt2$ forever.</li>
<li><b>Squeezed r</b>: a Gaussian narrower in $x$ by $e^{-r}$ and wider in $p$ by $e^{r}$. Its width breathes at $2\\omega$: $\\Delta x^2 = \\tfrac12(e^{-2r}\\cos^2 t + e^{2r}\\sin^2 t)$. The amplitude and phase sliders also shift it.</li>
</ul>
<h3>Ladder operators</h3>
<p>Define $a = (x + ip)/\\sqrt2$ and its partner $a^\\dagger = (x - ip)/\\sqrt2$. Then $H = a^\\dagger a + \\tfrac12$, $a^\\dagger$ climbs one rung, and $a$ steps one rung down: $a\\,\\psi_n = \\sqrt n\\,\\psi_{n-1}$. The readouts $\\langle x\\rangle$, $\\langle p\\rangle$ and $\\Delta x\\,\\Delta p$ are computed this way, straight from the $c_n$.</p>`,
  deep: [
    {
      title: 'Why the ladder has a bottom rung',
      html: `<p>The algebra alone finds the whole spectrum. From $[x, p] = i$ you get $[a, a^\\dagger] = 1$. Then if $\\psi$ has energy $E$, the state $a\\psi$ has energy $E - 1$, and $a^\\dagger\\psi$ has energy $E + 1$. The operators are a ladder.</p>
<p>The ladder cannot go down forever, because $\\langle H\\rangle = \\langle a^\\dagger a\\rangle + \\tfrac12 = \\|a\\psi\\|^2 + \\tfrac12 \\ge \\tfrac12$. So there must be a lowest state with $a\\psi_0 = 0$. Written out, that is the first-order equation $(x + \\partial_x)\\psi_0 = 0$, whose solution is the Gaussian $e^{-x^2/2}$. Its energy is exactly $\\tfrac12$. Every other rung is $a^\\dagger$ applied again and again.</p>
<p>Intuitively, $a$ removes one quantum of vibration and $a^\\dagger$ adds one. In quantum field theory the same two operators remove and add one particle.</p>
<p>Why almost everything is an oscillator: expand any smooth potential around a minimum, $V(x) \\approx V(x_0) + \\tfrac12 V''(x_0)(x - x_0)^2 + \\dots$ The first-order term vanishes at a minimum. So small motions near any stable point obey this model, with $\\omega = \\sqrt{V''/m}$. The higher terms, called anharmonic, make the rung spacing uneven. For a chemical bond the rungs crowd together at high energy.</p>`,
    },
    {
      title: 'Zero-point energy: what is real and what is not',
      html: `<p>The ground state energy $\\tfrac12\\hbar\\omega$ has measurable effects. Helium is the clearest case. At ordinary pressure it stays liquid all the way down to absolute zero, and needs about 25 atmospheres to freeze. The atoms are light and attract each other only weakly, so their zero-point motion is large enough to shake apart a crystal. Heavier noble gases, with less zero-point motion and stronger attraction, all freeze.</p>
<p>Isotopes show it too. A C–D bond sits lower in its well than a C–H bond, because the heavier deuterium has a smaller $\\tfrac12\\hbar\\omega$. That shift changes reaction rates in a measurable way, the kinetic isotope effect.</p>
<p>The <b>Casimir effect</b> is often cited as well. Two uncharged metal plates very close together attract, and the textbook explanation counts the zero-point energies of the light modes between them. Steve Lamoreaux measured the force in 1997 and found agreement with theory within about 5 percent. Be careful with the story, though. The same force can also be derived as a van der Waals attraction between the charges in the plates, without mentioning vacuum energy.</p>
<p>What is <em>not</em> established is that the vacuum's zero-point energy can be tapped for useful work, or how it relates to the dark energy of cosmology. Naive sums over all field modes give a vacuum energy vastly larger than the observed value. That mismatch, the cosmological constant problem, is unsolved.</p>`,
    },
    {
      title: 'Photons, lasers and coherent states',
      html: `<p>Each mode of the electromagnetic field, one frequency and one direction, obeys the same equations as a mass on a spring. The electric and magnetic fields play the roles of $x$ and $p$. Quantise it and the rungs become <b>photons</b>: a mode on rung $n$ holds $n$ photons of energy $\\hbar\\omega$. Rung zero, the vacuum, still carries field fluctuations.</p>
<p>Erwin Schrödinger found the non-spreading packet in 1926, as a bridge to classical motion. Roy Glauber showed in 1963 that these <b>coherent states</b> describe the light of an ideal laser, and built the quantum theory of optical coherence around them. He shared the 2005 Nobel Prize in Physics for that work. The photon count of a coherent state follows a Poisson distribution, which is exactly the histogram next to the rungs in the scene.</p>
<p><b>Squeezed</b> light trades noise between the two field quadratures, just as the squeezed state here trades $\\Delta x$ for $\\Delta p$. The LIGO and Virgo gravitational-wave detectors have injected squeezed vacuum into their interferometers since 2019 to lower their quantum noise.</p>`,
    },
    {
      title: 'Phase space and the Wigner function',
      html: `<p>A classical oscillator traces a circle in the $(x, p)$ plane at angular speed $\\omega$. Quantum mechanics has an exact copy of that picture. The Wigner function</p>
$$W(x,p) = \\frac{1}{\\pi\\hbar}\\int \\psi^*(x+y)\\,\\psi(x-y)\\, e^{2ipy/\\hbar}\\, dy$$
<p>obeys the classical Liouville equation for any quadratic potential. For the oscillator that means $W$ simply <b>rotates rigidly</b> in phase space. The scene uses this directly. It computes $W$ once and then turns the surface.</p>
<p>A coherent state is a round Gaussian bump riding the classical circle. A squeezed state is an ellipse, so its shadow on the $x$ axis grows and shrinks twice per turn. A Fock state $|n\\rangle$ is a set of rings,</p>
$$W_n(x,p) = \\frac{(-1)^n}{\\pi}\\, e^{-(x^2+p^2)}\\, L_n\\big(2(x^2+p^2)\\big),$$
<p>so rotating it changes nothing. That is the phase-space version of "eigenstates do not move". At the origin $W_n = (-1)^n/\\pi$, negative for every odd $n$. No true probability can be negative. By Hudson's theorem (1974), a pure state has a Wigner function that is nowhere negative only if it is a Gaussian.</p>`,
    },
    {
      title: 'The correspondence principle, and molecular vibrations',
      html: `<p>A classical ball spends most of its time near the turning points, where it moves slowly. The chance of finding it near $x$ is proportional to $1/|v|$, which gives</p>
$$P_{\\text{cl}}(x) = \\frac{1}{\\pi\\sqrt{A^2 - x^2}}, \\qquad A = \\sqrt{2E}.$$
<p>For large $n$, $|\\psi_n|^2$ oscillates rapidly under this curve. Averaged over a few wiggles it matches. The match readout compares the two in eight bins. It climbs from about 65% at $n = 0$ to about 94% at $n = 20$. What never disappears is the leak past the turning points, where the classical particle cannot go. It shrinks relative to the width of the well as $n$ grows.</p>
<p>Molecules show the ladder directly. Carbon monoxide absorbs infrared light at 2143 cm⁻¹, its jump from rung 0 to rung 1. The jump from 0 to 2 sits at 4260 cm⁻¹, a little less than double. The rungs close up because a real bond is not a perfect spring. It can break.</p>`,
    },
  ],
  challenges: [
    {
      id: 'frozen',
      title: 'Nothing moves',
      prompt: 'Pick any eigenstate and let it run for a full period. Show that its $|\\psi|^2$ has not changed at all while the spiral keeps turning.',
      hint: 'Set State to Eigenstate n, any n. Watch the periods readout pass 1.',
      check: (s) => s.touched === true && s.kind === 'eigen' && (s.periods as number) >= 1 && (s.drift as number) < 1e-9,
    },
    {
      id: 'no-spread',
      title: 'The packet that never spreads',
      prompt: 'Run a coherent state with $|\\alpha| \\ge 1.5$ for 5 full periods and keep $\\Delta x$ constant, to better than $10^{-6}$.',
      hint: 'Choose Coherent α, set the amplitude, and raise Speed to get there sooner. Changing a state slider restarts the count.',
      check: (s) => s.touched === true && s.kind === 'coherent' && (s.alpha as number) >= 1.5 && (s.periods as number) >= 5 && (s.dxSpread as number) < 1e-6,
    },
    {
      id: 'negative',
      title: 'Less than zero',
      prompt: 'Find a state whose Wigner function dips below $-0.01$ somewhere, and look at it in the phase-space view.',
      hint: 'Coherent and squeezed states are Gaussians, and those never go negative. Try an eigenstate with odd n.',
      check: (s) => s.touched === true && s.view === 'wigner' && (s.wmin as number) < -0.01,
    },
    {
      id: 'correspond',
      title: 'Becoming classical',
      prompt: 'Show an eigenstate with $n \\ge 20$ next to the classical density, so that the coarse-grained match passes 93%.',
      hint: 'Eigenstate n, slide n to 20 or more, and keep Show classical particle on.',
      check: (s) => s.touched === true && s.kind === 'eigen' && (s.n as number) >= 20 && s.showClassical === true && (s.match as number) > 0.93,
    },
  ],
  caveats: `<p>The potential here is a perfect parabola in one dimension. Real bonds and traps are only parabolic near the bottom. Higher up they soften, the rungs crowd together, and a molecule can dissociate.</p>
<p>Nothing in the model is damped or measured. A real oscillator exchanges energy with its surroundings. That drains coherence, and turns clean superpositions into mixtures.</p>
<p>The basis is cut off at $n = 80$ and the grid spans $-12 < x < 12$. The squeezed state is projected onto that basis numerically and loses less than one part in $10^4$ of its norm, which is then renormalised. Everything else is exact up to rounding.</p>
<p>The classical ball in the ladder view has the same energy as the quantum state, or for Gaussian states the same orbit. For an eigenstate its phase is arbitrary, because an eigenstate has no phase to match.</p>`,
  further: [
    { label: 'Quantum harmonic oscillator on Wikipedia', url: 'https://en.wikipedia.org/wiki/Quantum_harmonic_oscillator' },
    { label: 'Glauber, Coherent and Incoherent States of the Radiation Field (1963)', url: 'https://doi.org/10.1103/PhysRev.131.2766' },
    { label: 'The Nobel Prize in Physics 2005', url: 'https://www.nobelprize.org/prizes/physics/2005/summary/' },
    { label: 'Wigner quasiprobability distribution on Wikipedia', url: 'https://en.wikipedia.org/wiki/Wigner_quasiprobability_distribution' },
  ],
};
