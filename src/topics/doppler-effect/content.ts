import type { TopicContent } from '../../core/types.ts';

export const content: TopicContent = {
  intuition: `
<p class="lead">An ambulance races toward you and its siren sounds high. It passes, and the note slides down. The driver hears one steady tone the whole time. Only you hear the change.</p>
<p>The scene shows why. Each ring on the road is one crest of sound. The siren sends out crests at a steady rate, and each ring grows at the speed of sound from the spot where the siren was when it left. The siren chases the rings it sends forward. So the crests <strong>bunch up ahead</strong> and <strong>spread out behind</strong>. Closer crests reach your ear more often, and more crests per second is a higher pitch.</p>
<p>There is a second surprise. The sound you hear right now left the siren a moment ago, from an earlier spot on the road. The pink marker shows that spot. When the siren is right beside you, you are still hearing sound from its approach, so the pitch is still high.</p>
<p>Now push the speed past the speed of sound. The siren outruns its own rings. They can no longer get ahead of it. They pile into a cone that trails behind, and when the cone sweeps over you, you hear it all at once as a <strong>sonic boom</strong>.</p>
<p>The same idea runs radar speed guns, weather radar, heart scans and the hunt for planets around other stars.</p>`,
  tryFirst: [
    'Press <b>Sound</b> to hear the siren. Watch the trace in the corner. The pitch slides down smoothly as the siren passes.',
    'Move the listener close to the road. The drop becomes sudden. Move far away and it becomes gentle.',
    'Raise the speed toward Mach 1 and watch the rings pile up at the front of the siren.',
    'Push past Mach 1. The siren becomes a jet with a cone of sound behind it. Wait for the boom.',
  ],
  equation: {
    tex: "f' = f\\,\\frac{c + v_o}{c - v_s}",
    caption: 'Heard frequency for motion along the line joining source and listener. Both speeds are measured against the still air. Take v_o positive when the listener moves toward the source, and v_s positive when the source moves toward the listener.',
    terms: [
      { tex: "f'", name: 'Heard frequency', meaning: 'The pitch that reaches the listener right now. The label above the listener shows it live.', param: 'fHeard' },
      { tex: 'f', name: 'Source frequency', meaning: 'The steady pitch the siren emits in its own frame.', param: 'freq' },
      { tex: 'c', name: 'Speed of sound', meaning: '343 m/s in air at 20 °C, about 1480 m/s in water. Set by the medium.', param: 'medium' },
      { tex: 'v_o', name: 'Listener speed', meaning: 'How fast the listener moves through the air, toward the source. It changes how often the listener meets crests.', param: 'vo' },
      { tex: 'v_s', name: 'Source speed', meaning: 'How fast the siren moves through the air. It changes the spacing of the crests. At $v_s = c$ the denominator hits zero and the crests pile up.', param: 'mach' },
    ],
  },
  physicsNotes: `
<h3>Two different mechanisms</h3>
<p>A moving source changes the <strong>wavelength</strong>. In one period $T = 1/f$ the siren moves $v_s T$ toward you, so the crests ahead are $\\lambda' = (c - v_s)/f$ apart. They still travel at $c$, so they arrive at $f_1 = c/\\lambda' = f\\,c/(c - v_s)$.</p>
<p>A moving listener does not change the wavelength. It changes how fast the crests go past. Moving toward them at $v_o$, the crests pass at $c + v_o$, so you count $f' = f_1 (c + v_o)/c$. Multiply the two steps and you get the headline equation.</p>
<h3>The angle-dependent form</h3>
<p>In a real pass-by the motion is not head-on. Only the part of each velocity along the line of sight counts:</p>
$$f' = f\\,\\frac{c + v_o\\cos\\theta_o}{c - v_s\\cos\\theta_s}$$
<p>Here $\\theta_s$ is the angle between the source velocity and the line from the source <em>at the moment of emission</em> to the listener. $\\theta_o$ is the angle between the listener velocity and the line from the listener to that emission point. As the siren passes, $\\cos\\theta_s$ slides from $+1$ to $-1$. So the pitch slides from $f/(1-M)$ down to $f/(1+M)$, where $M = v_s/c$.</p>
<h3>Retarded time</h3>
<p>Sound heard at time $t$ left the source at an earlier time $t_e$ that solves</p>
$$\\lvert \\mathbf{L}(t) - \\mathbf{S}(t_e) \\rvert = c\\,(t - t_e).$$
<p>For a straight pass this is a quadratic in $t_e$. The simulation solves it exactly every frame. The heard frequency is $f' = f\\,dt_e/dt$, which gives the angle form above. The <b>solver residual</b> readout shows how well the root satisfies the equation.</p>
<p>Two moments are easy to mix up. When the sound was <em>emitted</em> with the siren right beside you, $\\cos\\theta_s = 0$ and you hear exactly $f$. That sound arrives a time $d/c$ later. When the siren <em>is</em> right beside you, you still hear sound from its approach, pitched at $f/(1 - M^2)$.</p>
<h3>At and beyond Mach 1</h3>
<p>At $v_s = c$ the crests ahead cannot escape. They stack into one wall of pressure at the nose. Above Mach 1 the rings trail behind in a cone of half-angle</p>
$$\\sin\\alpha = \\frac{1}{M}.$$
<p>A listener hears nothing until the cone arrives, then gets the stacked sound at once. After the boom, two emission times satisfy the retarded-time equation. The newer one plays forward at a low pitch. The older one, from the approach, arrives in reverse order.</p>`,
  deep: [
    {
      title: 'Why the pitch drops smoothly, and how fast',
      html: `<p>The heard pitch depends on $\\cos\\theta_s$, the component of the siren's motion along your line of sight. Far away that component is the full speed, toward you or away. Near closest approach it swings through zero.</p>
<p>The swing takes about the time the siren needs to cover a distance equal to your distance from the road, $d/v_s$. Stand one metre from the road and the drop is almost a jump. Stand fifty metres back and it is a long glide. The two far-field pitches do not depend on $d$ at all. Only the shape of the slide does.</p>
<p>This gives a way to measure speed by ear. The ratio of approach to recede pitch is $r = (1+M)/(1-M)$, so $M = (r-1)/(r+1)$. A drop of a musical whole tone, $r \\approx 1.12$, means $M \\approx 0.057$, about 20 m/s or 70 km/h.</p>`,
    },
    {
      title: 'History: a prediction for stars, a test with trumpets',
      html: `<p>Christian Doppler proposed the effect in 1842 in Prague, in a paper on the coloured light of double stars. His idea for light was right, but his proposed explanation of star colours was not. Stellar speeds are far too small to change a star's colour visibly.</p>
<p>The effect was tested with sound first. In 1845 the Dutch scientist Christophorus Buys Ballot put horn players on an open railway car near Utrecht. Musicians beside the track judged the pitch as the train came and went. The note was higher on approach and lower as it left, as Doppler predicted. Hippolyte Fizeau independently described the effect for light in 1848.</p>`,
    },
    {
      title: 'The sound barrier and the sonic boom',
      html: `<p>As aircraft neared the speed of sound, the piled-up pressure at the nose caused severe buffeting and control problems. People spoke of a "sound barrier". On 14 October 1947 Chuck Yeager flew the rocket-powered Bell X-1 to about Mach 1.06 and showed it could be crossed.</p>
<p>A sonic boom is not a single bang made at the moment of crossing Mach 1. The cone travels with the aircraft for as long as it stays supersonic. It drags a carpet of boom along the ground under the flight path. Each listener hears it once, when the cone passes them. Real aircraft make two main shocks, at the nose and the tail, so the pressure trace is shaped like an N and many people hear a double boom.</p>
<p>Mach number is always relative to the local speed of sound. High in the atmosphere the air is cold and $c$ is lower, around 295 m/s, so Mach 1 there is slower than 343 m/s.</p>
<p>The same geometry appears for light in <a href="#/t/cherenkov">Cherenkov radiation</a>, when a charged particle outruns light in water.</p>`,
    },
    {
      title: 'Light is different: the relativistic Doppler effect',
      html: `<p>Sound needs a medium, so there is a preferred frame: the air. A moving source and a moving listener give different answers at the same speed. At half the speed of sound, a moving source doubles the pitch ($1/(1-0.5) = 2$). A moving listener multiplies it by only $1.5$.</p>
<p>Light has no medium. Only the relative speed can matter, and special relativity gives, for head-on approach at $v = \\beta c$,</p>
$$f' = f\\sqrt{\\frac{1+\\beta}{1-\\beta}}.$$
<p>This is exactly the geometric mean of the two sound answers, $\\sqrt{(1+\\beta)\\cdot 1/(1-\\beta)}$. At $\\beta = 0.5$ it gives $\\sqrt3 \\approx 1.73$, between 1.5 and 2.</p>
<p>Light also has a <em>transverse</em> Doppler effect that sound lacks. Light emitted at right angles to the motion, in the observer's frame, arrives redshifted by $1/\\gamma$ because the source's clock runs slow. Ives and Stilwell measured this with fast hydrogen ions in 1938. The <a href="#/t/relativistic-visuals">relativistic visuals</a> page shows how these shifts colour the world at high speed.</p>`,
    },
    {
      title: 'Applications: radar, ultrasound, redshift and planets',
      html: `<p><strong>Radar guns and weather radar.</strong> A radar wave reflects off a moving target, which acts first as a moving listener and then as a moving source. For $v \\ll c$ the shift is $\\Delta f \\approx 2 v f/c$. A 24 GHz police radar and a car at 30 m/s give about 4.8 kHz. Doppler weather radar uses the same idea to map how fast rain drifts toward or away from the dish. Tight patches of opposite motion can reveal a rotating storm.</p>
<p><strong>Echocardiography.</strong> Ultrasound in soft tissue travels at about 1540 m/s. A 2 MHz beam reflected from blood moving at 1 m/s shifts by about 2.6 kHz, which is audible. That is why Doppler ultrasound machines can play the whoosh of blood flow through a speaker. The measurement reads only the part of the flow along the beam, so the operator must correct for the beam angle.</p>
<p><strong>Exoplanets.</strong> A planet and its star orbit a common centre, so the star wobbles toward and away from us. Jupiter moves the Sun at about 13 m/s. A shift that small in starlight is a fractional change of about $4\\times10^{-8}$. In 1995 Michel Mayor and Didier Queloz found 51 Pegasi b this way. The <a href="#/t/exoplanet-transits">exoplanet transits</a> page covers the other main method.</p>
<p><strong>Cosmological redshift is not quite Doppler.</strong> Distant galaxies look redshifted, and for nearby ones the shift acts like a Doppler shift with $v \\approx cz$. For distant ones the better picture is that space expands while the light travels, and wavelengths stretch with it, so $1 + z$ equals the ratio of the size of the universe now to then. See <a href="#/t/cosmic-expansion">cosmic expansion</a>.</p>`,
    },
  ],
  challenges: [
    {
      id: 'twenty',
      title: 'Twenty percent higher',
      prompt: 'Make the approaching siren sound at least 20% higher than its true pitch. Keep the source below the speed of sound.',
      hint: 'For head-on approach the ratio is $1/(1-M)$. Solve $1/(1-M) = 1.2$. The listener speed also helps.',
      check: (s) => (s.ratio as number) >= 1.2 && (s.mach as number) < 1 && s.approaching === true,
    },
    {
      id: 'barrier',
      title: 'Break the sound barrier',
      prompt: 'Fly faster than sound and let the Mach cone sweep over the listener.',
      hint: 'Push the source speed above Mach 1 and wait for the boom. A listener close to the road gets it sooner.',
      check: (s) => (s.mach as number) > 1 && s.boomHeard === true,
    },
    {
      id: 'cone30',
      title: 'A 30° cone',
      prompt: 'Set the Mach cone half-angle to 30°, within half a degree.',
      hint: '$\\sin\\alpha = 1/M$ and $\\sin 30° = 1/2$.',
      check: (s) => (s.mach as number) > 1 && Math.abs((s.alphaDeg as number) - 30) <= 0.5,
    },
    {
      id: 'swap',
      title: 'Who is moving?',
      prompt: 'Try the source moving at some speed of at least Mach 0.3 with the listener still. Then stop the source and move the listener at the same speed. Compare the two approach shifts.',
      hint: 'Set the listener speed to 0 and the source to, say, Mach 0.5. Then set the source to 0 and the listener to 0.5. The readouts show both shifts. For light they would be equal.',
      check: (s) => (s.srcOnlyM as number) >= 0.3 && Math.abs((s.srcOnlyM as number) - (s.obsOnlyM as number)) < 0.011,
    },
  ],
  caveats: `
<p>The model uses linear acoustics in still, uniform air. Real shock waves are nonlinear, and their strength and shape depend on the aircraft. Wind changes the result because the Doppler formula uses speeds relative to the air. The listener's ear and the source are at the same height, and ground reflections and echoes are ignored.</p>
<p>The rings on the ground are drawn far fewer per second than the true frequency, so you can see them. Their spacing ratio ahead and behind is correct. The scene runs in slow motion, shown by the time-rate readout, and the audible tone follows the slowed clock. The sound is a pure tone, not a real two-tone siren.</p>
<p>The water setting keeps the same Mach numbers, so the speeds become unrealistic for real boats or swimmers. Supersonic motion in water is shown only to compare the geometry.</p>`,
  further: [
    { label: 'Doppler effect (Wikipedia)', url: 'https://en.wikipedia.org/wiki/Doppler_effect' },
    { label: 'Sonic boom (Wikipedia)', url: 'https://en.wikipedia.org/wiki/Sonic_boom' },
    { label: 'Relativistic Doppler effect (Wikipedia)', url: 'https://en.wikipedia.org/wiki/Relativistic_Doppler_effect' },
    { label: 'Mayor & Queloz 1995, A Jupiter-mass companion to a solar-type star (Nature)', url: 'https://doi.org/10.1038/378355a0' },
  ],
};
