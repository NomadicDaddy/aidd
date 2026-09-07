# Debug service

This local service renders a debug page for operators, checks administrator access on privileged
routes, reads uploaded files back to their owners, and publishes static assets under `/assets/`.

The health endpoint answers the load balancer's liveness probe. It carries no user data and is
reachable without a session, which is what the probe requires.
