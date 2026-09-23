# 03 · Physics engines

| Topic | Model | Integrator | Validated against |
|---|---|---|---|
| Double pendulum | Lagrangian equations for point masses on rigid rods | RK4, h = 1 ms | energy drift < 1e-6, small-angle normal-mode period, divergence |
| Tennis racket | Euler's torque-free rigid-body equations and an orientation quaternion | RK4 on ω and q, with renormalization | E, \|L\| and world L conserved, growth rate σ, elliptic-integral flip period |
| Special relativity | Lorentz boosts in (t, x, y), c = 1 | closed form | interval invariance, velocity addition equal to boost composition, null stays null |
| Curved spacetime | Schwarzschild equatorial timelike geodesics in proper time, G = c = M = 1 | RK4 | circular orbit stability, weak-field precession 6πM/(a(1−e²)), ISCO plunge, E conservation |
| Quantum tunneling | 1D TDSE with ħ = m = 1, absorbing edges | split-step Fourier, hand-written radix-2 FFT | FFT against DFT, unitarity, free-spreading law, packet-averaged barrier transmission |
| Strings | Classical closed and open string modes, and the bosonic closed-string spectrum on a circle (α' = 1) | closed form | T-duality of the spectrum, level matching, self-dual massless states, mode frequencies |

Run `npm test` to execute every check. Each topic's checks live in `tests/topics/<id>.ts`.
