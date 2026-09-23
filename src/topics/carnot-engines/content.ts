import type { TopicContent } from '../../core/types.ts';

export const content: TopicContent = {
  intuition: `
<p class="lead">Every engine that runs on heat plays the same game. It takes heat from something hot, turns part of it into work, and dumps the rest into something cold. Car engines, power stations and jet turbines all do this. None of them can skip the dumping step.</p>
<p>In 1824 a young French engineer, Sadi Carnot, asked how good such an engine could ever be. His answer was surprising. The limit does not depend on the fuel, the gas or the cleverness of the design. It depends only on <strong>two temperatures</strong>: how hot the hot side is and how cold the cold side is.</p>
<p>The scene shows a cylinder of gas with a piston. The <strong>red block</strong> is the hot reservoir and the <strong>blue block</strong> is the cold one. They light up when they touch the gas. The gas particles speed up when the gas is hot and slow down when it is cold.</p>
<p>On the right, the same motion is drawn as a loop of pressure against volume. The gas pushes hard while it expands and is pushed back more gently while it is compressed. The difference is the useful work, and it is exactly the <strong>area inside the loop</strong>.</p>
<p>The corner graph plots temperature against entropy. For Carnot's ideal engine that loop is a perfect rectangle. Every other cycle fits inside the same box and does worse.</p>
<p>Run the engine backwards and it becomes a refrigerator or a heat pump. Now work goes in and heat is pushed from cold to hot. That is what your fridge and a heat pump in a house both do.</p>`,
  tryFirst: [
    'Watch the <b>Otto</b> cycle, the idealised petrol engine. Heat goes in on the red leg and out on the blue leg. The shaded area is the work.',
    'Switch <b>Cycle</b> to <b>Carnot</b> and look at the corner graph. The T–S loop becomes a rectangle.',
    'Raise <b>Th</b> or lower <b>Tc</b> and watch the Carnot limit climb.',
    'Set <b>Mode</b> to <b>Fridge</b>. The loop runs backwards and the COP readout shows how much heat each joule of work moves.',
  ],
  equation: {
    tex: '\\eta_{\\max} = 1 - \\frac{T_c}{T_h}',
    caption: 'Carnot’s limit. No heat engine working between two temperatures can turn a larger fraction of its heat into work.',
    terms: [
      { tex: '\\eta_{\\max}', name: 'Carnot efficiency', meaning: 'The largest possible fraction of the input heat that comes out as work. Only a perfectly reversible engine reaches it.', param: 'etaC' },
      { tex: 'T_h', name: 'Hot temperature', meaning: 'Temperature of the hot reservoir, in kelvin. Hotter means a higher ceiling.', param: 'Th' },
      { tex: 'T_c', name: 'Cold temperature', meaning: 'Temperature of the cold reservoir, in kelvin. Only at absolute zero would the limit reach 1.', param: 'Tc' },
      { tex: '\\eta', name: 'Actual efficiency', meaning: 'The efficiency $W/Q_h$ of the cycle you picked. It is never above $\\eta_{\\max}$.', param: 'eta' },
      { tex: 'W', name: 'Net work', meaning: 'Work out per cycle. It equals the area of the P–V loop, and for these reversible legs also the area of the T–S loop.', param: 'W' },
    ],
  },
  physicsNotes: `
<h3>Bookkeeping on every leg</h3>
<p>The gas is ideal, with $PV = nRT$ and internal energy $U = nC_vT$, where $C_v = R/(\\gamma-1)$. The first law says $Q = \\Delta U + W$ on every leg. Each leg type has a closed form:</p>
<ul>
<li><b>Isotherm</b> at $T$: $\\Delta U = 0$, so $Q = W = nRT\\ln(V_b/V_a)$ and $\\Delta S = nR\\ln(V_b/V_a)$.</li>
<li><b>Adiabat</b>: no heat, so $W = -\\Delta U$ and $TV^{\\gamma-1}$ stays constant. $\\Delta S = 0$.</li>
<li><b>Constant volume</b>: $W = 0$ and $Q = nC_v\\Delta T$, with $\\Delta S = nC_v\\ln(T_b/T_a)$.</li>
<li><b>Constant pressure</b>: $W = P\\Delta V$ and $Q = nC_p\\Delta T$, with $\\Delta S = nC_p\\ln(T_b/T_a)$.</li>
</ul>
<p>Add the legs and you get $W = Q_h - Q_c$ and $\\eta = W/Q_h$. The ledger in the corner of the scene lists each leg. It also checks the sum of the works against the loop area, measured separately from the drawn curve.</p>
<h3>Why the limit is $1 - T_c/T_h$</h3>
<p>Entropy is a state property, so the gas ends each cycle with the entropy it started with. The hot reservoir loses entropy $Q_h/T_h$ and the cold one gains $Q_c/T_c$. The second law says the total cannot fall, so $Q_c/T_c \\ge Q_h/T_h$. Then</p>
$$\\eta = 1 - \\frac{Q_c}{Q_h} \\le 1 - \\frac{T_c}{T_h}.$$
<p>Equality needs zero entropy made anywhere. That happens only when heat flows across no temperature gap at all, which is what the Carnot cycle's isotherms do. The readout <em>entropy made</em> shows how far each cycle is from this ideal.</p>
<h3>Other cycles</h3>
<p>The Otto cycle adds heat at constant volume, like a spark igniting fuel at the top of the stroke. Its efficiency depends only on the compression ratio $r$: $\\eta = 1 - r^{1-\\gamma}$. The Diesel cycle burns fuel while the piston moves out at constant pressure. The Stirling cycle uses two isotherms and two constant-volume legs. With a perfect regenerator that stores the heat from one constant-volume leg and returns it on the other, Stirling matches Carnot.</p>
<p>In fridge mode the cycle runs backwards. The fridge coefficient of performance is $\\text{COP} = Q_c/W$, which for Carnot is $T_c/(T_h-T_c)$. A heat pump counts the heat delivered instead, $Q_h/W = T_h/(T_h-T_c)$.</p>`,
  deep: [
    {
      title: 'The two statements of the second law',
      html: `<p>Two classic statements say the same thing in different words.</p>
<p><b>Kelvin</b> (in the form later sharpened by Planck): no cyclic process can take heat from a single reservoir and turn all of it into work. Some heat must go to a colder body.</p>
<p><b>Clausius</b>: no process can have as its only result the flow of heat from a colder body to a hotter one. A fridge can do it, but only by spending work.</p>
<p>They are equivalent. If you had a perfect engine that broke Kelvin's rule, you could use its work to drive a Carnot fridge and move heat uphill for free, breaking Clausius's rule. The reverse argument works too. Carnot's theorem follows from either one. Any engine better than a reversible one could run a reversed Carnot engine and pump heat from cold to hot with nothing else changing.</p>`,
    },
    {
      title: 'Why a real engine falls short',
      html: `<p>A Carnot engine must take in heat while the gas is at exactly $T_h$. But heat only flows across a temperature difference, and a vanishing difference means a vanishing flow. A true Carnot engine would take forever per cycle, so its power output would be zero.</p>
<p>Real engines trade efficiency for power. Heat crosses finite temperature gaps. Gas rushes through valves, pistons rub, and hot gas leaks heat to the cylinder walls. Every one of these makes entropy and pulls the efficiency down.</p>
<p>A simple model of this trade-off was found by Chambadal and Novikov in 1957 and made famous by Curzon and Ahlborn in 1975. Let heat leak into an otherwise perfect engine through a finite thermal conductance, and ask for the most <em>power</em>. The efficiency at that point is</p>
$$\\eta_{\\text{CA}} = 1 - \\sqrt{T_c/T_h}.$$
<p>This is a model result, not a law. It is exact only for that idealised model and roughly tracks the efficiency of some real power plants. Other heat-transfer laws give other numbers. For a broad class of low-dissipation engines, Esposito and co-workers showed in 2010 that the efficiency at maximum power lies between $\\eta_C/2$ and $\\eta_C/(2-\\eta_C)$, and $\\eta_{\\text{CA}}$ falls inside that range.</p>`,
    },
    {
      title: 'The T–S diagram, and why Carnot is a rectangle',
      html: `<p>For a reversible leg, the heat taken in is $dQ = T\\,dS$. So on a plot of temperature against entropy, the area under a leg is the heat on that leg, and the area inside the loop is the net heat, which equals the work.</p>
<p>A Carnot cycle has two legs at fixed temperature (horizontal lines) and two legs at fixed entropy (vertical lines, the adiabats). So it is a rectangle. Its efficiency is the loop area over the area under the top edge: $(T_h - T_c)\\Delta S / (T_h\\Delta S) = 1 - T_c/T_h$.</p>
<p>Any other cycle between the same extreme temperatures takes in some of its heat below $T_h$ or gives some out above $T_c$. Its loop cannot fill the rectangle, so it does worse. The dashed box in the corner inset shows that rectangle for the cycle you are running.</p>`,
    },
    {
      title: 'A short history',
      html: `<p>Sadi Carnot published <em>Réflexions sur la puissance motrice du feu</em> in 1824. He still used the caloric theory, which treated heat as a fluid that is conserved. Even so, his key idea survived: the work comes from heat falling from a high temperature to a low one, and a reversible engine is the best possible.</p>
<p>Émile Clapeyron redrew Carnot's argument as a loop on a pressure–volume diagram in 1834. Around 1850 Rudolf Clausius and William Thomson (later Lord Kelvin) rebuilt the theory on energy conservation and stated the second law. Kelvin had already used Carnot's idea in 1848 to define an absolute temperature scale that does not depend on any substance. Clausius introduced the word entropy in 1865.</p>
<p>The engines in the menu are named after their inventors. Robert Stirling patented his hot-air engine in 1816. Nikolaus Otto built his four-stroke engine in 1876. Rudolf Diesel patented his compression-ignition engine in the 1890s.</p>`,
    },
    {
      title: 'Power plants, car engines and heat pumps',
      html: `<p><b>Power plants.</b> A steam plant with steam near 800 K and a condenser near 300 K has a Carnot limit of about 0.6. Real plants of this kind reach roughly 0.35 to 0.45. The best combined-cycle gas plants, which feed a gas turbine's hot exhaust into a steam cycle, now exceed 0.6.</p>
<p><b>Car engines.</b> The ideal Otto cycle with $r = 10$ and air ($\\gamma = 1.4$) gives 0.60. A real petrol engine turns roughly a quarter to a third of its fuel energy into work. Friction, heat loss to the walls, incomplete burning and pumping air in and out take the rest. Diesel engines allow higher compression and are usually more efficient.</p>
<p><b>Heat pumps.</b> A heat pump runs the cycle backwards to heat a house. Moving heat from 273 K outdoors to 313 K indoors has a Carnot COP of about 7.8. Real units manage roughly 3 to 4 in mild weather. That still means three or four joules of heat for every joule of electricity, which is why heat pumps beat electric heaters.</p>`,
    },
  ],
  challenges: [
    {
      id: 'sixty',
      title: 'Sixty percent',
      prompt: 'Run any cycle as an engine with an efficiency of at least 0.6.',
      hint: 'The Carnot limit needs $T_c/T_h \\le 0.4$. Raise Th, lower Tc, or both. For Otto, also raise the compression ratio.',
      check: (s) => s.mode === 'engine' && (s.eta as number) >= 0.6,
    },
    {
      id: 'otto-limit',
      title: 'Otto at the wall',
      prompt: 'Push the Otto engine to its largest allowed compression ratio. Confirm its efficiency still stays below Carnot’s for the same Th and Tc.',
      hint: 'Pick Otto and drag the compression ratio up until the readout says it is capped. Compare η with the Carnot limit.',
      check: (s) => s.cycle === 'otto' && s.mode === 'engine' && s.rCapped === true && (s.eta as number) < (s.etaC as number),
    },
    {
      id: 'cop5',
      title: 'An efficient fridge',
      prompt: 'Run a fridge with a coefficient of performance above 5.',
      hint: 'A fridge works best when the two temperatures are close. Carnot needs $T_c/(T_h-T_c) > 5$, so try Tc = 300 K and Th below 360 K.',
      check: (s) => s.mode === 'fridge' && (s.copF as number) > 5,
    },
    {
      id: 'rectangle',
      title: 'The perfect rectangle',
      prompt: 'Switch to the Carnot cycle and let it complete one full loop. Watch its T–S diagram draw a rectangle.',
      hint: 'Two isotherms are flat lines and two adiabats are vertical lines in the corner graph.',
      check: (s) => s.cycle === 'carnot' && (s.carnotLaps as number) >= 1,
    },
  ],
  caveats: `<p>The gas is ideal and every leg is quasi-static, meaning slow enough that the gas is always in equilibrium. There is no friction, no heat leak through the walls and no valve loss. Real engines lose to all of these, which is why real efficiencies sit well below the numbers shown.</p>
<p>The Otto and Diesel cycles here are air-standard models. They replace burning fuel with heat added from outside and replace the exhaust stroke with cooling at constant volume. To keep the compressed gas cooler than Th, the compression ratio is capped where it reaches 85% of the way from Tc to Th. For Carnot, the adiabats alone need a volume ratio of $(T_h/T_c)^{1/(\\gamma-1)}$, so small ratios are raised to fit. Both limits are choices of this page, not laws.</p>
<p>In fridge mode only the reversed Carnot cycle, and Stirling with a perfect regenerator, exchange heat exactly at Tc and Th. The other reversed cycles exchange heat over a range of gas temperatures. The reservoirs they could really serve are closer together than Tc and Th. The <em>entropy made</em> readout uses those real contact temperatures. The particles in the cylinder are a picture of the temperature, not a simulation of the gas.</p>`,
  further: [
    { label: 'Carnot’s theorem and the Carnot cycle on Wikipedia', url: 'https://en.wikipedia.org/wiki/Carnot_cycle' },
    { label: 'Curzon and Ahlborn, Efficiency of a Carnot engine at maximum power output, Am. J. Phys. (1975)', url: 'https://doi.org/10.1119/1.10023' },
    { label: 'Esposito et al., Efficiency at maximum power of low-dissipation Carnot engines, PRL (2010)', url: 'https://doi.org/10.1103/PhysRevLett.105.150603' },
    { label: 'Second law of thermodynamics on Wikipedia', url: 'https://en.wikipedia.org/wiki/Second_law_of_thermodynamics' },
  ],
};
