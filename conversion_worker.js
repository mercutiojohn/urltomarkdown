const { parentPort, workerData } = require('worker_threads');
const readers = require('./url_to_markdown_readers.js');
const processor = require('./url_to_markdown_processor.js');
const filters = require('./url_to_markdown_common_filters.js');
const JSDOM = require('jsdom').JSDOM;

async function run(job) {
	if (job.mode === 'html') {
		try {
			const stripped = filters.strip_style_and_script_blocks(job.html);
			const document = new JSDOM(stripped);
			const { markdown, title } = processor.process_dom(job.url, document, "", job.options);
			const headers = {};
			if (title) headers['X-Title'] = title;
			return { status: 200, headers, body: markdown };
		} catch (error) {
			return { status: 400, body: "Could not parse that document" };
		}
	}

	const reader = readers.reader_for_url(job.url);
	return reader.read_url(job.url, job.options);
}

run(workerData).then((result) => {
	parentPort.postMessage(result);
});
