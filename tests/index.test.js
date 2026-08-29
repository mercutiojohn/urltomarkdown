const request = require('supertest');
const app = require('../index.js');

describe('GET /', () => {
	test('rejects requests with no url parameter', async () => {
		const res = await request(app).get('/');
		expect(res.status).toBe(400);
		expect(res.text).toContain('valid url');
	});

	test('rejects requests with a malformed url parameter that cannot be fetched', async () => {
		// note: @7c/validurl passes 'not-a-url' as valid, so this exercises the
		// downstream https.get failure path (synchronous invalid-URL throw
		// inside the fetch promise) rather than the initial validation check.
		const res = await request(app).get('/').query({ url: 'not-a-url' });
		expect(res.status).toBe(504);
	});
});

describe('POST /', () => {
	test('rejects requests with no html body', async () => {
		const res = await request(app).post('/').send({});
		expect(res.status).toBe(400);
		expect(res.text).toContain('POST parameter called html');
	});

	test('converts posted html to markdown', async () => {
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
	});

	test('honours the title and links query options on posted html', async () => {
		const res = await request(app)
			.post('/')
			.query({ title: 'true', links: 'false' })
			.type('form')
			.send({
				url: 'https://example.com',
				html: '<html><head><title>My Title</title></head><body><p><a href="https://example.com/x">link</a></p></body></html>'
			});

		expect(res.status).toBe(200);
		expect(res.text.startsWith('# My Title')).toBe(true);
		expect(res.text).not.toContain('](https://example.com/x)');
	});
});
