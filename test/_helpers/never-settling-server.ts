/**
 * A local server that accepts a connection and never responds, for tests whose subject is a
 * CLIENT-side request bound firing.
 *
 * The handler settles on the request's own abort signal rather than never settling at all. Both
 * shapes look identical to the client under test -- no response ever arrives, so its bound fires
 * exactly as it should -- but a handler that never settles wedges `server.stop(true)` forever on
 * Bun 1.4.0. That hang lands in the test's `finally`, AFTER every assertion has already passed,
 * and is reported as "this test timed out after <N>ms" against whatever the per-test ceiling
 * happens to be. It therefore reads like a slow test and invites raising the ceiling, which only
 * moves the identical hang to a larger number. Settling on abort keeps the client-side behavior
 * under test unchanged while leaving the server with nothing in flight to wait for.
 */
export function serveNeverSettling(): ReturnType<typeof Bun.serve> {
	return Bun.serve({
		fetch: (request) =>
			new Promise<Response>((_resolve, reject) => {
				request.signal.addEventListener(
					'abort',
					() => {
						reject(new Error('client disconnected'));
					},
					{ once: true },
				);
			}),
		port: 0,
	});
}
