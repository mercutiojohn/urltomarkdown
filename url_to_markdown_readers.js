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

function send_fetch_failure(res, code) {
	if (code === 'too_large') {
		res.status(413).send(failure_message + " as the page was too large to convert");
	} else if (code && Number.isInteger(code)) {
		res.status(502).send(failure_message + " as the website you are trying to convert returned status code " + code);
	} else {
		res.status(504).send(failure_message);
	}
}

class html_reader {
	read_url(url, res, options) {
		try {
			fetch_url(url, (html) => {
				html = filters.strip_style_and_script_blocks(html);
				const document = new JSDOM(html);
				const id = "";
				let markdown = processor.process_dom(url, document, res, id, options);
				res.send(markdown);
			}, (code) => {
				send_fetch_failure(res, code);
			});
		} catch(error) {
			res.status(400).send(failure_message);
		}
	}
}

class apple_reader {
	read_url(url, res, options) {
		try {
			let json_url = apple_dev_parser.dev_doc_url(url);
			fetch_url(json_url, (body) => {
	            let json = JSON.parse(body);
	            let markdown = apple_dev_parser.parse_dev_doc_json(json, options.inline_title, options.ignore_links);
	            res.send(markdown);
			}, (code) => {
				send_fetch_failure(res, code);
			});
		} catch(error) {
			res.status(400).send(failure_message);
		}
	}
}

class stack_reader {
	read_url(url, res, options) {
		try {
			fetch_url(url, (html) => {
				html = filters.strip_style_and_script_blocks(html);
				const document = new JSDOM(html);
				let markdown_q = processor.process_dom(url, document, res, 'question', options );
				options.inline_title = false;
				let markdown_a = processor.process_dom(url, document, res, 'answers', options );
				if (markdown_a.startsWith('Your Answer')) {
					res.send(markdown_q);
				}
				else {
					res.send(markdown_q + "\n\n## Answer\n"+ markdown_a);
				}
			}, (code) => {
				send_fetch_failure(res, code);
			});
		} catch(error) {
			res.status(400).send(failure_message);
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
