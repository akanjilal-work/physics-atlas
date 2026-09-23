import type { TopicContent } from '../../core/types.ts';

export const content: TopicContent = {
  intuition: `
<p class="lead">The school picture of an atom is a tiny solar system: a nucleus in the middle and electrons circling it like planets. It is a lovely picture. It is also wrong.</p>
<p>A charge that moves in a circle radiates light and loses energy. A planetary electron would spiral into the proton in about a hundred-billionth of a second. Real hydrogen atoms last forever. And a planet can orbit at any distance, yet hydrogen only glows at a few sharp colours.</p>
<p>The fix is to treat the electron as a <strong>wave</strong>. Think of a guitar string. Pinned at both ends, it can only ring at certain notes. An electron held by a proton is a wave pinned by the pull of the nucleus, so it can only settle into certain shapes. Each shape is a <strong>standing wave in three dimensions</strong>, and each has its own fixed energy. Those shapes are the <em>orbitals</em>.</p>
<p>The cloud in the scene is one orbital. Each dot is a place where a measurement could find the electron. Where the dots crowd together, the electron is likely to be. Where they thin out, it is rare. Nobody claims the electron is smeared out like fog. It is the <em>chance</em> of finding it that has this shape.</p>
<p>The two colours are the sign of the wave. Like a plucked string, one part swings up while the other swings down. Between them the wave is exactly zero. These silent surfaces are called <strong>nodes</strong>. The electron is never found on them.</p>
<p>Light comes out when the electron drops from one standing wave to a lower one. The energy gap is fixed, so the colour is fixed. Press <b>Emit photon</b> with 3 → 2 to see hydrogen's famous red line.</p>`,
  tryFirst: [
    'Drag to orbit the cloud. Cyan and rose mark where the wave is positive and negative. The dark gaps between them are nodes.',
    'Set n = 3, ℓ = 0 and switch on <b>Cutaway</b>. The slice shows the 3s orbital as rings nested inside each other, like an onion.',
    'Keep n fixed and raise ℓ. The radial plot in the corner narrows into a single hump. Watch ⟨r⟩ fall.',
    'Pick a transition and press <b>Emit photon</b>, or click an arrow in the energy ladder. Visible lines fly out in their true colour.',
  ],
  equation: {
    tex: '\\psi_{n\\ell m}(r,\\theta,\\varphi) = R_{n\\ell}(r)\\,Y_\\ell^m(\\theta,\\varphi), \\quad E_n = -\\frac{13.6\\text{ eV}}{n^2}',
    caption: 'Every hydrogen orbital is a radial wave times an angular pattern. The energy depends only on n.',
    terms: [
      { tex: 'n', name: 'Principal quantum number', meaning: 'Sets the energy and the overall size. The cloud grows roughly as $n^2$ Bohr radii.', param: 'n' },
      { tex: '\\ell', name: 'Angular momentum number', meaning: 'Runs from 0 to $n-1$. It sets the shape family (s, p, d, f) and the number of angular nodes.', param: 'l' },
      { tex: 'm', name: 'Magnetic number', meaning: 'Runs from $-\\ell$ to $\\ell$. It sets how the pattern is oriented around the z axis.', param: 'm' },
      { tex: 'R_{n\\ell}(r)', name: 'Radial function', meaning: 'How the wave rises and falls with distance. It crosses zero $n-\\ell-1$ times, giving the spherical nodes.', param: 'rnodes' },
      { tex: 'Y_\\ell^m(\\theta,\\varphi)', name: 'Spherical harmonic', meaning: 'The angular pattern, the same for every central force. It has $\\ell$ nodal surfaces (planes or cones).', param: 'anodes' },
      { tex: 'E_n', name: 'Energy level', meaning: 'Negative because the electron is bound. It depends on $n$ only, so all $n^2$ orbitals of a level share it.', param: 'energy' },
    ],
  },
  physicsNotes: `
<h3>Where the equation comes from</h3>
<p>The electron feels the Coulomb pull $V(r) = -e^2/(4\\pi\\varepsilon_0 r)$. Put that into the time-independent Schrödinger equation:</p>
$$-\\frac{\\hbar^2}{2m}\\nabla^2\\psi - \\frac{e^2}{4\\pi\\varepsilon_0 r}\\psi = E\\psi$$
<p>The potential depends only on the distance $r$. So in spherical coordinates the equation splits. Try $\\psi = R(r)\\,Y(\\theta,\\varphi)$ and divide through. One side depends only on $r$, the other only on the angles. Both must equal the same constant, $\\ell(\\ell+1)$.</p>
<p>The angular equation is solved by the spherical harmonics $Y_\\ell^m$. They only stay smooth and single valued on the sphere when $\\ell$ is a whole number and $|m| \\le \\ell$. The radial equation has solutions that fade at large $r$ only for special energies. Those are $E_n = -13.6\\text{ eV}/n^2$ with $n > \\ell$. The quantum numbers are not added by hand. They are the conditions for a sensible wave.</p>
<h3>Units and numbers</h3>
<p>Lengths are in Bohr radii, $a_0 = 0.0529$ nm. In these units the radial functions are $R_{n\\ell}(r) \\propto e^{-r/n}\\,(2r/n)^\\ell\\,L_{n-\\ell-1}^{2\\ell+1}(2r/n)$, where $L$ is an associated Laguerre polynomial. The average distance is $\\langle r\\rangle = \\tfrac12\\left[3n^2 - \\ell(\\ell+1)\\right]$. For fixed $n$, the largest $\\ell$ is the most compact.</p>
<h3>How the cloud is drawn</h3>
<p>Each point is a random draw from $|\\psi|^2$. The distance comes from the radial probability $P(r) = r^2 R^2$, shown in the corner plot. The direction is drawn by rejection sampling from $|Y|^2$. The colour is the sign of $\\psi$ in the real basis, or its phase in the complex basis. Points are drawn again only when you change the orbital.</p>`,
  deep: [
    {
      title: 'Nodes, and why s orbitals reach the nucleus',
      html: `<p>An orbital has $n-1$ nodes in total. Of these, $\\ell$ are angular (planes or cones through the nucleus) and $n-\\ell-1$ are radial (spheres). A 3s orbital has two nodal spheres. A 3p has one sphere and one plane. A 3d has two angular nodes and no sphere.</p>
<p>Near the nucleus, $R_{n\\ell} \\propto r^\\ell$. For $\\ell > 0$ this goes to zero. Angular momentum acts like a centrifugal barrier, $\\ell(\\ell+1)/r^2$, that keeps the wave away from the centre. For $\\ell = 0$ there is no barrier, and $\\psi$ has its largest value right at the proton.</p>
<p>That can look like a contradiction with the corner plot, where $P(r)$ starts at zero. It is not. $P(r)$ counts a whole shell of radius $r$, whose area grows as $r^2$. The density per unit volume peaks at the centre. The chance of being in a thin shell peaks further out, at exactly $a_0$ for 1s.</p>
<p>This has measurable effects. Because s electrons overlap the nucleus, they feel its magnetic moment directly. That gives the 21 cm hyperfine line radio astronomers use to map the galaxy. It also lets some nuclei capture an s electron in radioactive decay.</p>`,
    },
    {
      title: 'Degeneracy: many shapes, one energy',
      html: `<p>For each $n$ there are $n$ values of $\\ell$, and for each $\\ell$ there are $2\\ell+1$ values of $m$. The total is $\\sum_{\\ell=0}^{n-1}(2\\ell+1) = n^2$ orbitals with the same energy. With electron spin it doubles to $2n^2$.</p>
<p>Degeneracy in $m$ is expected for any central force. No direction is special, so rotating an orbital cannot change its energy. Degeneracy in $\\ell$ is special to the pure $1/r$ potential. It comes from a hidden conserved quantity, the Runge Lenz vector. In a classical Kepler orbit that vector points to the closest approach and keeps the ellipse from drifting. In any other potential the $\\ell$ levels split, which is what happens in every atom with more than one electron.</p>
<p>Because the $m$ states share an energy, any mixture of them is also a valid orbital. That is why two bases exist. The complex basis has definite $m$ and a phase that winds around the z axis. The real basis combines $+m$ and $-m$ into standing patterns like $p_x$ and $p_y$. Switch the basis control to compare.</p>`,
    },
    {
      title: 'Spectral lines: from Balmer to Bohr to Schrödinger',
      html: `<p>In 1885 Johann Balmer, a Swiss school teacher, found a formula that fit the four visible hydrogen lines to high accuracy. In modern form it is</p>
$$\\frac{1}{\\lambda} = R_H\\left(\\frac{1}{2^2} - \\frac{1}{n^2}\\right), \\quad n = 3, 4, 5, \\dots$$
<p>Rydberg generalised the 2 to any lower level. The Lyman series (ending on $n=1$) lies in the ultraviolet. Paschen and the others lie in the infrared. Only the Balmer lines are visible: Hα at 656 nm (red), Hβ at 486 nm (cyan), Hγ at 434 nm and Hδ at 410 nm (violet).</p>
<p>Niels Bohr explained the formula in 1913 with circular orbits and quantised angular momentum. His energies were right, but the model failed for helium and predicted the wrong angular momentum for the ground state. In 1926 Erwin Schrödinger wrote his wave equation and solved hydrogen in the same paper. The Bohr energies came out again, now with the full shapes and the correct angular momentum, which is zero for 1s.</p>
<p>The precise value of $R_H$ depends on the proton's mass. The electron and proton both orbit their common centre, so the electron mass is replaced by the reduced mass $\\mu = m_e m_p/(m_e+m_p)$. That shifts Hα from 656.11 nm to 656.47 nm in vacuum. Tables quote 656.28 nm, the wavelength measured in air. Deuterium's heavier nucleus shifts its lines by about 0.18 nm, which is how deuterium was discovered in 1932.</p>`,
    },
    {
      title: 'What this model leaves out',
      html: `<p>The Schrödinger solution is excellent, but real hydrogen has more structure. Each refinement is small and was found by looking very closely at the lines.</p>
<ul>
<li><strong>Fine structure.</strong> The electron moves at about $\\alpha c \\approx c/137$. Relativity and the electron's spin split each level by a few parts in $10^5$. The Dirac equation (1928) gets these right. The splitting depends on the total angular momentum $j$, not on $\\ell$ alone.</li>
<li><strong>Spin.</strong> The electron carries an intrinsic magnetic moment with two states. It doubles every degeneracy and is the reason each orbital holds two electrons.</li>
<li><strong>The Lamb shift.</strong> Dirac predicts that $2s_{1/2}$ and $2p_{1/2}$ have exactly the same energy. In 1947 Willis Lamb measured a gap of about 1057 MHz. It comes from the electron interacting with vacuum fluctuations of the electromagnetic field. Explaining it launched modern quantum electrodynamics.</li>
<li><strong>Hyperfine structure.</strong> The proton's own magnetic moment splits the ground state. The flip between the two parts emits the 21 cm radio line.</li>
<li><strong>Finite proton size.</strong> The proton is about $0.84$ fm across. s electrons feel this very slightly. Measuring it with muonic hydrogen started the "proton radius puzzle" of 2010.</li>
</ul>`,
    },
    {
      title: 'From hydrogen to chemistry',
      html: `<p>No other neutral atom can be solved exactly. With two or more electrons, each one feels the others, and the equation no longer separates. Chemists still use hydrogen-like orbitals as a starting point. Each electron is treated as moving in an average field from the nucleus and the other electrons.</p>
<p>That average field is not $1/r$. Inner electrons screen the nucleus, and s electrons dive through that screen more than p or d electrons do. So the $\\ell$ degeneracy breaks: 2s lies below 2p, and 4s fills before 3d. That filling order, together with two electrons per orbital, builds the rows and blocks of the periodic table. The s block, the p block, the d block of transition metals and the f block of lanthanides are these same shapes.</p>
<p>Bonding also follows the shapes. Lobes of the same sign overlap to make bonds. The four lobes of $d_{x^2-y^2}$ point at the neighbours in many metal complexes. Mixtures of s and p orbitals make the tetrahedral bonds of carbon.</p>
<p>Look at a periodic table with this in mind. The blocks are 2, 6, 10 and 14 columns wide. That is two electrons in each of the 1, 3, 5 and 7 orbitals of an s, p, d and f set. The shape of the table is the count of these shapes.</p>`,
    },
  ],
  challenges: [
    {
      id: 'two-radial',
      title: 'Two nodal spheres',
      prompt: 'Find an orbital with exactly two radial nodes. Use the corner plot or the cutaway to see them.',
      hint: 'Radial nodes are $n - \\ell - 1$. Try n = 3 with ℓ = 0.',
      check: (s) => s.radialNodes === 2,
    },
    {
      id: 'd-cut',
      title: 'Inside a d orbital',
      prompt: 'Show any d orbital (ℓ = 2) with the cutaway on.',
      hint: 'd orbitals need n ≥ 3. Set ℓ = 2, then switch on Cutaway.',
      check: (s) => s.l === 2 && s.cutaway === true,
    },
    {
      id: 'h-alpha',
      title: 'The red line',
      prompt: 'Emit the Balmer Hα photon, the red line near 656 nm.',
      hint: 'Choose the transition 3 → 2 and press Emit photon, or click the red arrow in the energy ladder.',
      check: (s) => s.photonUpper === 3 && s.photonLower === 2 && (s.photonNm as number) > 655 && (s.photonNm as number) < 658,
    },
    {
      id: 'compact',
      title: 'Most compact n = 4',
      prompt: 'For n = 4, find the orbital with the smallest average distance ⟨r⟩.',
      hint: 'Every ℓ at n = 4 has the same energy, but not the same size. Look at the formula for ⟨r⟩.',
      check: (s) => s.n === 4 && s.l === 3,
    },
  ],
  caveats: `<p>This is the non-relativistic, spinless Schrödinger solution for a single electron and a point nucleus. The nucleus is treated as infinitely heavy for the orbitals and energies shown. The photon wavelengths include the reduced-mass correction when that toggle is on, and are vacuum wavelengths. Fine structure, the Lamb shift, hyperfine splitting and the proton's size are all left out. They shift levels by parts per ten thousand or less.</p>
<p>The cloud shows where a measurement might find the electron, drawn from $|\\psi|^2$. It is not a picture of an electron in motion, and a real measurement finds one point, not a cloud. The morph between orbitals is a visual aid. A real transition is a quantum jump that emits one photon, not a smooth reshaping. The isosurface encloses about 90% of the probability, a common but arbitrary choice.</p>`,
  further: [
    { label: 'Griffiths, Introduction to Quantum Mechanics, ch. 4', url: 'https://www.cambridge.org/highereducation/books/introduction-to-quantum-mechanics/990799CA07A83FC5312402AF6860311E' },
    { label: 'NIST Atomic Spectra Database (hydrogen lines)', url: 'https://physics.nist.gov/PhysRefData/ASD/lines_form.html' },
    { label: 'Schrödinger, Quantisierung als Eigenwertproblem (1926)', url: 'https://doi.org/10.1002/andp.19263840404' },
    { label: 'Hydrogen atom on Wikipedia', url: 'https://en.wikipedia.org/wiki/Hydrogen_atom' },
  ],
};
