import type { TopicContent } from '../../core/types.ts';

export const content: TopicContent = {
  intuition: `
<p class="lead">Two particles fly apart from one source. Each meets a detector that can be turned to any angle. Each detector only ever says + or −, at random. Yet the pairs of answers are linked more tightly than any story of pre-agreed answers allows.</p>
<p>Think of a pair of gloves sent in two boxes. Open one box, find a left glove, and you know the other is a right glove. Nothing strange there. The answer was set when the gloves were packed. In 1935 Einstein, Podolsky and Rosen argued that quantum particles must work the same way. If you can predict the far result with certainty, they said, it must have been fixed all along.</p>
<p>In 1964 John Bell showed that this idea can be tested. Give each side two possible settings. Any theory where the answers are packed in advance, and where one detector cannot affect the other, must keep a certain score $S$ at or below 2. Quantum mechanics predicts up to $2\\sqrt2 \\approx 2.83$. Experiments side with quantum mechanics.</p>
<p>In the scene, the glowing source in the middle sends out pairs. Each analyzer picks one of its two angles at random and lights green for + or red for −. The board in the corner keeps score. Switch the mode to <b>Local hidden variables</b> and every pair now carries a secret arrow that decides both answers. That model is as good as a local story can be. Watch its score stop at 2.</p>
<p>Here is the twist that keeps physics consistent. Each detector on its own sees a fair coin, 50/50, whatever the other side does. The link only shows up when the two lists of results are brought together and compared. So entanglement cannot be used to send a message.</p>`,
  tryFirst: [
    'Watch the <b>S</b> row on the tally board. The dot sits near 2.83, well past the local limit of 2.',
    'Switch <b>Mode</b> to <b>Local hidden variables</b>. Pulses now carry a small arrow, the hidden angle λ. The score falls back to 2.',
    'Set Bob\'s <b>b</b> equal to Alice\'s <b>a</b>. In Quantum mode those pairs always give opposite answers.',
    'Raise the <b>emission rate</b> and watch the error bars shrink as the pair count grows.',
  ],
  equation: {
    tex: "\\begin{gathered} S = E(a,b) - E(a,b') + E(a',b) + E(a',b') \\\\[4pt] |S| \\le 2 \\ \\text{(local)}, \\qquad |S| \\le 2\\sqrt2 \\ \\text{(quantum)} \\end{gathered}",
    caption: 'The CHSH inequality. Four correlations, measured on four sets of pairs, combine into one number that no local hidden-variable model can push past 2.',
    terms: [
      { tex: 'S', name: 'CHSH score', meaning: 'The signed sum of the four measured correlations. The tally board plots $|S|$ with a one-standard-error bar.', param: 'S' },
      { tex: 'E(a,b)', name: 'Correlation', meaning: 'The average of the product $AB$ of the two ±1 outcomes. It is $+1$ if they always agree and $-1$ if they always disagree. For the singlet, $E(a,b) = -\\cos(a-b)$.', param: 'Eab' },
      { tex: "a,\\ a'", name: "Alice's settings", meaning: 'The two angles of the left analyzer. For each pair one of them is chosen at random.', param: 'a' },
      { tex: "b,\\ b'", name: "Bob's settings", meaning: 'The two angles of the right analyzer, also chosen at random for each pair.', param: 'b' },
      { tex: '2', name: 'Local bound', meaning: 'The most any model with pre-set answers and no influence between the sides can reach. Switch the mode to see such a model hit it.', param: 'mode' },
      { tex: '2\\sqrt2', name: 'Tsirelson bound', meaning: 'The quantum maximum, about 2.83. It is reached at the optimal angles: $a = 0°$, $a\' = 90°$, $b = 45°$, $b\' = 135°$.', param: 'preset' },
    ],
  },
  physicsNotes: `
<h3>The quantum prediction</h3>
<p>The two spins start in the singlet state</p>
$$|\\psi^-\\rangle = \\tfrac{1}{\\sqrt2}\\left(|{\\uparrow\\downarrow}\\rangle - |{\\downarrow\\uparrow}\\rangle\\right).$$
<p>An analyzer at angle $a$ measures the spin along a unit vector $\\hat a$ at that angle about the beam. Quantum mechanics gives $E(a,b) = \\langle\\psi^-|(\\boldsymbol\\sigma\\cdot\\hat a)(\\boldsymbol\\sigma\\cdot\\hat b)|\\psi^-\\rangle = -\\hat a\\cdot\\hat b = -\\cos(a-b)$. The chance that both sides give the same answer is $\\sin^2\\!\\big((a-b)/2\\big)$. At the optimal angles each correlation has size $1/\\sqrt2$, so $|S| = 4/\\sqrt2 = 2\\sqrt2$.</p>
<h3>Why local models stop at 2</h3>
<p>Suppose each pair carries some hidden data $\\lambda$, and each outcome depends only on the local setting and $\\lambda$: $A(a,\\lambda)$ and $B(b,\\lambda)$, each $\\pm1$. For one pair,</p>
$$A(a)\\big[B(b) - B(b')\\big] + A(a')\\big[B(b) + B(b')\\big] = \\pm 2,$$
<p>because one bracket is 0 and the other is $\\pm2$. Averaging over $\\lambda$ gives $|S| \\le 2$. The step that matters is that $\\lambda$ does not depend on the settings chosen. That is why real tests pick the settings at random, late, and far apart.</p>
<h3>The local model in the scene</h3>
<p>Each pair carries a random angle $\\lambda$. Alice answers $\\operatorname{sign}\\cos(a-\\lambda)$ and Bob answers $-\\operatorname{sign}\\cos(b-\\lambda)$. It reproduces the perfect anticorrelation at equal angles and the 50/50 marginals. Its correlation is a straight-line zigzag, $E = -(1 - 2|a-b|/\\pi)$, instead of a cosine. At the optimal angles it gives exactly $|S| = 2$ and never more.</p>
<h3>How the simulation computes it</h3>
<p>Every pair is a separate random event. At arrival, each side picks one of its two settings with a fair coin. In Quantum mode the pair is drawn from the joint singlet probabilities. In local mode the two answers come from the hidden angle alone. The board shows the running $E$ for each setting pair with its standard error $\\sqrt{(1-E^2)/n}$, and $S$ with the errors added in quadrature. The <b>vs theory</b> readout says how many standard errors the measured $S$ sits from the exact prediction. It should hover within about ±2.</p>
<h3>A note on photons</h3>
<p>Most experiments use polarization-entangled photons. There a polarizer turned by $\\theta$ plays the role of the analyzer and the correlation is $\\pm\\cos 2(\\alpha-\\beta)$. All angles are halved, so the optimal settings are 0°, 45°, 22.5° and 67.5°. This page uses spins throughout.</p>`,
  deep: [
    {
      title: 'Deriving the bound, and Bell\'s original inequality',
      html: `<p>Bell's 1964 paper assumed perfect anticorrelation at equal settings. From locality alone he derived</p>
$$\\big|E(a,b) - E(a,c)\\big| \\le 1 + E(b,c).$$
<p>Real detectors are never perfect, so perfect anticorrelation cannot be checked. In 1969 Clauser, Horne, Shimony and Holt found the form used here. It needs no perfect correlations and uses only measured averages.</p>
<p>The proof above works for each $\\lambda$ separately, so it covers every local model, however clever. It also covers stochastic models, where $\\lambda$ only sets the odds of each answer. Those can be rewritten as deterministic models with extra hidden randomness.</p>
<p>The assumptions are worth stating plainly. <strong>Locality</strong>: Alice's result does not depend on Bob's setting. <strong>Realism</strong> in the weak sense of pre-set answers or pre-set odds. <strong>Measurement independence</strong>: the hidden data are not correlated with the settings that will be chosen. Drop any one and the bound no longer follows.</p>`,
    },
    {
      title: 'The quantum maximum: Tsirelson\'s bound',
      html: `<p>Quantum mechanics beats 2, but it does not reach the logical maximum of 4. In 1980 Boris Tsirelson proved that $|S| \\le 2\\sqrt2$ for any quantum state and any measurements. One short route: the operator $\\hat S$ built from the four observables obeys $\\hat S^2 = 4 + [A,A'][B,B']$, and each commutator has norm at most 2.</p>
<p>For the singlet the maximum needs the four directions spaced 45° apart around the circle. Try other spacings in the scene. Equal angles give strong correlations but a poor $S$. The sweet spot is a compromise.</p>
<p>Why not 4? A hypothetical "PR box" reaches $S = 4$ and still cannot send signals. Why nature stops at $2\\sqrt2$ is an open research question. Several information-based principles have been proposed. None is settled.</p>`,
    },
    {
      title: 'From EPR to the Nobel Prize',
      html: `<p><strong>1935.</strong> Einstein, Podolsky and Rosen argued that quantum mechanics must be incomplete. Their example used position and momentum. In 1951 David Bohm recast it with two spins, the version used here.</p>
<p><strong>1964.</strong> John Bell showed that any local hidden-variable completion would disagree with quantum mechanics in measurable ways.</p>
<p><strong>1969 and 1972.</strong> Clauser, Horne, Shimony and Holt turned Bell's idea into a practical test. Stuart Freedman and John Clauser ran it in 1972 with photon pairs from calcium atoms. They found a violation.</p>
<p><strong>1982.</strong> Alain Aspect, Philippe Grangier and Gérard Roger measured $S = 2.697 \\pm 0.015$. Later that year Aspect, Jean Dalibard and Roger switched the analyzer settings while the photons were in flight. In 1998 Gregor Weihs and colleagues in Anton Zeilinger's group used truly random, fast switching with detectors 400 m apart.</p>
<p><strong>2015.</strong> Three loophole-free tests closed the locality and detection loopholes in one experiment. Hensen and colleagues in Delft entangled electron spins in diamond 1.3 km apart and found $S = 2.42 \\pm 0.20$ over 245 trials. Groups at NIST (Shalm et al.) and in Vienna (Giustina et al.) used photons and very efficient detectors.</p>
<p><strong>2022.</strong> Aspect, Clauser and Zeilinger shared the Nobel Prize in Physics "for experiments with entangled photons, establishing the violation of Bell inequalities and pioneering quantum information science".</p>`,
    },
    {
      title: 'No signalling, and what entanglement is good for',
      html: `<p>Alice's chance of + is exactly 1/2 whatever Bob does. From the joint probabilities, $P(A{=}+) = \\tfrac12\\sin^2\\tfrac{a-b}2 + \\tfrac12\\cos^2\\tfrac{a-b}2 = \\tfrac12$, with no trace of $b$. This holds for every entangled state and every measurement, and it is called the no-signalling theorem. Alice alone sees fair coin flips. The correlation appears only when the two records are compared, and that comparison travels no faster than light.</p>
<p>The scene checks this live. The readout <b>P(A=+) given b | b′</b> splits Alice's results by Bob's choice. Both stay near 0.50.</p>
<p><strong>Quantum key distribution.</strong> In 1991 Artur Ekert proposed the E91 protocol. Alice and Bob measure entangled pairs and keep the results at matching settings as a shared secret key. They use the other settings to compute $S$. An eavesdropper who learns the outcomes in advance acts like a hidden variable and drags $S$ down toward 2. A large $S$ certifies the key is private.</p>
<p><strong>Teleportation.</strong> A shared entangled pair plus two ordinary classical bits lets Alice transfer an unknown quantum state to Bob. It was proposed by Bennett and colleagues in 1993 and first shown with photons in Innsbruck in 1997. The classical bits are essential, which again rules out faster-than-light messages.</p>`,
    },
    {
      title: 'Loopholes and interpretations, briefly',
      html: `<p><strong>Locality loophole.</strong> If one detector could learn the other's setting in time, a local model could fake the result. The fix is to choose settings at random after the pair is emitted, with the stations far enough apart that no light-speed signal can connect them.</p>
<p><strong>Detection loophole.</strong> If many particles go undetected, a local model can hide in which ones get counted. The fix is detectors efficient enough that the violation holds for all pairs.</p>
<p><strong>Freedom of choice.</strong> If the setting choices were correlated with the hidden variables from the start, any result could be faked. This cannot be fully closed. Experiments have pushed the random choices back to human input and to light from distant stars. The idea that everything was pre-arranged, called superdeterminism, is logically possible. It is also very hard to test, and most physicists do not adopt it.</p>
<p><strong>Interpretations.</strong> The experiments rule out local hidden variables. They do not pick an interpretation. Copenhagen-style views accept correlations with no local explanation. Pilot-wave theory keeps definite outcomes but is explicitly nonlocal. Many-worlds avoids a single outcome at each station, so Bell's derivation does not apply in the usual way. All of them predict the same numbers shown here.</p>`,
    },
  ],
  challenges: [
    {
      id: 'beat-two',
      title: 'Beat the local limit',
      prompt: 'Start a fresh tally in Quantum mode and collect at least 2000 pairs with a running $|S|$ above 2.5.',
      hint: 'Press Optimal CHSH angles, then raise the emission rate. The error bar on S shrinks like 1/√N.',
      check: (s) => s.seeded === false && s.mode === 'quantum' && (s.pairs as number) >= 2000 && (s.absS as number) > 2.5,
    },
    {
      id: 'lhv-stuck',
      title: 'The local model hits a wall',
      prompt: 'In Local hidden variables mode, with angles where quantum theory predicts $|S| \\ge 2.5$, collect 2000 pairs and show $|S|$ stays at 2 within the error bar.',
      hint: 'Use the optimal angles and switch the mode. The local model reaches exactly 2 there and no further, so the dot stays inside the shaded limit.',
      check: (s) =>
        s.seeded === false && s.mode === 'lhv' && (s.pairs as number) >= 2000 && (s.Squantum as number) >= 2.5 &&
        (s.absS as number) <= 2 + 2 * (s.sigmaS as number),
    },
    {
      id: 'anti',
      title: 'Perfect opposites',
      prompt: 'In Quantum mode, set one of Bob\'s angles equal to one of Alice\'s and collect 100 pairs at that setting. Their correlation should be −1.',
      hint: 'Set b = a, for example both at 0°. For those pairs every + on one side meets a − on the other.',
      check: (s) => s.mode === 'quantum' && (s.eqN as number) >= 100 && (s.eqE as number) <= -0.99,
    },
    {
      id: 'no-signal',
      title: 'No message gets through',
      prompt: 'Collect a fresh Quantum tally with at least 800 pairs for each of Bob\'s settings, with Bob\'s two angles at least 90° apart. Alice\'s P(+) must stay within 0.05 of 0.5 for both.',
      hint: 'Watch the readout P(A=+) given b | b′. Bob\'s choice changes the correlations but not Alice\'s own statistics.',
      check: (s) =>
        s.seeded === false && s.mode === 'quantum' && (s.bobSep as number) >= 89.5 && (s.nB as number) >= 800 && (s.nB2 as number) >= 800 &&
        Math.abs((s.pAgivenB as number) - 0.5) <= 0.05 && Math.abs((s.pAgivenB2 as number) - 0.5) <= 0.05,
    },
  ],
  caveats: `<p>The quantum mode does not simulate a real mechanism. It draws each pair from the joint singlet probabilities, and to do that the code uses both settings at once. That is not a flaw. Bell's theorem says a classical computer cannot do better without that shared knowledge.</p>
<p>The detectors are ideal. There is no loss, no noise and no dark counts, so every pair is counted and the equal-angle correlation is exactly −1. Real experiments see $|S|$ somewhat below $2\\sqrt2$. The local model shown is one natural choice. It is not the only one, but the bound of 2 covers all of them.</p>
<p>The flight of the pulses is slowed for viewing, and the distances are not to scale. The scene cannot show the timing and spacing that close the locality loophole, only the statistics.</p>`,
  further: [
    { label: 'J. S. Bell, On the Einstein Podolsky Rosen paradox (1964)', url: 'https://doi.org/10.1103/PhysicsPhysiqueFizika.1.195' },
    { label: 'Clauser, Horne, Shimony and Holt, Proposed experiment to test local hidden-variable theories (1969)', url: 'https://doi.org/10.1103/PhysRevLett.23.880' },
    { label: 'Hensen et al., Loophole-free Bell inequality violation using electron spins separated by 1.3 km (2015)', url: 'https://arxiv.org/abs/1508.05949' },
    { label: "Stanford Encyclopedia of Philosophy: Bell's Theorem", url: 'https://plato.stanford.edu/entries/bell-theorem/' },
  ],
};
