import type { TopicContent } from '../../core/types.ts';

export const content: TopicContent = {
  intuition: `
<p class="lead">Alice holds a qubit in a state she does not know. She wants Bob, far away, to end up with <strong>exactly that state</strong>. She cannot measure it and phone the answer, because one measurement reveals only one bit and destroys the rest.</p>
<p>The trick needs two things. First, Alice and Bob share a pair of <strong>entangled</strong> qubits made earlier. Second, Alice sends Bob <strong>two ordinary bits</strong> by any normal channel.</p>
<p>Alice lets her unknown qubit interact with her half of the pair, then measures both of her qubits. She gets one of four answers, each with the same chance of 1/4. The answers tell her nothing about the state. Yet at that moment Bob's qubit already holds the state, twisted by one of four known flips. The two bits say which flip. Bob undoes it and his qubit becomes the original.</p>
<p>Watch Bob's sphere. Until the two glowing packets arrive, his arrow shrinks to a dot at the centre. From where Bob stands his qubit is pure noise, a fair coin along every axis. That is why teleportation cannot send a message faster than light. The bits carry no information about the state, but without them Bob has nothing.</p>
<p>Also watch Alice's spheres. Her measurement snaps them to the poles. The original state is gone from her side. Nothing was copied, and no particle moved. Only the state did.</p>`,
  tryFirst: [
    'Press <b>Run</b> and watch the highlighted gate move along the circuit. The fidelity bars in the corner fill in step by step.',
    'Press <b>Reset</b> and use <b>Step</b> until after <b>measure</b>. Bob’s arrow is a dot at the centre and the fidelity bar sits at 1/2.',
    'Turn on <b>Forget the correction</b> and run again. Bob keeps a flipped copy. Then press <b>Average over 50 states</b>.',
    'Raise the <b>pair noise</b>. Bob’s final arrow gets shorter and the fidelity drops toward the classical line at 2/3.',
  ],
  equation: {
    tex: '(H_1\\,\\mathrm{CNOT}_{12})\\,|\\psi\\rangle_1|\\Phi^+\\rangle_{23} = \\tfrac12\\sum_{m} |m\\rangle_{12}\\,\\sigma_m|\\psi\\rangle_3',
    caption: 'After Alice’s two gates, each of her four outcomes m = m₁m₂ has probability 1/4. It leaves Bob holding |ψ⟩ with a known flip σ_m: nothing, X, Z, or both.',
    terms: [
      { tex: '|\\psi\\rangle_1', name: 'Unknown state', meaning: 'Alice’s qubit, $\\alpha|0\\rangle + \\beta|1\\rangle$ with $\\alpha = \\cos\\tfrac\\theta2$ and $\\beta = e^{i\\varphi}\\sin\\tfrac\\theta2$.', param: 'theta' },
      { tex: '|\\Phi^+\\rangle_{23}', name: 'Shared Bell pair', meaning: '$(|00\\rangle + |11\\rangle)/\\sqrt2$, split between Alice (qubit 2) and Bob (qubit 3). The noise slider mixes it with white noise.', param: 'noise' },
      { tex: 'H_1\\,\\mathrm{CX}_{12}', name: 'Alice’s gates', meaning: 'A CNOT from qubit 1 to 2, then a Hadamard on qubit 1. Together they turn a Bell-basis measurement into an ordinary one.', param: 'step' },
      { tex: '|m\\rangle_{12}', name: 'Measurement outcome', meaning: 'Two classical bits $m_1 m_2$. Each of the four values has probability exactly 1/4, whatever $|\\psi\\rangle$ is.', param: 'bits' },
      { tex: '\\sigma_m', name: 'Known flip', meaning: '$X^{m_2}Z^{m_1}$. Bob undoes it with $Z^{m_1}X^{m_2}$: X first, then Z. Skip this and the state stays scrambled.', param: 'forget' },
      { tex: '\\tfrac12', name: 'Equal amplitudes', meaning: 'Amplitude 1/2 means probability 1/4 per outcome. Averaged over outcomes, Bob’s qubit is $I/2$.', param: 'rhoB' },
    ],
  },
  physicsNotes: `
<h3>Where the equation comes from</h3>
<p>Write the three-qubit state and expand Alice’s two qubits in the Bell basis $|\\Phi^\\pm\\rangle = (|00\\rangle \\pm |11\\rangle)/\\sqrt2$, $|\\Psi^\\pm\\rangle = (|01\\rangle \\pm |10\\rangle)/\\sqrt2$. A few lines of algebra give</p>
$$|\\psi\\rangle|\\Phi^+\\rangle = \\tfrac12\\big[\\,|\\Phi^+\\rangle|\\psi\\rangle + |\\Psi^+\\rangle X|\\psi\\rangle + |\\Phi^-\\rangle Z|\\psi\\rangle + |\\Psi^-\\rangle XZ|\\psi\\rangle\\,\\big].$$
<p>Nothing has happened yet. This is the same state, written differently. The CNOT and H then rotate the Bell basis into the ordinary basis $|m_1m_2\\rangle$, so a plain measurement of both qubits is a Bell measurement. That gives the headline equation.</p>
<h3>The no-signalling point</h3>
<p>Before Bob hears from Alice, his qubit is described by the partial trace over her qubits. Average the four branches, each with weight 1/4:</p>
$$\\rho_B = \\tfrac14\\sum_m \\sigma_m|\\psi\\rangle\\langle\\psi|\\sigma_m^\\dagger = \\tfrac12 I.$$
<p>The four Pauli flips average any Bloch vector to zero. The result does not depend on $|\\psi\\rangle$, so nothing Alice does can change what Bob sees. The simulation computes this partial trace at every step and draws it as Bob’s arrow. It stays at zero length until the bits land.</p>
<h3>Fidelity and noise</h3>
<p>Fidelity $F = \\langle\\psi|\\rho_B|\\psi\\rangle$ is 1 for a perfect copy and 1/2 for a random guess. With a Werner pair $\\rho = (1-\\lambda)|\\Phi^+\\rangle\\langle\\Phi^+| + \\lambda I/4$ the overlap with $|\\Phi^+\\rangle$ is $F_\\text{pair} = 1 - 3\\lambda/4$. Bob’s corrected state is $(1-\\lambda)|\\psi\\rangle\\langle\\psi| + \\lambda I/2$, so</p>
$$F = 1 - \\tfrac{\\lambda}{2} = \\frac{1 + 2F_\\text{pair}}{3}.$$
<p>This holds for every input state and every outcome. The best any classical scheme can do from one copy is measure and re-prepare, which averages $F = 2/3$. Teleportation beats that only when $F_\\text{pair} > 1/2$, that is $\\lambda < 2/3$.</p>
<h3>How the simulation works</h3>
<p>The code keeps the full $8\\times8$ density matrix of all three qubits. Gates act as $\\rho \\to U\\rho U^\\dagger$ with exact matrices. The Werner noise is applied once, right after the pair is made. Measurement projects onto the drawn outcome. Each sphere shows the Bloch vector of that qubit’s reduced density matrix. The tests check unitarity, fidelity 1 for 200 random states and all four outcomes, $\\rho_B = I/2$ to machine precision, and the Werner formula. The <b>trace error</b> readout shows that $\\mathrm{Tr}\\,\\rho$ stays 1.</p>`,
  deep: [
    {
      title: 'Why skipping the correction gives 1/2, not 2/3',
      html: `<p>Without the correction Bob holds $\\sigma_m|\\psi\\rangle$. For outcome 00 that is $|\\psi\\rangle$ itself. For the other three the fidelity is $|\\langle\\psi|\\sigma|\\psi\\rangle|^2 = r_\\sigma^2$, the square of one Bloch component. Averaging over outcomes:</p>
$$\\bar F = \\tfrac14\\,(1 + r_x^2 + r_y^2 + r_z^2) = \\tfrac12.$$
<p>That is exactly the fidelity of a random guess, and it is the same for every state. It is also the fidelity of $I/2$. This makes sense: throwing away the bits is the same as never getting them.</p>
<p>The number 2/3 is different. It is the best average fidelity of a <em>classical</em> strategy that does use a message: measure the unknown qubit along z, send the result, and let Bob prepare that pole. For a state with Bloch component $z$ this scores $(1 + z^2)/2$. Averaged over the sphere that is 2/3. S. Massar and S. Popescu proved in 1995 that no measure-and-prepare scheme beats 2/3 on one copy. Experiments must pass this line to claim true quantum teleportation.</p>`,
    },
    {
      title: 'No-cloning: why the original must be destroyed',
      html: `<p>In 1982 William Wootters and Wojciech Zurek, and independently Dennis Dieks, proved that no device can copy an unknown quantum state. Suppose a unitary $U$ did $U|\\psi\\rangle|0\\rangle = |\\psi\\rangle|\\psi\\rangle$ for every $|\\psi\\rangle$. Unitaries keep inner products. Taking two states gives $\\langle\\psi|\\phi\\rangle = \\langle\\psi|\\phi\\rangle^2$, which forces the overlap to be 0 or 1. So only a set of orthogonal states can be copied, never an arbitrary one.</p>
<p>Teleportation obeys this. After Alice measures, her qubits sit at $|0\\rangle$ or $|1\\rangle$ and hold no trace of $\\alpha$ and $\\beta$. See the collapse in the scene. Bob gets the state only as Alice’s copy is erased. At no moment do two copies exist.</p>
<p>No-cloning also blocks a faster-than-light trick. If Bob could clone his qubit many times, he might hope to learn something from it before the bits arrive. He cannot, and in any case his state is $I/2$ for every choice Alice makes.</p>`,
    },
    {
      title: 'What does not happen',
      html: `<p><strong>No matter moves.</strong> Bob’s qubit was always his. It was made alongside Alice’s half of the pair and sent to him in advance. What changes is its state.</p>
<p><strong>Nothing goes faster than light.</strong> Bob cannot use his qubit until two classical bits reach him. Those bits travel at the speed of light or slower. The scene lets you slow them down. Nothing Bob can measure changes before they land.</p>
<p><strong>No information about the state is revealed.</strong> The four outcomes are equally likely whatever $|\\psi\\rangle$ is. An eavesdropper who copies the two bits learns nothing about $\\alpha$ or $\\beta$.</p>
<p><strong>It is not a transporter.</strong> Teleporting a large object would need its exact quantum state, a matching entangled resource of enormous size, and near-perfect operations. Nobody knows how to do this, and nothing on this page suggests it is practical.</p>`,
    },
    {
      title: 'From a 1993 paper to a satellite',
      html: `<p>Charles Bennett, Gilles Brassard, Claude Crépeau, Richard Jozsa, Asher Peres and William Wootters proposed the protocol in <em>Physical Review Letters</em> in 1993. The paper’s title already said the key point: teleporting an unknown state via dual classical and entangled channels.</p>
<p>The first experiments used photons. Dik Bouwmeester, Anton Zeilinger and colleagues in Innsbruck published in <em>Nature</em> in December 1997. They could recognise only one of the four Bell outcomes, so the protocol worked in about one run out of four. A group in Rome led by Francesco De Martini reported a related scheme at about the same time, published in 1998. It used two properties of the same photon, so the input was not an independent particle. In 1998 a Caltech group led by Akira Furusawa and Jeff Kimble teleported a continuous light-field state with all outcomes used.</p>
<p>Distances grew. In 2012 a team led by Zeilinger teleported photon states 143 km between La Palma and Tenerife in the Canary Islands. In 2017 Ji-Gang Ren and colleagues on the Chinese team led by Jian-Wei Pan teleported single-photon qubits from a ground station in Ngari, Tibet, to the Micius satellite. Distances ran up to about 1,400 km, with an average fidelity of 0.80 ± 0.01, above the classical 2/3.</p>`,
    },
    {
      title: 'Networks and repeaters',
      html: `<p>Photons in optical fibre are lost at a rate that grows exponentially with distance. A quantum signal cannot simply be amplified, because amplifying would mean copying, which no-cloning forbids.</p>
<p>The fix is to teleport entanglement itself. Make Bell pairs over two short links, A to B and B to C. At B, perform the same Bell measurement Alice uses here on the two middle qubits. A and C are now entangled, though they never interacted. This is <strong>entanglement swapping</strong>, first demonstrated with photons in 1998. A <strong>quantum repeater</strong>, proposed by Hans Briegel, Wolfgang Dür, Ignacio Cirac and Peter Zoller in 1998, chains swapping with purification to cover long distances.</p>
<p>Teleportation also moves data inside quantum computers. Gate teleportation lets a hard gate be prepared offline and consumed later. It is a key idea in measurement-based quantum computing and in linking separate processors. Working long-distance quantum repeaters are still a research goal, not a finished technology.</p>`,
    },
  ],
  challenges: [
    {
      id: 'perfect',
      title: 'A perfect teleport',
      prompt: 'Choose any state and complete the protocol with Bob’s fidelity above 0.99.',
      hint: 'Keep the pair noise at zero and the correction on. Press Run, or Step through all eight gates.',
      check: (s) => s.touched === true && s.done === true && s.forget === false && (s.fidelity as number) > 0.99,
    },
    {
      id: 'forget',
      title: 'Forget the correction',
      prompt: 'Skip Bob’s correction and average over 50 random states. Show the mean fidelity falls well below 2/3.',
      hint: 'Tick Forget the correction, then press Average over 50 states. The mean lands near 1/2, the same as guessing. Deep Dive explains why it is not 2/3.',
      check: (s) => s.batchForget === true && s.batchN === 50 && (s.batchMean as number) < 0.62,
    },
    {
      id: 'mixed',
      title: 'Mixed before the bits arrive',
      prompt: 'Stop the protocol after Alice has measured but before Bob has her bits. Confirm Bob’s qubit is maximally mixed.',
      hint: 'Press Reset, then Step five times. Bob’s arrow shrinks to the centre and |r_B| reads 0.',
      check: (s) => s.touched === true && s.running === false && s.step === 5 && (s.bobLen as number) < 0.01,
    },
    {
      id: 'classical',
      title: 'The classical limit',
      prompt: 'Find the pair noise where teleportation fidelity falls to 2/3, the best a classical scheme can do. Finish a run there.',
      hint: 'The fidelity is 1 − λ/2. Solve for 2/3, set the slider, and run the protocol with the correction on.',
      check: (s) => s.done === true && s.forget === false && Math.abs((s.fidelity as number) - 2 / 3) < 0.006,
    },
  ],
  caveats: `<p>The qubits are ideal. Gates are exact and instant, and only the shared pair is noisy. Real experiments also lose photons, make imperfect Bell measurements and suffer detector noise. Early photonic experiments could only recognise some of the four outcomes.</p>
<p>The Werner model is the simplest noise, white noise mixed into a perfect pair. Real pairs have noise with structure, Then the fidelity depends on the input state, and the formula $F = (1 + 2F_\\text{pair})/3$ holds only for the average over all input states.</p>
<p>The scene shrinks the distance between Alice and Bob to a few metres of screen. The packet speed is a visual choice. The only physical rule it encodes is that the bits never beat light. The "average over 50 states" button imagines 50 fresh runs, each with its own random outcome.</p>`,
  further: [
    { label: 'Bennett et al., Teleporting an unknown quantum state (1993)', url: 'https://doi.org/10.1103/PhysRevLett.70.1895' },
    { label: 'Bouwmeester et al., Experimental quantum teleportation (1997)', url: 'https://doi.org/10.1038/37539' },
    { label: 'Ren et al., Ground-to-satellite quantum teleportation (2017)', url: 'https://arxiv.org/abs/1707.00934' },
    { label: 'Quantum teleportation on Wikipedia', url: 'https://en.wikipedia.org/wiki/Quantum_teleportation' },
  ],
};
