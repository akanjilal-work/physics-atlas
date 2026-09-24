import type { TopicContent } from '../../core/types.ts';

export const content: TopicContent = {
  intuition: `
<p class="lead">Every particle of ordinary matter has a mirror twin with the same mass and the opposite charge. When a particle meets its twin, both vanish. Their mass turns completely into light.</p>
<p>The positron is the electron's twin. You can make one from pure light. A gamma ray that passes close to an atomic nucleus can turn into an electron and a positron. There is a price: the photon must carry at least the rest energy of both particles, $2m_ec^2 = 1.022$ MeV. Below that, nothing happens.</p>
<p>The first view is a <strong>cloud chamber</strong>. The photon leaves no trail, because it has no charge. Where it converts, two vapour trails appear and curl away in opposite directions. The magnetic field pushes positive and negative charges to opposite sides. As they slow down, the curls tighten into spirals. That is how Carl Anderson spotted the first positron in 1932.</p>
<p>The second view is a <strong>PET scanner</strong>. A patient receives a sugar tagged with a positron emitter. Each positron soon meets an electron. The pair turns into two photons of 511 keV that fly off in opposite directions. A ring of detectors catches both at once and draws a line between the hits. The source lies somewhere on that line. Thousands of lines cross at the hot spot.</p>
<p>The third view is the <strong>ALPHA-g</strong> experiment at CERN. Atoms of antihydrogen float in a magnetic bottle. Switch the bottle off slowly and count where the atoms hit the wall. In 2023 the answer came in: antimatter falls down, like everything else.</p>`,
  tryFirst: [
    'In the cloud chamber, drag <b>photon energy</b> below the 1.022 MeV mark. The photon now crosses the chamber and nothing appears. Push it back above.',
    'Flip the <b>B field</b> to a negative value. The two trails swap sides.',
    'Switch to <b>PET</b> and raise the <b>event rate</b>. Watch the lines of response pile up and the inset image sharpen around the hot spot.',
    'Switch to <b>ALPHA drop</b>, press <b>Ramp down</b> and watch the counters. Then try again with gravity set to <b>−g</b>.',
  ],
  equation: {
    tex: 'E_\\gamma \\;\\ge\\; 2\\,m_e c^2 \\;=\\; 1.022\\ \\text{MeV}',
    caption: 'The pair-production threshold. The photon must pay for the rest energy of two electrons. The same exchange runs backwards when they annihilate: E = mc² turns the whole mass back into light.',
    terms: [
      { tex: 'E_\\gamma', name: 'Photon energy', meaning: 'The energy of the incoming gamma ray. Anything above the threshold becomes kinetic energy of the pair.', param: 'egamma' },
      { tex: 'm_e c^2', name: 'Electron rest energy', meaning: 'The energy locked in one electron or positron at rest: 0.511 MeV. It is also the energy of each annihilation photon.', param: 'e511' },
      { tex: '2\\,m_e c^2', name: 'Threshold', meaning: 'Two particles must be made, so the price is twice the rest energy. A nearby nucleus absorbs the recoil momentum, so the threshold stays at 1.022 MeV.', param: 'threshold' },
      { tex: '1.022\\ \\text{MeV}', name: 'Energy balance', meaning: 'The photon energy minus the threshold is shared between the positron and electron as kinetic energy. The balance readout checks that nothing is lost.', param: 'balance' },
    ],
  },
  physicsNotes: `
<h3>Why a nucleus has to be nearby</h3>
<p>A lone photon cannot turn into a pair. In the pair's centre-of-mass frame the total momentum is zero, but a photon has momentum in every frame. Something else must take up the difference. A heavy nucleus does this while taking almost no energy. For a target of mass $M$ the exact threshold is</p>
$$E_\\gamma \\ge 2m_ec^2\\left(1 + \\frac{m_e}{M}\\right)$$
<p>For a lead nucleus the correction is a few eV. If the target is an electron instead, $M = m_e$ and the threshold doubles to $4m_ec^2 = 2.044$ MeV.</p>
<h3>Opposite charges, opposite curls</h3>
<p>A charge $q$ moving at velocity $\\mathbf v$ in a field $\\mathbf B$ feels $\\mathbf F = q\\,\\mathbf v \\times \\mathbf B$. The force is sideways, so the path is a circle of radius</p>
$$r = \\frac{p}{|q|B}$$
<p>With $p$ in MeV/c and $B$ in tesla this is $r \\approx 3.34\\,\\text{mm} \\times p/B$. An electron and a positron with the same momentum have the same radius. They turn in opposite directions. In the scene, B points out of the screen when it is positive, so the positron turns clockwise. The gas slowly drains their energy, $r$ shrinks, and the circles close into spirals.</p>
<h3>Annihilation</h3>
<p>Run the process backwards. A slow positron and electron have total energy $2m_ec^2$ and almost no momentum. Two photons can carry that away if they fly in opposite directions with equal energy. Each photon gets $m_ec^2 = 511$ keV. Often the pair first forms <em>positronium</em>, a short-lived atom. The para state (spins opposite) decays into two photons in about 125 ps. The ortho state (spins parallel) cannot decay into two photons. It needs three, and lives about 142 ns in vacuum.</p>`,
  deep: [
    {
      title: 'Dirac\'s prediction and Anderson\'s plate',
      html: `<p>In 1928 Paul Dirac wrote a wave equation for the electron that obeyed special relativity. It worked beautifully, but it also had solutions with negative energy. Dirac first guessed that the "holes" among these states were protons. The masses did not match. In 1931 he proposed a new particle instead, with the electron's mass and the opposite charge: the anti-electron.</p>
<p>Carl Anderson was photographing cosmic rays in a cloud chamber at Caltech inside a strong magnet. In 1932 he saw tracks that curved like electrons but the wrong way. A track curving one way could be a negative particle going down or a positive particle going up. To settle the direction he put a 6 mm lead plate across the chamber. A particle loses energy in the plate, so its track curls more tightly on the far side. His famous track entered with about 63 MeV and left with about 23 MeV. It was moving upward and it was positive. It was also far too light to be a proton. Anderson shared the 1936 Nobel Prize in Physics for the discovery.</p>
<p>Turn on the lead plate in the cloud chamber view to see the same trick. The scene uses a thin plate, because the pairs here have only a few MeV.</p>`,
    },
    {
      title: 'Antiprotons and antihydrogen',
      html: `<p>A positron was one thing. Did heavy particles have twins too? The Bevatron at Berkeley was built with enough energy to find out. In 1955 Owen Chamberlain, Emilio Segrè, Clyde Wiegand and Tom Ypsilantis identified the antiproton. Chamberlain and Segrè received the 1959 Nobel Prize.</p>
<p>An antiproton and a positron can form antihydrogen. In 1995 a team at CERN's LEAR ring made nine atoms, moving at nearly the speed of light. Each one annihilated almost at once. In 2002 the ATHENA and ATRAP collaborations at CERN made slow, cold antihydrogen in large numbers. In 2010 ALPHA trapped antihydrogen in a magnetic bottle for the first time, and later held atoms for many minutes. Since then its spectrum has been measured. The 1S to 2S line matches hydrogen to a few parts in a trillion.</p>`,
    },
    {
      title: 'Does antimatter fall down?',
      html: `<p>General relativity says every kind of mass and energy falls the same way. Still, nobody had ever watched antimatter fall. Charged antiparticles are useless for this, because stray electric fields push them far harder than gravity does. Neutral antihydrogen solves that.</p>
<p>The ALPHA-g apparatus holds antihydrogen in a tall, vertical magnetic trap. The team slowly lowered the current in the top and bottom mirror coils over about 20 seconds and recorded where each atom annihilated. They repeated the release with the two mirrors deliberately unbalanced, which mimics extra gravity up or down. Comparing with detailed simulations, they found an acceleration of $(0.75 \\pm 0.13 \\pm 0.16)\\,g$, downward. The result is consistent with ordinary gravity and rules out antimatter falling up at the same rate (E. K. Anderson et al., <i>Nature</i> 621, 716, 2023). The precision is still modest. A small difference from $g$ is not yet excluded.</p>
<p>The third view is a <strong>simplified model</strong> of this idea. Gravity tilts the trap, so the bottom barrier is slightly lower than the top one. With a slow ramp, most atoms find the lower exit. A fast ramp gives them no time to find it, and they leave in both directions about equally.</p>`,
    },
    {
      title: 'Why antimatter is not a fuel',
      html: `<p>Annihilation turns all of the mass into energy. One gram of antimatter has a rest energy of $mc^2 \\approx 9\\times10^{13}$ J. Together with one gram of matter it releases $1.8\\times10^{14}$ J, the energy of about 43 kilotons of TNT. Nuclear fission converts less than one part in a thousand of its fuel's mass.</p>
<p>The catch is making it. Antiprotons come from slamming high-energy protons into a metal target. Only a tiny fraction of collisions produce one, and only some of those can be caught and cooled. Far less than a millionth of the energy spent comes back in annihilation. Everything made at CERN in its history adds up to a few nanograms at most. Storage is just as hard: antimatter must never touch the walls of its container. So antimatter is a superb probe of physics and a hopeless battery. It can carry energy only after someone else has paid for it many times over.</p>`,
    },
    {
      title: 'PET medicine, and the missing antimatter',
      html: `<p>Positron emission tomography puts antimatter to work every day. The most common tracer is fluorodeoxyglucose, a glucose analogue carrying fluorine-18. Fluorine-18 decays with a half-life of about 110 minutes by emitting a positron. The positron travels about a millimetre in tissue, then annihilates. Busy cells that take up more sugar, such as many tumours, glow brighter in the image.</p>
<p>Real scanners add corrections the scene leaves out. They filter the projections before backprojecting, or use iterative methods, which removes the blur you see around the hot spot. They correct for photons absorbed or scattered in the body. Modern scanners also time the two photons. A difference of 1 ns places the source about 15 cm along the line, which cuts down the noise.</p>
<p>A deeper puzzle hides here. The laws of physics treat matter and antimatter almost the same. Yet the universe is made of matter, and almost no primordial antimatter survives. Where the antimatter went is one of the great open questions. See <a href="#/t/matter-asymmetry">Why Is There Matter?</a></p>`,
    },
  ],
  challenges: [
    {
      id: 'threshold',
      title: 'Cross the pair threshold',
      prompt: 'In the cloud chamber, lower the photon energy until no pair appears, then raise it until the photon converts again.',
      hint: 'The threshold is $2m_ec^2 = 1.022$ MeV, marked on the slider. Go below it, then above it.',
      check: (s) => s.crossedUp === true,
    },
    {
      id: 'identify',
      title: 'Which one is the positron?',
      prompt: 'Press <b>Mystery pair</b>. The trails lose their colours and the field may flip. Use the field direction to say which trail is the positron.',
      hint: 'F = qv × B. With B out of the screen (⊙), a positive charge moving right is pushed down, so it turns clockwise. With B into the screen (⊗) it turns the other way.',
      check: (s) => s.quizCorrect === true,
    },
    {
      id: 'pet',
      title: 'Find the hot spot',
      prompt: 'In PET, press <b>Hide a random spot</b>. Collect at least 150 events, then click the inset image where you think the spot is. Land within 1 cm.',
      hint: 'The lines of response cross most often at the source. Raise the event rate, wait for the bright blob in the inset, and click its centre.',
      check: (s) => s.petHidden === true && (s.petEvents as number) >= 150 && (s.petGuessErr as number) <= 1,
    },
    {
      id: 'fall',
      title: 'Watch antihydrogen fall',
      prompt: 'With gravity set to the measured value (+g) and no bias, release the trap and get at least two thirds of the atoms to leave through the bottom.',
      hint: 'A fast ramp scatters atoms both ways. Set the ramp time to 10 s or more, then press Ramp down and wait until the trap is empty.',
      check: (s) => s.alphaDone === true && s.ag === 1 && s.bias === 0 && (s.pDown as number) >= 2 / 3,
    },
  ],
  caveats: `<p>The cloud chamber is flat. Real tracks are helices in three dimensions. Energy loss in the gas is exaggerated about ten times so the spirals close inside the chamber. The energy split between positron and electron is drawn at random, and the nucleus recoil is ignored. The lead plate applies the mean energy loss. Real losses in lead fluctuate a lot from one particle to the next.</p>
<p>The PET scanner is a single slice with a coarse ring of detectors. Every photon pair is detected. There is no absorption, scatter, random coincidence or positron range. The half-degree spread in the photon angle is included. The image is plain unfiltered backprojection, which is why the spot sits in a blurred halo.</p>
<p>The ALPHA view is a one-dimensional toy model, not the experiment. The atoms move only up and down between two mirror barriers. Gravity is exaggerated many times relative to the trap depth so the effect shows in seconds. The real analysis relied on detailed simulations of the full magnetic field and the atoms' three-dimensional motion.</p>`,
  further: [
    { label: 'Antimatter on Wikipedia', url: 'https://en.wikipedia.org/wiki/Antimatter' },
    { label: 'Anderson, "The Positive Electron", Phys. Rev. 43, 491 (1933)', url: 'https://doi.org/10.1103/PhysRev.43.491' },
    { label: 'ALPHA collaboration, "Observation of the effect of gravity on the motion of antimatter", Nature (2023)', url: 'https://doi.org/10.1038/s41586-023-06527-1' },
    { label: 'Positron emission tomography on Wikipedia', url: 'https://en.wikipedia.org/wiki/Positron_emission_tomography' },
  ],
};
