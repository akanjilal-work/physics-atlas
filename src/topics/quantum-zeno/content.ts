import type { TopicContent } from '../../core/types.ts';

export const content: TopicContent = {
  intuition: `
<p class="lead">Push a qubit steadily from $|0\\rangle$ toward $|1\\rangle$. Left alone it gets there. Check on it often enough and it <strong>never leaves</strong>.</p>
<p>A steady drive turns the arrow in the scene from the north pole toward the south pole. After one "π pulse" it arrives at $|1\\rangle$. Now stop it partway and ask "are you still $|0\\rangle$?". The answer is yes or no, nothing in between. A yes puts the arrow <strong>back on the north pole</strong>, and the turn has to start over.</p>
<p>Here is the surprise. In the first moments of the turn, the chance of a "no" grows with the <em>square</em> of the time. Halve the gap between checks and each check is four times less likely to find a change. You make twice as many checks, so the total risk still halves. Check without limit and the risk goes to zero. The arrow is frozen by being watched.</p>
<p>Baidyanath Misra and George Sudarshan gave this the name "Zeno's paradox" in 1977. The name nods to Zeno of Elea's arrow, which could never move because at each instant it was still. In 1990 a group at NIST saw the effect with trapped ions.</p>
<p>"Watching" does not need a mind. It means any interaction that leaves a record of which state the system is in. In the ion experiment that was a laser pulse that made one level glow. Nobody had to look at the glow for the freezing to happen.</p>
<p>Look at the scene. The grey arrow is an unwatched copy that swings freely to the south pole. The bright arrow is one watched run. Each green flash is a measurement. The faint dots are many other runs. Most stay at the top, while a few jump to the bottom and turn purple.</p>`,
  tryFirst: [
    'Watch one shot with the default 6 checks per π pulse. The grey unwatched arrow reaches |1⟩ while most watched runs are still at |0⟩.',
    'Slide <b>Measurements per π pulse</b> up to 30 or more. The ghost dots barely leave the north pole, and the corner plot climbs toward 1.',
    'Set it to <b>none</b>. Every run now turns together to the south pole in plain Rabi flopping.',
    'Switch the <b>Scene</b> to <b>Zeno dragging</b>. With no drive at all, a slowly turning measurement axis pulls the state from |0⟩ to |1⟩.',
  ],
  equation: {
    tex: 'P_{\\text{survive}} = \\left[\\cos^2\\!\\left(\\tfrac{\\Omega\\tau}{2}\\right)\\right]^{T/\\tau} \\to 1 \\text{ as } \\tau\\to 0',
    caption: 'The chance that every one of the T/τ checks still finds |0⟩. More frequent checks make it approach 1.',
    terms: [
      { tex: 'P_{\\text{survive}}', name: 'Survival probability', meaning: 'The chance that every measurement so far found $|0\\rangle$. The readout shows the formula next to the fraction of simulated runs.', param: 'P' },
      { tex: '\\cos^2\\!\\left(\\tfrac{\\Omega\\tau}{2}\\right)', name: 'Stay chance per interval', meaning: 'Plain Rabi flopping for a time $\\tau$, then a measurement. For small $\\tau$ it is about $1 - \\Omega^2\\tau^2/4$.', param: 'pstep' },
      { tex: '\\Omega', name: 'Rabi frequency', meaning: 'How fast the drive turns the state. Unwatched, it reaches $|1\\rangle$ after $T_\\pi = \\pi/\\Omega$.', param: 'omega' },
      { tex: '\\tau', name: 'Measurement interval', meaning: 'Time between checks. The slider sets it as $N$ checks per π pulse, so $\\tau = \\pi/(N\\Omega)$.', param: 'm' },
      { tex: 'T/\\tau', name: 'Number of checks', meaning: 'How many measurements fit in the total time $T$. The readout counts them as the shot runs.', param: 'N' },
    ],
  },
  physicsNotes: `
<h3>Where the formula comes from</h3>
<p>A resonant drive in the rotating frame has $H = \\tfrac{\\hbar\\Omega}{2}\\sigma_x$. Starting from $|0\\rangle$, the state after a time $\\tau$ is $\\cos(\\Omega\\tau/2)|0\\rangle - i\\sin(\\Omega\\tau/2)|1\\rangle$. A measurement in the $|0\\rangle,|1\\rangle$ basis finds $|0\\rangle$ with probability $\\cos^2(\\Omega\\tau/2)$ and resets the state to exactly $|0\\rangle$. Each interval is then a fresh start, so the probabilities multiply:</p>
$$P_N = \\cos^{2N}\\!\\left(\\frac{\\Omega\\tau}{2}\\right),\\qquad N = T/\\tau.$$
<h3>Why the limit is 1</h3>
<p>For small $\\tau$, $\\cos^2(\\Omega\\tau/2) \\approx 1 - \\Omega^2\\tau^2/4$. So</p>
$$P_N \\approx \\left(1 - \\frac{\\Omega^2\\tau^2}{4}\\right)^{T/\\tau} \\approx \\exp\\!\\left(-\\frac{\\Omega^2 T}{4}\\,\\tau\\right) \\to 1.$$
<p>The effective leak rate $\\Omega^2\\tau/4$ shrinks in proportion to $\\tau$. At one π-pulse time with $N$ checks, $P = \\cos^{2N}(\\pi/2N) \\approx e^{-\\pi^2/4N}$. That gives 0.25 for $N = 2$, 0.53 for $N = 4$, and 0.90 at $N = 24$.</p>
<p>The key ingredient is that every quantum state starts to change <em>quadratically</em> in time. For any Hamiltonian the short-time survival is $1 - (\\Delta H)^2 t^2/\\hbar^2$, where $\\Delta H$ is the energy spread of the state. Anything that starts linearly, like classical exponential decay, cannot be frozen this way.</p>
<h3>Quantum jumps and the ensemble</h3>
<p>Each run in the scene is one possible history. Between checks its arrow turns smoothly. At each check it either snaps back to $|0\\rangle$ or jumps to $|1\\rangle$, chosen at random with the Born rule. The fraction of runs that never jumped estimates $P_N$. Its statistical error is $\\sigma = \\sqrt{P(1-P)/M}$ for $M$ runs, and the $|\\text{sim} - \\text{theory}|/\\sigma$ readout should stay around 1. Runs that jumped keep turning and can jump back. Counting them too, the $|0\\rangle$ population is $\\tfrac12 + \\tfrac12\\cos^N(\\Omega\\tau)$.</p>
<h3>How the simulation works</h3>
<p>Every state visited lies on one great circle of the Bloch sphere, so each run is a single angle. Free evolution is an exact rotation, and measurements are processed at their exact times, even when several fall inside one frame. There is no integrator and so no step error. The only error is Monte Carlo noise, which the σ readout reports.</p>`,
  deep: [
    {
      title: 'Misra and Sudarshan, 1977',
      html: `<p>Baidyanath Misra and E. C. George Sudarshan published "The Zeno's paradox in quantum theory" in the <em>Journal of Mathematical Physics</em> in 1977. They asked what happens to an unstable particle watched continuously, for example in a bubble chamber. With idealised instant measurements, the mathematics said it would never decay.</p>
<p>They meant it partly as a puzzle about what "continuous observation" can mean. Real detectors take time to respond and interact with finite strength. So no real observation is truly continuous, and no real decay is truly stopped. The idea had appeared earlier in more informal forms. Their paper gave it the name that stuck.</p>
<p>Zeno of Elea argued that a flying arrow is at rest at every instant, and so can never move. The quantum version is an odd echo. A system checked at every instant would never leave its state.</p>`,
    },
    {
      title: 'Itano and colleagues, 1990: trapped ions',
      html: `<p>Richard Cook proposed a clean test in 1988, and Wayne Itano, Daniel Heinzen, John Bollinger and David Wineland at NIST carried it out in 1990. They held a few thousand beryllium ions in a Penning trap. A radio-frequency pulse drove each ion between two ground-state hyperfine levels. Unwatched, a π pulse of about a quarter of a second moved them fully from level 1 to level 2.</p>
<p>During that pulse they fired $n$ short ultraviolet laser pulses, with $n$ up to 64. The laser drove a strong cycling transition that makes an ion in level 1 scatter many photons, and does nothing to an ion in level 2. Each pulse is therefore a measurement of "level 1 or not". As $n$ grew, fewer ions ended in level 2, closely following $\\tfrac12[1 - \\cos^n(\\pi/n)]$, which is the population formula of this page for a π pulse. The level 1 population includes ions that jumped away and later jumped back, so it sits a little above the never-jumped survival plotted in the scene.</p>
<p>A debate followed about whether this was "really" a measurement effect. The laser pulses can be treated as ordinary quantum dynamics with no collapse at all, and the same result comes out. That is the honest lesson. The Zeno effect is about strong, frequent <em>interaction</em> that records information, however you choose to describe it.</p>`,
    },
    {
      title: 'Watching means interacting',
      html: `<p>Nothing in the formula mentions an observer. It needs an interaction that correlates the system with something else, fast and strongly enough that $|0\\rangle$ and $|1\\rangle$ can no longer interfere. A photon scattered only by level 1 does that. So does a stray atom that bumps into the system in a way that depends on its state.</p>
<p>Seen this way, the Zeno effect is a close relative of decoherence. Strong coupling to the environment can freeze a state just as well as a lab measurement. A related trick uses no measurement at all. A strong extra drive or a fast dephasing channel shifts or blurs the levels, so the slow drive can no longer build up its turn. Some authors call all of these "Zeno dynamics".</p>
<p>The effect is also no proof of any role for consciousness. Detectors that write to memory and are never read give the same statistics. Whether anyone ever looks at the data makes no difference to the physics.</p>`,
    },
    {
      title: 'The anti-Zeno effect',
      html: `<p>Real decay is a leak into a continuum of final states, such as an excited atom emitting a photon into any of many modes. Fermi's golden rule gives the long-time rate $\\Gamma = 2\\pi G(\\omega_a)$, set by the coupling spectrum $G$ at the atom's frequency $\\omega_a$. Abraham Kofman and Gershon Kurizki showed in 2000 that checks every $\\tau$ change this to</p>
$$\\Gamma(\\tau) = 2\\pi\\int G(\\omega)\\,F_\\tau(\\omega - \\omega_a)\\,d\\omega,\\qquad F_\\tau(x) = \\frac{\\tau}{2\\pi}\\,\\mathrm{sinc}^2\\!\\left(\\frac{x\\tau}{2}\\right).$$
<p>Measurement blurs the level over a width of order $1/\\tau$. If the atom sits on the peak of $G$, blurring can only lower the overlap, and decay slows. That is the Zeno effect. If the atom sits on the tail of $G$, a moderate blur reaches the peak and the decay <strong>speeds up</strong>. That is the anti-Zeno effect. Very fast checks still win in the end, because the blur then spreads thinner than the whole continuum.</p>
<p>The <b>Anti-Zeno</b> scene uses a Lorentzian continuum, for which the overlap has a closed form. The curve shows the ratio to the golden rule as the check rate rises. Put the level on the peak and the ratio only falls. Move it to the side and a bump above 1 appears. Mark Raizen's group saw both regimes in 2001, with cold sodium atoms tunnelling out of an accelerated optical lattice. Kofman and Kurizki argued that the anti-Zeno regime should be the more common one in natural decays.</p>`,
    },
    {
      title: 'Zeno dragging and uses in quantum technology',
      html: `<p>If frequent checks hold a state still, checks along a slowly turning axis should drag it along. Each small step $\\delta$ keeps the state aligned with probability $\\cos^2(\\delta/2)$. Over a half turn in $N$ steps, the chance to end on $|1\\rangle$ is $\\tfrac12 + \\tfrac12\\cos^N(\\pi/N)$, which rises to 1 as $N$ grows. Yakir Aharonov and M. Vardi discussed this in 1980. It has since been done with a superconducting qubit, where a slowly rotated measurement steered the state without any drive.</p>
<p>The same idea helps in several places.</p>
<ul>
<li><b>Error suppression.</b> Frequent checks of which subspace a system is in, such as the parity checks of an error-correcting code, stop slow errors from building up amplitude. Small coherent errors then get turned into rare, detectable jumps.</li>
<li><b>Protecting against leakage.</b> Watching for escape out of a qubit's two levels keeps the state inside them. This is the idea of "Zeno subspaces", studied by Paolo Facchi and Saverio Pascazio.</li>
<li><b>State preparation.</b> Dragging and strong dissipation can steer a system into a target state without precise control pulses.</li>
<li><b>Interaction-free measurement.</b> In 1995 Paul Kwiat and colleagues used many small polarisation rotations, each followed by a check, to detect an object while rarely absorbing a photon.</li>
</ul>
<p>In every case the price is the same. Frequent, strong interaction is needed, and each check must be fast compared with the dynamics it freezes.</p>`,
    },
  ],
  challenges: [
    {
      id: 'freeze',
      title: 'Freeze it',
      prompt: 'Finish a Zeno-freeze shot in which the theory gives survival above 0.9 at $T = \\pi/\\Omega$.',
      hint: 'The survival at the π-pulse time is $\\cos^{2N}(\\pi/2N) \\approx e^{-\\pi^2/4N}$. Solve $e^{-\\pi^2/4N} > 0.9$ for $N$, set the slider, and let one shot run to the end.',
      check: (s) => (s.shotM as number) >= 1 && (s.shotSurvTheory as number) > 0.9,
    },
    {
      id: 'free',
      title: 'Let it flip',
      prompt: 'Run a Zeno-freeze shot with no measurements and watch the state arrive at $|1\\rangle$.',
      hint: 'Set Measurements per π pulse to none. The drive then gives plain Rabi flopping, and after $\\pi/\\Omega$ every run sits on the south pole.',
      check: (s) => s.shotM === 0 && (s.shotEndZ as number) < -0.99,
    },
    {
      id: 'drag',
      title: 'Drag it with looks alone',
      prompt: 'In Zeno dragging, finish a sweep that ends with the bright arrow on $|1\\rangle$, with theory fidelity above 0.9.',
      hint: 'The fidelity is about $\\tfrac12 + \\tfrac12 e^{-\\pi^2/2N}$, so you need more than about 20 measurements in the sweep. Slow the drag speed or raise the number of checks.',
      check: (s) => s.dragDone === true && (s.dragF as number) > 0.9 && (s.dragEndZ as number) < -0.99,
    },
    {
      id: 'half',
      title: 'The halfway point',
      prompt: 'Find the smallest number of checks per π pulse for which survival at $T = \\pi/\\Omega$ first exceeds 0.5, and run a shot with it.',
      hint: 'Try small numbers on the slider and read the lower corner plot. $\\cos^{2N}(\\pi/2N)$ is 0.25 at $N = 2$. The answer is only a little higher.',
      check: (s) => s.touched === true && s.shotM === 4,
    },
  ],
  caveats: `<p>The model uses ideal projective measurements that take no time. Real measurements have a finite duration and strength, so real freezing is never perfect. With weak or slow checks the state only partly collapses, and the theory of continuous weak measurement is needed.</p>
<p>The drive is exactly on resonance and there is no decay or dephasing between checks. Time is slowed hugely. In the 1990 ion experiment a π pulse took a quarter of a second, and in superconducting qubits it takes tens of nanoseconds.</p>
<p>The anti-Zeno scene is a toy. It uses a Lorentzian continuum and the short-time, weak-coupling formula of Kofman and Kurizki, which holds only when little decays within one interval. The Bloch sphere there is a picture, not a real two-level state. North means "not yet decayed" and south means "decayed into the continuum".</p>
<p>The ghost runs are drawn fanned about the z axis, or scattered slightly, so they do not overlap. The real states all lie on one circle and at two points.</p>`,
  further: [
    { label: 'Misra and Sudarshan, The Zeno\'s paradox in quantum theory (1977)', url: 'https://doi.org/10.1063/1.523304' },
    { label: 'Itano et al., Quantum Zeno effect (1990)', url: 'https://doi.org/10.1103/PhysRevA.41.2295' },
    { label: 'Kofman and Kurizki, Acceleration of quantum decay by frequent observations (2000)', url: 'https://doi.org/10.1038/35014537' },
    { label: 'Quantum Zeno effect on Wikipedia', url: 'https://en.wikipedia.org/wiki/Quantum_Zeno_effect' },
  ],
};
