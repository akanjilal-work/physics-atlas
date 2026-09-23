import type { TopicContent } from '../../core/types.ts';

const ALL = (s: Record<string, unknown>) => s.volume === true && s.surface === true && s.coulomb === true && s.asymmetry === true && s.pairing === true;

export const content: TopicContent = {
  intuition: `
<p class="lead">Weigh a helium nucleus. Then weigh two protons and two neutrons on their own. The nucleus is lighter, by about three quarters of a percent. The missing mass left as energy when the pieces came together. That energy is the <strong>binding energy</strong>, and it powers the Sun, reactors and bombs.</p>
<p>Einstein's $E = mc^2$ says mass and energy are the same thing counted in different units. A nucleus that is more tightly bound has given away more energy, so it weighs less than its parts. To pull it apart you must pay that energy back.</p>
<p>The surprise is that the amount per particle is not the same for every nucleus. Light nuclei are loosely bound. Very heavy ones are loosely bound too. The tightest of all sit near <strong>iron and nickel</strong>. So there are two ways to release nuclear energy. Join light nuclei together (fusion), or split heavy ones apart (fission). Both move toward the iron peak, and both give off energy on the way.</p>
<p>Why is there a peak at all? Think of a nucleus as a drop of liquid. Every nucleon sticks to its neighbours, so bigger drops bind more. But nucleons on the surface have fewer neighbours, which hurts small nuclei most. Protons also repel each other electrically, and that grows fast with size, which hurts big nuclei most. Balance the two and the best size lands near 60 nucleons.</p>
<p>The main scene is a landscape over the chart of nuclides: neutrons along one side, protons along the other. Stable nuclei sit in a long valley. Nuclei on the slopes slide down by radioactive decay. Most of what you see comes from a single five-term formula written in 1935.</p>`,
  tryFirst: [
    'Look at the glowing dots. They are the 250 measured stable nuclides. See how they hug the amber valley line, and how that line bends away from N = Z as nuclei grow.',
    'Turn off the <b>Coulomb</b> toggle. The valley swings onto the N = Z line and the stable dots are left stranded on the slope.',
    'Switch to <b>B/A curve</b>. Slide Z and N and watch the fission and fusion arrows. Arrows that climb release energy. Arrows that fall cost energy.',
    'Switch to <b>Nucleus</b> and build ²⁰⁸Pb (Z = 82, N = 126). It is doubly magic, and the formula does not know it.',
  ],
  equation: {
    tex: 'B(A,Z) = a_V A - a_S A^{2/3} - a_C\\frac{Z(Z-1)}{A^{1/3}} - a_A\\frac{(A-2Z)^2}{A} \\pm \\delta(A,Z)',
    caption: 'The semi-empirical mass formula (Weizsäcker 1935, Bethe and Bacher 1936). A = Z + N. Coefficients in MeV: a_V = 15.8, a_S = 18.3, a_C = 0.714, a_A = 23.2, a_P = 12 with δ = a_P/√A, from the least-squares fit (1) tabulated in the Wikipedia article on the formula.',
    terms: [
      { tex: 'a_V A', name: 'Volume', meaning: 'Each nucleon binds only to its near neighbours, like molecules in a drop. So binding grows in proportion to the number of nucleons. This is the big positive term.', param: 'termV' },
      { tex: '- a_S A^{2/3}', name: 'Surface', meaning: 'Nucleons on the surface have fewer neighbours. Surface area goes as $R^2 \\propto A^{2/3}$. This term dominates for light nuclei and makes them loosely bound.', param: 'termS' },
      { tex: '- a_C\\frac{Z(Z-1)}{A^{1/3}}', name: 'Coulomb', meaning: 'Every pair of protons repels. For a uniformly charged sphere of radius $1.2A^{1/3}$ fm this costs $\\tfrac35 \\cdot 1.44/1.2 \\approx 0.72$ MeV per pair over $A^{1/3}$. It grows as $Z^2$ and drags heavy nuclei down.', param: 'termC' },
      { tex: '- a_A\\frac{(A-2Z)^2}{A}', name: 'Asymmetry', meaning: 'The Pauli principle fills proton and neutron levels separately. An excess of either kind forces nucleons into higher levels. This term keeps the valley near N = Z.', param: 'termA' },
      { tex: '\\pm \\delta(A,Z)', name: 'Pairing', meaning: 'Like nucleons pair up. Even Z and even N gain $+\\delta$, odd Z and odd N lose $\\delta$, odd A gets zero. Here $\\delta = a_P/\\sqrt{A}$.', param: 'termP' },
      { tex: 'B/A', name: 'Binding per nucleon', meaning: 'Divide by A to compare nuclei of different sizes. The readout also shows the AME2020 value for the check nuclei.', param: 'BA' },
    ],
  },
  physicsNotes: `
<h3>From binding to mass</h3>
<p>The atomic mass follows from the binding energy: $M(Z,N)c^2 = Z\\,m_H c^2 + N\\,m_n c^2 - B$. Here $m_H$ is the hydrogen atom and $m_n$ the neutron. The neutron is heavier by $\\Delta = 0.782$ MeV. Lower mass means more stable.</p>
<h3>The valley of stability</h3>
<p>At fixed A, only Z can change, through beta decay. Set $\\partial M/\\partial Z = 0$ and solve:</p>
$$Z_0(A) = \\frac{\\Delta + a_C A^{-1/3} + 4a_A}{2a_C A^{-1/3} + 8a_A/A} \\approx \\frac{A}{2}\\,\\frac{1}{1 + \\tfrac{a_C}{4a_A}A^{2/3}}.$$
<p>For light nuclei $Z_0 \\approx A/2$. For heavy ones the Coulomb term pulls $Z_0$ down, so heavy stable nuclei carry extra neutrons. At A = 208 the formula gives $Z_0 = 82.7$. Lead is Z = 82. Turn off Coulomb and $Z_0 \\to A/2$ plus a tiny shift from $\\Delta$. Nuclei above the valley have too many protons and decay by $\\beta^+$ or electron capture. Nuclei below it have too many neutrons and decay by $\\beta^-$.</p>
<h3>Fission of ²³⁵U</h3>
<p>A slow neutron joins ²³⁵U to make ²³⁶U, which splits. For a symmetric split into two ¹¹⁸Pd fragments, with the neutron counted as free:</p>
$$Q = 2B(46,72) - B(92,143) \\approx 2(991) - 1791 \\approx 191\\ \\text{MeV}.$$
<p>Measured fission releases about 200 MeV per event. Most of it is the kinetic energy of the two fragments, pushed apart by their Coulomb repulsion. Real splits are usually lopsided, with fragments near A ≈ 95 and A ≈ 140. The formula gives about 178 MeV for a 94 : 142 split, which you can set with the split slider. The rest of the difference comes from shell effects and from how the energy is booked (neutrons, gammas, and later beta decays).</p>
<h3>Fusion</h3>
<p>Below the peak the curve rises steeply. Fusing two ¹²C nuclei into ²⁴Mg releases about 21 MeV in the formula (the measured value is 13.9 MeV, which shows how rough the formula is for light nuclei). Fusing two ⁵⁶Fe nuclei would cost about 42 MeV. Stars that reach iron have no fusion fuel left.</p>`,
  deep: [
    {
      title: 'Aston, the mass spectrograph and E = mc²',
      html: `<p>In 1919 Francis Aston at the Cavendish Laboratory built a mass spectrograph. It bent beams of ions in electric and magnetic fields and sorted them by mass to about one part in a thousand. He found isotopes in dozens of elements and his whole-number rule: isotope masses come close to whole multiples of the hydrogen mass. He received the 1922 Nobel Prize in Chemistry.</p>
<p>Close is not equal. Aston measured helium as lighter than four hydrogen atoms by a little under 1%. In 1920 Arthur Eddington pointed out that if stars turned hydrogen into helium, this mass defect, converted by Einstein's 1905 relation $E = mc^2$, could keep the Sun shining for billions of years. Aston later plotted a "packing fraction" curve. It was the first picture of what this page shows as B/A.</p>
<p>Today masses are measured with Penning traps and storage rings to parts per billion. The Atomic Mass Evaluation (AME2020) collects them. The check table here uses it:</p>
<table class="data"><tr><th>Nucleus</th><th>AME2020 B/A (MeV)</th><th>Formula (MeV)</th></tr>
<tr><td>²H</td><td>1.112</td><td>−2.97</td></tr>
<tr><td>⁴He</td><td>7.074</td><td>5.55</td></tr>
<tr><td>¹²C</td><td>7.680</td><td>7.32</td></tr>
<tr><td>⁵⁶Fe</td><td>8.790</td><td>8.761</td></tr>
<tr><td>⁶²Ni</td><td>8.795</td><td>8.784</td></tr>
<tr><td>²³⁸U</td><td>7.570</td><td>7.603</td></tr></table>`,
    },
    {
      title: 'Iron or nickel? Getting the peak right',
      html: `<p>Two different questions have two different answers.</p>
<p><strong>Highest binding energy per nucleon:</strong> ⁶²Ni, at 8.7946 MeV. Next come ⁵⁸Fe (8.7922) and ⁵⁶Fe (8.7904). The differences are a few keV per nucleon.</p>
<p><strong>Lowest mass per nucleon:</strong> ⁵⁶Fe, at about 930.412 MeV/c² per nucleon, just below ⁶²Ni. The reason is the neutron–proton mass difference. ⁵⁶Fe has a larger share of protons (26 of 56) than ⁶²Ni (28 of 62), and a hydrogen atom is lighter than a neutron by 0.782 MeV. That small edge in ingredients outweighs nickel's slightly tighter binding.</p>
<p>The formula cannot settle a contest decided by 4 keV. With these coefficients its peak along the valley floor is ⁵⁸Fe at 8.784 MeV, with ⁶²Ni a hair behind. That the formula lands in the right neighbourhood at all is the achievement.</p>
<p>Why then is iron, not nickel, so common in the universe? In the last days of a massive star, silicon burning runs with nearly equal numbers of protons and neutrons. It makes mostly ⁵⁶Ni (Z = N = 28). That nucleus decays through ⁵⁶Co to ⁵⁶Fe within months. Iron's abundance reflects that path, not the binding peak alone.</p>`,
    },
    {
      title: 'Fission: Hahn, Meitner and Frisch, 1938 to 1939',
      html: `<p>In December 1938 Otto Hahn and Fritz Strassmann in Berlin bombarded uranium with neutrons and found barium, an element about half as heavy. Lise Meitner, who had fled Germany that summer, and her nephew Otto Frisch worked out the explanation over the Christmas holiday. They pictured the uranium nucleus as a liquid drop, barely held together against its own charge, which a neutron could set wobbling until it split. Their paper appeared in <em>Nature</em> in February 1939, and Frisch borrowed the word <em>fission</em> from biology.</p>
<p>From the mass defect they estimated that each split frees about 200 MeV. That is tens of millions of times more than a chemical reaction per atom. Frisch confirmed the energetic fragments with an ionisation chamber within weeks. Bohr and Wheeler published the full liquid-drop theory of fission later in 1939. Hahn alone received the 1944 Nobel Prize in Chemistry. Meitner's omission is now widely regarded as an injustice.</p>
<p>The liquid-drop picture also says when a nucleus cannot hold together at all. The fission barrier falls to zero when Coulomb energy reaches twice the surface energy, the <em>fissility</em> $x = E_C/2E_S = 1$. That happens around $Z^2/A \\approx 50$. The valley view marks fission for $x > 0.76$ as a rough stand-in for where spontaneous fission takes over.</p>`,
    },
    {
      title: 'Up the curve in stars, and beyond iron',
      html: `<p>Stars live by climbing the B/A curve. Hydrogen fuses to helium, which releases about 26.7 MeV for every helium nucleus made, around 0.7% of the mass. Then helium burns to carbon and oxygen, and in massive stars carbon, neon, oxygen and silicon burn in turn, each stage faster than the last. The chain stops at the iron peak because further fusion costs energy instead of releasing it. The iron core then collapses, and a core-collapse supernova follows.</p>
<p>Elements heavier than iron are built mostly by neutron capture, since neutrons feel no Coulomb barrier. The slow <em>s-process</em> in aging giant stars adds neutrons one at a time and lets beta decays keep up, so it walks along the valley floor. The rapid <em>r-process</em> floods nuclei with neutrons faster than they can decay, pushing far down the neutron-rich slope before they beta decay back to the valley. The kilonova seen after the neutron-star merger GW170817 in 2017 showed r-process material being made. Whether mergers are the main r-process site, or whether rare supernovae also contribute, is still debated.</p>
<p>The framework was laid out in 1957 by Burbidge, Burbidge, Fowler and Hoyle, and independently by Cameron.</p>`,
    },
    {
      title: 'Magic numbers: what the drop misses',
      html: `<p>Nuclei with 2, 8, 20, 28, 50, 82 or 126 protons or neutrons are extra stable. They have more stable isotopes, higher first excited states, and more binding than the formula predicts. Tin (Z = 50) has ten stable isotopes, the most of any element. In 1949 Maria Goeppert Mayer and, independently, Otto Haxel, Hans Jensen and Hans Suess explained these numbers with a shell model that includes a strong spin–orbit force. Goeppert Mayer and Jensen shared the 1963 Nobel Prize in Physics for it.</p>
<p>A liquid drop has no shells, so the formula misses these bumps. The violet lines in the valley view mark the magic numbers. Doubly magic nuclei such as ⁴He, ¹⁶O, ⁴⁰Ca, ⁴⁸Ca, ¹³²Sn and ²⁰⁸Pb are the clearest cases.</p>
<p>⁴He is the worst fit on the page. The formula gives 5.55 MeV per nucleon against the measured 7.07, about 22% low. ⁴He is doubly magic and far too small to have a real surface or interior, so a liquid-drop model does not apply to it. The deuteron is worse still: the formula does not bind it at all. Modern mass models add shell and deformation corrections to a drop and reach well under 1 MeV accuracy on total binding.</p>`,
    },
  ],
  challenges: [
    {
      id: 'peak',
      title: 'Top of the curve',
      prompt: 'With every formula term on, choose a nucleus whose formula B/A is within 0.01 MeV of the formula\'s highest value.',
      hint: 'Look near A = 56 to 62 and stay on the valley floor. Try ⁵⁸Fe or ⁶²Ni (Z = 28, N = 34), the measured record holder.',
      check: (s) => ALL(s) && (s.ba as number) >= (s.baPeak as number) - 0.01,
    },
    {
      id: 'u235',
      title: 'Split uranium-235',
      prompt: 'In the B/A curve view, set Z = 92 and N = 143 with all terms on, and read off the fission energy.',
      hint: 'Uranium-235 has 92 protons and 143 neutrons. The fission readout should land near 180 to 190 MeV. Try the split slider too.',
      check: (s) => s.view === 'curve' && s.Z === 92 && s.N === 143 && ALL(s) && (s.qFission as number) > 150 && (s.qFission as number) < 220,
    },
    {
      id: 'nocoulomb',
      title: 'Switch off the repulsion',
      prompt: 'In the valley view, turn off only the Coulomb term and watch the valley straighten onto N = Z.',
      hint: 'Keep the other four toggles on. The amber valley line should now lie on the dashed N = Z line.',
      check: (s) => s.view === 'valley' && s.coulomb === false && s.volume === true && s.surface === true && s.asymmetry === true,
    },
    {
      id: 'magic',
      title: 'Doubly magic',
      prompt: 'In the Nucleus view, build a nucleus whose proton and neutron numbers are both magic.',
      hint: 'Magic numbers are 2, 8, 20, 28, 50, 82, 126. Try ¹⁶O (8, 8), ⁴⁰Ca (20, 20) or ²⁰⁸Pb (82, 126).',
      check: (s) => s.view === 'builder' && s.doublyMagic === true,
    },
  ],
  caveats: `<p>The formula is a fit with five numbers. For the medium and heavy check nuclei it gets B/A right to within about half a percent, but it has no shell structure, no deformation and no real physics for the lightest nuclei. ⁴He is 22% underbound and the deuteron is not bound at all. The coefficients vary between published fits by a few percent.</p>
<p>The decay colours in the valley are rough. They come from Q-values of the formula and two rules of thumb: Viola–Seaborg systematics for α half-lives and Sargent's rule for β. Fission is marked for fissility above 0.76. Real decay modes depend on shell effects, spins and barriers the formula cannot see. The landscape flattens where B/A is more than 4 MeV below the peak, only to keep the picture readable. The stable-nuclide list has 250 ground states. The usual count of 251 includes the long-lived isomer ¹⁸⁰ᵐTa, which is not drawn.</p>
<p>Fission fragments here keep the parent's proton fraction, and no neutrons are emitted. The builder packs nucleons on a lattice at nuclear density. Real nucleons are not little balls in fixed places. They are quantum waves spread through the whole nucleus.</p>`,
  further: [
    { label: 'Semi-empirical mass formula (Wikipedia), source of the coefficients', url: 'https://en.wikipedia.org/wiki/Semi-empirical_mass_formula' },
    { label: 'Wang et al., The AME2020 atomic mass evaluation (II), Chinese Physics C 45, 030003 (2021)', url: 'https://doi.org/10.1088/1674-1137/abddaf' },
    { label: 'Meitner and Frisch, Disintegration of uranium by neutrons, Nature 143, 239 (1939)', url: 'https://doi.org/10.1038/143239a0' },
    { label: 'Burbidge, Burbidge, Fowler and Hoyle, Synthesis of the elements in stars, Rev. Mod. Phys. 29, 547 (1957)', url: 'https://doi.org/10.1103/RevModPhys.29.547' },
  ],
};
