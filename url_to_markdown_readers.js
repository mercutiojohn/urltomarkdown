const apple_dev_parser = require('./url_to_markdown_apple_dev_docs.js');
const processor = require('./url_to_markdown_processor.js');
const filters = require('./url_to_markdown_common_filters.js');
const JSDOM = require('jsdom').JSDOM;
const https = require('https');

const failure_message  = "Sorry, could not fetch and convert that URL";
const service_user_agent = "Urltomarkdown/1.0";

const apple_dev_prefix = "https://developer.apple.com";
const stackoverflow_prefix = "https://stackoverflow.com/questions";

const timeoutMs = 15 * 1000;
const max_response_bytes = 8 * 1024 * 1024;

function fetch_url (url, success, failure) {

	let fetch = new Promise((resolve, reject) => {

		let timedOut = false;
		let tooLarge = false;

		const timeout = setTimeout(() => {
			timedOut = true;
		}, timeoutMs);

		const req = https.get(url, {
			headers: {
				'User-Agent': service_user_agent
			}
		}, (res) => {
			clearTimeout(timeout);

		    let result = "";
		    let bytes = 0;
		    res.on("data", (chunk) => {
		    	if (tooLarge) return;
		        bytes += chunk.length;
		        if (bytes > max_response_bytes) {
		        	tooLarge = true;
		        	res.destroy();
		        	reject('too_large');
		        	return;
		        }
		        result += chunk;
		    });
		    res.on("end", () => {
		    	if (tooLarge) return;
		    	if (!timedOut && res.statusCode >= 200 && res.statusCode < 300) {
		    		resolve(result);
		    	} else {
		    		reject(res.statusCode);
		    	}
		    });
		});

		req.on('error', (err) => {
			clearTimeout(timeout);
			reject();
	    });

		req.on('timeout', () => {
			clearTimeout(timeout);
			req.destroy();
			reject();
	    });

	    req.setTimeout(timeoutMs);

	});

	fetch.then( (response) => success(response) ).catch( (code) => failure(code) );
}

function fetch_url_promise(url) {
	return new Promise((resolve, reject) => {
		fetch_url(url, resolve, reject);
	});
}

function build_fetch_failure(code) {
	if (code === 'too_large') {
		return { status: 413, body: failure_message + " as the page was too large to convert" };
	} else if (code && Number.isInteger(code)) {
		return { status: 502, body: failure_message + " as the website you are trying to convert returned status code " + code };
	} else {
		return { status: 504, body: failure_message };
	}
}

function success_result(markdown, title) {
	const headers = {};
	if (title) headers['X-Title'] = title;
	return { status: 200, headers, body: markdown };
}

class html_reader {
	async read_url(url, options) {
		try {
			const html = await fetch_url_promise(url);
			const stripped = filters.strip_style_and_script_blocks(html);
			const document = new JSDOM(stripped);
			const { markdown, title } = processor.process_dom(url, document, "", options);
			return success_result(markdown, title);
		} catch(error) {
			if (error instanceof Error) {
				return { status: 400, body: failure_message };
			}
			return build_fetch_failure(error);
		}
	}
}

class apple_reader {
	async read_url(url, options) {
		try {
			let json_url = apple_dev_parser.dev_doc_url(url);
			const body = await fetch_url_promise(json_url);
			let json = JSON.parse(body);
			let markdown = apple_dev_parser.parse_dev_doc_json(json, options.inline_title, options.ignore_links);
			return { status: 200, headers: {}, body: markdown };
		} catch(error) {
			if (error instanceof Error) {
				return { status: 400, body: failure_message };
			}
			return build_fetch_failure(error);
		}
	}
}

class stack_reader {
	async read_url(url, options) {
		try {
			const html = await fetch_url_promise(url);
			const stripped = filters.strip_style_and_script_blocks(html);
			const document = new JSDOM(stripped);
			const question = processor.process_dom(url, document, 'question', options);
			const answer_options = { ...options, inline_title: false };
			const answers = processor.process_dom(url, document, 'answers', answer_options);
			let markdown;
			if (answers.markdown.startsWith('Your Answer')) {
				markdown = question.markdown;
			} else {
				markdown = question.markdown + "\n\n## Answer\n" + answers.markdown;
			}
			return success_result(markdown, question.title);
		} catch(error) {
			if (error instanceof Error) {
				return { status: 400, body: failure_message };
			}
			return build_fetch_failure(error);
		}
	}
}

module.exports = {
	html_reader,
	stack_reader,
	apple_reader,
	reader_for_url: function (url) {
		if (url.startsWith(apple_dev_prefix)) {
			return new apple_reader;
		} else if (url.startsWith(stackoverflow_prefix)) {
			return new stack_reader;
		} else {
			return new html_reader;
		}
	},
	ignore_post: function(url) {
		if (url) {
			if (url.startsWith(stackoverflow_prefix)) {
				return true;
			}
		} else {
			return false;
		}
	}
}
