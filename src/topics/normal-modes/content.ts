import type { TopicContent } from '../../core/types.ts';

export const content: TopicContent = {
  intuition: `
<p class="lead">Tie a row of weights together with springs and shake one end. The motion looks messy. Yet hidden inside it are a few perfectly simple patterns, each humming at its own steady pitch. Every wobble the chain can make is just these patterns played together, like notes in a chord.</p>
<p>Those simple patterns are the <strong>normal modes</strong>. In a normal mode every mass moves at the same frequency and passes the middle at the same moment. The shape just grows and shrinks in place. The slowest mode is one gentle arch. The next has one still point in the middle, called a <strong>node</strong>. Each higher mode adds another node and moves faster.</p>
<p>Look at the scene. The big chain at the top is doing something complicated. The small faint chains below it are its ingredients. Each one is a single pure mode, and if you add them up point by point you get the big chain exactly. The bars in the corner show how much energy each mode holds.</p>
<p>Now the surprise. Drag any mass sideways and let go. The bars jump to a new mix and then <strong>freeze</strong>. The chain keeps flailing about, but no energy moves from one mode to another. Each note keeps its own share forever, until friction takes it away. That only holds because the springs are perfectly linear. Turn on the nonlinear springs and the bars start to trade energy.</p>
<p>The same idea runs through much of physics. Molecules vibrate in normal modes, and that is how carbon dioxide absorbs infrared light. Bridges and buildings have normal modes that engineers must keep away from footsteps and wind. A drum has them too. Switch to the <strong>Drum</strong> view to see a vibrating skin with lines that never move.</p>`,
  tryFirst: [
    'Drag any ball on the chain up or down, then let go. Watch the energy bars in the corner settle into a fixed pattern.',
    'Set <b>Mode k</b> to 2 and press <b>Excite k purely</b>. Only one bar lights up, and the chain holds one shape as it swings.',
    'Turn up <b>Nonlinearity β</b> and excite mode 1 again. The single bar slowly spills into others.',
    'Switch <b>View</b> to <b>Drum</b>, raise <b>m</b> and <b>n</b>, and turn on the <b>sand</b>. It gathers on the lines that stay still.',
  ],
  equation: {
    tex: 'x_j(t) = \\sum_{k=1}^{N} A_k \\,\\sin\\!\\left(\\frac{j k \\pi}{N+1}\\right) \\cos(\\omega_k t + \\varphi_k)',
    caption: 'Any motion of the linear chain is a sum of standing waves. Each mode k has a fixed shape across the masses and a single frequency in time.',
    terms: [
      { tex: 'x_j(t)', name: 'Displacement of mass j', meaning: 'How far mass $j$ sits from its rest point. The trace in the top corner follows the mass you choose.', param: 'watch' },
      { tex: 'A_k', name: 'Mode amplitude', meaning: 'How strongly mode $k$ is playing. A pluck sets all of them at once by projection. Its energy is $\\tfrac12 \\omega_k^2 A_k^2$ times a constant.', param: 'amp' },
      { tex: '\\sin\\!\\left(\\frac{j k \\pi}{N+1}\\right)', name: 'Mode shape', meaning: 'A sine wave sampled at the masses. Mode $k$ has $k-1$ nodes between the walls.', param: 'mode' },
      { tex: '\\omega_k', name: 'Mode frequency', meaning: 'The angular frequency $2\\omega_0 \\sin\\big(k\\pi/2(N+1)\\big)$. The readout compares the numerical value with this formula.', param: 'omega' },
      { tex: 'N', name: 'Number of masses', meaning: 'A chain of $N$ masses has exactly $N$ modes. No more, no fewer.', param: 'N' },
      { tex: '\\varphi_k', name: 'Phase', meaning: 'When mode $k$ reaches its peak. A pluck from rest starts every mode at its peak, so all $\\varphi_k = 0$.', param: 'pluck' },
    ],
  },
  physicsNotes: `
<h3>Where the formula comes from</h3>
<p>Give every mass $m$ and every spring stiffness $\\kappa$, and write $\\omega_0^2 = \\kappa/m$. Mass $j$ is pulled by the springs on both sides, so Newton's law reads</p>
$$\\ddot x_j = \\omega_0^2\\,(x_{j+1} - 2x_j + x_{j-1}), \\qquad x_0 = x_{N+1} = 0.$$
<p>In matrix form this is $\\ddot{\\mathbf x} = -K\\mathbf x$ with $K = \\omega_0^2\\,\\mathrm{tridiag}(-1, 2, -1)$. Guess a solution where everything moves together, $\\mathbf x = \\boldsymbol\\phi \\cos\\omega t$. Then $K\\boldsymbol\\phi = \\omega^2\\boldsymbol\\phi$. The normal modes are the <strong>eigenvectors</strong> of $K$, and their squared frequencies are its <strong>eigenvalues</strong>.</p>
<p>For this chain the answer is known exactly. The eigenvectors are sampled sine waves, $\\phi_k(j) \\propto \\sin(jk\\pi/(N+1))$, and</p>
$$\\omega_k = 2\\omega_0 \\sin\\frac{k\\pi}{2(N+1)}.$$
<h3>How the page computes it</h3>
<p>The page does not rely on the formula. It builds $K$ and diagonalises it with the <strong>Jacobi eigenvalue method</strong>, which zeroes the off-diagonal entries one plane rotation at a time. The same code would work for unequal masses or odd springs, where no neat formula exists. The eigen error readout shows how closely the numbers agree with the formula. It is usually around $10^{-15}$.</p>
<p>The motion itself is integrated with velocity Verlet at 1200 steps per simulated second. Each frame the page projects positions and velocities onto the modes, $q_k = \\boldsymbol\\phi_k \\cdot \\mathbf x$, and reports the mode energies $E_k = \\tfrac12(\\dot q_k^2 + \\omega_k^2 q_k^2)$. With no damping and linear springs, the mode drift readout stays tiny. That is the conservation law made visible.</p>`,
  deep: [
    {
      title: 'Why every motion is a chord',
      html: `<p>$K$ is real and symmetric. A standard theorem says such a matrix has a full set of <strong>orthogonal</strong> eigenvectors. So the $N$ mode shapes form a basis, like the $x$, $y$ and $z$ axes, only in $N$ dimensions.</p>
<p>Any starting shape can therefore be written as a sum of mode shapes. The weights come from a dot product, $q_k(0) = \\boldsymbol\\phi_k \\cdot \\mathbf x(0)$. That is all a pluck does in this scene. Each mode then evolves on its own as a simple harmonic oscillator,</p>
$$\\ddot q_k = -\\omega_k^2 q_k,$$
<p>and the chain's motion is the sum of these independent oscillators. The energy splits the same way, $E = \\sum_k E_k$, with no cross terms. That is why the bars freeze after a pluck.</p>
<p>Damping in this model is a drag force $-\\gamma \\dot x_j$ on every mass. It is proportional to the mass matrix, so it keeps the modes separate. Each mode just decays like $e^{-\\gamma t/2}$. Damping that is not spread this evenly can couple the modes.</p>`,
    },
    {
      title: 'From beads to strings: the link to Fourier',
      html: `<p>Let $N$ grow while the chain length $L$ stays fixed. The masses at positions $x = ja$ with $a = L/(N+1)$ sample the curve $\\sin(k\\pi x/L)$. In the limit the chain becomes a string, and the mode sum becomes a <strong>Fourier sine series</strong>. Fourier's claim that any shape is a sum of sines is the continuum version of the chord in this scene.</p>
<p>For low modes, $\\sin\\theta \\approx \\theta$ gives $\\omega_k \\approx k\\pi\\omega_0/(N+1)$. The frequencies are whole-number multiples of the lowest one, which is why a string sounds like a clear musical note. The beaded chain departs from this for high $k$. Its frequencies bunch up below a ceiling of $2\\omega_0$, reached when neighbours move in opposite directions. Nothing on the chain can shake faster than that.</p>
<p>Written with a wavenumber $q = k\\pi/((N+1)a)$, the formula becomes $\\omega(q) = 2\\omega_0|\\sin(qa/2)|$. This is the textbook dispersion relation for sound waves in a one-dimensional crystal. When those vibrations are quantised, each mode's energy comes in steps of $\\hbar\\omega_k$. Those quanta are called <strong>phonons</strong>, and they carry heat and sound through solids.</p>`,
    },
    {
      title: 'Nonlinearity and the FPUT surprise',
      html: `<p>Real springs are not perfectly linear. Add a small cubic term to each spring force, $F = \\kappa(d + \\beta d^3)$ for stretch $d$. This is the FPU-β chain, and the <b>Nonlinearity β</b> slider turns it on. The energy is still conserved exactly, but it is no longer a sum of separate mode energies. The modes now trade energy.</p>
<p>In 1953, Enrico Fermi, John Pasta, Stanislaw Ulam and Mary Tsingou ran a chain like this on the MANIAC I computer at Los Alamos. Tsingou wrote the program. They expected the energy placed in mode 1 to spread evenly over all modes, as statistical physics suggests. Instead it spread to a few modes and then flowed <strong>almost entirely back</strong> into mode 1. Their report came out in 1955, after Fermi's death.</p>
<p>The puzzle helped launch modern nonlinear science. Norman Zabusky and Martin Kruskal studied a continuum version in 1965 and found stable travelling pulses they named <em>solitons</em>. Later work showed the recurrence is a long-lived stage, not the final state. With enough time or energy, the chain does share its energy out.</p>
<p>The slider here shows the first half of that story, energy leaking out of a pure mode. This small chain is not tuned to reproduce the original recurrence.</p>`,
    },
    {
      title: 'Drums, Chladni figures and degenerate modes',
      html: `<p>A square drumhead is a grid of masses, each tied to four neighbours. Its modes are products of sines, $\\sin(m\\pi u)\\sin(n\\pi v)$, with $m-1$ and $n-1$ straight <strong>nodal lines</strong> that never move. For a continuous square membrane the frequencies go as $\\sqrt{m^2+n^2}$. They are not whole-number multiples, which is why a drum has a less definite pitch than a string.</p>
<p>The modes $(m,n)$ and $(n,m)$ have the same frequency. Any mix of the two is also a normal mode, and its nodal lines can bend into curves and diagonals. The <b>Mix</b> slider explores this. In 1787 Ernst Chladni sprinkled sand on metal plates and bowed their edges. The sand bounced off the moving parts and piled up on the nodal lines, drawing figures like these.</p>
<p>A round drum has modes built from Bessel functions. The first few frequency ratios are about 1, 1.59, 2.14 and 2.30. A timpani's kettle and the air it holds shift these toward a more musical set.</p>`,
    },
    {
      title: 'Normal modes in the real world',
      html: `<p><strong>Molecules.</strong> A molecule of $n$ atoms has $3n-6$ vibrational modes, or $3n-5$ if it is linear. Carbon dioxide has four: a symmetric stretch, an asymmetric stretch near 2349 cm⁻¹, and two bending modes near 667 cm⁻¹. The bending modes absorb infrared light near 15 μm, which is a large part of why CO₂ is a greenhouse gas. Infrared and Raman spectroscopy identify molecules by their modes.</p>
<p><strong>Structures.</strong> Engineers compute a building's or bridge's normal modes with the same eigenvalue method used here, only with millions of unknowns. The Millennium Bridge in London swayed on its opening day in 2000 when crowd footsteps locked onto a sideways mode, and it was later fitted with dampers.</p>
<p><strong>A famous misconception.</strong> The Tacoma Narrows Bridge collapsed in November 1940 in a steady wind. It is often shown as simple resonance, but that story is wrong. The wind did not push at a matching frequency. The twisting motion fed energy back into itself through the airflow, a self-excited instability called <strong>aeroelastic flutter</strong>. Normal modes set the shape of the twisting, but flutter drove it.</p>`,
    },
  ],
  challenges: [
    {
      id: 'pure3',
      title: 'Play a single note',
      prompt: 'On the chain, put more than 95% of the energy into mode $k = 3$.',
      hint: 'Set <b>Mode k</b> to 3 and press <b>Excite k purely</b>. Keep the nonlinearity at zero so the energy stays put.',
      check: (s) => s.view === 'chain' && (s.N as number) >= 3 && (s.frac3 as number) > 0.95 && (s.energy as number) > 1e-6,
    },
    {
      id: 'chord',
      title: 'Pluck a chord',
      prompt: 'Pluck the chain so that at least three modes each hold 5% or more of the energy. The active modes readout counts them.',
      hint: 'Drag a mass near one end, or press the <b>Quarter</b> or <b>One mass</b> preset. Sharp shapes need many modes.',
      check: (s) => s.view === 'chain' && s.plucked === true && (s.activeModes as number) >= 3,
    },
    {
      id: 'drum2',
      title: 'Two nodal lines',
      prompt: 'In the Drum view, show a mode with at least two nodal lines, so the skin splits into three or more regions.',
      hint: 'Try $(m, n) = (2, 2)$ or $(1, 3)$. The nodal domain readout counts the regions.',
      check: (s) => s.view === 'drum' && (s.nodalDomains as number) >= 3,
    },
    {
      id: 'beats',
      title: 'Make it beat',
      prompt: 'Excite two modes whose frequencies differ by less than 10%, each with at least 30% of the energy. Watch the traced mass swell and fade through one full beat period.',
      hint: 'Only the top of the spectrum has close frequencies. Set N to 12, excite mode 10, then press <b>Add mode k</b> with k = 11. Speed up the simulation to see the beat sooner.',
      check: (s) => s.beatDone === true,
    },
  ],
  caveats: `<p><strong>Ideal parts.</strong> The masses are points, the springs are massless, and the walls are perfectly rigid. Damping is the same drag on every mass, which keeps the modes separate. Real structures have uneven damping and joints that slip, which couple modes slightly.</p>
<p><strong>Transverse and longitudinal.</strong> For small motions both views obey the same equation. Only the meaning of $\\omega_0$ changes: $\\sqrt{\\kappa/m}$ for stretching springs, and $\\sqrt{T/(ma)}$ for sideways motion of a chain under tension $T$ with spacing $a$. The scene uses one $\\omega_0$ for both. Large sideways swings would add nonlinear terms that are not modelled.</p>
<p><strong>The drum.</strong> The drum is a square lattice of masses, not a continuous skin, so its high modes sit slightly below the continuum values. Real Chladni plates are stiff plates with free edges. Their modes differ from a membrane's, though the idea of nodal lines is the same. The sand is a simple random walk whose step grows with the local vibration, not a model of bouncing grains.</p>`,
  further: [
    { label: 'Normal mode on Wikipedia', url: 'https://en.wikipedia.org/wiki/Normal_mode' },
    { label: 'Fermi–Pasta–Ulam–Tsingou problem on Wikipedia', url: 'https://en.wikipedia.org/wiki/Fermi%E2%80%93Pasta%E2%80%93Ulam%E2%80%93Tsingou_problem' },
    { label: 'Billah and Scanlan, Resonance, Tacoma Narrows bridge failure, and undergraduate physics textbooks (1991)', url: 'https://doi.org/10.1119/1.16590' },
    { label: 'Phonon on Wikipedia', url: 'https://en.wikipedia.org/wiki/Phonon' },
  ],
};
