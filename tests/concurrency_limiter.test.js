const make_concurrency_limiter = require('../concurrency_limiter.js');
const { EventEmitter } = require('events');

function fake_req_res() {
	const res = new EventEmitter();
	let statusCode = null;
	let sent = null;
	res.status = (code) => { statusCode = code; return { send: (body) => { sent = body; } }; };
	res.getStatus = () => statusCode;
	res.getSent = () => sent;
	return { req: {}, res };
}

test('allows requests through while under the limit', () => {
	const limiter = make_concurrency_limiter(2);
	const next = jest.fn();
	const { req, res } = fake_req_res();

	limiter(req, res, next);

	expect(next).toHaveBeenCalledTimes(1);
	expect(res.getStatus()).toBeNull();
});

test('queues a request once the limit is reached, without calling next immediately', () => {
	const limiter = make_concurrency_limiter(1);
	const first = fake_req_res();
	const second = fake_req_res();

	limiter(first.req, first.res, jest.fn());
	const second_next = jest.fn();
	limiter(second.req, second.res, second_next);

	expect(second_next).not.toHaveBeenCalled();
	expect(second.res.getStatus()).toBeNull();
});

test('runs a queued request once the active one finishes', () => {
	const limiter = make_concurrency_limiter(1);
	const first = fake_req_res();
	limiter(first.req, first.res, jest.fn());

	const second = fake_req_res();
	const second_next = jest.fn();
	limiter(second.req, second.res, second_next);

	first.res.emit('finish');

	expect(second_next).toHaveBeenCalledTimes(1);
});

test('runs a queued request when the active one closes without finishing', () => {
	const limiter = make_concurrency_limiter(1);
	const first = fake_req_res();
	limiter(first.req, first.res, jest.fn());

	const second = fake_req_res();
	const second_next = jest.fn();
	limiter(second.req, second.res, second_next);

	first.res.emit('close');

	expect(second_next).toHaveBeenCalledTimes(1);
});

test('does not double-release a slot when both finish and close fire', () => {
	const limiter = make_concurrency_limiter(1);
	const first = fake_req_res();
	limiter(first.req, first.res, jest.fn());
	first.res.emit('finish');
	first.res.emit('close');

	const second = fake_req_res();
	limiter(second.req, second.res, jest.fn());
	const third = fake_req_res();
	const third_next = jest.fn();
	limiter(third.req, third.res, third_next);

	// only one slot was freed by the first request, so the second request is
	// now occupying it and the third should still be queued, not running.
	expect(third_next).not.toHaveBeenCalled();
});

test('rejects with 503 once the queue itself is full', () => {
	const limiter = make_concurrency_limiter(1, { maxQueueLength: 1 });
	const first = fake_req_res();
	limiter(first.req, first.res, jest.fn());

	const second = fake_req_res();
	limiter(second.req, second.res, jest.fn()); // fills the one queue slot

	const third = fake_req_res();
	const third_next = jest.fn();
	limiter(third.req, third.res, third_next);

	expect(third_next).not.toHaveBeenCalled();
	expect(third.res.getStatus()).toBe(503);
	expect(third.res.getSent()).toContain('busy');
});

test('rejects a queued request with 503 if it waits past maxWaitMs', () => {
	jest.useFakeTimers();
	const limiter = make_concurrency_limiter(1, { maxWaitMs: 1000 });
	const first = fake_req_res();
	limiter(first.req, first.res, jest.fn());

	const second = fake_req_res();
	const second_next = jest.fn();
	limiter(second.req, second.res, second_next);

	jest.advanceTimersByTime(1000);

	expect(second_next).not.toHaveBeenCalled();
	expect(second.res.getStatus()).toBe(503);
	jest.useRealTimers();
});

test('a queued request that disconnects before its turn frees its queue slot', () => {
	const limiter = make_concurrency_limiter(1, { maxQueueLength: 1 });
	const first = fake_req_res();
	limiter(first.req, first.res, jest.fn());

	const second = fake_req_res();
	limiter(second.req, second.res, jest.fn());
	second.res.emit('close'); // client gave up while queued

	const third = fake_req_res();
	const third_next = jest.fn();
	limiter(third.req, third.res, third_next);

	// the queue slot vacated by the second request's disconnect should now be free
	expect(third_next).not.toHaveBeenCalled();
	expect(third.res.getStatus()).toBeNull();
});
