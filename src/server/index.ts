import { Hono } from 'hono';
const app = new Hono<{ Bindings: { APP_ENV: string; DB: D1Database; ASSETS: Fetcher } }>();
app.use('/api/*', async (c, next) => { c.header('Cache-Control', 'no-store'); await next(); });
app.get('/api/health', c => c.json({ status: 'ok', milestone: 1, mode: 'demo', persistence: 'browser-local', outboundMessaging: false }));
// Fail closed until Access identity and repository-backed routes are implemented.
app.all('/api/*', c => c.json({ code: 'NOT_CONFIGURED', message: 'Staff API is not enabled at the interface checkpoint.' }, 503));
export default app;
