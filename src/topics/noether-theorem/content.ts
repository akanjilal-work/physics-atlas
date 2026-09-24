import type { TopicContent } from '../../core/types.ts';

export const content: TopicContent = {
  intuition: `
<p class="lead">Do an experiment today or tomorrow. Do it here or across the room. Face north or face east. If the laws of physics do not care, something must be conserved.</p>
<p>That is Emmy Noether’s theorem, proved in 1918. Each <strong>continuous symmetry</strong> of the laws comes with a quantity that never changes. Laws that are the same at every moment conserve <strong>energy</strong>. Laws that are the same at every place conserve <strong>momentum</strong>. Laws that are the same in every direction conserve <strong>angular momentum</strong>.</p>
<p>The surprise is the direction of the logic. Conservation laws are not extra rules added to physics. They fall out of the symmetries, and the theorem says exactly which quantity goes with which symmetry.</p>
<p>The scene holds a few bodies that pull on each other. Three glowing rings at the back stand for the three symmetries: a <strong>clock</strong> for time, <strong>arrows</strong> for shifts in space, and a <strong>turning ring</strong> for rotation. Each ring lights up while its symmetry holds. The corner graph plots energy $E$, momentum $P$ and angular momentum $L$. Break a symmetry with a switch and its ring goes dark and its line starts to move. The other lines stay perfectly flat.</p>
<p>The faint <strong>ghost</strong> is a copy of the system that has been shifted, turned or started on a later clock. Small rings mark where the symmetry says each ghost body should be. While the symmetry holds, the ghost stays locked inside its rings forever. Break it and the ghost wanders off.</p>`,
  tryFirst: [
    'The scene opens with a pulsing force and a well at the centre. Two rings are dark, and <b>E</b> and <b>P</b> move in the corner graph. Only <b>L</b> is flat.',
    'Switch off <b>Pulsing strength</b>. The clock ring lights and the <b>E</b> line goes flat, even though the well still pushes the bodies around.',
    'Switch off the <b>well</b> as well. All three rings light and all three lines are flat. The shifted ghost now moves in perfect step with the real system.',
    'Turn on <b>Squashed forces</b>, set the ghost to <b>Rotation</b>, and watch the turned copy break away while momentum stays flat.',
  ],
  equation: {
    tex: '\\frac{\\partial L}{\\partial q} = 0 \\;\\Rightarrow\\; \\frac{d}{dt}\\frac{\\partial L}{\\partial \\dot q} = 0',
    caption:
      'If the Lagrangian does not change when you shift $q$, the momentum that goes with $q$ never changes. The table of pairs:<br>time shift $\\to$ energy $E$ &nbsp;·&nbsp; space shift $\\to$ momentum $\\mathbf P$ &nbsp;·&nbsp; rotation $\\to$ angular momentum $\\mathbf L$ &nbsp;·&nbsp; phase rotation, U(1) $\\to$ electric charge $Q$',
    terms: [
      { tex: 'L', name: 'Lagrangian', meaning: 'Kinetic energy minus potential energy, $L = T - V$. It holds all the physics of the system. Here it covers 2 to 4 bodies, their pairwise pull, and any extra terms you switch on.', param: 'n' },
      { tex: 'q', name: 'The shifted coordinate', meaning: 'The thing the symmetry moves: the position of the whole system, its angle, or the moment you start the clock. The ghost is the system with $q$ shifted.', param: 'ghost' },
      { tex: '\\frac{\\partial L}{\\partial q} = 0', name: 'The symmetry', meaning: 'Moving everything along $q$ leaves $L$ unchanged. The well at the origin spoils this for shifts. The system then has a place it prefers.', param: 'field' },
      { tex: '\\frac{\\partial L}{\\partial \\dot q}', name: 'Noether charge', meaning: 'The momentum that belongs to $q$. For a shift it is the total momentum $\\mathbf P$. For a rotation it is the angular momentum $L_z$.', param: 'pdrift' },
      { tex: '\\frac{d}{dt}(\\ldots) = 0', name: 'Conservation', meaning: 'The charge stays fixed for all time. The drift readouts show how far each charge has moved since the last reset. When its symmetry holds, the drift is round-off, below $10^{-9}$.', param: 'ldrift' },
    ],
  },
  physicsNotes: `
<h3>Why the theorem works</h3>
<p>Every trajectory obeys the Euler–Lagrange equation for each coordinate:</p>
$$\\frac{d}{dt}\\frac{\\partial L}{\\partial \\dot q} = \\frac{\\partial L}{\\partial q}$$
<p>If $L$ does not depend on $q$, the right side is zero and the left side says $\\partial L/\\partial \\dot q$ is constant. That is the headline equation. Noether’s version is more general. Suppose shifting every coordinate by $\\delta q_i = \\epsilon\\, K_i(q)$ leaves $L$ unchanged. Then this quantity is conserved:</p>
$$Q = \\sum_i \\frac{\\partial L}{\\partial \\dot q_i}\\, K_i(q)$$
<p>Shift every body by the same vector and $Q$ is the total momentum $\\mathbf P = \\sum m_i \\mathbf v_i$. Turn every body about the origin and $Q$ is the angular momentum $L_z = \\sum m_i (x_i v_{y,i} - y_i v_{x,i})$.</p>
<h3>Energy and the homogeneity of time</h3>
<p>Time works the same way. Define the energy function $E = \\sum_i \\dot q_i\\, \\partial L/\\partial \\dot q_i - L$. Along any trajectory,</p>
$$\\frac{dE}{dt} = -\\frac{\\partial L}{\\partial t}$$
<p>If the law has no clock in it, energy is conserved. The pulse switch puts a clock in. Every potential is multiplied by $f(t) = 1 + 0.3\\sin(1.1\\,t)$, so $dE/dt = f'(t)\\,V(q)$. The test suite checks this energy budget along a full run.</p>
<h3>What the simulation contains</h3>
<p>The bodies move in a plane. Each pair pulls with $U = K m_i m_j(\\sqrt{r^2 + a^2} - a)$. Close up this acts like a spring. Far away the pull levels off, so no body can escape. The well is a fixed bowl at the origin of the same shape. The squash switch replaces $y^2$ by $0.35\\,y^2$ in every distance, which makes the forces non-central.</p>
<p>The integrator is Yoshida’s fourth-order symplectic scheme with a fixed step of 0.002. Each stage either moves every body in a straight line or gives it a kick from equal and opposite pair forces. Both kinds of stage keep $\\mathbf P$ exactly, and with central forces they keep $L_z$ exactly too. So the symmetry is built into the numerics, and the only error left is round-off near $10^{-14}$. Energy is not kept exactly by any fixed-step method. A symplectic one keeps its error bounded instead of growing. Here it stays near $10^{-11}$.</p>`,
  deep: [
    {
      title: 'Emmy Noether, Göttingen and the 1918 paper',
      html: `<p>Emmy Noether was born in Erlangen in 1882. Her father Max was a mathematician at the university there. Women could not enrol as full students when she began, so she first attended lectures as a guest. She earned her doctorate at Erlangen in 1907 with a thesis on algebraic invariants.</p>
<p>In 1915 David Hilbert and Felix Klein invited her to Göttingen, then the leading centre of mathematics. They were working on Einstein’s new general relativity, and they were puzzled by how energy conservation worked in it. Noether was an expert on invariants, which was exactly the tool they needed. The faculty resisted giving a woman the right to lecture. Hilbert is reported to have answered that a university is not a bathhouse. For years she taught courses listed under Hilbert’s name. She gained the right to lecture in 1919.</p>
<p>Her paper <em>Invariante Variationsprobleme</em> was presented to the Göttingen Royal Society of Sciences by Klein in July 1918. It contains two theorems. The first links each continuous global symmetry to a conservation law. The second covers symmetries that can vary from point to point, like those of general relativity. There the would-be conservation law turns into an identity that holds automatically. That explained the puzzle Hilbert and Klein had raised.</p>
<p>Noether went on to reshape abstract algebra. Rings that obey her chain condition are still called Noetherian. In 1933 the Nazi government removed her from her post because she was Jewish. She moved to Bryn Mawr College in Pennsylvania and also lectured at the Institute for Advanced Study in Princeton. She died in 1935 after surgery. Einstein wrote in <em>The New York Times</em> that she was the most significant creative mathematical genius produced since the higher education of women began.</p>`,
    },
    {
      title: 'Why the theorem underpins modern physics',
      html: `<p>Before Noether, conservation laws were discovered one by one, from experiment. After her, they became consequences. You state the symmetries of a theory, and its conserved quantities follow.</p>
<p>Modern physics is now built in that order. The Standard Model is specified largely by its symmetries: the symmetries of spacetime, which give energy, momentum and angular momentum, and a set of internal symmetries, which give conserved charges. Baryon number is a subtler case. It comes from an accidental symmetry of the Standard Model and holds in every process seen so far, but theory predicts it can fail in extreme conditions.</p>
<p>The theorem also works in reverse as a diagnostic. When a quantity is found not to be conserved, some symmetry must be missing. When a symmetry is proposed, experiments can look for its conserved quantity.</p>
<p>In quantum mechanics the link becomes even tighter. A symmetry is an operator that commutes with the Hamiltonian, and that same operator is the conserved quantity. Momentum is the generator of translations, and the Hamiltonian itself is the generator of time translations.</p>`,
    },
    {
      title: 'Charge and phase symmetry: the road to gauge theory',
      html: `<p>Symmetries need not act on space and time. In quantum mechanics a particle is described by a complex wave $\\psi$. Multiplying it everywhere by the same phase, $\\psi \\to e^{i\\alpha}\\psi$, changes nothing measurable. This is a U(1) symmetry, a rotation in the complex plane of $\\psi$.</p>
<p>Noether’s theorem turns it into a conserved current. For the Schrödinger equation the conserved density is $|\\psi|^2$, so total probability never changes. For a charged field in quantum electrodynamics, the same current times the electron charge is the electric current, and the conserved quantity is <strong>electric charge</strong>.</p>
<p>Now ask for more. Let the phase $\\alpha(x)$ vary from place to place. The kinetic term then fails to be invariant, unless you add a new field that absorbs the change. That field is the electromagnetic potential $A_\\mu$. Demanding a local version of the charge symmetry forces light to exist. This is the idea of <a href="#/t/gauge-symmetry">gauge symmetry</a>, and it is the pattern behind every force in the Standard Model. It is also exactly the case Noether’s second theorem was written for.</p>`,
    },
    {
      title: 'Is energy conserved in an expanding universe?',
      html: `<p>Energy conservation is tied to one symmetry: the laws, and the stage they act on, must look the same at every moment. In general relativity the stage is spacetime itself, and it can change with time. An expanding universe is not the same today as it was yesterday. So Noether’s theorem does not give a conserved total energy for it.</p>
<p>What survives is <strong>local</strong> conservation. General relativity guarantees $\\nabla_\\mu T^{\\mu\\nu} = 0$. In any small region, energy and momentum change only by flowing across the boundary. Your laboratory, and the Solar System, conserve energy to superb precision, because spacetime is nearly static on those scales.</p>
<p>The trouble is adding up. To total the energy over a large curved region you must compare vectors at distant points, and curved spacetime gives no unique way to do that. A global total exists when spacetime has a time-translation symmetry, called a timelike Killing vector. The expanding universe does not have one.</p>
<p>The effects are concrete. Light from distant galaxies is stretched as space expands. Each photon’s energy falls in proportion to $1/a$, where $a$ is the scale factor. The number of photons in a region that grows with the expansion stays fixed. So the radiation energy in that region falls. Dark energy, if it is a cosmological constant, does the opposite. Its density stays fixed while the volume grows as $a^3$, so its energy in that region rises.</p>
<p>Can you rescue a global law by giving energy to the gravitational field? You can define such quantities, called pseudotensors, but they depend on the coordinates you choose. There is no single agreed answer. The honest summary is that energy is conserved locally, always, and globally only when spacetime has the symmetry that Noether’s theorem requires. For an isolated system in otherwise empty space, a well-defined total energy does exist, the ADM energy, and it is conserved.</p>`,
    },
    {
      title: 'Edge cases and fine print',
      html: `<p><strong>Only continuous symmetries.</strong> The theorem needs a symmetry you can apply in tiny amounts. Mirror reflection cannot be done a little at a time, so it gives no Noether charge. In quantum mechanics discrete symmetries do give conserved labels such as parity, but by a different argument.</p>
<p><strong>A crystal is only partly symmetric.</strong> A lattice looks the same only after shifts by whole lattice spacings. Momentum is then conserved only up to a multiple of a reciprocal lattice vector. This <em>crystal momentum</em> is why electrons and sound waves in solids obey modified collision rules.</p>
<p><strong>Friction is outside the frame.</strong> The theorem applies to systems described by an action. A damped oscillator has no simple time-independent Lagrangian that produces its friction, and its energy leaks into heat. Include the heat bath, and the total energy is conserved again.</p>
<p><strong>Symmetries of the equations are not always symmetries of the action.</strong> The theorem uses the action. Some symmetries only leave the equations of motion unchanged, and these need not produce a conserved quantity.</p>
<p><strong>The conserved quantity can depend on the choice of origin.</strong> In the scene $L_z$ is measured about the centre of the well. A central well keeps that $L_z$ fixed, but not the angular momentum about any other point. The symmetry picks out the point, and the point picks out the charge.</p>`,
    },
  ],
  challenges: [
    {
      id: 'all-three',
      title: 'Three flat lines',
      prompt: 'Make energy, momentum and angular momentum all conserved. Keep every drift below $10^{-9}$ for at least 10 time units.',
      hint: 'Switch off all three symmetry breakers. Each switch resets the run. Then wait until the clock readout passes 10.',
      check: (s) => !s.pulse && !s.field && !s.aniso && (s.t as number) >= 10 && (s.eDrift as number) < 1e-9 && (s.pDrift as number) < 1e-9 && (s.lDrift as number) < 1e-9,
    },
    {
      id: 'only-momentum',
      title: 'Break only momentum',
      prompt: 'Make total momentum drift by more than 5% while energy and angular momentum both stay conserved to $10^{-9}$. Run for at least 10 time units.',
      hint: 'You need a law that cares where the bodies are, but not when or in which direction. A round well does exactly that.',
      check: (s) => !!s.field && !s.pulse && !s.aniso && (s.t as number) >= 10 && (s.pDrift as number) > 0.05 && (s.eDrift as number) < 1e-9 && (s.lDrift as number) < 1e-9,
    },
    {
      id: 'ghost-rotation',
      title: 'Turn the ghost loose',
      prompt: 'Break rotational symmetry and make the rotated ghost drift more than 0.3 away from where the symmetry says it should be.',
      hint: 'Set the ghost to Rotation. Then switch on Squashed forces. A round well alone will not do it, since it keeps rotation symmetry.',
      check: (s) => s.ghost === 'rotation' && !!s.aniso && (s.gap as number) > 0.3,
    },
    {
      id: 'energy-survives',
      title: 'Energy survives',
      prompt: 'With 4 bodies, break only space symmetry and let the shifted ghost part from its marks by more than 0.5. Energy must still be conserved to $10^{-9}$ after 30 time units.',
      hint: 'Pick 4 bodies, turn on the well, and switch off the pulse and the squash. Leave the ghost on Space shift and wait.',
      check: (s) => s.n === 4 && !!s.field && !s.pulse && !s.aniso && s.ghost === 'space' && (s.gap as number) > 0.5 && (s.t as number) >= 30 && (s.eDrift as number) < 1e-9,
    },
  ],
  caveats: `<p>The bodies move in a plane and pull on each other with a made-up soft law, chosen so that nothing escapes. Noether’s theorem does not care about the details of the force. It only cares about its symmetries, so the lessons carry over to gravity and electromagnetism. The pulse, the well and the squash are hand-built switches, not models of real systems.</p>
<p>“Conserved” here means conserved to the precision of the computer. Momentum and angular momentum sit at round-off, near $10^{-14}$, because the integrator respects the symmetries stage by stage. Energy is held by a bounded integrator error near $10^{-11}$. The shifted ghost carries its own round-off, so its gap grows very slowly from about $10^{-13}$. The rotated and time-shifted ghosts are exact copies in floating point, so their gap stays at zero. The drift readouts take the largest change since the last reset.</p>
<p>The deep-dive statements about general relativity describe the mainstream view. The definition of gravitational energy in general spacetimes is still debated, and no simulation here tests it.</p>`,
  further: [
    { label: 'Noether’s theorem (Wikipedia)', url: 'https://en.wikipedia.org/wiki/Noether%27s_theorem' },
    { label: 'E. Noether, Invariant Variation Problems (1918), English translation by M. A. Tavel', url: 'https://arxiv.org/abs/physics/0503066' },
    { label: 'Emmy Noether (Wikipedia)', url: 'https://en.wikipedia.org/wiki/Emmy_Noether' },
    { label: 'J. Baez, Is energy conserved in general relativity?', url: 'https://math.ucr.edu/home/baez/physics/Relativity/GR/energy_gr.html' },
  ],
};
