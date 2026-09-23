import type { TopicContent } from '../../core/types.ts';

export const content: TopicContent = {
  intuition: `
<p class="lead">Put a hot drink on the table and it cools. Nobody has ever seen a lukewarm drink heat itself up while the room gets colder. Heat flows one way. That one-way rule is the <strong>second law of thermodynamics</strong>. It is the law that gives time its direction in everyday life.</p>
<p>Yet the molecules obey Newton's laws, and those work just as well backwards. So where does the arrow come from? Ludwig Boltzmann's answer was counting. There are vastly more ways to be mixed and lukewarm than to be sorted and hot on one side. Left alone, a gas wanders into the overwhelming majority of arrangements and stays there. <strong>Entropy</strong> is a measure of how many arrangements look the same from outside.</p>
<p>In 1867 James Clerk Maxwell imagined a tiny being who guards a trapdoor in a wall. It lets fast molecules through one way and slow ones the other way. The right side heats up, the left cools down, and no work seems to have been done. The second law looks broken.</p>
<p>In the scene, particles are coloured by speed: <strong>blue</strong> is slow, <strong>white</strong> is typical, <strong>amber and red</strong> are fast. The glowing eye is the demon. Watch the door flash green each time it opens, and watch the two temperature bars in the corner drift apart.</p>
<p>The catch took a century to find. The demon has to <em>remember</em> what it saw, at least one bit per decision. A memory is a physical thing. To keep working, the demon must eventually wipe it clean, and Rolf Landauer showed in 1961 that erasing one bit must release at least $k_B T \\ln 2$ of heat. The ledger in the corner keeps that account. The gas never loses more entropy than the demon's memory must pay back.</p>
<p>Switch to the <strong>Mixing</strong> experiment for the other half of the story. Two colours of gas mix and never unmix. Press <strong>Reverse velocities</strong> and, if you are quick and perfectly precise, they do unmix. Add the smallest error and they do not.</p>`,
  tryFirst: [
    'Watch the <b>temperature bars</b> in the corner. The sorter demon makes the right side hotter within a few seconds.',
    'Set <b>Demon</b> to <b>Off</b>. The door stays open and the two temperatures drift back together.',
    'Try the <b>Pressure</b> demon. It lets particles through in one direction only, so they pile up on the right.',
    'Switch <b>Experiment</b> to <b>Mixing</b>. After about two seconds press <b>Reverse velocities</b> with noise at zero and watch the colours separate again.',
  ],
  equation: {
    tex: 'S = k_B \\ln W, \\qquad \\Delta S_{\\text{erase}} \\ge k_B \\ln 2 \\ \\text{per bit}',
    caption: 'Boltzmann’s entropy counts arrangements. Landauer’s bound says what forgetting costs. Together they balance the demon’s books.',
    terms: [
      { tex: 'S', name: 'Entropy', meaning: 'How many microscopic arrangements fit what you see, on a log scale. The ledger shows how far the gas has dropped below its maximum entropy.', param: 'sgas' },
      { tex: 'W', name: 'Number of microstates', meaning: 'Arrangements of positions and velocities that look the same from outside. Mixing two gases multiplies $W$ by about $2^N$, because each particle can now be on either side.', param: 'mix' },
      { tex: 'k_B', name: 'Boltzmann constant', meaning: 'Turns a count into thermodynamic units: $1.380649\\times10^{-23}$ J/K. The scene works in units where $k_B = 1$, so temperature is energy per particle.', param: 'T0' },
      { tex: '\\ln 2 \\ \\text{per bit}', name: 'One bit of memory', meaning: 'Each door decision is recorded as one bit, a yes or a no. The bits readout counts them.', param: 'bits' },
      { tex: '\\Delta S_{\\text{erase}}', name: 'Cost of erasing', meaning: 'Entropy that must go into the surroundings when the memory is wiped, as heat of at least $k_B T \\ln 2$ per bit of information. Press Erase memory to pay it.', param: 'landauer' },
    ],
  },
  physicsNotes: `
<h3>Temperature and the speed distribution</h3>
<p>Temperature is average kinetic energy. For point particles in three dimensions, $\\langle \\tfrac12 m v^2 \\rangle = \\tfrac32 k_B T$. Each half of the box gets its own temperature this way. After a few collisions per particle, speeds settle into the Maxwell–Boltzmann distribution</p>
$$f(v) = 4\\pi v^2 \\left(\\frac{m}{2\\pi k_B T}\\right)^{3/2} e^{-m v^2 / 2 k_B T}.$$
<p>The inset draws a histogram of each half against this curve. Press Reset with <b>Start with equal speeds</b> on. Every particle starts at the same speed, so the histogram is a single spike. Watch it spread into the curve. The KS readout measures the largest gap between the two.</p>
<h3>How the ledger counts entropy</h3>
<p>For an ideal gas, $W \\propto V^N E^{3N/2}$ up to factors that do not change here. So each half has $S_h = N_h k_B \\left[\\ln(V_h/N_h) + \\tfrac32 \\ln(E_h/N_h)\\right]$ plus a constant per particle. The ledger compares the two halves with the most likely state of the same gas, with the same total energy and particle number spread evenly:</p>
$$\\Delta S_{\\text{gas}} = S_L + S_R - S_{\\text{eq}} \\le 0.$$
<p>The demon records one bit per decision. By the Landauer and Bennett argument, the gas entropy drop can never exceed $k_B \\ln 2$ times the information the demon holds. The ledger checks this live. It uses the Shannon content of the record, $H(p)$ bits per decision where $p$ is the fraction of doors opened, because a clever demon could compress its memory before erasing it.</p>
<h3>How the simulation works</h3>
<p>The particles are hard spheres. The code finds the exact moment of every collision and wall hit and handles them in time order, so energy is conserved to round-off and the motion can be run backwards. The energy drift readout is the check.</p>`,
  deep: [
    {
      title: 'Counting: why entropy grows and why it fluctuates',
      html: `<p>Take $N$ particles, half amber and half cyan. With the colours sorted into two halves there is one way to do it. Once mixed, any particle can be anywhere. The number of colour arrangements is $W = \\binom{N}{N/2}$, and Stirling's formula gives</p>
$$\\ln W \\approx N \\ln 2 - \\tfrac12 \\ln\\frac{\\pi N}{2}.$$
<p>So mixing raises entropy by $N k_B \\ln 2$. That is Gibbs' mixing entropy, and it is what the Mixing readout estimates by counting colours in 16 cells. For 400 particles, the sorted state is one arrangement in about $2^{400}$. It is not forbidden to return there. It is just absurdly unlikely.</p>
<p>Smaller departures happen all the time. Einstein turned Boltzmann's formula around: the chance of a fluctuation that lowers the entropy by $\\Delta S$ is about $e^{-\\Delta S/k_B}$. The two halves of the box have two quantities that can fluctuate, the particle count and the energy on one side. So with no demon the ledger's entropy drop averages $1\\,k_B$, and it exceeds $s\\,k_B$ with probability $e^{-s}$. The test suite confirms both numbers. This is why the ledger treats drops below about $3\\,k_B$ as ordinary noise.</p>`,
    },
    {
      title: 'Maxwell’s thought experiment and Szilard’s engine',
      html: `<p>Maxwell described his sorting being in a letter to Peter Guthrie Tait in December 1867, and in his 1871 book <em>Theory of Heat</em>. William Thomson (Lord Kelvin) gave it the name <em>demon</em> in 1874. Maxwell's point was that the second law is statistical. It holds for crowds of molecules, not for each one.</p>
<p>Leo Szilard sharpened the puzzle in 1929 with a gas of just one molecule. Slide a partition into the middle of the box. Find out which side the molecule is on. Then let it push the partition like a piston. That extracts $k_B T \\ln 2$ of work from one bit of knowledge. Szilard argued that the measurement itself must cost at least $k_B \\ln 2$ of entropy to save the second law. This was the first link between information and thermodynamics.</p>
<p>The demon in this scene is far less efficient than Szilard's. Each decision is worth one bit, but moving one particle between two large, nearly equal halves lowers the entropy by only a tiny amount. The ledger's margin, usually a factor of several or more, shows how much room there is. The second law needs only the inequality, not a tight one.</p>`,
    },
    {
      title: 'Landauer and Bennett: forgetting is what costs',
      html: `<p>For decades people assumed the demon's <em>measurement</em> was the costly step. In 1961 Rolf Landauer at IBM looked at computing instead. He showed that erasing information, a logically irreversible operation, must release at least $k_B T \\ln 2$ of heat per bit into the surroundings. Resetting a bit squeezes two possible states into one. The lost entropy has to go somewhere.</p>
<p>In 1982 Charles Bennett closed the loop. He showed that a measurement can in principle be done reversibly, with no minimum cost. The demon can observe for free. What it cannot do is keep working forever. Its memory fills up. To reuse it, the demon must erase, and erasure pays at least what the sorting gained.</p>
$$-\\Delta S_{\\text{gas}} \\;\\le\\; k_B \\ln 2 \\times (\\text{bits recorded}) \\;\\le\\; \\Delta S_{\\text{erase}}.$$
<p>At room temperature, $k_B T \\ln 2 \\approx 2.9\\times10^{-21}$ J, about 0.018 eV. Today's chips dissipate several orders of magnitude more per logic operation, so the Landauer limit is a floor for the far future, not a limit on present hardware. In 2008 Takahiro Sagawa and Masahito Ueda put the whole argument on a modern footing. With feedback, the extracted work is bounded by $k_B T$ times the mutual information the demon gained.</p>`,
    },
    {
      title: 'Experiments: erasing a real bit',
      html: `<p>In 2012 Antoine Bérut, Sergio Ciliberto, Eric Lutz and colleagues tested Landauer's principle directly. They trapped a single glass bead a couple of micrometres across in a laser trap with two wells. Left well meant 0 and right well meant 1. They then erased the bit. They lowered the barrier and pushed the bead with a controlled force, so it always ended on one side.</p>
<p>The heat released, averaged over many cycles, went down as the erasure was done more slowly. For slow cycles it approached the Landauer bound $k_B T \\ln 2$, and it stayed at or above it within the measurement error, as predicted. The paper appeared in <em>Nature</em>. Related experiments have since used nanomagnets and single electrons. In 2010 Shoichi Toyabe and colleagues built a real Szilard-style engine. It used feedback on a rotating colloidal particle to turn information into free energy.</p>`,
    },
    {
      title: 'Loschmidt’s objection and the arrow of time',
      html: `<p>In 1876 Josef Loschmidt raised a sharp objection to Boltzmann. Newton's laws are time-reversible. Take any history in which entropy rises, reverse every velocity, and you get an equally valid history in which entropy falls. So how can mechanics alone prove that entropy always grows?</p>
<p>The Mixing experiment lets you do Loschmidt's reversal. With zero noise, the code reverses every velocity exactly and the gases unmix, returning to their start within round-off. Add a tiny random error and the unmixing fails. Hard-sphere gases are chaotic. Each collision multiplies small errors by a factor of roughly the mean free path over the particle size. With the settings here that factor is around ten, so after ten or so collisions an error of $10^{-9}$ becomes as large as the box. Even the computer's own $10^{-16}$ round-off wins if you wait long enough before reversing.</p>
<p>The modern resolution has two parts. First, entropy-lowering histories exist but need impossibly precise conditions, as you can see. Second, the arrow needs a low-entropy start. Our own arrow of time is commonly traced to a very low-entropy early universe, sometimes called the past hypothesis. Why the universe began that way is still an open question.</p>`,
    },
  ],
  challenges: [
    {
      id: 'hot-cold',
      title: 'Sort the gas',
      prompt: 'With the temperature sorter running, make the two halves differ in temperature by more than 20% of their average.',
      hint: 'A bigger door gives the demon more chances per second. Watch the ΔT readout.',
      check: (s) => s.touched === true && s.exp === 'demon' && s.demon === 'sorter' && (s.dT as number) > 0.2,
    },
    {
      id: 'pay-up',
      title: 'Pay the bill',
      prompt: 'Let a demon lower the gas entropy by more than $3\\,k_B$, beyond ordinary noise. Then press Erase memory and confirm the erasure cost is at least as large as the drop.',
      hint: 'Run either demon until the gas entropy drop passes 3, then press Erase memory. Compare the drop with the erasure cost in the ledger.',
      check: (s) => s.exp === 'demon' && (s.erased as number) > 0 && (s.sgas as number) > 3 && (s.landauer as number) >= (s.sgas as number),
    },
    {
      id: 'unmix',
      title: 'Run the film backwards',
      prompt: 'In the Mixing experiment, let the gases mix to at least 60%, then reverse the velocities with zero noise and watch them unmix below 15%.',
      hint: 'Reverse early, about two seconds after Reset. If you wait much longer, round-off error alone spoils the reversal. You can pause first.',
      check: (s) => s.exp === 'mix' && s.revNoise === 0 && (s.mixAtRev as number) >= 0.6 && (s.minMixAfter as number) <= 0.15,
    },
    {
      id: 'noise',
      title: 'Loschmidt loses',
      prompt: 'Now reverse with some noise, after mixing to at least 60%. Wait until the run should have returned to its start and see the mixing stay above 40%.',
      hint: 'Noise of $10^{-3}$ fails for sure. Smaller noise fails too if you wait a few seconds longer before reversing.',
      check: (s) => s.exp === 'mix' && (s.revNoise as number) > 0 && (s.mixAtRev as number) >= 0.6 && (s.tSinceRev as number) >= (s.revDur as number) && (s.minMixAfter as number) > 0.4,
    },
  ],
  caveats: `<p>The particles are identical hard spheres with no attraction. The gas is dilute, filling only 1 to 3 percent of the volume, so the ideal-gas entropy formula used by the ledger is a good but not exact approximation. The ledger's entropy is also coarse-grained. It tracks only how many particles and how much energy sit in each half.</p>
<p>The demon is idealised. It sees each arriving particle perfectly and acts instantly at no cost. The bit count is the minimal record of its decisions, not a model of a real memory. The doorway is a square hole in a wall of zero thickness. A particle whose centre lands inside the square passes through, and collisions with the door's edges are ignored.</p>
<p>Units are chosen so that $k_B = 1$ and the particle mass is 1. Temperatures and times are in these simulation units, not kelvin and seconds.</p>`,
  further: [
    { label: 'Landauer, Irreversibility and Heat Generation in the Computing Process (1961)', url: 'https://doi.org/10.1147/rd.53.0183' },
    { label: 'Bennett, The thermodynamics of computation: a review (1982)', url: 'https://doi.org/10.1007/BF02084158' },
    { label: 'Bérut et al., Experimental verification of Landauer’s principle, Nature (2012)', url: 'https://doi.org/10.1038/nature10872' },
    { label: 'Maxwell’s demon on Wikipedia', url: 'https://en.wikipedia.org/wiki/Maxwell%27s_demon' },
  ],
};
