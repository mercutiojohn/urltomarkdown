jest.mock('../conversion_runner.js');
const run_conversion = require('../conversion_runner.js');
const request = require('supertest');
const app = require('../index.js');

beforeEach(() => {
	jest.clearAllMocks();
});

describe('GET /', () => {
	test('rejects requests with no url parameter', async () => {
		const res = await request(app).get('/');
		expect(res.status).toBe(400);
		expect(res.text).toContain('valid url');
		expect(run_conversion).not.toHaveBeenCalled();
	});

	test('dispatches a url conversion job and returns the worker result', async () => {
		run_conversion.mockResolvedValue({ status: 200, headers: { 'X-Title': 'hi' }, body: 'converted markdown' });

		const res = await request(app).get('/').query({ url: 'https://example.com' });

		expect(res.status).toBe(200);
		expect(res.text).toBe('converted markdown');
		expect(res.headers['x-title']).toBe('hi');
		expect(res.headers['content-type']).toContain('text/markdown');
		expect(res.headers['access-control-allow-origin']).toBe('*');
		expect(run_conversion).toHaveBeenCalledWith(
			expect.objectContaining({ mode: 'url', url: 'https://example.com' })
		);
	});
});

describe('POST /', () => {
	test('rejects requests with no html body', async () => {
		const res = await request(app).post('/').send({});
		expect(res.status).toBe(400);
		expect(res.text).toContain('POST parameter called html');
		expect(run_conversion).not.toHaveBeenCalled();
	});

	test('converts posted html to markdown', async () => {
		run_conversion.mockResolvedValue({ status: 200, headers: {}, body: 'hello world' });

		const res = await request(app)
			.post('/')
			.type('form')
			.send({
				url: 'https://example.com',
				html: '<html><head><title>t</title></head><body><p>hello world</p></body></html>'
			});

		expect(res.status).toBe(200);
		expect(res.text).toContain('hello world');
		expect(res.headers['content-type']).toContain('text/markdown');
		expect(res.headers['access-control-allow-origin']).toBe('*');
		expect(run_conversion).toHaveBeenCalledWith(
			expect.objectContaining({ mode: 'html', url: 'https://example.com' })
		);
	});

	test('honours the title and links query options on posted html', async () => {
		run_conversion.mockResolvedValue({ status: 200, headers: {}, body: '# My Title\nlink' });

		const res = await request(app)
			.post('/')
			.query({ title: 'true', links: 'false' })
			.type('form')
			.send({
				url: 'https://example.com',
				html: '<html><head><title>My Title</title></head><body><p><a href="https://example.com/x">link</a></p></body></html>'
			});

		expect(res.status).toBe(200);
		expect(run_conversion).toHaveBeenCalledWith(
			expect.objectContaining({
				options: expect.objectContaining({ inline_title: true, ignore_links: true })
			})
		);
	});
});
