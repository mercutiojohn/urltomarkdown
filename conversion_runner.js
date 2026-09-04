const path = require('path');
const { Worker } = require('worker_threads');

const failure_message = "Sorry, could not fetch and convert that URL";
const default_timeout_ms = 15 * 1000;
const default_max_old_space_mb = parseInt(process.env.WORKER_MAX_OLD_SPACE_MB || '300', 10);

// Runs one conversion job in its own worker thread so a fatal V8 "out of
// memory" error - which no try/catch or promise .catch() can intercept -
// only takes down that worker instead of the shared Express process and its
// request queue. Always resolves; never rejects.
function run_conversion(job, options = {}) {
	const worker_path = path.join(__dirname, 'conversion_worker.js');
	const timeout_ms = options.timeoutMs ?? default_timeout_ms;
	const max_old_space_mb = options.maxOldSpaceMb ?? default_max_old_space_mb;

	return new Promise((resolve) => {
		let settled = false;
		let timer = null;

		const worker = new Worker(worker_path, {
			workerData: job,
			resourceLimits: { maxOldGenerationSizeMb: max_old_space_mb }
		});

		function finish(result) {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			worker.removeAllListeners();
			worker.terminate();
			resolve(result);
		}

		timer = setTimeout(() => {
			finish({ status: 504, body: failure_message });
		}, timeout_ms);

		worker.on('message', (result) => {
			finish(result);
		});

		worker.on('error', (err) => {
			if (err && err.code === 'ERR_WORKER_OUT_OF_MEMORY') {
				finish({ status: 503, body: failure_message + " as the page was too complex to convert" });
			} else {
				finish({ status: 500, body: failure_message });
			}
		});

		worker.on('exit', (code) => {
			if (code !== 0) {
				finish({ status: 500, body: failure_message });
			}
		});
	});
}

module.exports = run_conversion;
