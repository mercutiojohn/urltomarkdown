const readers = require('./url_to_markdown_readers.js');
const run_conversion = require('./conversion_runner.js');
const validURL = require('@7c/validurl');
const express = require('express');
const rateLimit = require('express-rate-limit');
const make_concurrency_limiter = require('./concurrency_limiter.js');
const app = express();

// handled upstream by proxy

const rateLimiter = rateLimit({
	windowMs: 30 * 1000,
	max: 5,
	message: 'Rate limit exceeded',
	headers: true
});

// Each conversion parses a full DOM and runs Readability + Turndown, which can
// spike memory well beyond a typical request, and now runs in its own worker
// thread (see conversion_runner.js) so a single job's fatal OOM only kills
// that worker, not this process. Capping how many run at once still bounds
// worst-case memory on this single dyno - default of 1 means only one
// conversion's memory footprint is ever live at a time. Requests that arrive
// over the cap are queued briefly rather than rejected outright, since most
// bursts clear within a few seconds - but the wait is kept comfortably under
// Heroku's ~30s router timeout so a queued request still gets a clean 503
// instead of a router-level timeout if the dyno stays busy.
const max_concurrent_conversions = parseInt(process.env.MAX_CONCURRENT_CONVERSIONS || '1', 10);
const concurrencyLimiter = make_concurrency_limiter(max_concurrent_conversions, {
	maxQueueLength: max_concurrent_conversions * 4,
	maxWaitMs: 20 * 1000
});

app.set('trust proxy', 1);

app.use(rateLimiter);
app.use(concurrencyLimiter);

app.use(express.urlencoded({
  extended: true,
  limit: '8mb'
}));

function send_headers(res) {
	res.header("Access-Control-Allow-Origin", '*');
	res.header("Access-Control-Allow-Methods", 'GET, POST');
 	res.header("Access-Control-Expose-Headers", 'X-Title');
 	res.header("Content-Type", 'text/markdown');
}

async function send_conversion_result(job, res) {
	const result = await run_conversion(job);
	send_headers(res);
	if (result.headers) {
		for (const [name, value] of Object.entries(result.headers)) {
			res.header(name, value);
		}
	}
	res.status(result.status).send(result.body);
}

function get_options(query) {
	const title = query.title;
	const links = query.links;
	const clean = query.clean;

	let inline_title = false;
	let ignore_links = false;
	let improve_readability = true;

	if (title !== undefined) {
		inline_title = (title === 'true');
	}
	if (links !== undefined) {
		ignore_links = (links === 'false');
	}
	if (clean !== undefined) {
		improve_readability = (clean !== 'false');
	}
	return {
		inline_title: inline_title,
		ignore_links: ignore_links,
		improve_readability: improve_readability
	};
}

app.get('/', async (req, res) => {
	const url = req.query.url;
	const options = get_options(req.query);
	if (url && validURL(url)) {
		await send_conversion_result({ mode: 'url', url, options }, res);
	} else {
		res.status(400).send("Please specify a valid url query parameter");
	}
});

app.post('/', async function(req, res) {
	let html = req.body.html;
	const url = req.body.url;
	const options = get_options(req.query);
	if (readers.ignore_post(url)) {
		await send_conversion_result({ mode: 'url', url, options }, res);
		return;
	}
	if (!html) {
		res.status(400).send("Please provide a POST parameter called html");
	} else {
		await send_conversion_result({ mode: 'html', url, html, options }, res);
	}
});

if (require.main === module) {
	const port = process.env.PORT;
	if (!port) {
		console.error("Please specify a port in the PORT environment variable");
		process.exit(1);
	}
	app.listen(port, () => {
	})
}

module.exports = app;
