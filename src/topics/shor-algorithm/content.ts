import type { TopicContent } from '../../core/types.ts';

export const content: TopicContent = {
  intuition: `
<p class="lead">Multiplying two primes is easy. Undoing it is hard. RSA encryption rests on that gap. Peter Shor showed in 1994 that a large enough quantum computer would close it.</p>
<p>Shor did not attack factoring head on. He turned it into a question about rhythm. Pick a number $a$ and keep multiplying by it, keeping only the remainder after dividing by $N$. The remainders repeat. For $N = 15$ and $a = 7$ they go 1, 7, 4, 13, 1, 7, 4, 13 and so on. The length of that cycle is the <strong>period</strong> $r$, here 4. Once you know $r$, a few lines of school arithmetic usually give the factors. For large $N$ the cycle can be astronomically long, and no known classical method finds it quickly.</p>
<p>The clock in the corner shows the cycle. The hand hops from remainder to remainder and comes back to 1 after $r$ hops.</p>
<p>A quantum computer finds the period by interference. The bar city shows its counting register, one bar per number $x$. Follow the steps:</p>
<ul>
<li><strong>Superpose.</strong> Every $x$ gets an equal amplitude.</li>
<li><strong>Modexp.</strong> A circuit computes $a^x \\bmod N$ into a second register. The colours show which remainder each $x$ produced.</li>
<li><strong>Measure work.</strong> Reading the second register keeps only the $x$ values with that remainder. What is left is a comb with teeth spaced exactly $r$ apart. You still cannot read $r$ off it, because a measurement returns one tooth at random.</li>
<li><strong>QFT.</strong> The quantum Fourier transform turns the spacing into position. The comb morphs into $r$ sharp peaks at multiples of $2^n/r$.</li>
<li><strong>Measure, then continued fractions.</strong> One reading of a peak gives a fraction close to $j/r$. An old technique for approximating fractions, which goes back to Euclid, pulls $r$ out of it.</li>
</ul>
<p>The surprise is how little luck it needs. Each run finds the period with a fair probability, so a handful of runs are enough.</p>`,
  tryFirst: [
    'Watch the opening run: the flat city becomes a coloured comb, then the <b>QFT</b> morphs it into four tall peaks.',
    'Press <b>Measure</b> via <b>Next step</b>, then <b>Next step</b> again to run continued fractions and the gcd. The cards along the bottom show each stage.',
    'Press <b>Measure ×20</b>. Green markers pile up on the peaks. Compare the success count with the exact P(CF finds r).',
    'Switch to $N = 21$. The period 6 does not divide $2^9 = 512$, so the peaks now spread over neighbouring bars.',
    'Set $a = 14$ for $N = 15$. The period is found, but the gcd step fails. Read the third card to see why.',
  ],
  equation: {
    tex: '\\begin{gathered}\\gcd\\left(a^{r/2}\\pm1,\\;N\\right) \\text{ gives the factors,} \\\\ \\text{where } a^r\\equiv 1 \\pmod N\\end{gathered}',
    caption: 'Once the period r is known, the factors of N come from two greatest common divisors. The quantum computer is needed only to find r.',
    terms: [
      { tex: 'N', name: 'Number to factor', meaning: 'An odd composite that is not a prime power. Here $N$ is 15, 21, 33, 35 or 39. RSA uses $N$ with 2048 bits or more.', param: 'N' },
      { tex: 'a', name: 'Base', meaning: 'A number between 2 and $N-1$ with no common factor with $N$. It is chosen at random in the real algorithm.', param: 'a' },
      { tex: 'r', name: 'Order (period)', meaning: 'The smallest $r > 0$ with $a^r \\equiv 1 \\pmod N$. The sequence $a^x \\bmod N$ repeats every $r$ steps. Finding it is the hard part.', param: 'r' },
      { tex: 'a^{r/2}', name: 'Half power', meaning: 'A square root of 1 mod $N$. If it is not $\\pm1$, then $N$ divides $(a^{r/2}-1)(a^{r/2}+1)$ without dividing either factor.', param: 'half' },
      { tex: '\\gcd', name: 'Greatest common divisor', meaning: 'Found fast with Euclid’s algorithm. Each gcd returns one nontrivial factor of $N$ when the checks pass.', param: 'factors' },
    ],
  },
  physicsNotes: `
<h3>From factoring to a period</h3>
<p>If $a^r \\equiv 1 \\pmod N$ and $r$ is even, then $(a^{r/2}-1)(a^{r/2}+1) \\equiv 0 \\pmod N$. When $a^{r/2} \\not\\equiv -1$, neither bracket is a multiple of $N$, so each shares a proper factor with $N$. Two failure cases remain: $r$ odd, or $a^{r/2} \\equiv -1$. For $N$ with two distinct odd prime factors, at least half of all bases avoid both. A failed base just means picking another $a$.</p>
<h3>The quantum part</h3>
<p>The counting register has $n$ qubits and $Q = 2^n$ basis states. Hadamards make $\\frac{1}{\\sqrt Q}\\sum_x |x\\rangle$. Controlled modular multiplication writes $|x\\rangle|a^x \\bmod N\\rangle$. Measuring the work register and getting $a^{x_0}$ leaves the comb</p>
$$|\\phi\\rangle = \\frac{1}{\\sqrt M}\\sum_{j=0}^{M-1} |x_0 + j r\\rangle, \\qquad M \\approx Q/r.$$
<p>The QFT sends $|x\\rangle \\to \\frac{1}{\\sqrt Q}\\sum_k e^{2\\pi i x k/Q}|k\\rangle$. The comb's amplitudes add in phase only when $rk/Q$ is close to an integer, so the probability piles up near $k \\approx jQ/r$:</p>
$$P(k) = \\frac{1}{QM}\\left|\\frac{\\sin(\\pi M r k/Q)}{\\sin(\\pi r k/Q)}\\right|^2.$$
<p>When $r$ divides $Q$ the peaks are exact, each with probability $1/r$. Otherwise each peak spreads over a few bars, and the nearest bar still holds at least $4/\\pi^2 \\approx 0.41$ of the ideal weight.</p>
<h3>Continued fractions</h3>
<p>A measured $k$ satisfies $|k/Q - j/r| \\le 1/(2Q)$. Shor chose $Q \\ge N^2$ so that this is below $1/(2r^2)$. A theorem of Legendre then guarantees that $j/r$ is one of the convergents of the continued fraction of $k/Q$. The page tries each convergent with denominator below $N$ and keeps the first $q$ with $a^q \\equiv 1$. If $j$ and $r$ share a factor, the fraction reduces and only a divisor of $r$ appears. Then you run again.</p>
<h3>What the simulation does</h3>
<p>The page stores the $2^n$ complex amplitudes of the counting register, up to $2^{11} = 2048$. It builds the comb, applies the QFT with an exact fast Fourier transform, and samples measurements from $|{\\rm amplitude}|^2$. The P(CF finds r) readout sums the exact distribution over every $k$ that continued fractions would turn into the period. The QFT animation follows $F^t$, a fractional power of the QFT. Every frame of it is a normalised quantum state, and the norm readout shows it.</p>`,
  deep: [
    {
      title: 'Shor 1994 and why RSA relies on factoring',
      html: `<p>Peter Shor, then at AT&amp;T Bell Labs, presented <em>Algorithms for quantum computation: discrete logarithms and factoring</em> at the 1994 IEEE Symposium on Foundations of Computer Science. The extended version appeared in SIAM Journal on Computing in 1997. The same period-finding idea also computes discrete logarithms.</p>
<p>RSA, described by Rivest, Shamir and Adleman in 1977, makes public a modulus $N = pq$. Anyone can encrypt with it. Decrypting needs a number computed from $p$ and $q$. Factoring $N$ therefore breaks the key. Diffie-Hellman and elliptic-curve cryptography rest instead on discrete logarithms, which Shor's method also solves. Together these cover almost all public-key encryption and signatures deployed on the internet today.</p>
<p>Symmetric ciphers such as AES and hash functions are different. Shor's algorithm does not apply to them. Grover search gives only a square-root speedup there, which longer keys absorb.</p>`,
    },
    {
      title: 'The speedup: polynomial against sub-exponential',
      html: `<p>The best known classical method for large numbers is the general number field sieve. Its heuristic running time for a number $N$ is</p>
$$\\exp\\!\\Big(\\big(\\tfrac{64}{9}\\big)^{1/3} (\\ln N)^{1/3} (\\ln\\ln N)^{2/3}\\,(1+o(1))\\Big).$$
<p>That grows faster than any polynomial in the number of digits, but slower than a true exponential. For scale, the RSA challenge number RSA-250 (829 bits) was factored in February 2020 by Boudot, Gaudry, Guillevic, Heninger, Thomé and Zimmermann using about 2,700 core-years of computing.</p>
<p>Shor's algorithm needs a number of gates that grows roughly as the cube of the bit length with ordinary multiplication circuits. The cost sits almost entirely in the modular exponentiation. The QFT is cheap by comparison. Nobody has proved that fast classical factoring is impossible. The claim is that the quantum method is exponentially faster than the best algorithm we know.</p>`,
    },
    {
      title: 'Resource estimates for RSA-2048',
      html: `<p>A useful estimate must count error correction, because physical qubits are noisy. Two widely cited estimates by Craig Gidney use the same hardware assumptions: a physical gate error rate of 0.1%, a surface-code cycle of 1 microsecond, a control reaction time of 10 microseconds, and a square grid of qubits with nearest-neighbour connections.</p>
<ul>
<li><strong>Gidney and Ekerå (2019, published in Quantum in 2021).</strong> About 20 million noisy qubits running for about 8 hours.</li>
<li><strong>Gidney (May 2025, arXiv preprint).</strong> Fewer than one million noisy qubits running for less than a week. The saving comes from approximate residue arithmetic, denser storage of idle logical qubits (yoked surface codes) and cheaper magic states (cultivation). It trades qubits for time.</li>
</ul>
<p>These are engineering estimates, not predictions of when such a machine will exist. They assume error rates and speeds sustained across a device far larger than any built so far. They do show that the target has moved down by more than an order of magnitude in six years. That trend matters for planning.</p>`,
    },
    {
      title: 'Experiments on 15 and 21, and the compiled caveat',
      html: `<p>Vandersypen and colleagues factored 15 in 2001 with seven nuclear spins in a liquid NMR molecule. Photonic demonstrations followed in 2007, a superconducting circuit by Lucero and colleagues in 2012, and a trapped-ion version by Monz and colleagues in 2016. Martín-López and colleagues factored 21 with photons in 2012 by recycling one qubit, a trick based on the semiclassical QFT of Griffiths and Niu (1996).</p>
<p>Most of these were <strong>compiled</strong>. The circuit for modular exponentiation was simplified using knowledge of the answer, for example the known period. Smolin, Smith and Vargo pointed out in <em>Nature</em> (2013) that such shortcuts can make any number look factorable, even with a coin standing in for the quantum computer. The demonstrations are real tests of interference and control. They are not evidence of scalable factoring.</p>
<p>No experiment has yet run Shor's algorithm for a number too large to factor by hand, with a full modular-exponentiation circuit and error correction.</p>`,
    },
    {
      title: 'Post-quantum cryptography and harvest now, decrypt later',
      html: `<p>On 13 August 2024 NIST published three post-quantum standards:</p>
<ul>
<li><strong>FIPS 203, ML-KEM.</strong> A lattice-based key-encapsulation mechanism derived from CRYSTALS-Kyber.</li>
<li><strong>FIPS 204, ML-DSA.</strong> A lattice-based signature derived from CRYSTALS-Dilithium.</li>
<li><strong>FIPS 205, SLH-DSA.</strong> A stateless hash-based signature derived from SPHINCS+.</li>
</ul>
<p>None of these rely on factoring or discrete logarithms, and no quantum algorithm is known that breaks them efficiently. They run on ordinary computers.</p>
<p><strong>Harvest now, decrypt later.</strong> An adversary can record encrypted traffic today and store it until a quantum computer can read it. Key exchange is the exposed part, since a broken key exchange reveals the session key. Data that must stay secret for many years is at risk well before a capable machine exists. Michele Mosca framed the planning question as a simple inequality. If the time data must stay secret plus the time to migrate exceeds the time until a capable quantum computer, you are already late. This is why many migrations start with key exchange, often in hybrid mode alongside a classical scheme.</p>`,
    },
  ],
  challenges: [
    {
      id: 'factor-15',
      title: 'Factor 15',
      prompt: 'With $N = 15$, run the full pipeline and finish with 15 = 3 × 5 from a single measurement.',
      hint: 'Press Run all. If continued fractions give only a divisor of r (for example k = 128 gives 1/2), run again.',
      check: (s) => s.touched === true && s.N === 15 && s.factored === true,
    },
    {
      id: 'factor-21',
      title: 'Factor 21',
      prompt: 'Switch to $N = 21$ and factor it with the quantum pipeline.',
      hint: 'a = 2 has period 6. The peaks sit near multiples of 512/6 ≈ 85.3, so they spread over neighbouring bars. Run all until the third card shows 7 × 3.',
      check: (s) => s.touched === true && s.N === 21 && s.factored === true,
    },
    {
      id: 'bad-base',
      title: 'A base that fails',
      prompt: 'Find the period for a base where the gcd step fails, because $r$ is odd or $a^{r/2} \\equiv -1$. Then factor the same $N$ with a different base.',
      hint: 'For N = 15 try a = 14 (14 ≡ −1). For N = 21 try a = 4 (r = 3 is odd). Run until the period is found, then change a.',
      check: (s) => s.failHandled === true,
    },
    {
      id: 'single-shot',
      title: 'One shot, one period',
      prompt: 'Recover a period that is not a power of two from a single measurement, using continued fractions.',
      hint: 'Pick N = 21 with a = 2 (r = 6), or N = 35 with a = 2 (r = 12). Step through to the continued fraction card. A peak with gcd(j, r) = 1 gives r directly.',
      check: (s) => s.touched === true && s.cfOk === true && s.rPow2 === false,
    },
  ],
  caveats: `<p>This is an ideal, noise-free simulation of the counting register only. The work register and the modular-exponentiation circuit are not simulated gate by gate. Their effect is applied exactly: the register splits into combs labelled by $a^x \\bmod N$. On real hardware that circuit is the expensive, error-prone part.</p>
<p>The numbers are tiny. Anyone can factor 39 in their head, and the classical side of this page computes $r$ by brute force for the clock. The point is the mechanism, not the result. Measure ×20 re-runs the whole circuit 20 times and samples from the exact distribution. The QFT morph shows a fractional power of the QFT for clarity. A real circuit applies the QFT as layers of Hadamard and controlled-phase gates, and its intermediate states look different.</p>
<p>The page allows fewer counting qubits than $2^n \\ge N^2$ for display. Below that size, continued fractions can return a wrong denominator more often.</p>`,
  further: [
    { label: 'Shor, Polynomial-time algorithms for prime factorization and discrete logarithms on a quantum computer (1995), arXiv', url: 'https://arxiv.org/abs/quant-ph/9508027' },
    { label: 'Gidney and Ekerå, How to factor 2048 bit RSA integers in 8 hours using 20 million noisy qubits (2019), arXiv', url: 'https://arxiv.org/abs/1905.09749' },
    { label: 'Gidney, How to factor 2048 bit RSA integers with less than a million noisy qubits (2025), arXiv', url: 'https://arxiv.org/abs/2505.15917' },
    { label: 'NIST, FIPS 203 Module-Lattice-Based Key-Encapsulation Mechanism Standard', url: 'https://csrc.nist.gov/pubs/fips/203/final' },
  ],
};
