import type { TopicContent } from '../../core/types.ts';
import { chirpMass, GW150914 } from './physics.ts';

const MC_150914 = chirpMass(GW150914.m1, GW150914.m2);

export const content: TopicContent = {
  intuition: `
<p class="lead">Shake a mass and space itself ripples. The ripple does not push things around. It changes the distances between them, stretching one way while it squeezes the other.</p>
<p>Picture a circle of dust floating freely in space. A gravitational wave passes through it, head on. The circle becomes an oval, tall and thin. Half a cycle later it is an oval lying on its side. Then it is tall again. Nothing pushed the dust. The space between the grains grew in one direction and shrank in the other. The area of the circle stays the same to a very good approximation, so the wave is a pure change of shape.</p>
<p>The strongest waves come from two black holes circling each other. They lose orbital energy to the waves, so they sink closer together. Closer means faster, and faster means stronger waves. The result is a <strong>chirp</strong>: a signal that climbs in pitch and loudness, then stops dead when the two holes merge into one.</p>
<p>The surprise is how small it all is. The first chirp ever caught, in September 2015, came from black holes about 30 times the Sun's mass each. By the time it reached Earth it changed a 4 km detector arm by a few billionths of a billionth of a metre. That is hundreds of times smaller than a proton.</p>
<p>In the scene, the middle grid is space around the binary. Its two-armed spiral is the wave pattern leaving the pair. On the left, a ring of free particles feels the wave. On the right, a detector shaped like an L has one arm stretched while the other shrinks. Every motion is hugely exaggerated. The inset plot is the real chirp shape, with a marker that shows where you are.</p>`,
  tryFirst: [
    'Let it play. Watch the chirp marker move right as the orbit shrinks and the ring pulses faster and harder.',
    'Switch <b>Polarization</b> to <b>×</b>. The same pulsing appears, turned by 45°. The detector arms stop moving, because they only feel the + part.',
    'Press <b>Merge (GW150914)</b> to replay the first detection, from 20 cycles out to the ringdown.',
    'Drag <b>Distance</b> and read the <b>strain</b>. Twice as far gives half the strain.',
  ],
  equation: {
    tex: 'h \\;\\sim\\; \\frac{4}{D}\\left(\\frac{G\\mathcal{M}_c}{c^2}\\right)^{5/3}\\left(\\frac{\\pi f}{c}\\right)^{2/3}',
    caption: 'The strain from a binary in a circular orbit, seen face on, at leading order. Everything that sets the size of the ripple is in here: one combination of the masses, the frequency and the distance.',
    terms: [
      { tex: 'h', name: 'Strain', meaning: 'The fractional change in length, $\\Delta L / L$. A dimensionless number near $10^{-21}$ for the loudest events. The ring and the arms show it multiplied by the exaggeration factor.', param: 'strain' },
      { tex: 'D', name: 'Distance', meaning: 'The luminosity distance to the source. The strain falls as $1/D$, not $1/D^2$, because detectors measure the wave amplitude, not its energy.', param: 'D' },
      { tex: '\\mathcal{M}_c', name: 'Chirp mass', meaning: 'The mass combination $(m_1 m_2)^{3/5}/(m_1+m_2)^{1/5}$. It alone sets how fast the chirp sweeps at leading order, so it is the best-measured mass in a detection.', param: 'mc' },
      { tex: 'f', name: 'Wave frequency', meaning: 'The gravitational-wave frequency, twice the orbital frequency. The quadrupole pattern repeats every half orbit. It rises as $(t_c - t)^{-3/8}$.', param: 'f' },
      { tex: '\\frac{G\\mathcal{M}_c}{c^2}', name: 'Chirp length', meaning: 'The chirp mass turned into a length. For the Sun, $GM_\\odot/c^2 \\approx 1.48$ km. Heavier binaries give louder waves.', param: 'm1' },
    ],
  },
  physicsNotes: `
<h3>The chirp mass and the frequency sweep</h3>
<p>Two masses $m_1$ and $m_2$ on a circular orbit radiate at twice the orbital frequency. At leading order only one mass combination appears in the signal:</p>
$$\\mathcal{M}_c = \\frac{(m_1 m_2)^{3/5}}{(m_1+m_2)^{1/5}}$$
<p>For GW150914, with $m_1 \\approx 36$ and $m_2 \\approx 29$ solar masses, this gives $\\mathcal{M}_c \\approx ${MC_150914.toFixed(1)}\\,M_\\odot$.</p>
<p>The derivation route is an energy balance. The orbital energy is $E = -Gm_1m_2/2a$. The quadrupole formula gives the power carried off by the waves. Kepler's third law links the separation $a$ to the frequency. Put together they give the chirp rate</p>
$$\\frac{df}{dt} = \\frac{96}{5}\\,\\pi^{8/3}\\left(\\frac{G\\mathcal{M}_c}{c^3}\\right)^{5/3} f^{11/3}$$
<p>Integrate it and the frequency runs away at a definite time $t_c$, the coalescence:</p>
$$f(t) = \\frac{1}{\\pi}\\left(\\frac{5}{256\\,(t_c - t)}\\right)^{3/8}\\left(\\frac{G\\mathcal{M}_c}{c^3}\\right)^{-5/8}$$
<p>The phase follows as $\\Phi = -2\\,[(t_c - t)/5T]^{5/8}$ with $T = G\\mathcal{M}_c/c^3$. The scene plays these closed forms. There is no numerical integration, so there is no step error. The headline equation then gives the amplitude at each moment.</p>
<h3>What the scene shows</h3>
<p>The replay covers the last 20 wave cycles before the <strong>innermost stable circular orbit</strong>, where $f_{\\text{ISCO}} = c^3/(6^{3/2}\\pi G M)$. Up to there the formula is a fair first approximation. Past ISCO the plot is shaded. The chirp is continued a little further, then handed to a damped ringdown at the rough frequency of the final black hole. That part is a sketch and is labelled as one.</p>
<p>The ring and the arms deform as</p>
$$\\delta x = \\tfrac12\\left(h_+ x + h_\\times y\\right), \\qquad \\delta y = \\tfrac12\\left(h_\\times x - h_+ y\\right)$$
<p>The <b>ring area</b> readout checks the shape change. The map has zero trace, so the area changes only at second order, by $-(h_+^2+h_\\times^2)/4$.</p>`,
  deep: [
    {
      title: 'From Einstein’s equations to two polarizations',
      html: `<p>Far from any source, write the metric as flat space plus a small correction, $g_{\\mu\\nu} = \\eta_{\\mu\\nu} + h_{\\mu\\nu}$, and keep only terms linear in $h$. With a good choice of coordinates, Einstein’s field equations become the ordinary wave equation</p>
$$\\Box\\, \\bar h_{\\mu\\nu} = -\\frac{16\\pi G}{c^4}\\, T_{\\mu\\nu}$$
<p>In empty space the right side vanishes and the solutions travel at the speed of light. Of the ten components of $h_{\\mu\\nu}$, only two carry physics. In the transverse-traceless gauge, for a wave moving along $z$,</p>
$$h_{ij} = \\begin{pmatrix} h_+ & h_\\times & 0 \\\\ h_\\times & -h_+ & 0 \\\\ 0 & 0 & 0 \\end{pmatrix}$$
<p>The wave acts only across its direction of travel. It is traceless, so a stretch along one axis always comes with an equal squeeze along the other. That is why the ring keeps its area to first order. The $\\times$ pattern is the $+$ pattern turned by 45°. A spin-2 field repeats after a turn of 180°, not 360° as for light.</p>
<p>A binary seen face on emits both at equal strength, a quarter cycle apart. That is <strong>circular</strong> polarization: the oval shape simply rotates. Seen edge on, only $h_+$ survives.</p>`,
    },
    {
      title: 'The quadrupole formula and why the chirp ends',
      html: `<p>Mass cannot produce dipole radiation. The dipole moment of a mass distribution is its total mass times the position of its centre of mass. Momentum conservation keeps that from oscillating. The leading radiation is the <strong>quadrupole</strong>. Einstein derived a version of it in 1918. In modern form the radiated power is</p>
$$P = \\frac{G}{5c^5}\\,\\dddot{Q}_{ij}\\,\\dddot{Q}_{ij}$$
<p>where $Q_{ij}$ is the traceless mass quadrupole. The factor $G/c^5 \\approx 3\\times10^{-53}$ W$^{-1}$ explains why no laboratory can make detectable waves. Only enormous masses moving near light speed radiate strongly.</p>
<p>For a binary, the power rises steeply as the orbit shrinks. The inspiral speeds up and the frequency obeys $f \\propto (t_c - t)^{-3/8}$. The formula blows up at $t_c$, but real bodies touch before then. For black holes, the leading-order formula stops being trustworthy near the ISCO. The final plunge and merger need numerical relativity, first solved in 2005. The merged hole then rings like a struck bell and settles within a few milliseconds for stellar masses.</p>
<p>How many cycles you see depends on the masses. Light systems chirp slowly. GW170817, two neutron stars, stayed in the detectors’ band for about 100 seconds and thousands of cycles. GW150914 lasted about 0.2 s and about 8 cycles.</p>`,
    },
    {
      title: 'A century of doubt, then a pulsar',
      html: `<p>Einstein predicted gravitational waves in 1916, months after he completed general relativity. He then doubted them for decades. Part of the trouble was coordinates. Some of the “waves” in the equations were only wobbles in the grid used to describe flat space. Arthur Eddington joked in 1922 that those travelled “at the speed of thought”.</p>
<p>In 1936 Einstein and Nathan Rosen sent <em>Physical Review</em> a paper arguing that gravitational waves do not exist. An anonymous referee found the mistake. Einstein withdrew the paper in anger. A corrected version, now describing real waves, appeared in 1937 in another journal.</p>
<p>The question of whether the waves carry energy was settled in the late 1950s. At the 1957 Chapel Hill conference, Richard Feynman offered the <strong>sticky bead</strong> argument. Put beads on a rigid rod. A passing wave moves the beads relative to the rod. Friction then heats the rod, so the wave must carry energy. The ring of particles in the scene is the same thought experiment without the rod.</p>
<p>The first hard evidence came from the sky. In 1974 Russell Hulse and Joseph Taylor found the pulsar PSR B1913+16 in a 7.75 hour orbit around another neutron star. Over the following years its orbit shrank at exactly the rate the quadrupole formula predicts, a period change of about 76 microseconds per year. They shared the 1993 Nobel Prize in Physics.</p>`,
    },
    {
      title: 'LIGO and GW150914',
      html: `<p>A LIGO detector is a Michelson interferometer with 4 km arms at right angles. Laser light splits, travels down both arms, bounces off hanging mirrors and recombines. If one arm stretches while the other shrinks, the light returning from the two arms falls out of step. The output brightens or dims. A wave arriving from overhead with $+$ polarization aligned to the arms gives the largest signal. A $\\times$ wave in the same frame gives none, which you can see in the scene.</p>
<p>On 14 September 2015 at 09:50:45 UTC, both LIGO detectors, in Hanford and Livingston, recorded the same chirp about 7 ms apart. It swept from 35 to 250 Hz with a peak strain of $1.0\\times10^{-21}$. Matched to general relativity, it came from black holes of about $36$ and $29$ solar masses merging about 410 megaparsecs away, roughly 1.3 billion light years. The final hole had about 62 solar masses. About 3 solar masses of energy left as gravitational waves in a fraction of a second.</p>
<p>A strain of $10^{-21}$ on a 4 km arm is a length change of a few times $10^{-18}$ m. Measuring that took suspended mirrors, high laser power, light stored in the arms, and years of noise hunting. Rainer Weiss, Barry Barish and Kip Thorne shared the 2017 Nobel Prize in Physics for LIGO and the detection.</p>
<p>Try the headline formula on the published numbers: $\\mathcal{M}_c \\approx 28\\,M_\\odot$, $D = 410$ Mpc and $f = 150$ Hz give $h \\approx 2\\times10^{-21}$. That is the right order. The measured value is lower because the detectors did not see the binary face on or from directly overhead.</p>`,
    },
    {
      title: 'Multi-messenger astronomy and the nanohertz sky',
      html: `<p>On 17 August 2017 LIGO and Virgo recorded <strong>GW170817</strong>, from two neutron stars about 40 Mpc away. About 1.7 seconds after the merger time, the Fermi and INTEGRAL satellites caught a short gamma-ray burst from the same patch of sky. Telescopes then found a new source in the galaxy NGC 4993: a <strong>kilonova</strong>, the glow of freshly made heavy elements from neutron-rich debris. Gravitational waves and light arrived so close together that their speeds agree to about one part in $10^{15}$.</p>
<p>Ground detectors hear roughly 10 Hz to a few kHz. Supermassive black hole pairs radiate at nanohertz frequencies, with periods of years. The detector for those is the galaxy. <strong>Pulsar timing arrays</strong> watch dozens of millisecond pulsars for tiny, correlated shifts in their tick times. A background of waves should correlate pulsar pairs in a particular way with their angle on the sky, the Hellings–Downs curve.</p>
<p>In June 2023 NANOGrav, the European and Indian arrays, the Parkes array and the Chinese array reported <strong>evidence</strong> for such a background. Each array saw hints of the expected correlation, at levels that differ between arrays. None reached the 5 sigma level usually asked of a detection. So this is strong evidence, not yet a definitive detection. Merging supermassive black hole binaries are the leading explanation, but other sources are not ruled out.</p>`,
    },
  ],
  challenges: [
    {
      id: 'cross',
      title: 'Turn the pattern',
      prompt: 'Switch to $\\times$ polarization and watch the ring pulse along the diagonals.',
      hint: 'Use the <b>Polarization</b> buttons. The stretch axes turn by 45°, not 90°. Notice the detector arms stop moving.',
      check: (s) => s.pol === 'cross' && (s.ringH as number) > 0.02,
    },
    {
      id: 'chirpmass',
      title: 'Rebuild GW150914',
      prompt: `Set the masses by hand so the chirp mass is within 5% of GW150914’s ${MC_150914.toFixed(1)} $M_\\odot$, without matching its masses exactly.`,
      hint: 'Many pairs share one chirp mass. Try equal masses near 32 $M_\\odot$, or 45 and 22. Watch the <b>chirp mass</b> readout.',
      check: (s) => s.massTouched === true && Math.abs((s.mc as number) / MC_150914 - 1) <= 0.05 && !(s.m1 === 36 && s.m2 === 29) && !(s.m1 === 29 && s.m2 === 36),
    },
    {
      id: 'merge',
      title: 'All the way down',
      prompt: 'Start a run yourself and watch it through the merger and ringdown to the end.',
      hint: 'Press <b>Reset</b> or <b>Merge (GW150914)</b>, then keep playing. Raise <b>Time scale</b> if you are impatient.',
      check: (s) => (s.userMerges as number) >= 1,
    },
    {
      id: 'distance',
      title: 'Twice as far',
      prompt: 'Change the distance so that it doubles, and check the strain halves.',
      hint: 'Note the <b>strain</b> readout, then drag <b>Distance</b> to twice its value. Energy falls as $1/D^2$, amplitude as $1/D$.',
      check: (s) => s.dTouched === true && (s.dMax as number) >= 2 * (s.dMin as number) - 1e-9,
    },
  ],
  caveats: `<p>The inspiral uses the leading-order (Newtonian quadrupole) chirp. Real waveforms include post-Newtonian corrections, spins and orbital eccentricity. Near the end these corrections are large.</p>
<p>Everything after the innermost stable circular orbit is a sketch. The chirp formula is continued a little, then joined to a single damped ringdown whose frequency comes from published fits and a rough guess of the final mass. The true merger needs numerical relativity.</p>
<p>The strain formula assumes a face-on binary and an ideally aligned detector. Real strains are smaller by orientation factors. Distances are treated as nearby, with no cosmological redshift. For GW150914 that redshift is about 0.09, which shifts masses by 9%.</p>
<p>The spiral grid is a picture, not a solution. Its height stands for the local $h_+$, with a made-up falloff near the centre and a wave speed chosen to fit the screen. The ring, the arms and the orbit are exaggerated by enormous factors, and time runs in slow motion. The detector shows the wave arriving at once, with no light-travel delay from the source.</p>`,
  further: [
    { label: 'LIGO and Virgo (2016), Observation of gravitational waves from a binary black hole merger', url: 'https://doi.org/10.1103/PhysRevLett.116.061102' },
    { label: 'LIGO and Virgo (2017), GW170817: observation of gravitational waves from a binary neutron star inspiral', url: 'https://doi.org/10.1103/PhysRevLett.119.161101' },
    { label: 'NANOGrav (2023), evidence for a gravitational-wave background', url: 'https://doi.org/10.3847/2041-8213/acdac6' },
    { label: 'Gravitational wave on Wikipedia', url: 'https://en.wikipedia.org/wiki/Gravitational_wave' },
  ],
};
