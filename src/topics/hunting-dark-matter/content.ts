import type { TopicContent } from '../../core/types.ts';

export const content: TopicContent = {
  intuition: `
<p class="lead">If dark matter is made of particles, billions of them pass through your body every second. You never notice. The hunt is to catch one bump from one of them, deep underground, in a detector quiet enough to hear it.</p>
<p>Start in the <strong>Halo wind</strong> view. The Sun moves through the Milky Way’s cloud of dark matter at about 230 km/s, so on Earth it feels like a wind. The Earth circles the Sun, so for half the year it runs into the wind a little faster and for half the year a little slower. The difference is only about 6 percent in speed. It gives a gentle yearly rhythm in the expected rate, strongest in early June.</p>
<p>Now open the <strong>Xenon TPC</strong>. It is a tank of liquid xenon with light sensors at the top and bottom. When something hits a xenon atom there is a flash of light. Freed electrons then drift up to the surface and make a second, bigger flash. Most hits come from ordinary radioactivity near the walls. The outer layers of xenon act as a shield, so the quiet centre is where a real signal would stand out. Watch for the rare amber event in the middle.</p>
<p>The <strong>Axion cavity</strong> hunts a different candidate. A very light axion in a strong magnetic field can turn into a microwave photon, but only if the cavity is tuned to exactly the right frequency. Nobody knows that frequency, so you have to sweep, slowly, like tuning an old radio in search of a faint station.</p>
<p>The honest headline: none of these experiments has found dark matter yet. Each null result rules out part of the map of possibilities.</p>`,
  tryFirst: [
    'In <b>Halo wind</b>, drag <b>Month</b> through the year. Watch the Earth’s speed readout rise to about 247 km/s in June and fall to 217 km/s in December.',
    'Switch to <b>Xenon TPC</b>. Drag <b>Fiducial cut</b> up and watch the inner cylinder shrink and the edge events drop out of the count.',
    'Drag <b>WIMP mass</b> from 10 GeV to a few TeV and watch the recoil spectrum in the corner stretch out, then stop stretching.',
    'Set the inset to <b>Exclusion</b> and raise the <b>Exposure</b>. The illustrative limit curve sinks toward the neutrino fog.',
    'Open <b>Axion cavity</b> and press <b>Scan</b>. If the scan is too fast, the axion peak can hide in the noise.',
  ],
  equation: {
    tex: 'E_R = \\frac{\\mu^2 v^2}{m_N}\\,(1-\\cos\\theta)',
    caption: 'Energy given to a xenon nucleus by an elastic WIMP collision, with $\\mu = m_\\chi m_N/(m_\\chi+m_N)$. Averaged over the halo, the rate per unit recoil energy is $\\dfrac{dR}{dE_R} \\propto \\dfrac{\\rho_0\\,\\sigma_n A^2}{m_\\chi\\,\\mu_n^2}\\,F^2(E_R)\\,\\eta(v_{min})$, where $\\eta$ is the mean of $1/v$ over WIMPs faster than $v_{min} = \\sqrt{m_N E_R/2\\mu^2}$.',
    terms: [
      { tex: 'E_R', name: 'Recoil energy', meaning: 'Kinetic energy of the struck nucleus, typically a few to a few tens of keV. The detector sees only this.', param: 'emax' },
      { tex: '\\mu', name: 'Reduced mass', meaning: 'The WIMP-nucleus reduced mass $m_\\chi m_N/(m_\\chi+m_N)$. It tends to $m_\\chi$ for light WIMPs and saturates at $m_N$ for heavy ones.', param: 'mchi' },
      { tex: 'v', name: 'WIMP speed', meaning: 'Speed of the WIMP relative to the detector. It is drawn from the halo’s Maxwellian, shifted by the Earth’s own motion $v_E$, which changes with the month.', param: 'month' },
      { tex: 'm_N', name: 'Nucleus mass', meaning: 'For xenon with $A = 131$, $m_N \\approx 122$ GeV. The transfer is most efficient when $m_\\chi = m_N$.', param: 'mN' },
      { tex: '(1-\\cos\\theta)', name: 'Scattering angle', meaning: 'Set by the centre-of-mass angle $\\theta$. A glancing hit gives almost nothing. A head-on hit ($\\theta = 180°$) gives twice the average, $E_{max} = 2\\mu^2 v^2/m_N$.', param: 'emax' },
    ],
  },
  physicsNotes: `
<h3>Where the equation comes from</h3>
<p>Go to the centre-of-mass frame. The WIMP’s speed there is $v\\,m_N/(m_\\chi+m_N)$ and the nucleus comes in at $v\\,m_\\chi/(m_\\chi+m_N)$. An elastic collision only turns the momenta through an angle $\\theta$. Boost back to the lab, where the nucleus was at rest, and its momentum transfer is $q^2 = 2\\mu^2 v^2(1-\\cos\\theta)$. The recoil energy is $q^2/2m_N$, which is the headline equation.</p>
<h3>Why the mass match matters</h3>
<p>A head-on hit hands over the fraction $4m_\\chi m_N/(m_\\chi+m_N)^2$ of the WIMP’s kinetic energy. This is 1 when the masses are equal, like a snooker ball stopping dead. A 10 GeV WIMP on xenon hands over at most 28 percent. For a very heavy WIMP, $\\mu \\to m_N$ and $E_{max} \\to 2m_N v^2$ stops growing. Heavier WIMPs also come in fewer numbers for a fixed mass density, so the rate falls as $1/m_\\chi$.</p>
<h3>The rate</h3>
<p>For spin-independent scattering the WIMP couples to protons and neutrons alike and the amplitudes add coherently. The cross-section on a nucleus grows as $A^2 (\\mu/\\mu_n)^2$, a factor of about $10^8$ for xenon. That is why heavy targets win. The nucleus is not a point, so the Helm form factor $F^2(E_R)$ cuts the rate at high recoil energy.</p>
<p>With the Earth at rest in the halo and no escape cut, the spectrum is a pure exponential, $dR/dE_R \\propto e^{-E_R/E_0 r}$ with $E_0 r = \\tfrac12 m_\\chi v_0^2 \\cdot 4 m_\\chi m_N/(m_\\chi+m_N)^2$. The page instead uses the closed form for a Maxwellian with $v_0 = 220$ km/s, cut at $v_{esc} = 544$ km/s and boosted by $v_E(t) = 232 + 14.6\\cos[2\\pi(t - 152.5\\text{ d})/365.25]$ km/s, with $\\rho_0 = 0.3$ GeV/cm³.</p>
<h3>Counting</h3>
<p>Expected signal is rate × fiducial mass × time in a 5 to 50 keV window. If you see nothing and expect no background, any model predicting more than 2.3 events is excluded at 90% confidence. The exclusion inset uses exactly that rule, so its curve is illustrative, not a real experiment’s result.</p>`,
  deep: [
    {
      title: 'Why direct detection is hard',
      html: `<p>A 40 GeV WIMP with a cross-section of $10^{-47}$ cm² gives only about 2 events per tonne per year in xenon between 5 and 50 keV. Meanwhile the rock, the steel of the cryostat and the detector’s own parts are mildly radioactive. Cosmic-ray muons make neutrons. Every one of these can fake a small energy deposit.</p>
<p>The defences stack up. Go deep underground: LZ is 1.5 km down in the Sanford Underground Research Facility in South Dakota, and XENONnT is under the Gran Sasso mountain in Italy. Build from carefully screened materials. Surround the tank with water and veto detectors. Then use the xenon itself. Gamma rays from outside rarely penetrate far into liquid xenon, which is almost three times as dense as water. Cutting away the outer layer, the fiducial cut, removes most of what remains. The toy here uses a 3 cm fall-off length, which is shorter than for real MeV gamma rays but shows the idea.</p>
<p>Finally, WIMPs would scatter off nuclei while gammas and betas scatter off electrons. In a TPC the ratio of charge (S2) to light (S1) is lower for nuclear recoils. This typically rejects more than 99.5 percent of electron recoils while keeping about half of the nuclear recoils. Neutrons remain the most dangerous background, because they also hit nuclei. Unlike WIMPs, they often scatter more than once in the tank.</p>`,
    },
    {
      title: 'How a dual-phase xenon TPC works',
      html: `<p>A particle deposits energy in the liquid. Some goes into prompt ultraviolet scintillation at 178 nm: the <strong>S1</strong> signal, seen by photomultipliers at both ends. Some goes into ionisation. An electric field drifts the freed electrons upward at roughly a millimetre per microsecond. At the surface a stronger field pulls them into a thin layer of xenon gas, where they make a second, larger flash by electroluminescence: the <strong>S2</strong> signal.</p>
<p>The time between S1 and S2 gives the depth. The pattern of S2 light on the top sensor array gives the horizontal position to within millimetres to centimetres. So every event gets a 3D position, and the fiducial cut can be applied after the fact. The scene slows all of this to human speed. A real drift across the full height of the LZ tank takes about a millisecond.</p>`,
    },
    {
      title: 'Annual modulation and the DAMA puzzle',
      html: `<p>Drukier, Freese and Spergel (1986) pointed out that the Earth’s orbit makes the WIMP wind stronger in June and weaker in December. A few percent change with a fixed phase would be a hard signature to fake. At low recoil energies the phase can even flip, because in June fewer WIMPs are slow. Drag the mass to 100 GeV with the inset on the spectrum to see where the June and December curves cross.</p>
<p>The DAMA/NaI and DAMA/LIBRA experiments at Gran Sasso, using about 250 kg of sodium iodide crystals, have reported such a modulation for more than two decades. It peaks near June and has a statistical significance above 12σ. Under standard halo assumptions, that signal is excluded by xenon and other experiments. Those use different targets, so model-dependent loopholes were argued for years.</p>
<p>The cleanest test uses the same material. COSINE-100 in South Korea found no modulation in 6.4 years of data and disfavours DAMA at more than 3σ. ANAIS-112 in Spain, with 112.5 kg of sodium iodide, reported six years of data incompatible with DAMA at about 4σ. A combined COSINE and ANAIS analysis (2025) excluded the DAMA amplitude at 4.68σ and 3.53σ in two energy windows. What causes DAMA’s modulation is still not settled. The DAMA collaboration stands by its result. Suggested explanations include how the background is subtracted each year. Further sodium iodide experiments, including SABRE in both hemispheres and COSINUS, are designed to test it.</p>`,
    },
    {
      title: 'Axions: from a symmetry puzzle to a radio search',
      html: `<p>The strong force could violate CP symmetry. If it did, the neutron would have an electric dipole moment. Experiments find none, which forces a parameter $\\bar\\theta$ below about $10^{-10}$. This fine-tuning is the <strong>strong CP problem</strong>. In 1977 Roberto Peccei and Helen Quinn proposed a new symmetry that drives $\\bar\\theta$ to zero dynamically. In 1978 Steven Weinberg and Frank Wilczek showed that it implies a new light particle, the axion.</p>
<p>Axions formed in the early Universe could be the dark matter. For many scenarios the mass is in the micro-eV range. In 1983 Pierre Sikivie proposed the <strong>haloscope</strong>. In a strong magnetic field an axion can convert into a photon of energy $m_a c^2$. A cold microwave cavity resonant at $f = m_a c^2/h$ collects that power. One micro-eV corresponds to 241.8 MHz. The power is so tiny that quantum-limited amplifiers are needed, and each frequency must be listened to long enough for the signal to rise above the noise. The signal-to-noise ratio grows as the square root of the dwell time, the radiometer equation.</p>
<p>ADMX, at the University of Washington, uses a cavity in a magnet of about 8 tesla, cooled to around 100 mK. It has reached the sensitivity of the weakly coupled DFSZ model over a band near 2.7 to 3.3 μeV (about 650 to 800 MHz). No axion has been found. Other haloscopes such as HAYSTAC and CAPP cover other bands. The scan in this page uses a far wider cavity linewidth than the real one so that the peak is visible.</p>`,
    },
    {
      title: 'Colliders, indirect searches and the neutrino fog',
      html: `<p><strong>Colliders.</strong> If the LHC made dark matter particles, they would escape unseen. ATLAS and CMS look for events where a single jet, photon or Z boson recoils against nothing, which shows up as missing transverse momentum. No excess has been found. A collider could never prove that such a particle is stable for billions of years or that it makes up the halo.</p>
<p><strong>Indirect searches.</strong> WIMPs in dense regions could annihilate into gamma rays, positrons or neutrinos. The Fermi-LAT gamma-ray telescope sees nothing extra from dwarf galaxies, which rules out the simplest thermal WIMPs below roughly 100 GeV for some annihilation channels. An excess of GeV gamma rays near the Galactic Centre and an excess of cosmic-ray positrons are both real observations. Both may come from pulsars, and neither is accepted as a dark matter signal.</p>
<p><strong>The neutrino fog.</strong> Neutrinos also bump whole nuclei, by coherent elastic neutrino-nucleus scattering. Solar neutrinos from boron-8 mimic a WIMP of about 6 GeV. Atmospheric neutrinos mimic heavier ones. In 2024 XENONnT and PandaX-4T reported the first hints of boron-8 neutrinos in xenon, at 2.7σ and 2.6σ. Below the fog, a signal must be separated from an irreducible background, and progress becomes much slower. The band in the exclusion inset is schematic.</p>
<p><strong>Where things stand.</strong> LZ’s 2024 result, with 4.2 tonne-years, found no excess and set its tightest limit of $2.2\\times10^{-48}$ cm² at 40 GeV. XENONnT’s 3.1 tonne-year search (2025) also found no signal. Many simple WIMP models are now excluded, and the space left for them is shrinking. Dark matter may still be WIMPs with smaller couplings, axions, something much lighter or heavier, or something not yet imagined.</p>`,
    },
  ],
  challenges: [
    {
      id: 'june',
      title: 'Catch the peak season',
      prompt: 'Find the time of year when the expected rate in the 5 to 50 keV window is highest for the current WIMP mass.',
      hint: 'Drag Month and watch the rate readout. For a 40 GeV WIMP the Earth’s speed through the halo matters most. When is it largest?',
      check: (s) => s.touchedMonth === true && Math.abs(s.modAmp as number) > 0.005 && (s.rateNow as number) >= 0.998 * (s.rateMaxYear as number),
    },
    {
      id: 'fiducial',
      title: 'Hide in the middle',
      prompt: 'Cut the expected wall background inside the fiducial volume below 0.5 events, while keeping at least 3 tonnes of xenon.',
      hint: 'In the Xenon TPC view, raise the Fiducial cut until the wall background readout drops. Too deep a cut throws away the target mass too.',
      check: (s) => (s.bgWall as number) < 0.5 && (s.mFid as number) >= 3,
    },
    {
      id: 'axion',
      title: 'Tune in the axion',
      prompt: 'Scan the haloscope until a candidate peak stands at least 5σ above the noise at the hidden axion frequency.',
      hint: 'Open Axion cavity and press Scan. If it sweeps past without a clear peak, slow the scan speed and scan again. Repeated scans add dwell time.',
      check: (s) => s.axionFound === true,
    },
    {
      id: 'kinematic',
      title: 'Hit the kinematic ceiling',
      prompt: 'Make the maximum recoil energy reach 90% of the heavy-WIMP limit $2m_N v^2$.',
      hint: 'Raise WIMP mass and watch the E_max ratio readout. The reduced mass creeps toward $m_N$ but never passes it.',
      check: (s) => s.touchedMass === true && (s.emaxRatio as number) >= 0.9,
    },
  ],
  caveats: `<p>The halo is the Standard Halo Model: an isotropic Maxwellian with $v_0 = 220$ km/s, a sharp cut at 544 km/s and $\\rho_0 = 0.3$ GeV/cm³. Real halos may have streams and anisotropy, and Gaia data suggest a more radially stretched component. Only spin-independent scattering with equal proton and neutron couplings is shown. Detector efficiency, energy resolution and the conversion from recoil energy to S1 and S2 are ignored.</p>
<p>The TPC background is a toy: an exponential fall-off from every wall plus a small uniform part, with invented rates. The events in the scene are sped up, and nuclear recoils are shown far more often than any real rate would give. A nuclear recoil in the centre could also be a neutron.</p>
<p>The exclusion curve is illustrative. It assumes zero background and 100% efficiency. The neutrino fog band is schematic. Only the two named LZ and XENONnT points are real published numbers.</p>
<p>The haloscope uses a cavity quality factor of 400 and a made-up noise level so that a sweep takes seconds. Real cavities have loaded Q of tens of thousands, and ADMX tunes in steps of kilohertz over months.</p>`,
  further: [
    { label: 'LZ Collaboration 2024, Dark matter search results from 4.2 tonne-years (arXiv)', url: 'https://arxiv.org/abs/2410.17036' },
    { label: 'COSINE-100 full dataset challenges the annual modulation of DAMA/LIBRA (arXiv)', url: 'https://arxiv.org/abs/2409.13226' },
    { label: 'ANAIS-112 results with six years of data (arXiv)', url: 'https://arxiv.org/abs/2502.01542' },
    { label: 'Axion (Wikipedia)', url: 'https://en.wikipedia.org/wiki/Axion' },
  ],
};
