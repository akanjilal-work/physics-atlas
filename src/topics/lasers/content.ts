import type { TopicContent } from '../../core/types.ts';

export const content: TopicContent = {
  intuition: `
<p class="lead">A light bulb is a crowd of atoms, each one flashing when it likes. A laser is the same kind of atoms, organised so that one photon can make another photon that is its exact copy. Then the copies make copies.</p>
<p>The trick is <strong>stimulated emission</strong>. An atom sits in an excited level. A passing photon of the right colour shakes it, and the atom drops down and releases a second photon. The new photon is not just similar. It has the same colour, the same direction and the same phase as the one that triggered it. In the scene, every cloned photon <em>flashes white</em> as it is born next to its twin.</p>
<p>There is a catch. The same photon can also be <strong>absorbed</strong> by an atom that is not excited. Normally most atoms sit in the ground state, so absorption wins and light fades. To get more copying than eating you need a <em>population inversion</em>: more atoms ready to emit than ready to absorb. The <strong>pump</strong> (the violet diodes) keeps lifting atoms up to make one. Excited atoms glow amber.</p>
<p>Two mirrors turn the rod into a hall of mirrors. A photon that heads along the axis bounces back and forth through the rod, getting copied on every pass. One mirror leaks a few percent. That leak is the laser beam.</p>
<p>Here is the surprise. Nothing happens until the pump crosses a sharp <strong>threshold</strong>. Below it, the light made on each round trip is less than the light lost, so any start dies out. Above it, gain beats loss and the light builds until it drags the inversion back down to exactly the break-even point. Push the pump harder and the output rises in a straight line. Watch the corner plot: flat, then a kink, then a ramp.</p>
<p>When you first switch on, the laser does not glide up to its final power. It <strong>spikes</strong>. The inversion overshoots, a burst of light drains it, the light dies, the inversion rebuilds, and the cycle repeats as a ringing that fades away.</p>`,
  tryFirst: [
    'Press <b>Reset</b> and watch the time trace. After a delay the output fires a train of spikes that ring down to a steady level. These are relaxation oscillations.',
    'Drag the <b>pump</b> slider below the threshold readout. The beam goes out and the photons stop cloning. Raise it again and watch the operating point climb the kinked line.',
    'Lower the <b>mirror reflectivity</b>. The threshold rises and the dashed kink on the plot slides right.',
    'Press <b>Q-switch pulse</b>. The cavity is blocked while the pump stores energy, then opened all at once. One giant pulse empties the rod.',
  ],
  equation: {
    tex: '\\dot N = R_p - \\frac{N}{\\tau} - B N q, \\qquad \\dot q = B N q - \\frac{q}{\\tau_c}',
    caption: 'The laser rate equations. Lasing starts when gain equals loss: $B N \\tau_c = 1$, which fixes the threshold inversion $N_{\\text{th}} = 1/(B\\tau_c)$.',
    terms: [
      { tex: 'R_p', name: 'Pump rate', meaning: 'Atoms lifted into the upper laser level each second. Set by the absorbed pump power.', param: 'pump' },
      { tex: 'N', name: 'Population inversion', meaning: 'Atoms in the upper level. In a four-level laser the lower level empties at once, so this is the inversion. Shown as a ratio to its threshold value.', param: 'N' },
      { tex: 'N/\\tau', name: 'Spontaneous decay', meaning: 'Excited atoms that fall on their own, in random directions. For Nd:YAG, $\\tau \\approx 230\\ \\mu$s. This loss is why the pump must work continuously.', param: 'Pth' },
      { tex: 'B N q', name: 'Stimulated emission', meaning: 'Each photon in the cavity triggers copies at a rate proportional to the inversion. It moves atoms down and photons up by the same amount.', param: 'q' },
      { tex: 'q/\\tau_c', name: 'Cavity loss', meaning: 'Photons leave through the output mirror or are scattered. The photon lifetime $\\tau_c$ is set by mirror reflectivity and cavity length.', param: 'tauc' },
      { tex: 'B N \\tau_c = 1', name: 'Threshold', meaning: 'Gain equals loss. Above this pump level the output grows linearly with pump.', param: 'r' },
    ],
  },
  physicsNotes: `
<h3>Where the equations come from</h3>
<p>Count atoms and photons. The pump adds atoms to the upper level at rate $R_p$. They leave by spontaneous decay, at rate $N/\\tau$, or by stimulated emission. Each stimulated emission removes one atom from the upper level and adds one photon to the lasing mode, so the same term $BNq$ appears in both equations with opposite signs. Photons leave the cavity at rate $q/\\tau_c$.</p>
<p>The photon lifetime comes from the round trip. Light takes $T_{\\text{rt}} = 2L/c$ to go there and back. Each trip keeps a fraction $R\\,e^{-L_i}$ of it, where $L_i$ is scatter and absorption. So</p>
$$\\frac{1}{\\tau_c} = \\frac{-\\ln R + L_i}{T_{\\text{rt}}}.$$
<p>A tiny share of spontaneous emission lands in the lasing mode by chance. The simulation includes it as a seed term $\\beta N/\\tau$ with $\\beta = 10^{-9}$. It is what starts the laser from nothing. It barely changes anything else.</p>
<h3>Threshold and slope</h3>
<p>Set the time derivatives to zero. Either $q = 0$ (no lasing) or $BN\\tau_c = 1$. In the lasing branch the inversion is <strong>clamped</strong> at $N_{\\text{th}}$, however hard you pump. Every extra pumped atom becomes a photon instead:</p>
$$q = \\tau_c\\,(R_p - R_{\\text{th}}), \\qquad R_{\\text{th}} = \\frac{N_{\\text{th}}}{\\tau}.$$
<p>The output is the share of cavity loss that goes through the mirror, $P_{\\text{out}} = h\\nu\\, q\\,(-\\ln R)/T_{\\text{rt}}$. So the slope efficiency is</p>
$$\\eta_s = \\frac{\\lambda_p}{\\lambda_L}\\cdot\\frac{-\\ln R}{-\\ln R + L_i}.$$
<p>The first factor is the ratio of photon energies, $808/1064 \\approx 0.76$. The missing quarter, the quantum defect, stays in the rod as heat. The second says a leakier output mirror wastes less light inside, but it also raises the threshold. Real laser designers pick the reflectivity that balances the two.</p>
<h3>Units in the simulation</h3>
<p>The numbers are Nd:YAG-like: 1064 nm output, 808 nm diode pump, $\\tau = 230\\ \\mu$s, cross-section $2.8\\times10^{-19}$ cm², mode area 1 mm² and 2% internal loss. Then $B = \\sigma c/(A L)$. Time runs about ten thousand times slower on screen than in reality. The equations are integrated with an exact exponential update for each variable, split symmetrically, with steps no longer than a fifth of $\\tau_c$.</p>`,
  deep: [
    {
      title: 'Relaxation oscillations, linearised',
      html: `<p>Nudge the lasing steady state by small amounts $\\delta N$ and $\\delta q$. Keep only first-order terms. The two equations combine into a damped oscillator:</p>
$$\\ddot{\\delta q} + \\gamma\\,\\dot{\\delta q} + \\omega_0^2\\,\\delta q = 0, \\qquad \\omega_0^2 = \\frac{r-1}{\\tau\\,\\tau_c}, \\quad \\gamma = \\frac{r}{\\tau},$$
<p>where $r = R_p/R_{\\text{th}}$ is how many times above threshold you pump. The ringing frequency is $\\omega_R = \\sqrt{\\omega_0^2 - \\gamma^2/4}$. Because it sits at the geometric mean of the slow atomic time and the fast photon time, it is typically tens to hundreds of kilohertz for a solid-state laser. The damping time $2\\tau/r$ is long, so solid-state lasers ring for many cycles.</p>
<p>At switch-on the swings are not small. The first spike can be many times the final power, and the early spikes come slower than $\\omega_R$. The formula describes the tail. The readouts show both the linear prediction and the measured spike rate.</p>
<p>Semiconductor lasers have a much shorter upper-level lifetime, in nanoseconds. Their relaxation oscillations run at gigahertz and die quickly. That sets how fast a diode laser can be switched on and off to carry data.</p>`,
    },
    {
      title: 'Why four levels',
      html: `<p>Pump light lifts atoms from the ground level $E_0$ into a broad band $E_3$. They fall within nanoseconds to the upper laser level $E_2$, which lives a long time. The laser transition goes from $E_2$ to $E_1$, and $E_1$ empties quickly back to the ground. See the level diagram in the corner of the scene.</p>
<p>Since $E_1$ is almost always empty, every atom in $E_2$ counts as inversion. Even a few excited atoms give gain. In a <strong>three-level</strong> laser such as ruby, the lower laser level is the ground state itself. More than half of all atoms must be excited before gain exceeds absorption. That is why Maiman needed an intense flash lamp and why ruby lasers usually run in pulses.</p>
<p>The model here drops the ground-state depletion, because $N$ is a tiny fraction of the neodymium ions. That is a good approximation for Nd:YAG.</p>`,
    },
    {
      title: 'Coherence, colour and cavity modes',
      html: `<p>A copy made by stimulated emission joins the same electromagnetic mode as the photon that triggered it. Same frequency, direction, polarisation and phase. Because almost every photon in the beam descends from copying, the beam behaves like one long, steady wave. That is <strong>coherence</strong>. Ordinary light is a jumble of independent flashes.</p>
<p>The mirrors pick which waves are allowed. A wave survives a round trip only if it returns in step with itself, which needs a whole number of half-wavelengths between the mirrors, $L = m\\lambda/2$. The allowed frequencies are</p>
$$\\nu_m = m\\,\\frac{c}{2L}, \\qquad \\Delta\\nu = \\frac{c}{2L}.$$
<p>For a 30 cm cavity the spacing is about 500 MHz. The gain medium amplifies a band that is much wider than this, so several longitudinal modes can lase at once. Designers add etalons or make the cavity very short to force a single mode. A single-mode laser can have a linewidth far narrower than the gain band. The fundamental limit, set by spontaneous emission, is the Schawlow-Townes linewidth. This simulation tracks one mode only, so it is a model of the total power, not of the spectrum.</p>`,
    },
    {
      title: 'Q-switching: storing energy for a giant pulse',
      html: `<p>A Q-switch is a fast shutter inside the cavity, such as a Pockels cell. While it is closed the loss is huge, so lasing cannot start. The pump keeps adding atoms, and the inversion climbs far above the normal threshold. Then the shutter opens in nanoseconds.</p>
<p>Now the gain is several times the loss. The photon number grows by a big factor on every round trip and the stored inversion dumps in one pulse lasting tens of nanoseconds. During the pulse, pumping and spontaneous decay are too slow to matter. Dividing the two rate equations gives $dq/dN = -1 + N_{\\text{th}}/N$, which integrates to the peak</p>
$$q_{\\text{peak}} = N_i - N_{\\text{th}} - N_{\\text{th}}\\ln\\frac{N_i}{N_{\\text{th}}}.$$
<p>The peak power can be thousands of times the continuous output from the same pump. The idea was proposed by Robert Hellwarth in 1961 and demonstrated with a Kerr cell shutter by Fred McClung and Hellwarth in 1962. Q-switched pulses are used for marking, cutting, tattoo removal and range finding.</p>`,
    },
    {
      title: 'From Einstein to the checkout counter',
      html: `<p>In 1917 Albert Einstein asked how atoms and light could reach thermal equilibrium. He found that absorption and spontaneous emission were not enough. A third process was needed, emission <em>stimulated</em> by the light already present. His A and B coefficients are still the language of lasers.</p>
<p>The first working device used microwaves. In 1954 Charles Townes, James Gordon and Herbert Zeiger at Columbia built the ammonia <strong>maser</strong>. Nikolay Basov and Alexander Prokhorov developed the same ideas in Moscow, and the three shared the 1964 Nobel Prize in Physics. In 1958 Arthur Schawlow and Townes showed how to extend the idea to light using two mirrors.</p>
<p>On 16 May 1960 Theodore Maiman, at Hughes Research Laboratories, fired the first laser. It was a ruby crystal pumped by a helical flash lamp, emitting red pulses at 694 nm. Its output came as a train of irregular spikes, the same relaxation physics shown here.</p>
<p>Uses followed quickly. Semiconductor lasers near 1550 nm carry data through optical fibre. Ultraviolet excimer lasers reshape the cornea in eye surgery. LIGO measures gravitational waves with highly stabilised infrared lasers at 1064 nm, the same wavelength as this simulation. Red diode lasers read supermarket barcodes and optical discs.</p>`,
    },
  ],
  challenges: [
    {
      id: 'threshold',
      title: 'Cross the threshold',
      prompt: 'Turn the pump down until the laser is dark, then bring it back above threshold so the beam returns.',
      hint: 'The threshold readout gives the pump power where gain equals loss. Go below it, wait a moment, then go above it.',
      check: (s) => s.crossed === true,
    },
    {
      id: 'spiking',
      title: 'Ring the bell',
      prompt: 'Make the laser spike: see at least three relaxation-oscillation peaks in the time trace.',
      hint: 'Press Reset, or jump the pump from well below to well above threshold. Each peak must top the steady power by 30%.',
      check: (s) => s.touched === true && (s.spikes as number) >= 3,
    },
    {
      id: 'giant',
      title: 'Giant pulse',
      prompt: 'Fire a Q-switched pulse whose peak power is more than 10 times the continuous-wave power, while pumping above threshold.',
      hint: 'Keep the pump above threshold and press Q-switch pulse. Wait for the charging to finish.',
      check: (s) => (s.qsRatio as number) > 10,
    },
    {
      id: 'dark',
      title: 'Leaky mirror',
      prompt: 'With the pump at 3 W or more, lower the output mirror reflectivity until lasing stops.',
      hint: 'Each percent of transmission is lost light. Around 87% the loss beats the gain at 3 W.',
      check: (s) => (s.R as number) < 0.95 && (s.pump as number) >= 3 && s.lasing === false && s.touched === true,
    },
  ],
  caveats: `<p>The model tracks one cavity mode and treats the inversion as uniform along the rod. Real lasers have many transverse and longitudinal modes, spatial hole burning, thermal lensing in the rod and pump light that is not fully absorbed. The pump is assumed to put every absorbed photon into the upper level. The cross-section, mode area and spontaneous seed fraction are illustrative Nd:YAG-like values, not a specific product.</p>
<p>The atoms and photons in the scene are a cartoon driven by the equations. A real rod holds around $10^{15}$ inverted ions and the cavity holds around $10^{10}$ photons, so each sphere and each glowing packet stands for a huge number of them. Photons are not really little balls. Laser light is better described as a coherent wave. The beam is drawn red, but 1064 nm light is invisible infrared. Time on screen is slowed by about ten thousand, and the Q-switch opens instantly.</p>`,
  further: [
    { label: 'Maiman, Stimulated optical radiation in ruby, Nature (1960)', url: 'https://doi.org/10.1038/187493a0' },
    { label: 'Schawlow and Townes, Infrared and optical masers, Phys. Rev. (1958)', url: 'https://doi.org/10.1103/PhysRev.112.1940' },
    { label: 'Laser on Wikipedia', url: 'https://en.wikipedia.org/wiki/Laser' },
    { label: 'Q-switching on Wikipedia', url: 'https://en.wikipedia.org/wiki/Q-switching' },
  ],
};
