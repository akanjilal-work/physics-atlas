import type { TopicContent } from '../../core/types.ts';

export const content: TopicContent = {
  intuition: `
<p class="lead">Leave a free neutron alone and in about fifteen minutes it turns into a proton. An electron shoots out, and so does a ghostly particle that almost nothing can stop. The force behind this change is the weak force. It is the only force that can turn one kind of quark into another.</p>
<p>The first scene shows the change up close. A neutron holds one up quark and two down quarks. One down quark throws off a heavy <strong>W⁻ boson</strong> and becomes an up quark. The neutron is now a proton. The W⁻ is far too heavy to exist for long. Almost at once it becomes an electron and an antineutrino.</p>
<p>Watch the numbers after each decay. The electron gets a different share of the energy every time, and the antineutrino carries off the rest. In 1930 this puzzled everyone. Electrons from beta decay came out with a smear of energies, as if energy were being lost. Wolfgang Pauli guessed that an unseen neutral particle was taking the missing part. He was right. It is the neutrino, and it was finally caught in 1956.</p>
<p>The weak force is weak mainly because its carrier is heavy. A W boson weighs about 86 protons. A force carried by a heavy particle reaches only a tiny distance, about 0.0025 fm. That is hundreds of times smaller than a proton. The third scene shows this. Slide the carrier's mass to zero and the short-range force turns into a long-range one like electromagnetism.</p>
<p>The strangest fact is in the second scene. In 1957 Chien-Shiung Wu lined up spinning cobalt-60 nuclei and found that their electrons fly out mostly <em>opposite</em> the spin. The mirror image of that experiment is a world where electrons go <em>along</em> the spin. That world never happens. The weak force can tell left from right.</p>
<p>This matters to you every day. The Sun can only burn hydrogen when the weak force turns a proton into a neutron, and that step is very slow. That slowness is why the Sun lasts billions of years instead of blowing up at once. See <a href="#/t/solar-fusion">solar fusion</a>.</p>`,
  tryFirst: [
    'Turn off <b>Play continuously</b>, then press <b>Step ▸</b> to walk through one decay.',
    'Press <b>Add 1000 decays</b> and look at the histogram in the corner. It is a smooth hill that stops at Q.',
    'Switch to <b>Wu mirror</b>. Compare where the electrons go in our world and in the mirror.',
    'Switch to <b>Range</b> and drag the mediator mass to zero. The cyan well spreads out to match the amber one.',
  ],
  equation: {
    tex: '\\frac{G_F}{\\sqrt{2}} = \\frac{g^2}{8M_W^2}\\qquad V(r)\\propto\\frac{e^{-r/\\lambda}}{r},\\quad \\lambda=\\frac{\\hbar}{M_W c}',
    caption: 'The weak force looks feeble at low energy because its carrier is heavy. The coupling g is not small. Dividing by the W mass squared makes Fermi\'s constant tiny, and the same mass cuts the range down to about 0.0025 fm.',
    terms: [
      { tex: 'G_F', name: 'Fermi constant', meaning: 'The strength of low-energy weak processes, $1.1663788\\times10^{-5}\\ \\text{GeV}^{-2}$. It is measured from the muon lifetime. The readout shows what it would be for the mass on the slider.', param: 'GF' },
      { tex: 'g', name: 'Weak coupling', meaning: 'How strongly the W grabs quarks and leptons. It is about 0.65, larger than the electric charge $e \\approx 0.30$ in the same units. It is held fixed while you change the mass.', param: 'g' },
      { tex: 'M_W', name: 'W boson mass', meaning: '80.37 GeV, about 86 proton masses. Set it with the mediator mass slider.', param: 'mass' },
      { tex: '\\lambda', name: 'Range', meaning: 'The distance over which the force fades by a factor $e$. For the W it is $\\hbar c/M_Wc^2 \\approx 2.5\\times10^{-3}$ fm.', param: 'range' },
      { tex: 'V(r)', name: 'Yukawa potential', meaning: 'A massive carrier gives $e^{-r/\\lambda}/r$. A massless carrier, like the photon, gives the Coulomb $1/r$. Compare them in the Range scene.', param: 'view' },
    ],
  },
  physicsNotes: `
<h3>Where G<sub>F</sub> comes from</h3>
<p>In a weak process a W is exchanged between two pairs of particles. Each end of the exchange brings a factor $g/(2\\sqrt2)$. The W itself brings a factor $1/(q^2 - M_W^2)$, where $q$ is the momentum it carries. In beta decay and muon decay, $q^2$ is at most a few MeV² or about $0.01\\ \\text{GeV}^2$. That is tiny next to $M_W^2 \\approx 6460\\ \\text{GeV}^2$. So the W line shrinks to a point and the product becomes a constant:</p>
$$\\frac{G_F}{\\sqrt2} = \\frac{g^2}{8M_W^2}.$$
<p>This is Fermi's 1933 contact theory, recovered as the low-energy limit. Put in $G_F$ and $M_W$ and you get $g \\approx 0.653$. That matches $e/\\sin\\theta_W$ from electroweak theory to 0.2%.</p>
<h3>Why a heavy carrier means a short range</h3>
<p>A static source of a field whose quanta have mass $M$ obeys $(\\nabla^2 - 1/\\lambda^2)V = -\\text{source}$, with $\\lambda = \\hbar/Mc$. Its solution is the Yukawa potential $V \\propto e^{-r/\\lambda}/r$. For $M = 0$ the extra term drops out and you get Coulomb's $1/r$. A rough picture: to create a W out of nothing you borrow energy $M_Wc^2$. The uncertainty principle lets you keep it for about $\\hbar/M_Wc^2 \\approx 8\\times10^{-27}$ s. Even at light speed it gets only $2.5\\times10^{-3}$ fm in that time.</p>
<h3>Two checks you can run</h3>
<p>The muon decays by the same W exchange. Its rate is $\\Gamma = G_F^2 m_\\mu^5/192\\pi^3$. That gives a lifetime of 2.187 μs, 0.44% below the measured 2.197 μs. Corrections from the electron mass and from photon loops bring the prediction to within 0.001%. In fact physicists now run this backwards and use the muon lifetime to define $G_F$.</p>
<p>The neutron spectrum follows the allowed shape $N(T) \\propto pE(Q-T)^2F(Z,E)$. Here $p$ and $E$ are the electron's momentum and total energy, $T$ its kinetic energy, and $Q = 0.782$ MeV. The factor $(Q-T)^2$ is the room left for the antineutrino. It forces the spectrum to zero at $T = Q$.</p>`,
  deep: [
    {
      title: 'From Fermi\'s contact theory to the W boson',
      html: `<p>Enrico Fermi wrote down his theory of beta decay in 1933. He modelled it on how an atom emits a photon, but with four particles meeting at one point. It worked very well for decays. It had a hidden flaw. At high energy the chance of a weak collision grows like $G_F^2E^2$ without limit. Somewhere near a few hundred GeV it would predict probabilities above one, which is impossible.</p>
<p>A carrier with mass cures this. Below $M_W$ the exchange looks like Fermi's point contact. Above $M_W$ the propagator $1/(q^2-M_W^2)$ falls off and the growth stops. The same idea is used for the strong nuclear force. In 1935 Hideki Yukawa proposed a carrier for it and estimated its mass from the range of nuclear forces. The pion, found in 1947, gives $\\hbar/m_\\pi c \\approx 1.4$ fm.</p>
<p>The weak coupling $g \\approx 0.65$ is larger than the electromagnetic $e \\approx 0.30$. At energies well above 100 GeV weak and electromagnetic processes happen at similar rates. The weak force only looks weak in everyday processes because $G_F E^2$ is tiny when $E$ is small.</p>`,
    },
    {
      title: 'The continuous spectrum and Pauli\'s neutrino',
      html: `<p>Henri Becquerel discovered radioactivity in uranium salts in 1896. Ernest Rutherford soon sorted the radiation into alpha and beta rays. Beta rays turned out to be electrons. In 1914 James Chadwick showed that their energies form a continuous spread rather than sharp lines. That was a shock, because an atom that decays has a definite energy to give away. In 1927 Charles Ellis and William Wooster caught all the heat from a radium E source in a calorimeter. The average energy per decay matched the average of the spectrum, not its top. The missing energy really was leaving the apparatus.</p>
<p>On 4 December 1930 Wolfgang Pauli sent an open letter to a physics meeting in Tübingen. It began "Dear radioactive ladies and gentlemen". He proposed a light, neutral particle emitted along with the electron. He called it a neutron. After Chadwick found the heavy neutron in 1932, Fermi renamed Pauli's particle the neutrino, "little neutral one". Clyde Cowan and Frederick Reines detected antineutrinos from a nuclear reactor in 1956.</p>
<p>The spectrum's end carries information. Near $T = Q$ the shape is $(Q-T)^2$ for a massless neutrino. A neutrino mass would bend the last few eV. The KATRIN experiment measures tritium's endpoint this way and has set an upper limit of 0.45 eV at 90% confidence (2024).</p>`,
    },
    {
      title: 'Parity violation: Lee, Yang and Wu',
      html: `<p>Before 1956 physicists assumed every law of nature looks the same in a mirror. That symmetry is called parity. Two strange mesons, then called θ and τ, seemed identical except that they decayed into states of opposite parity. In 1956 Tsung-Dao Lee and Chen-Ning Yang checked the evidence and found that nobody had ever tested parity in weak interactions. They proposed ways to do it.</p>
<p>Chien-Shiung Wu at Columbia took up the test with a low-temperature group at the National Bureau of Standards. They cooled cobalt-60 to a few millikelvin in a magnetic field so the nuclear spins lined up. More electrons came out opposite the spin than along it. Reverse the field and the pattern reversed with it. The result was published in February 1957. In the same journal issue Richard Garwin, Leon Lederman and Marcel Weinrich reported parity violation in pion and muon decays. Lee and Yang won the 1957 Nobel Prize. Wu did not share it.</p>
<p>Why is this a mirror test? A mirror reverses the turning sense of the nucleus, so its spin arrow flips. It does not change which way along the axis the electrons move. So the mirror shows electrons going along the spin. For Co-60 the rate is $W(\\theta) \\propto 1 - P\\,(v/c)\\cos\\theta$, with $\\theta$ the angle from the spin and $P$ the degree of alignment. The scene samples exactly this. With full alignment about 38% of electrons go into the spin hemisphere. The mirror world would need 62%.</p>`,
    },
    {
      title: 'Handedness: only left-handed neutrinos',
      html: `<p>Helicity is the spin measured along the direction of motion. Spin along the motion is right-handed. Spin against the motion is left-handed. In 1958 Maurice Goldhaber, Lee Grodzins and Andrew Sunyar measured the neutrino's helicity with a clever europium-152 experiment. It was negative. Every neutrino ever seen is left-handed, and every antineutrino is right-handed. That is why the antineutrino in the scene carries a spin arrow pointing forward.</p>
<p>The W couples only to left-handed particles and right-handed antiparticles. This is the V − A structure proposed in 1958 by Richard Feynman and Murray Gell-Mann, and by George Sudarshan and Robert Marshak. Massive particles like the electron can be caught in either state, because you can always overtake them and see the motion reverse. So a beta electron is mostly left-handed, by a fraction that grows with $v/c$.</p>
<p>Whether right-handed neutrinos exist at all is an open question. Neutrinos have mass, so some partner state is expected in many theories. It has never been observed.</p>`,
    },
    {
      title: 'Unification, the W and Z, and the Sun',
      html: `<p>Sheldon Glashow proposed a combined theory of weak and electromagnetic forces in 1961. Steven Weinberg in 1967 and Abdus Salam in 1968 gave the W and Z their masses through the Higgs mechanism, while the photon stays massless. Gerard 't Hooft and Martinus Veltman showed in 1971 that the theory gives finite answers. The theory predicted a neutral carrier, the Z. The Gargamelle bubble chamber at CERN saw its neutral-current effects in 1973.</p>
<p>To make real W and Z bosons, CERN turned its SPS into a proton-antiproton collider. Simon van der Meer's stochastic cooling made dense enough antiproton beams. The UA1 and UA2 experiments announced the W in January 1983 and the Z a few months later. Carlo Rubbia and van der Meer shared the 1984 Nobel Prize. Glashow, Weinberg and Salam had shared the 1979 prize. Today $M_W = 80.369 \\pm 0.013$ GeV and $M_Z = 91.188$ GeV.</p>
<p>The weak force also sets the pace of the Sun. The first step of the pp chain is $p + p \\to d + e^+ + \\nu_e$. One proton must become a neutron while the two touch, and only the weak force can do it. The chance is so small that a typical proton in the core waits billions of years. The <a href="#/t/solar-fusion">solar fusion</a> page follows that bottleneck. The <a href="#/t/standard-model">Standard Model</a> page puts the W and Z among the other particles.</p>`,
    },
  ],
  challenges: [
    {
      id: 'watch',
      title: 'Watch the neutron decay',
      prompt: 'In the Beta decay scene, walk through one full decay with the Step button, from the neutron to the three outgoing particles.',
      hint: 'Turn off Play continuously, then press Step until you reach step 4 of 4. If you start mid-decay, press Step again to begin a new one.',
      check: (s) => s.watched === true,
    },
    {
      id: 'spectrum',
      title: 'Find the edge at Q',
      prompt: 'Collect at least 1000 decays and get an electron with more than 0.7 MeV of kinetic energy. None can ever pass $Q = 0.782$ MeV.',
      hint: 'Press Add 1000 decays. The histogram in the corner is a smooth hill, not a sharp line, and it ends at the dashed Q marker.',
      check: (s) => s.ffUsed === true && (s.decays as number) >= 1000 && (s.maxT as number) > 0.7 && (s.maxT as number) <= (s.Q as number),
    },
    {
      id: 'massless',
      title: 'Make the force reach forever',
      prompt: 'In the Range scene, make the mediator massless so the range becomes infinite.',
      hint: 'Drag the mediator mass slider to 0 or press Massless. The cyan surface becomes the same shape as the amber Coulomb one.',
      check: (s) => s.view === 'range' && s.mass === 0 && s.rangeInfinite === true,
    },
    {
      id: 'mirror',
      title: 'Break the mirror',
      prompt: 'In the Wu scene, with the mirror shown and polarisation at least 0.8, count 200 electrons and show that fewer than 45% go along the spin in our world.',
      hint: 'Switch the scene to Wu mirror and wait a few seconds. Compare the green and red bars in the corner.',
      check: (s) => s.view === 'wu' && s.mirror === true && (s.polarization as number) >= 0.8 && (s.wuCount as number) >= 200 && (s.alongReal as number) < 0.45,
    },
  ],
  caveats: `<p>The W in the first scene is a cartoon. In beta decay the W is virtual. It never exists as a free particle with 80 GeV of energy, and it has no path you could film. The scene also runs in extreme slow motion. The proton's recoil is drawn 100 times too large so that you can see it.</p>
<p>The spectrum uses the allowed shape with a non-relativistic Fermi function for $Z = 1$. It leaves out small recoil, radiative and weak-magnetism corrections. The electron and antineutrino directions are drawn independently. In reality they are weakly correlated.</p>
<p>The Wu scene assumes the ideal Co-60 asymmetry $A = -1$ and a polarisation you choose. The real experiment had partial polarisation that faded as the sample warmed, and it counted electrons in one direction while flipping the field.</p>
<p>The Yukawa surfaces show the shape of each potential with the same coupling. The weak force is not usually described by a static potential between particles. The surface is a way to see the range, not a measured energy landscape. The muon lifetime readout on the Range scene uses tree-level physics only.</p>`,
  further: [
    { label: 'Wu et al., Experimental Test of Parity Conservation in Beta Decay, Phys. Rev. 105, 1413 (1957)', url: 'https://doi.org/10.1103/PhysRev.105.1413' },
    { label: 'Lee and Yang, Question of Parity Conservation in Weak Interactions, Phys. Rev. 104, 254 (1956)', url: 'https://doi.org/10.1103/PhysRev.104.254' },
    { label: 'Weak interaction on Wikipedia', url: 'https://en.wikipedia.org/wiki/Weak_interaction' },
    { label: 'Particle Data Group, Review of Particle Physics', url: 'https://pdg.lbl.gov/' },
  ],
};
