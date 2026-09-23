import type { TopicContent } from '../../core/types.ts';

export const content: TopicContent = {
  intuition: `
<p class="lead">Hide one winning ticket among a million. A classical computer has no shortcut. It checks tickets one by one and needs half a million looks on average. A quantum computer running Grover's algorithm needs about 800.</p>
<p>The trick is not to look at every ticket at once. A measurement only ever returns one answer, picked at random with probability equal to the squared <strong>amplitude</strong>. Grover's idea is to pump amplitude into the right answer, a little at a time, before anyone looks.</p>
<p>The scene is a city of bars, one per possible answer. Bar height is the amplitude. At the start every bar is the same height, so a measurement would be a blind guess. Two moves repeat:</p>
<ul>
<li><strong>Oracle.</strong> A black box that recognises the answer flips its bar upside down. Nothing else changes, and the probabilities stay the same. The information is hidden in a sign.</li>
<li><strong>Diffuse.</strong> Every bar is reflected through the violet plane at the average height. The flipped bar sat far below the average, so it lands far above it. All the others dip slightly.</li>
</ul>
<p>Each round lifts the winner. After about $\\tfrac{\\pi}{4}\\sqrt{N}$ rounds it towers over the rest and a measurement almost always finds it. The surprise is what happens if you keep going. The winner shrinks again. Grover search is a rotation, and rotations overshoot.</p>
<p>The circle in the corner shows that rotation. The whole state is one arrow in a flat plane. Each round turns it by the same small angle toward the answer $|w\\rangle$.</p>`,
  tryFirst: [
    'Press <b>Oracle</b> and watch the amber-marked bar flip below the floor. Then press <b>Diffuse</b> and watch every bar reflect through the violet mean plane.',
    'Press <b>Auto-run optimal</b>. With 4 qubits it takes 3 rounds and P(success) reaches 96%.',
    'Keep pressing <b>Oracle</b> and <b>Diffuse</b> past the optimum. The winner shrinks and the corner plot shows P falling.',
    'Click any bar to mark it instead. Raise <b>M</b> to mark several items and see the optimal count fall.',
    'Press <b>Measure ×100</b> and compare the hit rate with P(success).',
  ],
  equation: {
    tex: 'P_k = \\sin^2\\!\\big((2k+1)\\theta\\big), \\quad \\sin\\theta = \\sqrt{M/N}',
    caption: 'The chance of measuring a marked item after k Grover iterations. Each iteration rotates the state by 2θ toward the answer.',
    terms: [
      { tex: 'P_k', name: 'Success probability', meaning: 'Total squared amplitude on the marked items after $k$ rounds. The panel shows it from the simulated statevector.', param: 'P' },
      { tex: 'k', name: 'Iterations', meaning: 'Completed rounds of oracle followed by diffusion. Each round costs one oracle query.', param: 'k' },
      { tex: '\\theta', name: 'Rotation half-angle', meaning: 'The starting angle between the state and the unmarked direction. Each round adds $2\\theta$.', param: 'theta' },
      { tex: 'M', name: 'Marked items', meaning: 'How many items the oracle recognises. More winners means a bigger $\\theta$ and fewer rounds.', param: 'M' },
      { tex: 'N', name: 'Search space size', meaning: 'Number of possible answers, $N = 2^n$ for $n$ qubits.', param: 'N' },
    ],
  },
  physicsNotes: `
<h3>The two-dimensional picture</h3>
<p>Split the answers into marked and unmarked. Define two unit vectors:</p>
$$|w\\rangle = \\tfrac{1}{\\sqrt M}\\sum_{x\\,\\text{marked}} |x\\rangle, \\qquad |r\\rangle = \\tfrac{1}{\\sqrt{N-M}}\\sum_{x\\,\\text{unmarked}} |x\\rangle$$
<p>Hadamards on every qubit make the uniform state $|s\\rangle = \\sin\\theta\\,|w\\rangle + \\cos\\theta\\,|r\\rangle$ with $\\sin\\theta = \\sqrt{M/N}$. The oracle $O = I - 2|w\\rangle\\langle w|$ reflects the state across $|r\\rangle$. The diffusion $D = 2|s\\rangle\\langle s| - I$ reflects it across $|s\\rangle$. Two reflections make a rotation by twice the angle between the mirrors, so one round $G = DO$ turns the state by $2\\theta$. After $k$ rounds it sits at angle $(2k+1)\\theta$, and its $|w\\rangle$ component squared is the headline equation.</p>
<h3>Why diffusion is inversion about the mean</h3>
<p>Apply $2|s\\rangle\\langle s| - I$ to amplitudes $a_x$. Since $\\langle s|\\psi\\rangle = \\sqrt N\\,\\bar a$, each amplitude becomes $2\\bar a - a_x$. That is a reflection of every bar through the mean height $\\bar a$, which is the violet plane in the scene. The mean itself does not move. In gates, $D = H^{\\otimes n}(2|0\\rangle\\langle 0| - I)H^{\\otimes n}$.</p>
<h3>How many rounds</h3>
<p>The success probability peaks when $(2k+1)\\theta$ is closest to $\\pi/2$:</p>
$$k_{\\text{opt}} = \\operatorname{round}\\!\\Big(\\frac{\\pi}{4\\theta} - \\frac12\\Big) \\approx \\frac{\\pi}{4}\\sqrt{\\frac NM}$$
<p>For $N = 4$ and one marked item, $\\theta = 30^\\circ$ and a single round lands exactly on $|w\\rangle$ with $P = 1$. For $N = 256$ the answer is 12 rounds with $P \\approx 0.9999$. A classical search picking items at random without repeats needs $(N+1)/(M+1)$ looks on average, about $N/2$ for one item.</p>
<h3>What the simulation does</h3>
<p>The page stores all $2^n$ real amplitudes, applies $H^{\\otimes n}$ with a fast Walsh–Hadamard transform, flips the marked signs, and reflects about the mean. No formula is used to draw the bars. The norm readout checks that $\\sum a_x^2$ stays 1, and the P readout is compared against $\\sin^2((2k+1)\\theta)$.</p>`,
  deep: [
    {
      title: 'Grover 1996 and the quadratic speedup',
      html: `<p>Lov Grover of Bell Labs presented the algorithm at the 1996 ACM Symposium on Theory of Computing under the title <em>A fast quantum mechanical algorithm for database search</em>. A year later he published a shorter account in Physical Review Letters called <em>Quantum mechanics helps in searching for a needle in a haystack</em>.</p>
<p>The speedup is quadratic. Classical search needs about $N/2$ queries and Grover needs about $0.785\\sqrt{N}$. For a million items that is 500,000 against 785. For a trillion it is half a trillion against under a million. Useful, but nothing like the exponential speedup Shor's algorithm gives for factoring.</p>
<p>Boyer, Brassard, Høyer and Tapp (1998) extended the analysis to unknown $M$. If you do not know how many winners there are, you cannot pick $k$ in advance. Their fix is to try random $k$ from a range that grows geometrically, which keeps the total cost at order $\\sqrt{N/M}$.</p>`,
    },
    {
      title: 'Why you cannot do better: the BBBV bound',
      html: `<p>Bennett, Bernstein, Brassard and Vazirani proved a matching limit. Any quantum algorithm that finds a marked item with an oracle as its only access to the data needs on the order of $\\sqrt N$ queries. Their paper, <em>Strengths and weaknesses of quantum computing</em>, was published in SIAM Journal on Computing in 1997.</p>
<p>The idea behind the proof is that one query can only move a small amount of amplitude toward any given item. Spread over $N$ possible hiding places, the state needs about $\\sqrt N$ queries before it can tell them apart. Christof Zalka showed in 1999 that Grover's algorithm is exactly optimal, not just optimal up to a constant factor.</p>
<p>So Grover search is not a first step toward something faster. For unstructured search, a quadratic speedup is the whole story. Bigger quantum speedups need structure in the problem, as in Shor's algorithm, which exploits periodicity.</p>`,
    },
    {
      title: 'Over-rotation, and why more is worse',
      html: `<p>Classical search never gets worse with more effort. Grover search does. The state rotates by $2\\theta$ each round. Once it passes $|w\\rangle$ it swings away again, and the success probability follows $\\sin^2$ back down. With $N = 16$ the probability is 0.96 after 3 rounds, 0.58 after 4, and 0.13 after 5.</p>
<p>The motion is periodic. After about $\\pi/(2\\theta)$ rounds the state is back near the start, and later it returns toward $|w\\rangle$ again. None of these later peaks beat the first one by enough to be worth the extra queries.</p>
<p>This is why the number of marked items matters. Mark 4 items among 16 and $\\theta$ doubles to $30^\\circ$. One round then gives $P = 1$, while the single-item count of 3 rounds would give $P = 0.25$.</p>`,
    },
    {
      title: 'What an oracle is in practice',
      html: `<p>The oracle is often described as a lookup in a database. That picture misleads. Loading $N$ classical records into a quantum superposition already costs about $N$ operations, which wipes out the gain.</p>
<p>A realistic oracle is a <strong>reversible circuit that checks a candidate answer</strong>. You need to know how to recognise a solution, not what it is. Examples are a circuit that tests whether an assignment satisfies a logic formula, or one that encrypts a known plaintext under a trial key and compares with a known ciphertext. The circuit computes $f(x)$ into a helper qubit prepared in $(|0\\rangle - |1\\rangle)/\\sqrt2$. The value of $f$ then appears as a phase $(-1)^{f(x)}$, a trick called phase kickback.</p>
<p>Each query runs that whole circuit. The speedup counts queries, so a slow oracle makes every round slow.</p>`,
    },
    {
      title: 'Real hardware and cryptography',
      html: `<p>Grover search has been run on very small devices. Chuang, Gershenfeld and Kubinec ran a two-qubit version with nuclear magnetic resonance in 1998. Figgatt and colleagues ran complete three-qubit searches on trapped ions in 2017. Success rates fall quickly as circuits get deeper, because every gate adds noise.</p>
<p>Large searches need error-corrected qubits. Each logical qubit uses many physical qubits, and each logical gate is far slower than a classical operation. Analyses such as Babbush and colleagues (2021) argue that a quadratic speedup alone is unlikely to beat classical hardware on early fault-tolerant machines, because the overhead eats the gain unless the problem is enormous.</p>
<p><strong>Cryptography.</strong> Brute-forcing a $b$-bit key takes about $2^b$ classical trials and about $2^{b/2}$ Grover rounds. Grover therefore halves the effective key length. AES-128 drops to roughly 64-bit security in query count, and AES-256 keeps roughly 128 bits, which is considered safe. The iterations must also run one after another, and splitting the search over many machines helps only as the square root of their number. Shor's algorithm is a different matter. It breaks RSA and elliptic-curve cryptography in polynomial time, which is why new public-key standards such as NIST's ML-KEM and ML-DSA (2024) replace those schemes rather than lengthen their keys.</p>`,
    },
  ],
  challenges: [
    {
      id: 'six-qubits',
      title: 'Ninety-five percent',
      prompt: 'Set $n = 6$ qubits (64 items, one marked) and reach P(success) above 0.95.',
      hint: 'The optimal count is round(π/(4θ) − ½) with sin θ = 1/8. Try Auto-run optimal, or count the rounds yourself.',
      check: (s) => s.n === 6 && (s.P as number) > 0.95,
    },
    {
      id: 'overshoot',
      title: 'Too much of a good thing',
      prompt: 'Run past the optimal number of rounds until P(success) is at least 0.1 below its peak.',
      hint: 'Auto-run optimal, then press Oracle and Diffuse once more. Watch the circle inset: the arrow swings past |w⟩.',
      check: (s) => !(s.half as boolean) && (s.k as number) > (s.kOpt as number) && (s.P as number) < (s.Popt as number) - 0.1,
    },
    {
      id: 'n8-find',
      title: 'Needle in 256',
      prompt: 'With $n = 8$ and one marked item, measure and find it after no more than 13 iterations. Check that the optimal count is 12.',
      hint: 'Run 12 iterations, then press Measure ×1. The classical average would be 128.5 looks.',
      check: (s) => s.found8 === true,
    },
    {
      id: 'four-marked',
      title: 'More winners, fewer rounds',
      prompt: 'Mark 4 items, run exactly the optimal number of rounds for that case, and reach P above 0.9.',
      hint: 'Set M to 4. With n = 4 the optimal count drops from 3 to 1.',
      check: (s) => s.M === 4 && !(s.half as boolean) && s.k === s.kOpt && (s.P as number) > 0.9,
    },
  ],
  caveats: `<p>This is an ideal, noise-free simulation. Gates are perfect, qubits never decohere, and the oracle is a single step. On real hardware each oracle call is a deep circuit and errors grow with every round.</p>
<p>The amplitudes here are real numbers because Grover's circuit keeps them real. General quantum states have complex amplitudes. Measuring ×100 re-runs the same circuit 100 times. A real measurement destroys the superposition, so the state is not reused.</p>
<p>The classical comparison assumes a blind search with no structure to exploit. Many real problems have structure, and good classical algorithms can beat brute force by far more than a square root.</p>`,
  further: [
    { label: 'Grover, A fast quantum mechanical algorithm for database search (1996), arXiv', url: 'https://arxiv.org/abs/quant-ph/9605043' },
    { label: 'Bennett, Bernstein, Brassard, Vazirani, Strengths and weaknesses of quantum computing (1997), arXiv', url: 'https://arxiv.org/abs/quant-ph/9701001' },
    { label: "Grover's algorithm on Wikipedia", url: 'https://en.wikipedia.org/wiki/Grover%27s_algorithm' },
  ],
};
