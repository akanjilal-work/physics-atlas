import type { TopicContent } from '../../core/types.ts';

export const content: TopicContent = {
  intuition: `
<p class="lead">A muon is a heavy cousin of the electron. It spins, and the spin makes it a tiny magnet. Put it in a magnetic field and two things turn at once: its path bends into a circle, and its spin swings around like a compass needle.</p>
<p>If the muon were the simple particle of Dirac's 1928 theory, the two would turn at exactly the same rate. The spin arrow would stay locked to the direction of travel, lap after lap. They do not quite match. The spin runs slightly ahead. In the real ring it gains one full extra turn every 29 laps. The size of this mismatch is set by a single number, the anomaly $a_\\mu$.</p>
<p>Where does the extra turning come from? Empty space is not empty. Around the muon, short-lived particles flicker in and out of existence: photons, electrons, quarks and gluons, and possibly particles nobody has found yet. Each one nudges the muon's magnetism a little. Measure the anomaly precisely enough and you are weighing everything in the vacuum.</p>
<p>In the scene, glowing dots are muons circling a 14 m magnet ring. The <strong>amber arrow</strong> on each muon is its spin and the faint cyan tick is its direction of travel. Watch the arrow slowly swing away from the tick, all the way round, and back.</p>
<p>We cannot see a spin directly. But muons live only about 2 microseconds at rest, and they decay into a positron. Nature breaks mirror symmetry in that decay, so the fastest positrons fly out along the spin. Count the fast positrons in the detectors and the count rises and falls as the spins swing. That rhythm, the <em>wiggle</em>, is the measurement.</p>`,
  tryFirst: [
    'Watch the inset. Each dot is a count of fast positrons in a time bin. Within a few seconds the smooth decay grows a clear wiggle, and the amber fit reads off $\\omega_a$.',
    'Drag the <b>momentum</b> slider. The lifetime and the lap time change a lot. The wiggle frequency does not change at all. Now drag <b>B</b>: the wiggle speeds up in proportion.',
    'Slide the hypothetical <b>anomaly</b> $a_\\mu$ up. A bigger anomaly means the spin outruns the momentum faster, so the wiggle gets faster.',
    'Set the camera to <b>Ride along</b> and follow the spin arrows. Long positron tracks (rose) come from spins pointing forward. Short curly ones (violet) come from spins pointing back.',
  ],
  equation: {
    tex: '\\omega_a \\;=\\; a_\\mu\\,\\frac{e\\,B}{m_\\mu}',
    caption: 'The anomalous precession. The spin turns faster than the momentum by a rate set only by the anomaly and the field, not by the speed of the muon.',
    terms: [
      { tex: '\\omega_a', name: 'Anomalous precession', meaning: 'How fast the spin rotates relative to the direction of travel. The wiggle plot measures it. In the real ring it is about $2\\pi \\times 229$ kHz.', param: 'omegaA' },
      { tex: 'a_\\mu', name: 'Anomaly', meaning: 'The muon anomaly $a_\\mu = (g-2)/2 \\approx 0.00116592$. The slider lets you try hypothetical values.', param: 'a' },
      { tex: 'B', name: 'Magnetic field', meaning: 'The vertical field of the storage ring, 1.45 T in the real experiment. Double it and $\\omega_a$ doubles.', param: 'B' },
      { tex: 'e', name: 'Charge', meaning: 'The elementary charge. The experiment uses positive muons.' },
      { tex: 'm_\\mu', name: 'Muon mass', meaning: 'The rest mass, with no Lorentz factor $\\gamma$. The $\\gamma$ in the lap rate and the $\\gamma$ in the spin rate cancel, which is why the momentum slider leaves $\\omega_a$ alone.', param: 'p' },
    ],
  },
  physicsNotes: `
<h3>Two clocks in one field</h3>
<p>A charged particle in a field $B$ circles at the cyclotron rate $\\omega_c = eB/(\\gamma m_\\mu)$. Its spin, described by the Thomas-BMT equation, turns at</p>
$$\\omega_s = \\frac{eB}{\\gamma m_\\mu} + a_\\mu \\frac{eB}{m_\\mu}.$$
<p>Subtract and every $\\gamma$ cancels: $\\omega_a = \\omega_s - \\omega_c = a_\\mu eB/m_\\mu$. With $g = 2$ exactly, $a_\\mu = 0$ and the spin would stay locked to the momentum forever. The whole signal is the anomaly.</p>
<h3>The magic momentum</h3>
<p>A pure magnetic field would let muons drift up and down out of the ring, so the ring also has electric quadrupoles for vertical focusing. An electric field adds a term to the spin equation:</p>
$$\\omega_a = \\frac{e}{m_\\mu}\\left[a_\\mu B - \\left(a_\\mu - \\frac{1}{\\gamma^2-1}\\right)\\frac{\\beta E}{c}\\right].$$
<p>The bracket vanishes when $\\gamma = \\sqrt{1 + 1/a_\\mu} \\approx 29.3$, which is a momentum of $p = m_\\mu c/\\sqrt{a_\\mu} \\approx 3.094$ GeV/c. At 1.45 T that gives an orbit radius of 7.11 m. The <b>E-term</b> readout shows the size of the correction for an illustrative 100 kV/m radial field. It drops to zero at the magic momentum.</p>
<h3>Time dilation buys time</h3>
<p>At rest a muon lives $\\tau_\\mu = 2.197\\ \\mu$s. At $\\gamma = 29.3$ it lives $\\gamma\\tau_\\mu \\approx 64.4\\ \\mu$s in the lab. That is about 15 wiggle periods per lifetime instead of half of one.</p>
<h3>The wiggle</h3>
<p>In the decay $\\mu^+ \\to e^+ \\nu_e \\bar\\nu_\\mu$, the weak force violates parity, so the most energetic positrons leave along the muon spin. Counting only positrons above an energy threshold gives</p>
$$N(t) = N_0\\, e^{-t/\\gamma\\tau_\\mu}\\left[1 + A\\cos(\\omega_a t + \\varphi)\\right].$$
<p>The simulation draws decay times from the dilated lifetime, keeps each positron with probability $(1 + A\\cos\\omega_a t)/2$, and fits all five parameters with a weighted least-squares fit. The fit error readout compares the fitted $\\omega_a$ with the input. Its statistical error shrinks as $1/\\sqrt{N}$.</p>`,
  deep: [
    {
      title: 'Why the muon, and not the electron?',
      html: `<p>The electron's anomaly is measured far more precisely, to about 0.1 parts per trillion. But heavy virtual particles of mass $M$ shift a lepton's anomaly roughly as $m_\\ell^2/M^2$. The muon is 206.8 times heavier than the electron, so it is</p>
$$\\left(\\frac{m_\\mu}{m_e}\\right)^2 \\approx 42\\,750$$
<p>times more sensitive to the same heavy new physics. The tau would be better still, but it lives only $2.9 \\times 10^{-13}$ s, far too short to store. The muon is the sweet spot: heavy enough to be sensitive, long-lived enough to measure.</p>`,
    },
    {
      title: 'From CERN to Brookhaven to Fermilab',
      html: `<p><b>CERN, late 1950s to 1979.</b> Three experiments measured $a_\\mu$ with steadily better precision. The third (CERN III) invented the magic-momentum technique, with a 14 m storage ring and electric-quadrupole focusing, and reached about 7 parts per million. Its muons at $\\gamma \\approx 29.3$ lived about 29 times longer than muons at rest, one of the cleanest tests of time dilation ever made.</p>
<p><b>Brookhaven E821.</b> A new superconducting 14 m ring at 1.45 T took data from 1997 to 2001. Results appeared from 2001 onward and the final report came in 2006, with a precision of 0.54 ppm. The value sat above the theory of the time.</p>
<p><b>Fermilab E989.</b> The superconducting coils could not be taken apart, so in 2013 the 15 m wide ring travelled about 5,000 km to Illinois, by barge down the Atlantic coast, around Florida and up rivers into Illinois, and then by truck. Fermilab took data from 2018 to 2023 with a much more intense beam. The final result, released in June 2025, is</p>
$$a_\\mu(\\text{FNAL}) = 116\\,592\\,070.5(14.8) \\times 10^{-11}\\quad (127\\ \\text{ppb}).$$
<p>Combined with Brookhaven the world average is $116\\,592\\,071.5(14.5) \\times 10^{-11}$.</p>`,
    },
    {
      title: 'How the real analysis works',
      html: `<p>The real experiment never quotes $B$ in tesla. It measures two frequencies in the same field: $\\omega_a$ from the wiggle and the precession of protons in water, $\\omega_p$, from NMR probes. The ratio $\\omega_a/\\omega_p$, combined with independently known constants such as the muon-to-electron mass ratio, gives $a_\\mu$. Only ratios of frequencies enter, which is why the result can reach parts per billion.</p>
<p>The fit also needs many small corrections. Muons that are slightly off the magic momentum feel the quadrupole field. Muons with a small vertical pitch see a slightly different field. Some muons are lost from the ring early, and overlapping positron hits in a calorimeter can masquerade as one high-energy positron. Each effect is measured and corrected at the level of tens of parts per billion.</p>`,
    },
    {
      title: 'The hadronic vacuum polarization challenge',
      html: `<p>The Standard Model prediction adds up QED loops (known to five loops), weak-boson loops, and hadronic loops of quarks and gluons. The hadronic part is the hard one. Its biggest piece, <b>hadronic vacuum polarization</b> (HVP), cannot be computed with pen and paper because the strong force is strong at low energy.</p>
<p>There are two routes. The <em>data-driven</em> route uses measured rates of $e^+e^- \\to$ hadrons and a dispersion relation. The <em>lattice</em> route computes HVP directly on a supercomputer grid of spacetime.</p>
<p>The 2020 Theory Initiative white paper used the data-driven route: $a_\\mu^{\\text{SM}} = 116\\,591\\,810(43) \\times 10^{-11}$. Against the 2021 experimental average that was a 4.2σ gap, and 5.1σ against the 2023 average. Then two things happened. Lattice calculations, starting with the BMW collaboration in 2020, found a larger HVP that moved theory toward experiment. And in 2023 the CMD-3 experiment measured $e^+e^- \\to \\pi^+\\pi^-$ and disagreed with earlier data sets. The data-driven inputs no longer agree with each other.</p>`,
    },
    {
      title: 'Where things stand',
      html: `<p>The 2025 Theory Initiative white paper uses a lattice average for HVP and finds $a_\\mu^{\\text{SM}} = 116\\,592\\,033(62) \\times 10^{-11}$. Compared with the world average:</p>
$$a_\\mu^{\\text{exp}} - a_\\mu^{\\text{SM}} = 38(63) \\times 10^{-11},$$
<p>well under one standard deviation. <b>Theory and experiment agree within their uncertainties.</b> The earlier tension was driven by the data-driven HVP, not by the measurement.</p>
<p>That is not the end of the story. The theory error is now about four times larger than the experimental one. Why the $e^+e^-$ data sets disagree is still not understood. New lattice results, new $e^+e^-$ measurements, and the proposed MUonE experiment aim to settle HVP independently. J-PARC in Japan is building a g−2 experiment with a very different method that needs no magic momentum. A new-physics signal smaller than the current uncertainties is still possible, but there is no evidence for one.</p>`,
    },
  ],
  challenges: [
    {
      id: 'magic',
      title: 'Find the magic',
      prompt: 'Set the momentum to the magic value, where the electric-field term in the spin equation vanishes.',
      hint: 'Look for the amber tick under the momentum slider, or watch the E-term readout drop to zero. For the real anomaly it is 3.094 GeV/c.',
      check: (s) => Math.abs(s.magicOff as number) < 0.002,
    },
    {
      id: 'wiggle5',
      title: 'See it wiggle',
      prompt: 'Change any setting, then accumulate a wiggle plot with at least 5 oscillations standing clearly above the noise.',
      hint: 'Raise the decay rate and wait. The oscillation count readout grows as the noise shrinks.',
      check: (s) => s.touched === true && s.fitOk === true && (s.oscillations as number) >= 5,
    },
    {
      id: 'fit1',
      title: 'One percent',
      prompt: 'After changing a setting, collect enough decays that the fitted $\\omega_a$ lands within 1% of the input value.',
      hint: 'The statistical error falls as one over the square root of the number of counts. A few tens of thousands of positrons is plenty.',
      check: (s) => s.touched === true && s.fitOk === true && (s.counts as number) >= 5000 && Math.abs(s.fitErr as number) < 0.01,
    },
    {
      id: 'doubleB',
      title: 'Double the field',
      prompt: 'Get a good fit (error under 2%) at one field, then double $B$ and get another. The fitted $\\omega_a$ should double too.',
      hint: 'Try 1.00 T and then 2.00 T. Let each histogram fill for a few seconds before moving on.',
      check: (s) => s.bDoubled === true,
    },
  ],
  caveats: `<p>The scene is a cartoon of the physics, with honest numbers underneath. The orbit is drawn far slower than in reality so you can follow the arrows. A real muon laps the ring about 29 times per spin wobble, once every 149 ns. The spin, decay and wiggle clocks are all to scale, run in slow motion at 2.5 μs per second.</p>
<p>Each decay positron is sorted into "fast" or "slow" with probability $(1 \\pm A\\cos\\theta)/2$, where $\\theta$ is the spin angle. The real energy and angle spectrum (the Michel spectrum) and the calorimeter response are not modelled. The asymmetry is fixed at $A = 0.4$, similar in size to the real experiment. The ring field is uniform, there is no beam dynamics, and the orbit radius $p/eB$ is shown as a readout while the drawn ring stays fixed. The anomaly slider goes far outside the real value on purpose.</p>`,
  further: [
    { label: 'Muon g−2 Collaboration, final Fermilab result (2025), arXiv:2506.03069', url: 'https://arxiv.org/abs/2506.03069' },
    { label: 'Aliberti et al., 2025 Theory Initiative white paper, arXiv:2505.21476', url: 'https://arxiv.org/abs/2505.21476' },
    { label: 'Muon g−2 experiment (Fermilab)', url: 'https://muon-g-2.fnal.gov/' },
    { label: 'Anomalous magnetic dipole moment on Wikipedia', url: 'https://en.wikipedia.org/wiki/Anomalous_magnetic_dipole_moment' },
  ],
};
