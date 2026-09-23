import type { TopicContent } from '../../core/types.ts';

export const content: TopicContent = {
  intuition: `
<p class="lead">Cool some metals far enough and two strange things happen at once. Electric current flows with no resistance at all. And the metal pushes magnetic fields out of itself.</p>
<p>In 1911 Heike Kamerlingh Onnes cooled mercury with liquid helium in Leiden. Near 4.2 K its resistance did not just shrink. It vanished. A current set running in a superconducting ring keeps flowing for as long as anyone has cared to watch.</p>
<p>Zero resistance is only half the story. In 1933 Walther Meissner and Robert Ochsenfeld found that a superconductor also <strong>expels magnetic field</strong>. A plain perfect conductor would only freeze in whatever field it had. A superconductor actively shoves it out when it cools. That is the <strong>Meissner effect</strong>.</p>
<p>The scene shows what that means. A small magnet sits on a disc. Above the critical temperature $T_c$ the field lines run straight through the disc, and the magnet just rests there. Cool the disc below $T_c$. The field is pushed out, the lines squeeze sideways around the disc, and the squeezed field pushes back on the magnet. It rises and floats. Warm the disc again and it drops.</p>
<p>The field is not cut off at a hard wall. It dies away over a thin skin, about a ten-thousandth of a millimetre deep, called the <strong>London penetration depth</strong>. The lower inset draws that decay.</p>
<p>Some superconductors, called <strong>Type II</strong>, compromise. They let the field in through thin tubes, each carrying exactly one tiny packet of flux, $\\Phi_0 = h/2e$. Switch to the vortex view to see the tubes pack into a triangular lattice, each wrapped in a whirl of current. The <em>2e</em> in that packet is the fingerprint of the real secret: electrons travel in pairs.</p>`,
  tryFirst: [
    'Watch the opening. The disc cools, the field lines bend away from it, and the magnet lifts.',
    'Press <b>Warm to 1.2 T<sub>c</sub></b>. The lines snap back through the disc and the magnet falls. The resistance inset jumps up at the same moment.',
    'With <b>Hg</b>, warm slowly. The magnet falls a little <em>before</em> $T_c$. The field under the magnet beats the shrinking critical field $B_c(T)$ first.',
    'Pick <b>YBCO</b>. It superconducts at 77 K, the temperature of liquid nitrogen. Press <b>Nudge</b> and see the pinned magnet snap back.',
    'Switch the view to <b>Type II vortices</b> and raise the field. The tubes crowd together, one flux quantum each.',
  ],
  equation: {
    tex: '\\nabla^2 \\mathbf B \\;=\\; \\frac{\\mathbf B}{\\lambda_L^2}, \\qquad \\lambda_L = \\sqrt{\\frac{m}{\\mu_0 n_s e^2}}',
    caption: 'The London equation. Inside a superconductor the field must curve as fast as it is large, so it dies away within a depth $\\lambda_L$. In Type II materials flux enters in tubes, each carrying one flux quantum $\\Phi_0 = h/2e \\approx 2.0678\\times10^{-15}$ Wb.',
    terms: [
      { tex: '\\mathbf B', name: 'Magnetic field', meaning: 'The field at the surface of the superconductor. The readout gives the largest value under the magnet.', param: 'Bsurf' },
      { tex: '\\nabla^2', name: 'Curvature of the field', meaning: 'How sharply the field changes from point to point. Outside the sample it can be zero. Inside it must equal $\\mathbf B/\\lambda_L^2$, and the only calm solution is decay.' },
      { tex: '\\lambda_L', name: 'London penetration depth', meaning: 'The skin depth of the field, tens of nanometres in elemental metals and about 150 nm in YBCO. It grows as you approach $T_c$ and becomes infinite there.', param: 'lambda' },
      { tex: 'n_s', name: 'Superfluid density', meaning: 'How many electrons have joined the paired condensate. It falls to zero at $T_c$. Move the temperature and watch $\\lambda_L$ respond.', param: 'T' },
      { tex: '\\Phi_0', name: 'Flux quantum', meaning: 'In the caption. Each Type II vortex carries exactly $h/2e$. The 2e is the charge of a Cooper pair.', param: 'phi0' },
    ],
  },
  physicsNotes: `
<h3>Where the London equation comes from</h3>
<p>Fritz and Heinz London (1935) assumed the paired electrons respond to the vector potential directly, $\\mathbf J_s = -\\frac{n_s e^2}{m}\\mathbf A$. Take the curl to get $\\nabla\\times\\mathbf J_s = -\\frac{n_s e^2}{m}\\mathbf B$. Now use Ampère's law, $\\nabla\\times\\mathbf B = \\mu_0\\mathbf J_s$, and the identity $\\nabla\\times\\nabla\\times\\mathbf B = -\\nabla^2\\mathbf B$ (since $\\nabla\\cdot\\mathbf B = 0$):</p>
$$\\nabla^2\\mathbf B = \\frac{\\mu_0 n_s e^2}{m}\\,\\mathbf B = \\frac{\\mathbf B}{\\lambda_L^2}$$
<p>For a flat surface with the field parallel to it, the solution that does not blow up inside is</p>
$$B(x) = B_0\\, e^{-x/\\lambda_L}, \\qquad \\int_0^\\infty B\\,dx = B_0\\lambda_L$$
<p>So all the field that gets in behaves as if it filled a layer exactly $\\lambda_L$ thick. With $n_s = 10^{28}\\ \\text{m}^{-3}$ the formula gives about 53 nm. Measured values are tens of nanometres in clean elemental metals.</p>
<h3>Temperature dependence</h3>
<p>Two empirical rules describe most classic superconductors well. The critical field falls as $B_c(T) \\approx B_c(0)\\left(1-(T/T_c)^2\\right)$. The penetration depth grows as $\\lambda_L(T) \\approx \\lambda_L(0)/\\sqrt{1-(T/T_c)^4}$. Both are fits, not exact laws, and the scene uses them.</p>
<h3>How the levitation is computed</h3>
<p>A perfect diamagnet forces the field component normal to its surface to zero. For a flat surface, an <strong>image dipole</strong> of opposite sign at the mirror point does exactly that. Two coaxial, opposed dipoles a distance $2z$ apart repel with</p>
$$F = \\frac{3\\mu_0 m^2}{32\\pi z^4}$$
<p>Setting $F = Mg$ gives the floating height. A 1 cm³ neodymium cube ($B_r \\approx 1.2$ T, so $m \\approx 0.95\\ \\text{A m}^2$, mass 7.5 g) floats with its centre about 2.6 cm up. The peak field on the surface is then about 9 mT, well below mercury's $B_c(0) \\approx 41$ mT. The scene steps the magnet's height with a fixed $10^{-4}$ s step and a little damping. The <b>height ÷ theory</b> readout compares the settled height with the formula.</p>`,
  deep: [
    {
      title: 'Perfect conductor versus superconductor',
      html: `<p>Zero resistance alone does not explain the floating magnet. In a perfect conductor Faraday's law gives $\\partial\\mathbf B/\\partial t = 0$ inside. The field is frozen at whatever it was. Cool such a metal in a field and the field stays trapped.</p>
<p>A superconductor behaves differently. Cool it in a field and the field is <em>expelled</em>. The final state does not depend on the history. That makes the superconducting state a true thermodynamic phase, with its own free energy. Expelling a field $B$ costs energy $B^2/2\\mu_0$ per unit volume. When that cost exceeds the energy gained by condensing, at $B = B_c(T)$, superconductivity breaks.</p>
<p>That is what you see with mercury. As the disc warms, $B_c(T)$ falls. When it drops below the field under the magnet, the Meissner state fails and the magnet sinks, slightly before $T_c$.</p>`,
    },
    {
      title: 'Cooper pairs and the BCS energy gap',
      html: `<p>John Bardeen, Leon Cooper and Robert Schrieffer explained superconductivity in 1957. An electron moving through the lattice pulls the positive ions slightly toward it. That leaves a faint trail of positive charge which attracts a second electron. Leon Cooper showed in 1956 that any weak attraction like this binds two electrons of opposite momentum and spin into a <strong>Cooper pair</strong>, however weak it is.</p>
<p>The pairs all share one quantum state, so scattering one electron means breaking a pair. That costs at least $2\\Delta$. At low temperature there is not enough thermal energy to pay it, so nothing scatters and resistance vanishes. Weak-coupling BCS theory predicts</p>
$$\\Delta(0) = \\pi e^{-\\gamma} k_B T_c \\approx 1.764\\, k_B T_c, \\qquad 2\\Delta(0) \\approx 3.53\\, k_B T_c$$
<p>Aluminium comes close to this. Lead and mercury have larger ratios because the electron-lattice coupling is strong, which later refinements of the theory handle. The cuprates such as YBCO are not conventional BCS superconductors at all. Their gap changes sign around the Fermi surface (d-wave), and their pairing mechanism is still debated. The gap readout uses the simple BCS formula for every material, so treat it as an estimate for YBCO.</p>
<p>The flux quantum confirms the pairs. In 1961 two groups (Deaver and Fairbank, and Doll and Näbauer) measured flux trapped in tiny superconducting cylinders. It came in steps of $h/2e$, not $h/e$.</p>`,
    },
    {
      title: 'Type I, Type II and Abrikosov vortices',
      html: `<p>Two lengths compete. The field decays over $\\lambda_L$. The pair condensate can only change over the <strong>coherence length</strong> $\\xi$. Their ratio $\\kappa = \\lambda_L/\\xi$ decides the type. If $\\kappa < 1/\\sqrt2$ a boundary between normal and superconducting regions costs energy, and the material is <strong>Type I</strong>. Mercury, lead and tin are Type I. They expel all field up to $B_c$, then give up.</p>
<p>If $\\kappa > 1/\\sqrt2$ boundaries lower the energy, and the material is <strong>Type II</strong>. Above a lower field $B_{c1}$ flux enters as thin tubes, each with a normal core of radius about $\\xi$ and a whirl of supercurrent about $\\lambda_L$ across. Above an upper field $B_{c2}$ the cores overlap and superconductivity ends. Niobium is a mild Type II ($B_{c2}$ about 0.4 T). YBCO is extreme, with $\\xi$ around a nanometre or two and $B_{c2}$ of the order of 100 T.</p>
<p>Alexei Abrikosov predicted these vortices in 1957 from Ginzburg-Landau theory. He first proposed a square array. A triangular array was later shown to have slightly lower energy (Kleiner, Roth and Autler, 1964). Each vortex holds exactly $\\Phi_0$, so the density of tubes is $B/\\Phi_0$ and the triangular spacing is $a = \\sqrt{2\\Phi_0/(\\sqrt3 B)}$, about 155 nm at 0.1 T. Essmann and Träuble first imaged the lattice in 1967 by sprinkling fine iron particles on a superconductor.</p>`,
    },
    {
      title: 'Why the magnet floats, and why a Type II one locks',
      html: `<p>Earnshaw's theorem says static charges or permanent magnets alone cannot hold anything in stable balance. Diamagnets escape the theorem, and a superconductor is the strongest diamagnet there is. The image force grows as $1/z^4$ when the magnet comes closer, so its vertical balance is stable. The spring constant is $k = 4Mg/z$, and small bounces have frequency $\\omega = \\sqrt{4g/z}$.</p>
<p>Over a flat Type I plane nothing holds the magnet sideways. Real demonstrations use a curved dish. Type II materials do better. Flux tubes that have entered the sample get stuck on defects, a process called <strong>flux pinning</strong>. Moving the magnet would drag the tubes, so the magnet resists motion in every direction and can even hang below the disc. That is the locked floating you see in YBCO demonstrations. The scene shows pinning only qualitatively, as a stiff spring that catches the magnet once it settles.</p>`,
    },
    {
      title: 'From mercury to MRI, and the hunt for room temperature',
      html: `<p><strong>Established.</strong> Onnes found superconductivity in mercury in 1911. Meissner and Ochsenfeld found flux expulsion in 1933. The London brothers gave the penetration depth in 1935. Ginzburg and Landau wrote their theory in 1950. BCS explained the mechanism in 1957. In 1986 Georg Bednorz and K. Alex Müller found superconductivity near 35 K in a copper oxide. Within a year Maw-Kuen Wu, Paul Chu and co-workers made YBa₂Cu₃O₇ superconduct near 93 K, above the 77 K boiling point of liquid nitrogen. The best cuprate at ordinary pressure, a mercury compound found in 1993, reaches about 133 K.</p>
<p><strong>Everyday use.</strong> Most MRI scanners use niobium-titanium wire in liquid helium to make steady 1.5 T or 3 T fields with no power lost in the coils. The Large Hadron Collider bends protons with niobium-titanium magnets at 1.9 K. Japan's SCMaglev test train reached 603 km/h in 2015 using superconducting magnets. It floats by currents induced in coils in the track, not by the Meissner effect shown here.</p>
<p><strong>Contested.</strong> Hydrogen-rich compounds squeezed to over a million atmospheres superconduct at 200 K and above, first reported for H₃S in 2015. Some high-pressure claims have been retracted, so each new one needs independent checks. In 2023 a copper-doped lead apatite called LK-99 was claimed to superconduct at room temperature and pressure. Replication attempts did not reproduce it. Its sudden resistance drop was traced to a copper sulfide impurity. No room-temperature superconductor at ambient pressure is established.</p>`,
    },
  ],
  challenges: [
    {
      id: 'drop',
      title: 'Let it fall',
      prompt: 'Warm the disc until the floating magnet drops onto it.',
      hint: 'Drag the temperature slider right, or press Warm. With mercury it falls a little before T<sub>c</sub>.',
      check: (s) => s.droppedByUser === true,
    },
    {
      id: 'float',
      title: 'Levitate the magnet',
      prompt: 'With the magnet resting on the disc, cool it until the magnet lifts off, and keep it floating for 2 seconds.',
      hint: 'Warm first so the magnet lands, then press Cool or drag T below T<sub>c</sub>.',
      check: (s) => s.liftedByUser === true && s.floating === true && (s.floatTime as number) >= 2,
    },
    {
      id: 'ln2',
      title: 'Liquid-nitrogen levitation',
      prompt: 'Pick YBCO, set the temperature to 77 K (within 1 K), and get the magnet floating there.',
      hint: 'YBCO has T<sub>c</sub> near 92 K. Liquid nitrogen boils at 77 K, which is why this material changed the field.',
      check: (s) => s.mat === 'YBCO' && Math.abs((s.T as number) - 77) <= 1 && s.floating === true && (s.floatTime as number) >= 1,
    },
    {
      id: 'count',
      title: 'Count the flux quanta',
      prompt: 'In the Type II vortex view, count the vortices inside the dashed 500 nm box and set <b>Your count</b> to match.',
      hint: 'Pick Nb or YBCO first. Check your answer: the count should be close to $B\\cdot A/\\Phi_0$ with $A = 0.25\\ \\mu\\text{m}^2$.',
      check: (s) => s.view === 'vortex' && s.guessTouched === true && (s.nBox as number) > 0 && s.guess === s.nBox,
    },
  ],
  caveats: `<p>The levitation uses the image-dipole model, which is exact only for an infinite flat superconductor with a point dipole above it. The disc here is finite, so field lines far from the magnet are only roughly right. The critical-field check uses the field at the floating height. A strong magnet already resting on a real Type I sample can push parts of it normal (the intermediate state) and stop it lifting.</p>
<p>Flux pinning is drawn as a schematic spring, not computed. The Type II levitation is shown as if the sample were cooled with the magnet far away. A sample cooled with the magnet resting on it would lock the magnet in place instead. The resistance curve is a sketch. Penetration depths and coherence lengths are order-of-magnitude values, and vortex cores are drawn wider than life. Real YBCO vortex lattices also melt into a vortex liquid below T<sub>c</sub>, which the scene ignores. Motion is slowed down about three times so you can follow it.</p>`,
  further: [
    { label: 'Superconductivity on Wikipedia', url: 'https://en.wikipedia.org/wiki/Superconductivity' },
    { label: 'Bardeen, Cooper, Schrieffer, Theory of Superconductivity (1957)', url: 'https://doi.org/10.1103/PhysRev.108.1175' },
    { label: 'Bednorz and Müller, Possible high Tc superconductivity in the Ba-La-Cu-O system (1986)', url: 'https://doi.org/10.1007/BF01303701' },
    { label: 'LK-99 on Wikipedia', url: 'https://en.wikipedia.org/wiki/LK-99' },
  ],
};
