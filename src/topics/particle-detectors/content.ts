import type { TopicContent } from '../../core/types.ts';

export const content: TopicContent = {
  intuition: `
<p class="lead">When two protons collide at the Large Hadron Collider, the debris flies out in every direction in a few billionths of a second. Nobody sees it directly. What we see is the trail each particle leaves as it crosses a detector the size of a building.</p>
<p>A modern collider detector is built like an <strong>onion</strong>. Each layer is good at one job, and each kind of particle gets a little further than the last before it stops.</p>
<ul>
<li>The <strong>tracker</strong> is closest to the collision. It records a few dots where each <em>charged</em> particle passes. It is thin on purpose, so it barely disturbs what goes through it.</li>
<li>The <strong>electromagnetic calorimeter</strong> (ECAL) is dense crystal. Electrons and photons crash into it and dump all their energy in a shower of lighter particles.</li>
<li>The <strong>hadronic calorimeter</strong> (HCAL) is thicker and made of metal. It stops protons, pions and neutrons.</li>
<li>Only <strong>muons</strong> get through all of that. The outermost layer is a set of muon chambers. If something makes it out there, it is almost certainly a muon.</li>
<li><strong>Neutrinos</strong> go through everything and leave nothing. We find them by what is missing. The debris should balance sideways, and when it does not, the imbalance points to an invisible particle.</li>
</ul>
<p>A huge magnet surrounds the tracker. Its field bends charged tracks. Fast particles bend a little and slow ones curl up. Measuring the bend gives the momentum. That one trick, plus the onion, is enough to tell every kind of particle apart.</p>
<p>In the scene, watch a Z boson decay to two muons. Two gently curved red tracks leave the tracker, cross every layer and light up the outer chambers. The small cyan curls near the middle are slow pions from the rest of the collision. Then run many events and watch a peak grow at 91 GeV in the corner. That peak is the Z boson.</p>`,
  tryFirst: [
    'Press <b>Next event</b> a few times. Look for the two red muon tracks reaching the outer chambers.',
    'Switch <b>Event</b> to <b>Z → ee</b>. The tracks now stop in the ECAL with a green shower. Then try <b>H → γγ</b>: showers with no tracks at all.',
    'Pick <b>W → eν</b>. A red arrow appears. It is the missing transverse momentum, the neutrino nobody saw.',
    'Press <b>Run N events</b> with N = 500 and watch the mass histogram build its peak.',
    'Drag <b>B field</b> to 0. Every track goes straight, and the momentum of the muons can no longer be measured.',
    'Switch <b>View</b> to <b>End-on</b> to see the classic view down the beam pipe.',
  ],
  equation: {
    tex: 'p_T\\,[\\text{GeV}] = 0.3\\,B\\,[\\text{T}]\\;R\\,[\\text{m}]',
    caption: 'A charged track in a magnetic field bends into a circle. Its radius gives the transverse momentum. Two measured particles then give the mass of their parent: $M^2 = (E_1+E_2)^2 - |\\vec p_1+\\vec p_2|^2$.',
    terms: [
      { tex: 'p_T', name: 'Transverse momentum', meaning: 'Momentum across the beam, in GeV/$c$. The readout shows the highest-$p_T$ track of the current event.', param: 'pt' },
      { tex: '0.3', name: 'Unit conversion', meaning: 'The exact value is $c/10^9 = 0.2998$. It turns $qBR$ in SI units into GeV/$c$ for a particle of charge $e$.' },
      { tex: 'B', name: 'Magnetic field', meaning: 'The solenoid field along the beam. The CMS solenoid runs at 3.8 T. At $B = 0$ tracks are straight and carry no momentum information.', param: 'B' },
      { tex: 'R', name: 'Radius of curvature', meaning: 'The radius of the circle the track follows, seen end-on. A 45 GeV muon in 3.8 T has $R \\approx 40$ m, so across a 1 m tracker it bends by only a few millimetres.', param: 'radius' },
      { tex: 'M', name: 'Invariant mass', meaning: 'Built from two tracks or two photons. It is the same in every frame, so it equals the mass of the particle that decayed.', param: 'mass' },
    ],
  },
  physicsNotes: `
<h3>Why a circle</h3>
<p>The magnetic force $q\\vec v \\times \\vec B$ is always sideways to the motion. It changes direction but never speed. In a uniform field along the beam, the motion across the beam is a circle and the motion along the beam is steady. The track is a helix. Setting the magnetic force equal to the centripetal force gives $p_T = qBR$. In collider units this becomes $p_T\\,[\\text{GeV}] = 0.3\\,B\\,[\\text{T}]\\,R\\,[\\text{m}]$.</p>
<p>The tracker does not see the whole circle. It sees an arc of length $L \\approx 1$ m, and the bend shows up as a <strong>sagitta</strong> $s \\approx L^2/8R = 0.3\\,BL^2/(8p_T)$. For a 45 GeV muon in 3.8 T that is about 3 mm. Silicon sensors locate each hit to tens of micrometres, which is why the momentum is known to about 1%. The sagitta shrinks as $1/p_T$, so the relative error grows with momentum. It also grows as $1/B$, which you can see by lowering the field and watching the peak smear out.</p>
<h3>From two particles to one mass</h3>
<p>Energy and momentum are conserved in a decay, so the parent four-momentum is the sum of the daughters. Its invariant length is the parent mass:</p>
$$M^2 = (E_1+E_2)^2 - |\\vec p_1 + \\vec p_2|^2 \\;\\approx\\; 2E_1E_2(1-\\cos\\theta_{12}).$$
<p>The last form holds when the daughters are much lighter than the parent. A Z boson can be moving fast in any direction, but this mass is the same in every frame. So every Z event lands near 91.19 GeV, and a histogram of many events shows a peak. Its width is the Z's own width of 2.5 GeV plus detector smearing.</p>
<h3>Missing transverse momentum</h3>
<p>The colliding protons have almost no momentum across the beam. So the transverse momenta of everything produced must add to zero. Anything that does not add up is carried by something unseen:</p>
$$\\vec p_T^{\\,\\text{miss}} = -\\sum_{\\text{visible}} \\vec p_T.$$
<p>Along the beam this trick fails, because the quarks and gluons that collide carry unknown fractions of the proton momentum. That is why detectors talk about <em>transverse</em> quantities all the time. For $W \\to e\\nu$ the histogram shows the transverse mass $m_T = \\sqrt{2p_T^e\\,p_T^{\\text{miss}}(1-\\cos\\Delta\\phi)}$. It can never exceed the W mass, so the distribution ends in a sharp edge near 80 GeV.</p>
<h3>Showers</h3>
<p>A high-energy electron in dense matter radiates a photon. The photon turns into an electron and a positron. Each of those radiates again. The toy model by Heitler says the number of particles doubles every radiation length $X_0$, so $N \\approx 2^t$ after $t$ radiation lengths. It stops when each particle reaches the critical energy $E_c$, where ionisation beats radiation. The shower is deepest at</p>
$$t_{\\max} = \\frac{\\ln(E_0/E_c)}{\\ln 2}.$$
<p>The depth grows only with the logarithm of the energy. That is why a 23 cm crystal is enough to contain electrons of hundreds of GeV. The bottom-right inset draws the toy shower for the most energetic electron or photon in the event.</p>`,
  deep: [
    {
      title: 'From cloud chambers to silicon',
      html: `<p>C. T. R. Wilson built the <strong>cloud chamber</strong> in 1911. A charged particle crossing supersaturated vapour leaves a trail of droplets that can be photographed. Carl Anderson found the positron in one in 1932, and with Seth Neddermeyer the muon in 1936. Both discoveries used a magnetic field to measure the bend.</p>
<p>Donald Glaser invented the <strong>bubble chamber</strong> in 1952. Its liquid is far denser than vapour, so it records many more interactions. Bubble chambers dominated the 1950s to 1970s. In 1973 the Gargamelle chamber at CERN saw weak neutral currents, the first evidence for the force carried by the Z boson.</p>
<p>Both were photographic. Someone had to scan the pictures. In 1968 Georges Charpak built the <strong>multiwire proportional chamber</strong>, a plane of thin wires that turns each passing particle into an electronic signal. It was far faster than any camera and fed its data straight to a computer. He received the 1992 Nobel Prize for it.</p>
<p>From the 1980s, <strong>silicon</strong> sensors took over the innermost layers. A charged particle frees electron and hole pairs in a thin reverse-biased silicon strip or pixel. Positions are measured to about 10 to 20 micrometres. That precision lets experiments see the few-millimetre flight of a b quark before it decays.</p>`,
    },
    {
      title: 'Why the onion is ordered this way',
      html: `<p>The order follows from one rule: <strong>measure gently first, destructively later</strong>.</p>
<ul>
<li>The tracker must be thin. Every gram of material makes electrons radiate and particles scatter, which spoils the curvature. So it goes first and uses as little material as possible.</li>
<li>Calorimeters measure energy by <em>absorbing</em> the particle. Once a particle showers, its track is gone. So they come after the tracker.</li>
<li>The ECAL is thin compared with the HCAL. Electromagnetic showers scale with the radiation length, which is 0.89 cm in lead tungstate. Hadronic showers scale with the nuclear interaction length, about 17 cm in iron and 20 cm in lead tungstate. A 23 cm crystal is about 26 radiation lengths but only about one interaction length. So electrons and photons stop in the ECAL, and most hadrons pass into the HCAL.</li>
<li>Muons are 200 times heavier than electrons, so they barely radiate. They are not affected by the strong force, so they do not make hadronic showers. They go through metres of iron. That is why the muon chambers are outside everything else.</li>
</ul>
<p>In the design shown here the solenoid sits outside the calorimeters. Its iron return yoke is interleaved with the muon chambers, and the field there points the other way. Look at a muon in the end-on view: it bends one way inside the coil and the other way outside.</p>`,
    },
    {
      title: 'How the Higgs boson was found in 2012',
      html: `<p>On 4 July 2012 the ATLAS and CMS collaborations announced a new boson near 125 GeV. Each saw it at about five standard deviations. The two strongest channels were the ones shown in this scene, done carefully.</p>
<p><strong>H → γγ.</strong> About 0.2% of Higgs bosons decay to two photons. The photons leave clean ECAL showers with no tracks. Their invariant mass forms a narrow bump on a large, smoothly falling background of ordinary photon pairs. The ECAL resolution is what makes the bump narrow enough to see.</p>
<p><strong>H → ZZ → 4ℓ.</strong> The Higgs can decay to two Z bosons, one of them off its mass shell, each going to an electron or muon pair. This is rare, but the four leptons are measured very precisely and the background is tiny. A handful of events clustered at 125 GeV.</p>
<p>The H → γγ preset here mixes signal and background events. In the real data the background under the peak was much larger than this demo shows. The bump only emerged from tens of thousands of photon pairs.</p>`,
    },
    {
      title: 'Triggers and data rates',
      html: `<p>At the LHC, bunches of protons cross 40 million times per second. Each crossing produces tens of overlapping collisions. Storing every one is impossible.</p>
<p>A <strong>trigger</strong> decides, very fast, which crossings to keep. The first level is custom hardware. It uses coarse calorimeter and muon information and cuts the rate to about 100,000 per second in a few microseconds. A farm of computers then runs a fast version of the full reconstruction and keeps on the order of a thousand events per second. Everything else is lost forever. So a search is only possible if its signature, like two energetic photons or a high-momentum muon, passes the trigger.</p>`,
    },
    {
      title: 'Particle flow and what the model leaves out',
      html: `<p>Real reconstruction combines all layers. A charged pion is measured best by the tracker at low energy and by the calorimeter at high energy. "Particle flow" algorithms link each track to its calorimeter deposits and keep the best measurement. This simulation does a crude version: tracks for charged particles, ECAL for electrons and photons, HCAL for neutral hadrons.</p>
<p>It also leaves out a lot. Electrons radiate in the tracker material. Photons sometimes convert into electron pairs before the ECAL. Hadrons start showers in the ECAL. Muons lose a little energy in the iron. Many collisions pile up in each crossing. All of these matter for real measurements.</p>`,
    },
  ],
  challenges: [
    {
      id: 'muon',
      title: 'Identify a muon',
      prompt: 'Set <b>Event</b> to <b>Mystery</b>. When an event contains muons, press <b>Muon</b> under <b>Your call</b>.',
      hint: 'Muons are the only tracks that reach the outermost chambers. Keep pressing Next event until you see one.',
      check: (s) => s.muonIdentified === true,
    },
    {
      id: 'zpeak',
      title: 'Weigh the Z boson',
      prompt: 'Using Z → μμ or Z → ee, collect at least 300 events and get the fitted peak within 2 GeV of 91.19 GeV.',
      hint: 'Run 500 events at 3.8 T. A weak field smears the muon peak.',
      check: (s) => s.touched === true && (s.zEntries as number) >= 300 && Math.abs((s.zPeak as number) - 91.19) <= 2,
    },
    {
      id: 'neutrino',
      title: 'See the invisible',
      prompt: 'Display a W → eν event with more than 30 GeV of missing transverse momentum.',
      hint: 'Pick W → eν and press Next event. The red arrow points where the neutrino went.',
      check: (s) => s.neutrinoFound === true,
    },
    {
      id: 'straight',
      title: 'Switch off the magnet',
      prompt: 'Set the field to 0 T and display an event. Every track should be a straight line.',
      hint: 'Drag the B field slider fully left, then press Next event.',
      check: (s) => s.straightSeen === true,
    },
  ],
  caveats: `<p>This is a teaching model, not a detector simulation. The geometry is generic with proportions like the large LHC detectors. Resolutions are simple formulas close to published values for a 3.8 T tracker and a lead tungstate ECAL. The field is perfectly uniform inside the coil and simply reversed in the yoke.</p>
<p>Events are generated with correct decay kinematics but not full theory. Boson transverse momentum is a simple exponential. Jets are a handful of particles in a cone, not a parton shower. The H → γγ background is far smaller than in real data. There is no pile-up, no material effects before the calorimeters, and no fake leptons.</p>
<p>The Heitler shower is a cartoon. It gets the logarithmic growth of depth right, but it overestimates the depth. The PDG estimate for a 50 GeV electron in lead tungstate is about 8 radiation lengths, not 12.</p>`,
  further: [
    { label: 'CMS Collaboration, The CMS experiment at the CERN LHC (JINST 2008)', url: 'https://doi.org/10.1088/1748-0221/3/08/S08004' },
    { label: 'ATLAS Collaboration, Observation of a new particle in the search for the Standard Model Higgs boson (arXiv:1207.7214)', url: 'https://arxiv.org/abs/1207.7214' },
    { label: 'CMS Collaboration, Observation of a new boson at a mass of 125 GeV (arXiv:1207.7235)', url: 'https://arxiv.org/abs/1207.7235' },
    { label: 'Particle detector on Wikipedia', url: 'https://en.wikipedia.org/wiki/Particle_detector' },
  ],
};
