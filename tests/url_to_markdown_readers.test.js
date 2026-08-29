jest.mock('https');
const https = require('https');
const { EventEmitter } = require('events');
const readers = require('../url_to_markdown_readers.js');

function fake_res() {
	let sent = null;
	let statusCode = null;
	return {
		header: () => {},
		send: (body) => { sent = body; },
		status: (code) => { statusCode = code; return { send: (body) => { sent = body; } }; },
		get sent() { return sent; },
		get statusCode() { return statusCode; }
	};
}

function mock_https_get_success(body, options = {}) {
	https.get.mockImplementation((url, opts, callback) => {
		if (typeof opts === 'function') { callback = opts; }
		const res = new EventEmitter();
		res.statusCode = options.statusCode ?? 200;
		const req = new EventEmitter();
		req.destroy = () => {};
		req.setTimeout = () => {};
		callback(res);
		res.emit('data', Buffer.from(body));
		res.emit('end');
		return req;
	});
}

function mock_https_get_oversized() {
	https.get.mockImplementation((url, opts, callback) => {
		const res = new EventEmitter();
		res.statusCode = 200;
		res.destroy = () => { res.emit('end'); };
		const req = new EventEmitter();
		req.destroy = () => {};
		req.setTimeout = () => {};
		callback(res);
		res.emit('data', Buffer.alloc(9 * 1024 * 1024));
		return req;
	});
}

function mock_https_get_error() {
	https.get.mockImplementation((url, opts, callback) => {
		const req = new EventEmitter();
		req.destroy = () => {};
		req.setTimeout = () => {};
		process.nextTick(() => req.emit('error', new Error('boom')));
		return req;
	});
}

beforeEach(() => {
	jest.clearAllMocks();
});

test('reader_for_url returns html reader for arbitrary domains', () => {
	let reader = readers.reader_for_url("https://en.wikipedia.org");
	expect(reader).toBeInstanceOf(readers.html_reader);
});

test('reader_for_url returns stack reader for stackoverflow questions', () => {
	let reader = readers.reader_for_url("https://stackoverflow.com/questions/0");
	expect(reader).toBeInstanceOf(readers.stack_reader);
});

test('reader_for_url returns apple reader for apple developer docs', () => {
	let reader = readers.reader_for_url("https://developer.apple.com/documentation/swift/array");
	expect(reader).toBeInstanceOf(readers.apple_reader);
});

test('reader_for_url falls back to html reader for a stackoverflow url outside /questions', () => {
	let reader = readers.reader_for_url("https://stackoverflow.com/users/1/someone");
	expect(reader).toBeInstanceOf(readers.html_reader);
});

test('ignore_post is true for stackoverflow question urls', () => {
	expect(readers.ignore_post("https://stackoverflow.com/questions/1/test")).toBe(true);
});

test('ignore_post is falsy for other urls', () => {
	expect(readers.ignore_post("https://example.com")).toBeFalsy();
});

test('ignore_post is falsy when no url is given', () => {
	expect(readers.ignore_post(undefined)).toBeFalsy();
});

test('html_reader fetches, converts and sends markdown for a successful response', (done) => {
	mock_https_get_success("<html><head><title>t</title></head><body><p>hello</p></body></html>");
	let reader = new readers.html_reader();
	let res = fake_res();
	res.send = (body) => {
		expect(body).toContain("hello");
		done();
	};
	reader.read_url("https://example.com", res, {});
});

test('html_reader responds with 502 and the upstream status code on a non-2xx response', (done) => {
	mock_https_get_success("not found", { statusCode: 404 });
	let reader = new readers.html_reader();
	let res = fake_res();
	res.status = (code) => {
		expect(code).toBe(502);
		return { send: (body) => {
			expect(body).toContain("404");
			done();
		} };
	};
	reader.read_url("https://example.com", res, {});
});

test('html_reader responds with 504 on a network error', (done) => {
	mock_https_get_error();
	let reader = new readers.html_reader();
	let res = fake_res();
	res.status = (code) => {
		expect(code).toBe(504);
		return { send: (body) => {
			expect(body).toContain("Sorry");
			done();
		} };
	};
	reader.read_url("https://example.com", res, {});
});

test('html_reader responds with 413 when the fetched page exceeds the size cap', (done) => {
	mock_https_get_oversized();
	let reader = new readers.html_reader();
	let res = fake_res();
	res.status = (code) => {
		expect(code).toBe(413);
		return { send: (body) => {
			expect(body).toContain("too large");
			done();
		} };
	};
	reader.read_url("https://example.com", res, {});
});

test('apple_reader fetches json and sends parsed markdown', (done) => {
	const json = JSON.stringify({ metadata: { title: 'Array' }, primaryContentSections: [] });
	mock_https_get_success(json);
	let reader = new readers.apple_reader();
	let res = fake_res();
	res.send = (body) => {
		expect(body).toBe("# Array\n\n");
		done();
	};
	reader.read_url("https://developer.apple.com/documentation/swift/array", res, { inline_title: true });
});

test('apple_reader responds with 504 on a network error', (done) => {
	mock_https_get_error();
	let reader = new readers.apple_reader();
	let res = fake_res();
	res.status = (code) => {
		expect(code).toBe(504);
		return { send: (body) => {
			expect(body).toContain("Sorry");
			done();
		} };
	};
	reader.read_url("https://developer.apple.com/documentation/swift/array", res, {});
});

test('apple_reader responds with an error when the fetched body is not valid json', (done) => {
	// note: JSON.parse errors happen inside the async fetch callback, past the
	// synchronous try/catch, so they surface as a generic 504 rather than a 400.
	mock_https_get_success("not json");
	let reader = new readers.apple_reader();
	let res = fake_res();
	res.status = (code) => {
		expect(code).toBe(504);
		return { send: (body) => {
			expect(body).toContain("Sorry");
			done();
		} };
	};
	reader.read_url("https://developer.apple.com/documentation/swift/array", res, {});
});

test('stack_reader combines question and answer markdown', (done) => {
	const html =
		"<html><head><title>q</title></head><body>" +
		"<div id='question'><p>the question</p></div>" +
		"<div id='answers'><p>the answer</p></div>" +
		"</body></html>";
	mock_https_get_success(html);
	let reader = new readers.stack_reader();
	let res = fake_res();
	res.send = (body) => {
		expect(body).toContain("the question");
		expect(body).toContain("## Answer");
		expect(body).toContain("the answer");
		done();
	};
	reader.read_url("https://stackoverflow.com/questions/1/test", res, {});
});

test('stack_reader responds with 504 on a network error', (done) => {
	mock_https_get_error();
	let reader = new readers.stack_reader();
	let res = fake_res();
	res.status = (code) => {
		expect(code).toBe(504);
		return { send: (body) => {
			expect(body).toContain("Sorry");
			done();
		} };
	};
	reader.read_url("https://stackoverflow.com/questions/1/test", res, {});
});
