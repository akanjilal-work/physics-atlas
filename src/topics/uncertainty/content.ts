import type { TopicContent } from '../../core/types.ts';

export const content: TopicContent = {
  intuition: `
<p class="lead">Try to pin a wave to one spot and it stops being a wave with one wavelength. Try to give it one clean wavelength and it spreads out everywhere. You cannot have both. That trade is the uncertainty principle.</p>
<p>In quantum mechanics a particle's momentum is set by its wavelength. A short wavelength means a large momentum. So a particle that sits in one small place has to be made of many wavelengths at once, and its momentum is blurred. A particle with a sharp momentum has to be spread out in space.</p>
<p>The scene shows the same particle twice. On the left is its wave in <strong>position space</strong>, $\\psi(x)$. On the right is the same wave written as a mix of wavelengths, its <strong>momentum space</strong> wave $\\phi(p)$. The two are linked by a Fourier transform. Each is drawn as a spiral. Its fatness is the size of the wave and its colour is the phase. The glow on the floor shows where you might find the particle, or which momentum you might measure.</p>
<p>The brackets on the floor measure the spread of each glow: $\\Delta x$ on the left, $\\Delta p$ on the right. Squeeze the packet with the width slider and watch the left bracket shrink while the right one grows. The gauge in the corner multiplies the two. It never drops below one unit of $\\hbar/2$. A smooth bell curve, a Gaussian, sits exactly on that floor. Every other shape sits above it.</p>
<p>This is not about clumsy measurements. Nobody is poking the particle. It is a plain fact about waves, and the same maths tells a sound engineer that a very short click cannot have a pure pitch.</p>`,
  tryFirst: [
    'Drag <b>width σ</b> from 1 down to 0.5. The left bracket halves, the right bracket doubles, and the gauge does not move.',
    'Switch <b>packet</b> to <b>Square</b>. Its sharp edges need many extra wavelengths, and the gauge jumps to about 1.85.',
    'Choose <b>Build from waves</b> and slide <b>plane waves N</b> from 1 up to 30. A few waves give a repeating comb. Many waves give one lump.',
    'Set <b>view</b> to <b>Phase space</b> and the packet to <b>Cat</b>. The Wigner function dips below zero between the two lumps.',
  ],
  equation: {
    tex: '\\Delta x\\,\\Delta p \\ge \\frac{\\hbar}{2}',
    caption: 'The spread in position times the spread in momentum can never be smaller than half the reduced Planck constant.',
    terms: [
      { tex: '\\Delta x', name: 'Position spread', meaning: 'The standard deviation of $|\\psi(x)|^2$. The left bracket spans $\\langle x\\rangle \\pm \\Delta x$.', param: 'dx' },
      { tex: '\\Delta p', name: 'Momentum spread', meaning: 'The standard deviation of $|\\phi(p)|^2$, found by a live Fourier transform of $\\psi$. The right bracket spans $\\langle p\\rangle \\pm \\Delta p$.', param: 'dp' },
      { tex: '\\ge', name: 'The bound', meaning: 'The gauge shows $\\Delta x\\,\\Delta p$ divided by $\\hbar/2$. It can reach 1 but never go below it.', param: 'ratio' },
      { tex: '\\hbar', name: 'Reduced Planck constant', meaning: 'About $1.055\\times10^{-34}$ J s. The scene uses units where $\\hbar = m = 1$, so momentum equals wave number.' },
      { tex: '\\sigma', name: 'Packet width', meaning: 'Not in the inequality itself, but it is the knob that trades one spread for the other.', param: 'sigma' },
    ],
  },
  physicsNotes: `
<h3>Two views of one wave</h3>
<p>A wave packet is a sum of plane waves $e^{ipx/\\hbar}$, each with its own amplitude $\\phi(p)$:</p>
$$\\psi(x) = \\frac{1}{\\sqrt{2\\pi\\hbar}}\\int \\phi(p)\\, e^{ipx/\\hbar}\\, dp .$$
<p>So $\\phi$ is the Fourier transform of $\\psi$. The spreads are ordinary standard deviations, $\\Delta x^2 = \\langle x^2\\rangle - \\langle x\\rangle^2$ with weights $|\\psi|^2$, and the same for $p$ with weights $|\\phi|^2$.</p>
<h3>Why there is a floor</h3>
<p>Kennard's proof takes two lines. Position and momentum do not commute: $[\\hat x, \\hat p] = i\\hbar$. The Cauchy–Schwarz inequality then gives $\\Delta x\\,\\Delta p \\ge \\tfrac12 |\\langle [\\hat x,\\hat p]\\rangle| = \\hbar/2$. Equality needs $(\\hat x - \\langle x\\rangle)\\psi$ to be an imaginary multiple of $(\\hat p - \\langle p\\rangle)\\psi$. The only solutions are Gaussians $e^{-(x-x_0)^2/4\\sigma^2 + ip_0x/\\hbar}$, with $\\Delta x = \\sigma$ and $\\Delta p = \\hbar/2\\sigma$.</p>
<h3>Free flight and chirp</h3>
<p>A free particle's momentum wave only changes phase: $\\phi(p,t) = \\phi(p,0)\\,e^{-ip^2t/2m\\hbar}$. So $|\\phi|^2$, and with it $\\Delta p$, never changes. The position spread grows as</p>
$$\\Delta x^2(t) = \\Delta x_0^2 + 2t\\,C/m + t^2\\Delta p^2/m^2 ,$$
<p>where $C$ is the position–momentum covariance. For a Gaussian with no chirp this gives $\\sigma\\sqrt{1 + (\\hbar t/2m\\sigma^2)^2}$. A <b>chirp</b> multiplies $\\psi$ by $e^{icx^2/2}$, so the local wave number grows along the packet. Positive chirp is what free flight produces on its own, fast parts in front. Negative chirp puts the fast parts behind, so the packet first focuses and then spreads.</p>
<h3>How the scene computes it</h3>
<p>The wave lives on 4096 points over a box of length 256. One fast Fourier transform gives $\\phi$. Free evolution is done exactly in momentum space, then transformed back. The $\\Delta p$ readout comes from a fresh transform of the evolved $\\psi$ on every frame, so its constancy is a real check, not a copy. The norm readout confirms both $\\int|\\psi|^2dx$ and $\\int|\\phi|^2dp$ equal 1. The Wigner surface uses exact formulas for the Gaussian and the two-lump cat state.</p>`,
  deep: [
    {
      title: 'Heisenberg, Kennard, and what was actually proved',
      html: `<p>Werner Heisenberg published the idea in 1927 in <em>Zeitschrift für Physik</em>. His argument was a thought experiment, the gamma-ray microscope. Light that is short enough to locate an electron sharply also kicks it hard. He wrote an approximate relation of order $h$, not a precise inequality.</p>
<p>Later that year Earle Kennard proved the exact statement $\\Delta x\\,\\Delta p \\ge \\hbar/2$ with standard deviations, and showed that Gaussians reach it. Hermann Weyl gave a proof in his 1928 book and credited the idea to Wolfgang Pauli. The microscope story is still told, but it is a heuristic. The inequality is a theorem about the state itself, whatever you do or do not measure.</p>`,
    },
    {
      title: 'A property of waves, not of clumsy detectors',
      html: `<p>Nothing in the proof mentions a measuring device. Any wave obeys the same bound between its extent and its spread of frequencies. For a sound pulse with rms duration $\\Delta t$ and rms spread of frequencies $\\Delta f$ (in hertz),</p>
$$\\Delta t\\,\\Delta f \\ge \\frac{1}{4\\pi}.$$
<p>Dennis Gabor spelled this out for signals in 1946. A drum hit has no clear pitch. A long steady note does. Radar, music software and MRI all live with this limit. Quantum mechanics adds only one step: de Broglie's $p = \\hbar k$ turns wave number into momentum, so the wave limit becomes a limit on the particle.</p>
<p>Measurement disturbance is a real and separate topic. Ozawa (2003) showed that Heisenberg's original error–disturbance form can be violated, and experiments with neutron spins confirmed his corrected relation in 2012. The preparation inequality shown here was never in question.</p>`,
    },
    {
      title: 'Robertson, Schrödinger, and phase space',
      html: `<p>Howard Robertson generalised the bound in 1929 to any two observables:</p>
$$\\Delta A\\,\\Delta B \\ge \\tfrac12\\left|\\langle[\\hat A,\\hat B]\\rangle\\right| .$$
<p>For spin components this gives $\\Delta S_x\\,\\Delta S_y \\ge \\tfrac{\\hbar}{2}|\\langle S_z\\rangle|$. Schrödinger strengthened it in 1930 by adding the covariance: $\\Delta x^2\\Delta p^2 - C^2 \\ge \\hbar^2/4$. That explains the chirp slider. A chirped Gaussian has $\\Delta x\\,\\Delta p$ above $\\hbar/2$, yet it still saturates Schrödinger's form. It is a minimum state tilted in phase space.</p>
<p>The <b>Phase space</b> view shows the Wigner function $W(x,p)$ (Wigner, 1932). Integrate it over $p$ and you get $|\\psi(x)|^2$. Integrate over $x$ and you get $|\\phi(p)|^2$. The walls of that view show these two shadows. For a Gaussian it is a positive bump, a tilted ellipse when chirped. For a superposition of two lumps, a cat state, it has ripples that go negative. So it is not a true probability. Hudson's theorem (1974) says a pure state has $W \\ge 0$ everywhere only if it is Gaussian.</p>`,
    },
    {
      title: 'Energy and time: a subtler relation',
      html: `<p>People often write $\\Delta E\\,\\Delta t \\ge \\hbar/2$. It is not the same kind of statement. Time is a parameter in quantum mechanics, not an observable. Pauli argued that no self-adjoint time operator can exist for a Hamiltonian with a lowest energy, so Robertson's recipe does not apply directly.</p>
<p>There are honest versions. Mandelstam and Tamm (1945) showed that if $\\tau$ is the time for some observable's average to shift by one standard deviation, then $\\Delta E\\,\\tau \\ge \\hbar/2$. For an unstable state, the natural linewidth $\\Gamma$ and the mean lifetime $\\tau$ obey $\\Gamma\\tau = \\hbar$ for an exponential decay. The popular idea that energy can be "borrowed" for a short time is a loose picture, not a theorem.</p>`,
    },
    {
      title: 'Zero-point energy and squeezed light at LIGO',
      html: `<p>A particle in a harmonic trap has energy $\\langle p^2\\rangle/2m + m\\omega^2\\langle x^2\\rangle/2$. Making it still and centred would need $\\Delta x = \\Delta p = 0$. The bound forbids that. Minimising the energy subject to $\\Delta x\\,\\Delta p \\ge \\hbar/2$ gives exactly $\\tfrac12\\hbar\\omega$, the true ground-state energy. This zero-point motion is why helium stays liquid at normal pressure down to absolute zero.</p>
<p>Light has the same structure. Its two field quadratures play the roles of $x$ and $p$. Vacuum fluctuations in the laser light set a noise floor for gravitational-wave detectors. The bound fixes only the product, so you can <strong>squeeze</strong> one quadrature below the vacuum level while the other grows. That is the $\\sigma$ slider, applied to light. GEO 600 first used squeezed light in an observatory. Since the O3 run in 2019 both Advanced LIGO detectors inject squeezed vacuum, which cut shot noise by up to about 3 dB. For O4 they added frequency-dependent squeezing, so the extra noise lands where it hurts least.</p>`,
    },
  ],
  challenges: [
    {
      id: 'floor',
      title: 'Touch the floor',
      prompt: 'Get $\\Delta x\\,\\Delta p$ within 1% of $\\hbar/2$ (gauge at 1.01 or less).',
      hint: 'Use the Gaussian with zero chirp, then press Pause and Rewind to t = 0. Or add a negative chirp and pause at the moment the packet is narrowest.',
      check: (s) => s.touched === true && (s.ratio as number) <= 1.01,
    },
    {
      id: 'rough',
      title: 'Rough edges cost',
      prompt: 'Make a packet that is not Gaussian and push the product above $1.5 \\times \\hbar/2$.',
      hint: 'Try the Square packet, a cat with well-separated lumps, or build from just a few plane waves.',
      check: (s) => s.kind !== 'gauss' && (s.ratio as number) > 1.5,
    },
    {
      id: 'halve',
      title: 'Halve it, double it',
      prompt: 'The default Gaussian has $\\Delta x = 1$ and $\\Delta p = 0.5$ at $t = 0$. Squeeze it to $\\Delta x = 0.5$ and confirm that $\\Delta p$ doubles to 1.',
      hint: 'Keep the Gaussian with zero chirp and set width σ to 0.50.',
      check: (s) => s.kind === 'gauss' && Math.abs((s.dx0 as number) - 0.5) < 0.01 && Math.abs((s.dp as number) - 1) < 0.02,
    },
    {
      id: 'negative',
      title: 'Less than nothing',
      prompt: 'Show a Wigner function with a clearly negative region (minimum below −0.02).',
      hint: 'Switch the view to Phase space and the packet to Cat. Wider separation gives finer ripples.',
      check: (s) => s.view === 'phase' && (s.wmin as number) < -0.02,
    },
  ],
  caveats: `<p>The scene is one-dimensional and the particle is free. There is no potential, no spin and no environment. The wave lives on a finite periodic box, which is large enough that nothing wraps around during a loop.</p>
<p>A perfectly sharp square packet has infinite $\\Delta p$, because its edges contain arbitrarily short wavelengths. The square here has slightly softened edges, one sixteenth of its width. That keeps $\\Delta p$ finite and makes its product, about 1.85, independent of the grid. In build mode each "plane wave" is really a long wave train with a Gaussian envelope of width 8. A true plane wave cannot be normalised, so $\\Delta x$ would be infinite. The Wigner surface is shown only for the Gaussian and cat packets, where it has a closed form.</p>`,
  further: [
    { label: 'Uncertainty principle (Wikipedia)', url: 'https://en.wikipedia.org/wiki/Uncertainty_principle' },
    { label: 'Heisenberg, Z. Phys. 43, 172 (1927)', url: 'https://doi.org/10.1007/BF01397280' },
    { label: 'Tse et al., Quantum-enhanced Advanced LIGO detectors, PRL 123, 231107 (2019)', url: 'https://doi.org/10.1103/PhysRevLett.123.231107' },
    { label: 'Wigner quasiprobability distribution (Wikipedia)', url: 'https://en.wikipedia.org/wiki/Wigner_quasiprobability_distribution' },
  ],
};
