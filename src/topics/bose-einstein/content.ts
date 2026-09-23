import type { TopicContent } from '../../core/types.ts';

export const content: TopicContent = {
  intuition: `
<p class="lead">Cool a gas of atoms far enough and something happens that has no classical analogue. Below a sharp temperature, a large share of the atoms pile into the single lowest quantum state of their trap. They stop behaving like a swarm of particles and start behaving like one giant wave.</p>
<p>Every atom is also a wave. Its size is set by the <strong>de Broglie wavelength</strong>, and that wavelength grows as the atom slows down. At room temperature it is far smaller than an atom. At a few hundred nanokelvin it grows to a few tenths of a micrometre. That is about the distance between neighbouring atoms in the cloud. Then the waves overlap, and the rule that makes these atoms <em>bosons</em> takes over. Bosons prefer to share a state. Once the lowest state starts to fill, it fills fast.</p>
<p>The scene shows this two ways. On the left is an <strong>absorption image</strong>: the shadow a laser beam sees when it shines through the cloud, drawn as a height map. Above the critical temperature $T_c$ it is a smooth, broad hump. Below $T_c$ a sharp spike grows out of its middle. That spike is the condensate. On the right are the atoms themselves as dots. Cyan dots are the hot thermal atoms, buzzing around the trap. Amber dots sit still in the ground state.</p>
<p>When the page opens, <strong>evaporative cooling</strong> is running. The rose shell is the edge of the trap. It is lowered step by step, and the hottest atoms spill over it and fly away (red). The atoms left behind collide, share out what energy remains, and end up colder. It is the same trick that cools a cup of coffee, pushed to a billionth of a degree.</p>
<p>The surprise is how sudden it is. Nothing special happens to the atoms one by one. Yet at $T_c$ the whole gas changes its character, a phase transition driven by nothing but quantum statistics.</p>`,
  tryFirst: [
    'Watch the demo finish. Note the $T/T_c$ readout. The spike in the image appears exactly as it drops below 1.',
    'Drag <b>Temperature</b> up and down across $T_c$. Watch the white marker slide along the curve in the inset, and the amber dots appear and vanish.',
    'Switch <b>View</b> to <b>Time of flight</b>. The trap is switched off and the cloud flies apart. The thermal cloud becomes round. The condensate flips its long axis.',
    'Turn off <b>Interactions</b>. The ideal-gas condensate is a needle, far narrower than anything in a real image.',
  ],
  equation: {
    tex: 'k_BT_c = \\hbar\\bar\\omega\\left(\\frac{N}{\\zeta(3)}\\right)^{1/3}',
    caption: 'The critical temperature of an ideal Bose gas in a harmonic trap. It depends on the atom number and the trap frequency, but not on the mass of the atom.',
    terms: [
      { tex: 'k_BT_c', name: 'Critical temperature', meaning: 'Below this temperature the lowest trap state holds a macroscopic share of the atoms. For typical traps it is a few hundred nanokelvin.', param: 'Tc' },
      { tex: '\\hbar\\bar\\omega', name: 'Trap level spacing', meaning: 'The energy step between trap levels, with $\\bar\\omega = (\\omega_x\\omega_y\\omega_z)^{1/3}$ the geometric mean of the three trap frequencies. A stiffer trap raises $T_c$.', param: 'nu' },
      { tex: 'N', name: 'Atom number', meaning: 'Total atoms in the trap. $T_c$ grows only as $N^{1/3}$, so doubling $N$ raises $T_c$ by $2^{1/3} \\approx 1.26$.', param: 'N' },
      { tex: '\\zeta(3)', name: 'Riemann zeta of 3', meaning: '$\\zeta(3) = \\sum_k 1/k^3 \\approx 1.2020569$. It is how many atoms the excited levels can hold at $T_c$, in units of $(k_BT/\\hbar\\bar\\omega)^3$. The level-sum readout does that count level by level.', param: 'fracExact' },
    ],
  },
  physicsNotes: `
<h3>Counting atoms in excited states</h3>
<p>Bosons in a level of energy $\\varepsilon$ follow the Bose–Einstein distribution</p>
$$\\bar n(\\varepsilon) = \\frac{1}{e^{(\\varepsilon-\\mu)/k_BT} - 1}.$$
<p>The chemical potential $\\mu$ must stay below the lowest level, or some occupation would turn negative. That caps how many atoms the <em>excited</em> levels can hold. In a harmonic trap the number of levels below energy $\\varepsilon$ grows as $\\varepsilon^3/(\\hbar\\bar\\omega)^3$, so the density of states is $\\varepsilon^2/2(\\hbar\\bar\\omega)^3$. With $\\mu$ at its ceiling the excited levels hold at most</p>
$$N_{\\text{ex}}^{\\max} = \\zeta(3)\\left(\\frac{k_BT}{\\hbar\\bar\\omega}\\right)^3 .$$
<p>Set that equal to $N$ and you get the headline equation. Below $T_c$ the surplus has only one place to go, the ground state. That gives the condensate fraction</p>
$$\\frac{N_0}{N} = 1 - \\left(\\frac{T}{T_c}\\right)^3 \\qquad \\text{(harmonic trap)}.$$
<h3>Trap versus box</h3>
<p>The exponent depends on the container. In a uniform box of volume $V$ the density of states grows as $\\varepsilon^{1/2}$, and the same argument gives</p>
$$\\frac{N_0}{N} = 1 - \\left(\\frac{T}{T_c}\\right)^{3/2}, \\qquad k_BT_c = \\frac{2\\pi\\hbar^2}{m}\\left(\\frac{n}{\\zeta(3/2)}\\right)^{2/3} \\qquad \\text{(uniform box)}.$$
<p>Both curves are in the inset. The trap curve (amber) rises faster below $T_c$. The box curve is dashed. Only the box formula contains the mass. In a trap of fixed frequency, sodium and rubidium condense at the same temperature.</p>
<h3>The condition in one line</h3>
<p>At the centre of the cloud, condensation starts when the peak phase-space density reaches</p>
$$n\\lambda_{\\text{dB}}^3 = \\zeta(3/2) \\approx 2.612, \\qquad \\lambda_{\\text{dB}} = \\frac{h}{\\sqrt{2\\pi m k_BT}} .$$
<p>In words: there are about 2.6 atoms in a cube one de Broglie wavelength on a side. Compare the $\\lambda_{\\text{dB}}$ and spacing readouts. Below $T_c$ the thermal cloud's peak value stays pinned at 2.612. Extra atoms go into the condensate instead.</p>
<h3>What the scene computes</h3>
<p>The images and dots use the semiclassical ideal gas. The thermal column density is $\\propto g_2\\!\\left(z\\,e^{-V/k_BT}\\right)$, where $g_\\nu(x) = \\sum_k x^k/k^\\nu$ and $z = e^{\\mu/k_BT}$. The thermal dots are drawn from the exact Bose–Einstein distribution in phase space and then move on their harmonic orbits. The <b>level-sum</b> readout solves $N = \\sum_\\varepsilon g_\\varepsilon\\, \\bar n(\\varepsilon)$ directly over the real trap levels for your $N$. It lands a little below $1-(T/T_c)^3$, because a finite gas condenses a little late.</p>`,
  deep: [
    {
      title: 'Why the formula is exact only for large N',
      html: `<p>The derivation replaces a sum over discrete levels with an integral. That works when $k_BT \\gg \\hbar\\omega$, which is true here: at $T_c$ the ratio is about $(N/\\zeta(3))^{1/3}$, near 100 for a million atoms.</p>
<p>The next correction is known in closed form. Grossmann and Holthaus, and separately Ketterle and van Druten, found in 1996 that</p>
$$\\frac{N_0}{N} \\approx 1 - t^3 - \\frac{3\\zeta(2)}{2\\zeta(3)^{2/3}}\\,\\frac{\\omega_m}{\\bar\\omega}\\, t^2 N^{-1/3}, \\qquad t = T/T_c,$$
<p>where $\\omega_m$ is the arithmetic mean of the three trap frequencies. The shift is under 1% for a million atoms. The test suite checks that the level sum in this page matches this formula to a few parts in a thousand.</p>
<p>With interactions, $T_c$ also shifts a little, by a few percent for typical alkali gases. The scene leaves that out.</p>`,
    },
    {
      title: 'Why nanokelvin, and why so dilute',
      html: `<p>You need $n\\lambda_{\\text{dB}}^3 \\approx 2.6$. You could raise the density $n$ instead of lowering $T$. But at high density atoms collide in threes, bind into molecules, and the gas turns into a liquid or a solid. That is the true equilibrium state of rubidium at these temperatures. A condensate is a metastable gas that survives only because it is so thin. Typical peak densities are $10^{13}$ to $10^{15}$ atoms per cm³, around a hundred thousand times thinner than air.</p>
<p>At those densities the spacing between atoms is a fraction of a micrometre. Making $\\lambda_{\\text{dB}}$ that long forces the temperature down to hundreds of nanokelvin.</p>
<p>Laser cooling alone usually stops at microkelvin temperatures, with a phase-space density still far below 1. The last factor of a million comes from <b>evaporative cooling</b> in a magnetic or optical trap. Each evaporated atom carries away much more than the average energy. Each step loses atoms but raises $n\\lambda^3$, as long as collisions re-thermalise the rest quickly. The ramp in this scene, $N \\propto T^{0.45}$, is an illustration. Real ramps are tuned for each apparatus.</p>`,
    },
    {
      title: 'Time of flight, and the flipped condensate',
      html: `<p>Real absorption images are usually taken after switching the trap off and letting the cloud fly for 10 to 40 ms. The image then shows velocities, not positions.</p>
<p>The <b>thermal cloud</b> becomes round. Its velocity spread is $\\sqrt{k_BT/m}$ in every direction, whatever the trap shape. For the ideal gas this is exact: each width grows as $\\sigma_i\\sqrt{1+\\omega_i^2t^2}$.</p>
<p>The <b>condensate</b> does not become round. In a cigar-shaped trap it is narrow across and long along the axis. The narrow direction has the largest momentum spread, by the uncertainty principle for an ideal gas, and by the release of the squeezed interaction energy for a real one. So it expands fastest, and the long axis flips. This <em>aspect-ratio inversion</em> was one of the signatures in the first 1995 images.</p>
<p>The scene uses the Castin–Dum scaling solution (1996) for an interacting condensate in the Thomas–Fermi limit. Treat that part as <b>qualitative</b>. The scene keeps the thermodynamics ideal, uses approximate scattering lengths, and ignores how the thermal cloud and condensate push on each other.</p>`,
    },
    {
      title: 'History: Bose, Einstein, and 1995',
      html: `<p>In 1924 Satyendra Nath Bose, in Dhaka, derived Planck's radiation law by a new way of counting light quanta as indistinguishable. Einstein translated his paper into German and had it published. He then applied the same counting to atoms, and in early 1925 predicted that below a critical temperature a finite fraction of an ideal gas would collect in the lowest state.</p>
<p>For seventy years the prediction could not be tested cleanly. On 5 June 1995, Eric Cornell and Carl Wieman at JILA in Boulder saw a condensate of about 2000 rubidium-87 atoms at around 170 nK. A few months later Wolfgang Ketterle's group at MIT made sodium condensates with far more atoms, enough to study their properties in detail. The three shared the 2001 Nobel Prize in Physics.</p>
<p><b>A relative: superfluid helium.</b> Liquid helium-4 flows without friction below 2.17 K, as Kapitza and, separately, Allen and Misener reported in 1938. Fritz London proposed in 1938 that this was Bose–Einstein condensation. The ideal-gas formula at liquid-helium density gives about 3.1 K, close to the real transition. But helium is a dense, strongly interacting liquid. Neutron scattering finds only about 7 to 10 percent of the atoms in the zero-momentum state, even near absolute zero.</p>`,
    },
    {
      title: 'Matter waves at work: interference, atom lasers, simulators',
      html: `<p>In 1997 the MIT group released two separate condensates and let them overlap. The image showed clear interference fringes, like two laser beams crossing. That proved each condensate is one coherent matter wave. The same year they pulsed atoms out of a trapped condensate with radio waves, a first <b>atom laser</b>: a directed beam of atoms all in one quantum state.</p>
<p>Condensates are now a workhorse. They are used in precision measurement, in atom interferometers, and as <b>quantum simulators</b>. Load a condensate into a lattice made of laser light and the atoms hop between sites like electrons in a crystal, with every parameter tunable. In 2002 Greiner and colleagues watched such a gas switch from a superfluid to a Mott insulator, a transition first studied in solid-state theory.</p>
<p>Fermionic atoms can condense too, by first pairing up. Those experiments connect to superconductivity. That link is established. Claims that cold-atom simulators will soon solve open problems like high-temperature superconductivity are still hopes, not results.</p>`,
    },
  ],
  challenges: [
    {
      id: 'spike',
      title: 'Cross the line',
      prompt: 'Start above $T_c$ and cool through it, until the spike holds at least 20% of the atoms.',
      hint: 'Raise Temperature until $T/T_c > 1$, then lower it slowly. Or press Reset ramp, then Evaporate.',
      check: (s) => s.crossed === true,
    },
    {
      id: 'eighty',
      title: 'A nearly pure condensate',
      prompt: 'Reach a condensate fraction $N_0/N$ above 0.8.',
      hint: 'You need $T/T_c$ below about 0.58. Cool further, or add atoms to raise $T_c$.',
      check: (s) => s.touched === true && (s.f0 as number) > 0.8,
    },
    {
      id: 'double',
      title: 'Twice the atoms',
      prompt: 'Double the atom number with the N slider and nothing else. Check that $T_c$ rises by $2^{1/3} \\approx 1.26$.',
      hint: 'Note N, then drag the N slider until the ratio readout shows 2.0. The log slider moves in steps of about 2%.',
      check: (s) => Math.abs((s.nRatio as number) - 2) < 0.06 && Math.abs((s.tcRatio as number) - Math.cbrt(2)) < 0.02,
    },
    {
      id: 'tof',
      title: 'Round cloud, flipped condensate',
      prompt: 'With a mix of condensate and thermal atoms ($0.2 < N_0/N < 0.9$) in an elongated trap, let the cloud fly. Show a round thermal cloud next to a condensate whose long axis has flipped.',
      hint: 'Set elongation to 3 or more, T about 0.6 T_c, then View: Time of flight with at least 15 ms. Wait for the drop to finish.',
      check: (s) => s.view === 'tof' && s.tofDone === true && (s.k as number) >= 2 && (s.f0 as number) > 0.2 && (s.f0 as number) < 0.9 && Math.abs((s.aspectT as number) - 1) < 0.15 && (s.aspectC as number) < 0.9,
    },
  ],
  caveats: `The gas is treated as ideal for all thermodynamics: $T_c$, the condensate fraction and the thermal cloud. Interactions enter only the condensate's shape (Thomas–Fermi) and its expansion (Castin–Dum scaling), and that part is qualitative. Scattering lengths are approximate (about 100 $a_0$ for rubidium-87 and 54 $a_0$ for sodium-23). The interaction shift of $T_c$, depletion, and the mean-field push between condensate and thermal cloud are left out. Just below $T_c$, where the condensate is small, the Thomas–Fermi shape is not valid, so the scene switches to the ideal ground state. The evaporation ramp is illustrative, not a model of collision rates. The level sum assumes the radial frequency is an exact whole-number multiple of the axial one. The image is autoscaled to its peak, like a camera display, so compare shapes, not absolute heights.`,
  further: [
    { label: 'Bose–Einstein condensate on Wikipedia', url: 'https://en.wikipedia.org/wiki/Bose%E2%80%93Einstein_condensate' },
    { label: 'Anderson et al., Observation of BEC in a dilute atomic vapor, Science (1995)', url: 'https://doi.org/10.1126/science.269.5221.198' },
    { label: 'Ketterle, Durfee and Stamper-Kurn, Making, probing and understanding BECs (arXiv)', url: 'https://arxiv.org/abs/cond-mat/9904034' },
    { label: 'The Nobel Prize in Physics 2001', url: 'https://www.nobelprize.org/prizes/physics/2001/summary/' },
  ],
};
