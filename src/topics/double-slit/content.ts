import type { TopicContent } from '../../core/types.ts';

export const content: TopicContent = {
  intuition: `
<p class="lead">Send light through two narrow slits and it paints stripes on a screen. Send electrons through, one at a time, and they paint the same stripes. Each electron still lands as a single dot.</p>
<p>Around 1801 Thomas Young split a beam of sunlight into two and saw bright and dark bands where the two parts overlapped. Where two waves meet crest to crest they add up. Where a crest meets a trough they cancel. That settled it for light: light is a wave.</p>
<p>Then the story turned strange. In 1974 Pier Giorgio Merli, Gian Franco Missiroli and Giulio Pozzi sent electrons through a double slit so slowly that only one was in the apparatus at a time. In 1989 Akira Tonomura's team at Hitachi filmed the same thing. The screen starts empty. Dots appear one by one, in places that look random. After thousands of dots, stripes appear. Each electron interfered with itself.</p>
<p>The scene replays that experiment. The rippling floor between the slits and the screen is the wave. It spreads out of both slits and makes bright beams and dark gaps. The glowing dots on the screen are single detections. The bars at the bottom count them. Watch the random dots slowly build the same stripes the wave predicts.</p>
<p>Now put a small detector by the slits to learn which slit each particle used. The stripes vanish. You get two plain humps, one behind each slit. Nothing magic happened. The detector became linked to the particle, and that link destroys the fine timing between the two paths that made the stripes.</p>
<p>Richard Feynman said this experiment contains <strong>the only mystery</strong> of quantum mechanics. It has been done with light, electrons, neutrons, atoms, and molecules of more than two thousand atoms. It always works the same way.</p>`,
  tryFirst: [
    'Watch the dots land. Each one is random, yet after a few hundred the stripes are clear. Press <b>Clear screen</b> to watch the build-up from zero.',
    'Set <b>Open slits</b> to <b>Left</b>. The stripes go and one broad hump is left. Opening a second slit makes some spots <em>darker</em>.',
    'Turn on the <b>Which-path detector</b> and slide its strength to 1. The floor wave loses its pattern and the stripes wash out.',
    'Drag <b>slit separation d</b>. Wider slits give narrower stripes. Switch the <b>Camera</b> to <b>Screen</b> for a flat view like a photograph.',
  ],
  equation: {
    tex: 'I(y) = I_0\\cos^2\\!\\left(\\frac{\\pi d\\,y}{\\lambda L}\\right)\\operatorname{sinc}^2\\!\\left(\\frac{\\pi a\\,y}{\\lambda L}\\right)',
    caption: 'The far-field pattern of two slits. Fast cos² stripes from the two paths sit inside a slow sinc² envelope from each slit\'s width.',
    terms: [
      { tex: 'I(y)', name: 'Intensity on the screen', meaning: 'For light, brightness. For single particles, the chance of a hit at height $y$. The bars at the bottom of the screen estimate it.', param: 'hits' },
      { tex: 'd', name: 'Slit separation', meaning: 'Centre-to-centre distance between the slits. It sets the stripe spacing $\\lambda L/d$.', param: 'd' },
      { tex: '\\lambda', name: 'Wavelength', meaning: 'For light, its colour. For an electron, the de Broglie wavelength $h/p$, set by the accelerating voltage.', param: 'lambda' },
      { tex: 'L', name: 'Screen distance', meaning: 'From slits to screen. Stripes grow in proportion to $L$.', param: 'L' },
      { tex: 'a', name: 'Slit width', meaning: 'Each slit alone spreads the wave by about $\\lambda/a$. This sets the envelope. Narrow slits give a wide envelope.', param: 'a' },
      { tex: '\\operatorname{sinc} x', name: 'Sinc function', meaning: '$\\sin x / x$. The single-slit pattern. Its first zeros are at $y = \\pm\\lambda L/a$.', param: 'open' },
    ],
  },
  physicsNotes: `
<h3>Where the equation comes from</h3>
<p>Treat the light or the particle as a scalar wave $\\psi$ with wavenumber $k = 2\\pi/\\lambda$. Huygens' principle says every point of an opening acts as a new source. The wave at a point on the screen is the sum of wavelets from every point of both slits:</p>
$$\\psi(y) \\propto \\sum_{\\text{slits}} \\int_{\\text{slit}} \\frac{e^{ikr}}{\\sqrt{r}}\\,dy_s, \\qquad r = \\sqrt{L^2 + (y - y_s)^2}.$$
<p>Far from the slits, $r \\approx L - y\\,y_s/L$. Each slit integral then becomes a sinc, and the two slits differ only by a phase $2\\pi d y/(\\lambda L)$. Squaring gives the headline equation. The stripes repeat every</p>
$$\\Delta y = \\frac{\\lambda L}{d}.$$
<h3>Amplitudes add, probabilities do not</h3>
<p>With both slits open, the rule is $I = |\\psi_1 + \\psi_2|^2 = I_1 + I_2 + 2\\sqrt{I_1 I_2}\\cos\\Delta\\phi$. The last term is the interference. It can be negative, so opening a second slit can make a spot darker. Adding probabilities, $I_1 + I_2$, would never do that.</p>
<h3>Partial which-path information</h3>
<p>A detector that partly records the path scales the cross term by a coherence factor $V$ between 0 and 1:</p>
$$I = I_1 + I_2 + 2V\\sqrt{I_1 I_2}\\cos\\Delta\\phi.$$
<p>$V = 1$ means no record. $V = 0$ means a perfect record and no stripes. The <b>Detector strength</b> slider sets $1 - V$.</p>
<h3>How the simulation computes it</h3>
<p>The screen pattern is not the formula above. It is a direct Huygens sum with 24 sources across each slit, exact path lengths, cylindrical wavelets $e^{ikr}/\\sqrt r$, and an obliquity factor. It agrees with the formula to within a fraction of a percent here. Each hit is drawn at random from that pattern by inverse sampling of its cumulative distribution. The <b>visibility</b> readout is measured from the histogram alone, by taking its Fourier component at the fringe frequency. It knows nothing about $V$.</p>
<h3>Matter waves</h3>
<p>For electrons, $\\lambda = h/p$ with $p = \\sqrt{2 m e U}$ after acceleration through a voltage $U$. At 50 kV that gives 5.48 pm. The relativistic formula gives 5.36 pm. The readout uses the relativistic value, since the difference is about 2%.</p>`,
  deep: [
    {
      title: 'One particle, one dot, one pattern',
      html: `<p>The wave does not carry a smeared-out electron. Every detection finds one whole electron at one point. The wave gives the <em>probability</em> of each point, by the Born rule: the chance of a hit near $y$ is proportional to $|\\psi(y)|^2$.</p>
<p>So a single dot tells you almost nothing. Its position is random. The pattern only lives in the statistics. Tonomura's film shows this well. Ten dots look random. A few thousand show stripes. Over a hundred thousand look like a photograph of light.</p>
<p>Where do the dark stripes come from, if each electron goes through alone? Not from electrons bumping into each other. The rate can be so low that the next electron leaves only after the last one has landed. The two paths of a <em>single</em> electron interfere. Try it in the scene with the emission rate at 1 per second. The pattern still grows.</p>
<p>The randomness is not a flaw of the detector. As far as any experiment has shown, it is how nature works.</p>`,
    },
    {
      title: 'Which path, complementarity, and decoherence',
      html: `<p>Suppose a detector near the slits interacts with the particle. After the interaction the particle and detector are in a joint state</p>
$$|\\Psi\\rangle = \\tfrac{1}{\\sqrt2}\\left(|\\psi_1\\rangle|D_1\\rangle + |\\psi_2\\rangle|D_2\\rangle\\right),$$
<p>where $|D_1\\rangle$ and $|D_2\\rangle$ are the detector states for each path. The screen only sees the particle. Its hit rate is found by summing over detector states you do not look at. The cross term picks up the overlap $\\langle D_2|D_1\\rangle$:</p>
$$I = I_1 + I_2 + 2\\,\\mathrm{Re}\\left[\\langle D_2|D_1\\rangle\\,\\psi_1\\psi_2^*\\right].$$
<p>So $V = |\\langle D_1|D_2\\rangle|$. If the detector states are identical, it learned nothing and the stripes stay. If they are orthogonal, it holds a perfect record and the stripes vanish. In between, both are partial. Englert showed in 1996 that the path distinguishability $D$ and the visibility obey $D^2 + V^2 \\le 1$. That is complementarity as an inequality.</p>
<p>This is <strong>decoherence</strong>. Nobody has to read the detector. The record merely has to exist, entangled with the particle. The same thing happens when a stray air molecule or photon bumps into the particle. It is why large, warm objects do not show interference.</p>`,
    },
    {
      title: 'From light to molecules',
      html: `<p><strong>1801, light.</strong> Young's demonstrations, reported between 1801 and 1807, split sunlight into two beams. They helped win the argument for waves against Newton's particle theory, at least for a century.</p>
<p><strong>1961, electrons.</strong> Claus Jönsson made the first real electron double slit with slits a fraction of a micron wide.</p>
<p><strong>1974 and 1989, one electron at a time.</strong> Merli, Missiroli and Pozzi in Bologna used an electron biprism and a TV camera to show single electrons building fringes. Tonomura's team at Hitachi repeated it with a better detector and a famous film. In 2013 Bach and colleagues finally did it with two real nanofabricated slits and a movable mask, as in the textbook.</p>
<p><strong>1999, molecules.</strong> Markus Arndt, Anton Zeilinger and colleagues in Vienna diffracted C<sub>60</sub> buckyballs, 60 carbon atoms each, through a grating. Their de Broglie wavelength was about 2.5 pm, a few hundred times smaller than the molecule. In 2004 the same group heated C<sub>70</sub> molecules until they emitted thermal photons. The fringes washed out, just as decoherence predicts. Since then the Vienna group has shown interference with molecules of about 2000 atoms and masses above 25,000 atomic mass units.</p>`,
    },
    {
      title: 'Edge cases: one slit, many slits, near field',
      html: `<p><strong>One slit.</strong> Close a slit and you get the $\\operatorname{sinc}^2$ envelope alone. Its central hump has width $2\\lambda L/a$. Narrower slits spread the wave more. This is the uncertainty principle in miniature: squeezing $y$ widens the spread of sideways momentum.</p>
<p><strong>Many slits.</strong> With $N$ slits the cross terms give</p>
$$I \\propto \\operatorname{sinc}^2\\!\\left(\\frac{\\pi a y}{\\lambda L}\\right)\\left[\\frac{\\sin(N\\pi d y/\\lambda L)}{N\\sin(\\pi d y/\\lambda L)}\\right]^2.$$
<p>The bright peaks stay at the same places but get $N$ times sharper. That is how a diffraction grating separates colours.</p>
<p><strong>Missing orders.</strong> When $d/a$ is a whole number, some bright stripes land on a zero of the envelope and vanish. The default here has $d/a = 5$, so the fifth stripe is missing.</p>
<p><strong>Near field.</strong> The formula needs $L \\gg a^2/\\lambda$. Close to the slits the pattern looks like two blurred copies of the openings. The Huygens sum in the code handles both regimes because it uses exact distances.</p>`,
    },
    {
      title: 'Interpretations, briefly',
      html: `<p>Every interpretation of quantum mechanics predicts the same pattern and the same loss of stripes with a detector. They differ on what is really happening between the source and the screen.</p>
<p>In the Copenhagen view, the wave is a tool for predicting outcomes, and it is not meaningful to ask which slit the particle used when nothing recorded it. In pilot-wave theory, the particle has a definite path guided by a real wave that passes through both slits. In the many-worlds view, the wave is all there is, and a detection branches the observer along with the outcome. Collapse models add a small physical process that picks outcomes.</p>
<p>No experiment so far tells these apart. The physics in this page, amplitudes, the Born rule and decoherence, is shared by all of them.</p>`,
    },
  ],
  challenges: [
    {
      id: 'buildup',
      title: 'Build the stripes',
      prompt: 'Clear the screen and collect 1000 hits with both slits open and a measured visibility above 0.6.',
      hint: 'Press Clear screen, keep the detector off, and raise the emission rate if you are impatient.',
      check: (s) => s.seeded === false && s.open === 'both' && (s.hits as number) >= 1000 && (s.visibility as number) > 0.6,
    },
    {
      id: 'which-path',
      title: 'Watch it and it washes out',
      prompt: 'Turn on the which-path detector at full strength and collect 500 hits with a measured visibility below 0.15.',
      hint: 'Toggle the detector, slide its strength to 1, and let the screen refill.',
      check: (s) => s.seeded === false && s.detector === true && (s.V as number) <= 0.01 && s.open === 'both' && (s.hits as number) >= 500 && (s.visibility as number) < 0.15,
    },
    {
      id: 'single',
      title: 'One slit',
      prompt: 'Close one slit and collect 300 hits to see the single-slit pattern.',
      hint: 'Set Open slits to Left or Right. The stripes are replaced by one broad hump.',
      check: (s) => s.seeded === false && s.open !== 'both' && (s.hits as number) >= 300,
    },
    {
      id: 'wider',
      title: 'Twice as wide',
      prompt: 'Make the predicted fringe spacing at least twice its default value.',
      hint: 'The spacing is $\\lambda L/d$. Halve $d$, or use a longer wavelength and a longer screen distance. For electrons, a lower voltage gives a longer wavelength.',
      check: (s) => (s.spacingRatio as number) >= 1.99,
    },
  ],
  caveats: `<p>The model uses scalar waves, so it ignores polarisation and electron spin. It is a 2D slice: the slits are treated as infinitely long, which gives cylindrical wavelets. The slits are ideal openings in a perfectly black plate with no edge effects. The source is perfectly monochromatic and the beam fills both slits evenly.</p>
<p>The rippling floor is drawn with a magnified wavelength so you can see individual crests. Its angles are scaled to match the screen, but the real wavelength is tens of thousands of times smaller than the slits drawn here. The floor height is also rescaled with distance so the far part stays visible.</p>
<p>The which-path detector is idealised. It is modelled only by the coherence factor $V$, without the physics of any real detector. Hits are drawn independently from the exact pattern. A real detector adds dark counts, finite resolution and dead time.</p>`,
  further: [
    { label: 'Tonomura et al., Demonstration of single-electron buildup of an interference pattern (1989)', url: 'https://doi.org/10.1119/1.16104' },
    { label: 'Merli, Missiroli and Pozzi, On the statistical aspect of electron interference phenomena (1976)', url: 'https://doi.org/10.1119/1.10184' },
    { label: 'Arndt et al., Wave-particle duality of C60 molecules (1999)', url: 'https://doi.org/10.1038/44348' },
    { label: 'Bach et al., Controlled double-slit electron diffraction (2013)', url: 'https://doi.org/10.1088/1367-2630/15/3/033018' },
    { label: 'Feynman Lectures on Physics, Vol. III, Chapter 1: Quantum Behavior', url: 'https://www.feynmanlectures.caltech.edu/III_01.html' },
  ],
};
