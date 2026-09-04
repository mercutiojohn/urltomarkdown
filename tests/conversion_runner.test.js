const { EventEmitter } = require('events');

jest.mock('worker_threads', () => {
	return { Worker: jest.fn() };
});

const { Worker } = require('worker_threads');
const run_conversion = require('../conversion_runner.js');

function fake_worker() {
	const worker = new EventEmitter();
	worker.terminate = jest.fn();
	return worker;
}

beforeEach(() => {
	jest.clearAllMocks();
});

test('resolves with the worker message on success', async () => {
	const worker = fake_worker();
	Worker.mockImplementation(() => worker);

	const promise = run_conversion({ mode: 'url', url: 'https://example.com' });
	worker.emit('message', { status: 200, body: 'hello' });

	const result = await promise;
	expect(result).toEqual({ status: 200, body: 'hello' });
	expect(worker.terminate).toHaveBeenCalled();
});

test('maps a worker out-of-memory error to a 503 without crashing the caller', async () => {
	const worker = fake_worker();
	Worker.mockImplementation(() => worker);

	const promise = run_conversion({ mode: 'url', url: 'https://example.com' });
	const err = new Error('worker out of memory');
	err.code = 'ERR_WORKER_OUT_OF_MEMORY';
	worker.emit('error', err);

	const result = await promise;
	expect(result.status).toBe(503);
	expect(result.body).toContain('too complex');
});

test('maps a generic worker error to a 500', async () => {
	const worker = fake_worker();
	Worker.mockImplementation(() => worker);

	const promise = run_conversion({ mode: 'url', url: 'https://example.com' });
	worker.emit('error', new Error('something else broke'));

	const result = await promise;
	expect(result.status).toBe(500);
});

test('times out a worker that runs too long and terminates it', async () => {
	jest.useFakeTimers();
	const worker = fake_worker();
	Worker.mockImplementation(() => worker);

	const promise = run_conversion({ mode: 'url', url: 'https://example.com' }, { timeoutMs: 1000 });
	jest.advanceTimersByTime(1000);

	const result = await promise;
	expect(result.status).toBe(504);
	expect(worker.terminate).toHaveBeenCalled();
	jest.useRealTimers();
});

test('an unexpected nonzero exit with no message resolves with a 500', async () => {
	const worker = fake_worker();
	Worker.mockImplementation(() => worker);

	const promise = run_conversion({ mode: 'url', url: 'https://example.com' });
	worker.emit('exit', 1);

	const result = await promise;
	expect(result.status).toBe(500);
});

test('a clean exit after a message does not override the resolved result', async () => {
	const worker = fake_worker();
	Worker.mockImplementation(() => worker);

	const promise = run_conversion({ mode: 'url', url: 'https://example.com' });
	worker.emit('message', { status: 200, body: 'ok' });
	worker.emit('exit', 0);

	const result = await promise;
	expect(result).toEqual({ status: 200, body: 'ok' });
});

test('a worker crash does not affect a subsequent conversion job', async () => {
	const crashing_worker = fake_worker();
	Worker.mockImplementationOnce(() => crashing_worker);

	const first = run_conversion({ mode: 'url', url: 'https://example.com/a' });
	const err = new Error('boom');
	err.code = 'ERR_WORKER_OUT_OF_MEMORY';
	crashing_worker.emit('error', err);
	const first_result = await first;
	expect(first_result.status).toBe(503);

	const healthy_worker = fake_worker();
	Worker.mockImplementationOnce(() => healthy_worker);

	const second = run_conversion({ mode: 'url', url: 'https://example.com/b' });
	healthy_worker.emit('message', { status: 200, body: 'still works' });
	const second_result = await second;

	expect(second_result).toEqual({ status: 200, body: 'still works' });
});

test('passes resourceLimits.maxOldGenerationSizeMb through to the worker options', async () => {
	const worker = fake_worker();
	Worker.mockImplementation(() => worker);

	const promise = run_conversion({ mode: 'url', url: 'https://example.com' }, { maxOldSpaceMb: 250 });

	expect(Worker).toHaveBeenCalledWith(
		expect.any(String),
		expect.objectContaining({
			workerData: { mode: 'url', url: 'https://example.com' },
			resourceLimits: { maxOldGenerationSizeMb: 250 }
		})
	);

	worker.emit('message', { status: 200, body: 'ok' });
	await promise;
});
