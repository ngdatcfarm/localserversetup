/**
 * Durable Object placeholder — used for streaming + presence later if needed.
 * Not currently wired up.
 */
export class RelayRoom {
    constructor(state, env) {
        this.state = state;
        this.env = env;
    }
    async fetch(req) {
        return new Response("not implemented", { status: 501 });
    }
}