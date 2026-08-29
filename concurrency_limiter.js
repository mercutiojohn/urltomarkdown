function send_busy(res) {
	res.status(503).send('Server is busy converting other requests, please try again shortly');
}

module.exports = function make_concurrency_limiter(limit, options = {}) {
	const max_queue_length = options.maxQueueLength ?? limit * 4;
	const max_wait_ms = options.maxWaitMs ?? 20 * 1000;

	let active = 0;
	const queue = [];

	function acquire(res, next) {
		active++;
		let released = false;
		const release = () => {
			if (released) return;
			released = true;
			active--;
			schedule();
		};
		res.on('finish', release);
		res.on('close', release);
		next();
	}

	function schedule() {
		if (active >= limit || queue.length === 0) return;
		const entry = queue.shift();
		clearTimeout(entry.timer);
		acquire(entry.res, entry.next);
	}

	return function (req, res, next) {
		if (active < limit) {
			acquire(res, next);
			return;
		}

		if (queue.length >= max_queue_length) {
			send_busy(res);
			return;
		}

		const entry = { res, next, timer: null };
		const remove_from_queue = () => {
			const index = queue.indexOf(entry);
			if (index !== -1) queue.splice(index, 1);
		};

		entry.timer = setTimeout(() => {
			remove_from_queue();
			send_busy(res);
		}, max_wait_ms);

		res.on('close', () => {
			clearTimeout(entry.timer);
			remove_from_queue();
		});

		queue.push(entry);
	};
}
