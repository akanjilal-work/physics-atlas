import type { TopicContent } from '../../core/types.ts';

export const content: TopicContent = {
  intuition: `
<p class="lead">A coin is heads or tails. A qubit is richer. Its state is a <strong>point on the surface of a sphere</strong>, and it can sit anywhere on that surface.</p>
<p>The north pole is the state $|0\\rangle$. The south pole is $|1\\rangle$. Every other point is a blend of the two. That is the whole idea of the <em>Bloch sphere</em>, and the arrow in the scene points at the current state.</p>
<p>People often say a qubit is "0 and 1 at the same time". That phrase hides the interesting part. A qubit holds two <strong>amplitudes</strong>, one for each outcome. How far the arrow tips from north sets their sizes. Which way it points around the equator sets their <strong>relative phase</strong>. The phase never shows up if you only ask "0 or 1?". It shows up the moment you rotate the qubit and ask a different question.</p>
<p>A measurement asks one yes or no question along one axis. The answer is always one of the two poles of that axis, never anything in between. The chance of each answer depends on how close the arrow is to that pole. After the answer the arrow jumps to it. This is called <em>collapse</em>.</p>
<p>The surprise starts with a 1922 experiment. Otto Stern and Walther Gerlach sent silver atoms through a lopsided magnet. A tiny spinning magnet should have been deflected by any amount, making a smear. The atoms landed in <strong>just two spots</strong>. Spin comes in two settings, up or down, along whatever axis you measure. Physicists later realised that this two-valued spin is a qubit.</p>
<p>Put the spin in a magnetic field and the arrow <strong>precesses</strong> like a tilted top. Push it with a radio wave at the right beat and it flips from north to south and back. That flip is how MRI scanners read the protons in your body, and how quantum computers run their gates.</p>`,
  tryFirst: [
    'Drag θ and φ. The arrow moves over the sphere and P(0) and P(1) follow cos² and sin² of θ/2. Moving φ changes neither of them.',
    'Press <b>Reset to |0⟩</b>, then <b>H</b>. The arrow turns half a circle about the tilted H axis and lands on |+⟩ on the equator.',
    'Press <b>Measure ×100</b> on |+⟩. The histogram in the corner splits about 50/50. Now press <b>S</b> once, set the axis to y and measure again. Every copy answers |+i⟩.',
    'Switch <b>Mode</b> to <b>Larmor</b>. The arrow circles the violet field arrow like a spinning top. Then try <b>Rabi</b> and press <b>π pulse</b>.',
  ],
  equation: {
    tex: '|\\psi\\rangle = \\cos\\tfrac{\\theta}{2}|0\\rangle + e^{i\\varphi}\\sin\\tfrac{\\theta}{2}|1\\rangle',
    caption: 'Every pure qubit state, up to an unobservable global phase. The angles θ and φ are the latitude and longitude of the arrow.',
    terms: [
      { tex: '\\theta', name: 'Polar angle', meaning: 'How far the arrow tips down from the north pole $|0\\rangle$. It sets the sizes of the two amplitudes.', param: 'theta' },
      { tex: '\\varphi', name: 'Relative phase', meaning: 'Where the arrow points around the equator. It is invisible to a z measurement but decides x and y outcomes.', param: 'phi' },
      { tex: '\\cos\\tfrac{\\theta}{2}', name: 'Amplitude of |0⟩', meaning: 'Its square is the Born-rule chance of reading 0: $P(0) = \\cos^2(\\theta/2)$.', param: 'p0' },
      { tex: 'e^{i\\varphi}\\sin\\tfrac{\\theta}{2}', name: 'Amplitude of |1⟩', meaning: 'A complex number. Its size gives $P(1) = \\sin^2(\\theta/2)$, and its angle is the relative phase.', param: 'p1' },
      { tex: '|0\\rangle, |1\\rangle', name: 'Measurement basis', meaning: 'The two answers of a z measurement. Any other axis gives a different pair of opposite points.', param: 'maxis' },
    ],
  },
  physicsNotes: `
<h3>From two complex numbers to one arrow</h3>
<p>A general state is $a|0\\rangle + b|1\\rangle$ with $|a|^2 + |b|^2 = 1$. That is four real numbers with one constraint. Multiplying the whole state by $e^{i\\chi}$ changes no prediction, so one more number drops out. Two remain. Write them as angles and you get the headline equation. The half angles are needed so that $\\theta$ runs from $0$ to $\\pi$ while $\\theta/2$ covers a quarter turn.</p>
<p>The arrow is the <strong>Bloch vector</strong>, the average of the three Pauli spin operators:</p>
$$\\vec r = \\langle\\vec\\sigma\\rangle = (\\sin\\theta\\cos\\varphi,\\ \\sin\\theta\\sin\\varphi,\\ \\cos\\theta).$$
<p>The chance of the + answer along any unit axis $\\hat n$ is $P_+ = \\tfrac12(1 + \\vec r\\cdot\\hat n)$. For $\\hat n = \\hat z$ this is $\\cos^2(\\theta/2)$.</p>
<h3>Gates are rotations</h3>
<p>Every single-qubit gate is a $2\\times2$ unitary matrix. Up to a global phase it equals $R_{\\hat n}(\\alpha) = e^{-i\\alpha\\,\\hat n\\cdot\\vec\\sigma/2}$, which turns the arrow by $\\alpha$ about $\\hat n$. X, Y and Z are half turns about their axes. H is a half turn about the axis halfway between x and z. S and T are quarter and eighth turns about z.</p>
<h3>Magnetic fields and radio pulses</h3>
<p>A spin with gyromagnetic ratio $\\gamma$ in a field $\\vec B$ has $H = -\\gamma\\,\\vec B\\cdot\\vec S$. Its Bloch vector obeys $\\dot{\\vec r} = \\gamma\\,\\vec r\\times\\vec B$. That is precession at the <strong>Larmor frequency</strong> $\\omega_L = \\gamma B$. For $\\gamma > 0$ the arrow turns clockwise when seen from the tip of $\\vec B$. For the proton, $\\gamma/2\\pi = 42.58$ MHz per tesla.</p>
<p>A weak field rotating at frequency $\\omega$ in the xy plane drives the spin. In a frame that rotates along with it, the drive looks static. The spin then turns about the effective axis $(\\Omega, 0, \\Delta)$, where $\\Omega$ is the drive strength and $\\Delta = \\omega_L - \\omega$ is the detuning. Starting from $|0\\rangle$:</p>
$$P_1(t) = \\frac{\\Omega^2}{\\Omega^2 + \\Delta^2}\\,\\sin^2\\!\\left(\\frac{\\sqrt{\\Omega^2+\\Delta^2}\\;t}{2}\\right).$$
<p>On resonance this is $\\sin^2(\\Omega t/2)$. A pulse of length $\\pi/\\Omega$ flips $|0\\rangle$ to $|1\\rangle$. It is called a π pulse.</p>
<h3>How the simulation works</h3>
<p>The arrow is integrated with fourth-order Runge–Kutta on the Bloch equations, at 2 ms per step with several steps per frame. Gates are exact rotations, animated slowly so you can follow them. The tests check the Rabi formula against a direct numerical solution of the Schrödinger equation with a rotating drive, to better than one part in a million. The <b>|r| − 1</b> readout shows how well the length is conserved when decoherence is off. In Rabi mode a second readout compares the arrow with the formula.</p>`,
  deep: [
    {
      title: 'Why opposite points are orthogonal',
      html: `<p>On the sphere, $|0\\rangle$ and $|1\\rangle$ are as far apart as two points can be. In the state space they are orthogonal: $\\langle 0|1\\rangle = 0$. The same holds for every pair of antipodal points. For two pure states with Bloch vectors $\\vec r$ and $\\vec s$,</p>
$$|\\langle\\psi_r|\\psi_s\\rangle|^2 = \\tfrac12\\,(1 + \\vec r\\cdot\\vec s).$$
<p>Opposite arrows give $\\vec r\\cdot\\vec s = -1$ and an overlap of zero. Arrows at right angles, like $|0\\rangle$ and $|+\\rangle$, give one half. They are not orthogonal at all. This is why the sphere uses half angles. A 90° turn on the sphere is only a 45° turn between state vectors.</p>
<p>The half angle has a famous side effect. A full $2\\pi$ turn of the arrow multiplies the state by $-1$. That sign is a global phase, so a lone spin shows nothing. In an interferometer it can be compared with an unrotated path. Neutron interferometry experiments confirmed the sign change in 1975. It takes a $4\\pi$ turn to return a spin-1/2 state exactly to itself.</p>`,
    },
    {
      title: 'Stern and Gerlach, 1922',
      html: `<p>Otto Stern and Walther Gerlach worked in Frankfurt. They heated silver in an oven and sent a thin beam of atoms between magnet poles shaped to make a strongly non-uniform field. Such a field pushes a small magnet up or down depending on how it is tilted. If atomic magnets could point any way, the beam should spread into a continuous band. It split into two separate lines.</p>
<p>They read the result as proof of "space quantisation" from the old Bohr–Sommerfeld atom. The real cause was not yet known. A silver atom has zero orbital angular momentum in its ground state. The whole magnetic moment comes from one unpaired electron's <strong>spin</strong>, an idea proposed by George Uhlenbeck and Samuel Goudsmit in 1925.</p>
<p>Chain the magnets and the qubit picture appears. Keep only the "up along z" beam and measure it again along z: it is always up. Measure it along x instead: half go each way. Keep the "up along x" beam and measure along z again: the 50/50 split returns. The x measurement erased the z information. Try the same sequence with the Measure button and the axis selector.</p>`,
    },
    {
      title: 'NMR and MRI: Larmor and Rabi at work',
      html: `<p>A proton is a spin-1/2 particle with a magnetic moment. In a field $B$ it precesses at $f = 42.58\\text{ MHz} \\times B/(1\\text{ T})$. A clinical scanner at 1.5 T runs at about 63.9 MHz. One at 3 T runs at about 127.7 MHz. In the Earth's field of about 50 μT the frequency drops to roughly 2 kHz. Proton magnetometers use that to measure the field.</p>
<p>Isidor Rabi measured nuclear moments in 1938 by driving molecular beams at resonance. That is the Rabi flopping in this scene, and it earned him the 1944 Nobel Prize. In 1946 the groups of Felix Bloch and Edward Purcell detected the same resonance in ordinary liquids and solids. They shared the 1952 Nobel Prize. MRI adds field gradients so that the Larmor frequency encodes position. Paul Lauterbur and Peter Mansfield received the 2003 Nobel Prize in Medicine for that.</p>
<p>Scanners speak the language of this page. A "90° pulse" tips the magnetisation from the pole to the equator. A "180° pulse" is a π pulse. The image contrast comes largely from how fast different tissues recover, their $T_1$ and $T_2$.</p>`,
    },
    {
      title: 'Decoherence: shrinking into the ball',
      html: `<p>A pure state sits on the surface. A qubit that has become entangled with its surroundings is no longer pure. It must be described by a <strong>density matrix</strong></p>
$$\\rho = \\tfrac12\\left(I + \\vec r\\cdot\\vec\\sigma\\right),\\qquad |\\vec r| \\le 1.$$
<p>Mixed states are points <em>inside</em> the sphere. The centre is the fully mixed state, a fair coin for every axis. The purity $\\mathrm{Tr}\\,\\rho^2 = \\tfrac12(1 + |\\vec r|^2)$ runs from 1 on the surface to 1/2 at the centre. A point inside the ball does not describe a hidden pure state we are ignorant of. Many different mixtures of pure states give the same $\\rho$, and no measurement can tell them apart.</p>
<p>Two times describe the simplest decay. $T_1$ is energy relaxation: the spin drops back to its ground state, here $|0\\rangle$ (or along $\\vec B$ in Larmor mode). $T_2$ is dephasing: the arrow's sideways part shrinks as its phase is scrambled. Keeping the density matrix physical requires $T_2 \\le 2T_1$, and the sliders enforce that. The scene uses a zero-temperature bath. A real NMR sample relaxes to a tiny thermal tilt instead of the full pole.</p>
<p>Much of $T_2$ decay can come from slow, static differences between spins rather than true decoherence. Erwin Hahn's spin echo of 1950 undoes that part with a π pulse halfway through.</p>`,
    },
    {
      title: 'Gates in a quantum computer',
      html: `<p>A quantum processor applies single-qubit gates as short, shaped microwave or laser pulses. Each pulse is a Rabi rotation with a chosen axis and angle. The phase of the pulse picks the axis in the xy plane. Z rotations are often done for free by shifting the reference phase of later pulses in software.</p>
<p>Any single-qubit unitary can be written as three rotations, for example $R_z(\\alpha)R_y(\\beta)R_z(\\gamma)$ times a phase. H and T together with a two-qubit gate such as CNOT form a universal set. Any quantum circuit can be approximated to any accuracy from them.</p>
<p>The identity $HZH = X$ is a small example of how gates are rewritten in a compiler. H swaps the roles of the x and z axes, so a z half turn sandwiched by H becomes an x half turn. The limit on all of this is decoherence. A useful machine must finish its gates well within $T_2$, or correct its errors faster than they appear.</p>`,
    },
  ],
  challenges: [
    {
      id: 'plus',
      title: 'One gate to the equator',
      prompt: 'Starting from $|0\\rangle$, reach $|+\\rangle$ with a single gate.',
      hint: 'Press Reset to |0⟩ first. Which gate swaps the z axis with the x axis? A quarter turn about y also works.',
      check: (s) => s.fromZero === true && s.gateCount === 1 && (s.rx as number) > 0.99,
    },
    {
      id: 'hzh',
      title: 'HZH = X',
      prompt: 'From $|0\\rangle$, apply H, then Z, then H, and end at $|1\\rangle$. That is exactly what X would do.',
      hint: 'Reset to |0⟩, then press H, Z, H in that order. Watch the middle Z turn the arrow around the equator from |+⟩ to |−⟩.',
      check: (s) => s.fromZero === true && s.seq === 'H Z H' && (s.rz as number) < -0.99,
    },
    {
      id: 'pipulse',
      title: 'A clean π pulse',
      prompt: 'In Rabi mode, drive the spin from $|0\\rangle$ until $P_1 > 0.99$.',
      hint: 'Keep the detuning near zero, or the arrow cannot reach the south pole. Press π pulse, or let the drive run. Decoherence also stops you short.',
      check: (s) => s.mode === 'rabi' && (s.rabiPeak as number) > 0.99,
    },
    {
      id: 'coin',
      title: 'A fair quantum coin',
      prompt: 'Prepare $|+\\rangle$ and use Measure ×100 along z. Get between 40 and 60 zeros.',
      hint: 'Reset to |0⟩, press H, set the axis to z, then Measure ×100. The Born rule gives 50/50, and 100 tries usually lands within ±10.',
      check: (s) => s.batchAxis === 'z' && (s.batchPrepX as number) > 0.98 && (s.batchPlus as number) >= 40 && (s.batchPlus as number) <= 60,
    },
  ],
  caveats: `<p>The scene shows one isolated two-level system. Real spins and qubits have more levels, neighbours they couple to, and noise that is not a simple exponential. $T_1$ and $T_2$ are the simplest model of decoherence, not a full one. The bath is at zero temperature, so $T_1$ relaxes all the way to the pole.</p>
<p>Time is slowed enormously. A proton at 1 T precesses about 43 million times per second, and the scene shows a few turns per second. Rabi mode is drawn in the rotating frame and uses the rotating-wave picture, which ignores small Bloch–Siegert shifts from a linearly polarised drive. Gates are drawn as slow turns but act as ideal, instant rotations. The global phase is dropped everywhere, since no single-qubit measurement can see it.</p>
<p>Measure ×100 imagines 100 freshly prepared copies of the current state. A single real qubit cannot be measured twice to get statistics. The first measurement collapses it, which is what the single Measure button shows.</p>`,
  further: [
    { label: 'Bloch sphere on Wikipedia', url: 'https://en.wikipedia.org/wiki/Bloch_sphere' },
    { label: 'Stern–Gerlach experiment on Wikipedia', url: 'https://en.wikipedia.org/wiki/Stern%E2%80%93Gerlach_experiment' },
    { label: 'Bloch, Nuclear Induction (1946)', url: 'https://doi.org/10.1103/PhysRev.70.460' },
    { label: 'Rabi cycle on Wikipedia', url: 'https://en.wikipedia.org/wiki/Rabi_cycle' },
  ],
};
