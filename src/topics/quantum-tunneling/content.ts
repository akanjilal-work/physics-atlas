import type { TopicContent } from '../../core/types.ts';

export const content: TopicContent = {
  intuition: `
<p class="lead">Roll a ball at a hill too high for it and the ball rolls back. Every time. Fire an electron at a wall too high for it and some of it comes out the other side.</p>
<p>In quantum mechanics a particle travels as a <strong>wave</strong>. The scene draws that wave as a spiral, or helix. At each point along the track the wave has a size and a direction, so it twists around the axis. The fatter the spiral, the more likely the particle is there. The colour shows the phase, the angle of the twist.</p>
<p>The violet block is the wall, a <strong>potential barrier</strong>. The dashed amber line is the particle's energy. When the line sits below the top of the block, a classical ball cannot get over. Press play and watch the wave hit the wall.</p>
<p>Most of the wave bounces back. But the wave does not stop dead at the wall. Inside it, the spiral shrinks fast, like a sound fading through a door. If the wall is thin, a little of the wave is still alive at the far side, and it carries on. That leaked part is real. Put a detector there and sometimes the particle shows up.</p>
<p>The glow on the floor is $|\\psi|^2$, the chance of finding the particle at each spot. After the collision it splits into two lumps, one going back and one going forward. The particle is not split in half. Each time you look, you find it whole, in one lump or the other. The <b>Measure position</b> button does exactly that.</p>
<p>This leak is not a curiosity. It powers the Sun, sets how long radioactive nuclei live, stores the data in your phone, and lets microscopes see single atoms.</p>`,
  tryFirst: [
    'Press <b>Reset</b> and watch the packet hit the barrier. Read <b>T measured</b> once the two lumps separate, and compare it with <b>T predicted</b>.',
    'Slide the <b>barrier width a</b> from 1.2 to 2.4. The energy has not changed, but the leak drops about sixfold.',
    'Switch the camera to <b>Side view (probability)</b> for the classic textbook plot of $|\\psi|^2$, the wall, and the energy line.',
    'Wait until the packet has split, then press <b>Measure position</b>. The spread-out wave snaps to one spot. Reset and try again. Count how often it lands on the far side.',
  ],
  equation: {
    tex: 'T \\approx e^{-2\\kappa a}, \\quad \\kappa = \\frac{\\sqrt{2m(V_0 - E)}}{\\hbar}',
    caption: 'The tunneling probability falls exponentially with the barrier width and with the square root of the energy deficit.',
    terms: [
      { tex: 'T', name: 'Transmission probability', meaning: 'The chance that the particle ends up past the barrier. The scene measures it by adding up $|\\psi|^2$ on the far side.', param: 'T' },
      { tex: '\\kappa', name: 'Decay rate', meaning: 'How fast the wave shrinks inside the barrier. The wave falls as $e^{-\\kappa x}$, so its probability falls as $e^{-2\\kappa x}$.' },
      { tex: 'a', name: 'Barrier width', meaning: 'Thickness of the wall. It sits in the exponent, so small changes matter a lot.', param: 'width' },
      { tex: 'V_0', name: 'Barrier height', meaning: 'The energy a classical particle would need to climb over.', param: 'V0' },
      { tex: 'E', name: 'Particle energy', meaning: 'Set with the energy slider as a fraction of $V_0$. Only the gap $V_0 - E$ enters $\\kappa$.', param: 'energy' },
      { tex: '\\hbar', name: 'Reduced Planck constant', meaning: 'The scale of quantum effects. The simulation uses units where $\\hbar = m = 1$.' },
    ],
  },
  physicsNotes: `
<h3>Where the equation comes from</h3>
<p>The wave obeys the time-dependent Schrödinger equation</p>
$$i\\hbar\\,\\frac{\\partial \\psi}{\\partial t} = -\\frac{\\hbar^2}{2m}\\frac{\\partial^2 \\psi}{\\partial x^2} + V(x)\\,\\psi .$$
<p>Outside the barrier, a wave of energy $E$ oscillates as $e^{\\pm ikx}$ with $k = \\sqrt{2mE}/\\hbar$. Inside, where $V_0 > E$, the same equation gives real exponentials $e^{\\pm \\kappa x}$. That is the <strong>evanescent wave</strong>. It does not oscillate. It only decays.</p>
<p>Require $\\psi$ and its slope to join smoothly at both walls and you get the exact plane-wave result</p>
$$T = \\left[1 + \\frac{V_0^2 \\sinh^2(\\kappa a)}{4E(V_0 - E)}\\right]^{-1}.$$
<p>For a thick barrier, $\\sinh(\\kappa a) \\approx \\tfrac12 e^{\\kappa a}$ and this becomes $T \\approx 16\\,\\tfrac{E}{V_0}\\big(1 - \\tfrac{E}{V_0}\\big)\\,e^{-2\\kappa a}$. The exponential is the headline equation. The prefactor is of order one.</p>
<h3>From plane waves to a real packet</h3>
<p>The scene fires a Gaussian packet, not an endless plane wave. A packet of width $\\sigma$ is a blend of momenta with spread $1/(2\\sigma)$. Each momentum has its own $T(k)$. The <b>T predicted</b> readout averages $T(k)$ over that blend. A narrow packet in space has a broad range of energies, and its fastest parts leak through much more easily.</p>
<h3>How the simulation solves it</h3>
<p>The browser solves the Schrödinger equation on 2048 grid points with the split-step Fourier method. Each step applies half the potential, then the free motion in momentum space via a fast Fourier transform, then the other half of the potential. Each step is exactly unitary, so the <b>norm</b> readout stays at 1 to about nine decimals. Soft absorbing layers near both edges swallow the outgoing waves so they cannot wrap around. What they swallow on the right still counts as transmitted, and what they swallow on the left as reflected. <b>R measured</b> counts only the part on the near side that is moving away, found by a Fourier transform of that part. So it starts near zero and grows as the echo forms.</p>`,
  deep: [
    {
      title: 'Inside the wall: why a wave leaks and a ball does not',
      html: `<p>A classical ball has one position and one energy. Where $V > E$ its kinetic energy would be negative, which is impossible, so it turns around at the edge.</p>
<p>A wave has no single turning point. Its shape is set by the curvature rule $\\psi'' = \\tfrac{2m}{\\hbar^2}(V - E)\\psi$. Where $V < E$ the curvature bends $\\psi$ back toward zero, and it oscillates. Where $V > E$ the curvature pushes it away from zero, so the allowed solutions grow or decay. A wave hitting the wall from the left must join smoothly onto a decaying one. It cannot drop to zero in an instant, because that would need an infinite slope.</p>
<p>So a tail enters the wall. If the wall ends before the tail dies out, the tail matches onto an ordinary travelling wave on the far side. The amplitude there is about $e^{-\\kappa a}$ of the incoming one. The probability, its square, is about $e^{-2\\kappa a}$.</p>
<p>The exponential makes tunneling brutally sensitive to width. With $\\kappa = 1$, going from $a = 1$ to $a = 3$ cuts $T$ by $e^{-4}$, about 50 times. Try it with the width slider and watch <b>T predicted</b>.</p>`,
    },
    {
      title: 'Above-barrier reflection and resonant tunneling',
      html: `<p>Waves also do the opposite surprise. Set $E > V_0$. A classical ball would always cross. The wave partly <strong>reflects</strong>, because any sudden change in $V$ changes the wavelength, and a sudden change in wavelength sends back an echo. For a barrier with $E > V_0$,</p>
$$T = \\left[1 + \\frac{V_0^2 \\sin^2(k' a)}{4E(E - V_0)}\\right]^{-1}, \\qquad k' = \\frac{\\sqrt{2m(E - V_0)}}{\\hbar}.$$
<p>$T$ reaches exactly 1 only when a whole number of half wavelengths fits inside the barrier. Electrons scattering off noble gas atoms show this. It is called the Ramsauer and Townsend effect.</p>
<p>Two barriers can let through <em>more</em> than one. Between them the wave can bounce back and forth. At special energies, the quasi-bound levels of the gap, the bounces add up in step. The reflections from the two walls then cancel and $T$ rises toward 1, even though each wall alone blocks most of the wave. This is <strong>resonant tunneling</strong>. The resonance is sharp, so it only shows up clearly for a packet with a narrow spread of energies, which means a wide $\\sigma$. Resonant tunneling diodes, first proposed by Raphael Tsu and Leo Esaki in 1973, use exactly this effect.</p>`,
    },
    {
      title: 'Measurement and the Born rule',
      html: `<p>After the collision, $|\\psi|^2$ has two lumps. The Born rule says $|\\psi(x)|^2\\,dx$ is the probability of finding the particle in the small interval $dx$ when you look. It does not say the particle is spread out like a fluid. Every detection finds one whole particle at one place.</p>
<p>The <b>Measure position</b> button draws a random $x$ from $|\\psi|^2$ and then replaces $\\psi$ with a narrow packet at that spot. This jump is called collapse. Repeat the experiment many times from a reset and the fraction that lands on the far side approaches $T$.</p>
<p>This is the textbook picture of an ideal position measurement. Real detectors are messier. How and whether collapse really happens is still argued about, in debates over interpretations such as Copenhagen, many worlds, and pilot waves. All of them agree on these probabilities.</p>`,
    },
    {
      title: 'Tunneling in the real world',
      html: `<p><strong>Alpha decay.</strong> In 1928 George Gamow, and independently Ronald Gurney and Edward Condon, explained alpha decay as tunneling. An alpha particle rattles inside the nucleus behind a Coulomb barrier that it cannot climb. Because $T$ is exponential, modest changes in energy change lifetimes enormously. Polonium-212 has a half-life of about 0.3 microseconds. Thorium-232 has a half-life of about 14 billion years. That is a span of more than 20 orders of magnitude, while the alpha energies differ by only about a factor of two.</p>
<p><strong>The scanning tunneling microscope.</strong> Gerd Binnig and Heinrich Rohrer at IBM Zurich built it in 1981 and shared the 1986 Nobel Prize in Physics for it. A sharp tip hovers a nanometre above a surface. Electrons tunnel across the vacuum gap. The current changes by about ten times for each 0.1 nanometre of gap, so the tip can map single atoms.</p>
<p><strong>Electronics.</strong> Leo Esaki's tunnel diode (1957) relies on electrons tunneling through a very thin junction. Flash memory stores a bit as charge on an isolated floating gate. Writing and erasing push electrons through a thin oxide layer by tunneling, driven by a strong electric field.</p>
<p><strong>The Sun.</strong> Protons in the Sun's core have typical thermal energies around one thousand electronvolts. The electric repulsion between two protons forms a barrier near a million electronvolts. Classically they would almost never touch. Tunneling gives each close encounter a tiny chance to succeed, and with enormous numbers of collisions that is enough to keep the Sun shining.</p>`,
    },
    {
      title: 'How long does tunneling take?',
      html: `<p>This is a genuinely open and subtle question. There is no single time operator in quantum mechanics, so "the time spent inside the barrier" has several reasonable definitions that give different answers.</p>
<p>In 1962 Thomas Hartman found that the delay of the transmitted peak stops growing once the barrier is thick. Taken naively, that suggests a speed faster than light. It is not a signal travelling faster than light. The transmitted peak is built mostly from the front of the incoming packet, and no information outruns the leading edge.</p>
<p>Experiments now probe this. Attoclock studies of electrons tunneling out of atoms in strong laser fields have given conflicting results about whether the delay is close to zero. In 2020 Aephraim Steinberg's group in Toronto used the spin of rubidium atoms as a clock that only ticks inside a barrier and measured a finite time. The debate is about what these clocks mean, not about the Schrödinger equation, which all sides accept.</p>
<p>The simulation shows the full wave, so you can see the reshaping for yourself. It does not settle the question.</p>`,
    },
  ],
  challenges: [
    {
      id: 'leak',
      title: 'Mostly through',
      prompt: 'With a single barrier and $E < V_0$, get more than half the packet through: <b>T measured</b> above 0.5.',
      hint: 'Make the wall thin and low. Try $V_0 = 0.5$, width 0.4, and energy 0.8. Then wait for the packet to pass.',
      check: (s) => s.potential === 'barrier' && (s.EV as number) < 1 && (s.T as number) > 0.5,
    },
    {
      id: 'above',
      title: 'Bounce off nothing',
      prompt: 'Give the particle more energy than the barrier ($E > V_0$) and still reflect more than 10% of it.',
      hint: 'Use the <b>Step</b> potential with the energy slider at about 1.2. Or use a tall, wide barrier: $V_0 = 3$, width 2, energy 1.1.',
      check: (s) => (s.potential === 'barrier' || s.potential === 'double' || s.potential === 'step') && (s.EV as number) > 1 && (s.R as number) > 0.1,
    },
    {
      id: 'resonance',
      title: 'Two walls beat one',
      prompt: 'With the double barrier and $E < V_0$, transmit more than half the packet, at least 0.15 more than a single one of those walls would pass.',
      hint: 'Set $V_0 = 1$, width 1.2 and $\\sigma = 10$ (a narrow energy spread). Then nudge the energy slider around 0.64 while you watch <b>T predicted</b> jump. The packet leaks out of the gap slowly, so raise the speed and wait.',
      check: (s) => s.potential === 'double' && (s.EV as number) < 1 && (s.T as number) > 0.5 && (s.T as number) > (s.Tsingle as number) + 0.15,
    },
    {
      id: 'caught',
      title: 'Caught on the far side',
      prompt: 'With a barrier or double barrier and $E < V_0$, press <b>Measure position</b> and find the particle on the far side.',
      hint: 'Wait until the packet has clearly split into two lumps, then measure. The odds are about <b>T measured</b>. If it lands on the near side, press Reset and try again.',
      check: (s) => s.measureSide === 'right' && (s.measurePotential === 'barrier' || s.measurePotential === 'double') && (s.measureEV as number) < 1,
    },
  ],
  caveats: `<p>This is a one-dimensional model. Real particles move in three dimensions, and real barriers are not flat walls. The particle has no spin, and the physics is non-relativistic, which is fine for slow electrons and nuclei but not for particles near light speed.</p>
<p>The barriers have perfectly sharp edges. Real potentials are smooth, which lowers the above-barrier reflection a lot. On the grid, each sharp edge is smeared over one cell of width 0.12.</p>
<p>The box has absorbing edges so that waves leaving the scene do not wrap around. A tiny part of the wave may reflect off these layers. The measurement is an idealized instant collapse to a narrow Gaussian, and it samples only the part of the wave still on the grid. Units are chosen so that $\\hbar = m = 1$, so the numbers are not in electronvolts or nanometres.</p>`,
  further: [
    { label: 'Quantum tunnelling on Wikipedia', url: 'https://en.wikipedia.org/wiki/Quantum_tunnelling' },
    { label: 'Gamow, Zur Quantentheorie des Atomkernes (1928)', url: 'https://doi.org/10.1007/BF01343196' },
    { label: 'The Nobel Prize in Physics 1986 (Binnig and Rohrer)', url: 'https://www.nobelprize.org/prizes/physics/1986/summary/' },
    { label: 'Ramos et al., time spent by a tunnelling atom in the barrier (Nature, 2020)', url: 'https://doi.org/10.1038/s41586-020-2490-7' },
  ],
};
