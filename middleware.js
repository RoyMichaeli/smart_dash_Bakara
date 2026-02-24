// Vercel Edge Middleware — runs BEFORE static files and serverless functions.
// Enforces authentication on all routes except login, healthz, and API callbacks.

const AUTH_SECRET = process.env.AUTH_SECRET || 'qasmart-secret-key-2024';

// Paths that do NOT require authentication
const PUBLIC_PATHS = ['/login.html', '/api/login', '/healthz', '/api/callback/', '/api/qa-result'];

function isPublicPath(pathname) {
  return PUBLIC_PATHS.some(p => pathname === p || pathname.startsWith(p));
}

// Compute the same HMAC-SHA256 token that server.js produces
async function computeAuthToken(secret) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode('qasmart-auth'));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function getCookie(req, name) {
  const header = req.headers.get('cookie') || '';
  const match = header.split(';').map(c => c.trim()).find(c => c.startsWith(name + '='));
  return match ? match.split('=')[1] : null;
}

export default async function middleware(request) {
  const { pathname } = new URL(request.url);

  // Allow public paths through
  if (isPublicPath(pathname)) {
    return;  // undefined = pass through, no modification
  }

  // Check auth cookie
  const token = getCookie(request, 'qasmart_auth');
  const expectedToken = await computeAuthToken(AUTH_SECRET);

  if (token === expectedToken) {
    return;  // authenticated, pass through
  }

  // Not authenticated — redirect to login for page requests, 401 for API
  if (pathname.startsWith('/api/')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Redirect to login page
  return new Response(null, {
    status: 302,
    headers: { Location: '/login.html' }
  });
}

export const config = {
  matcher: [
    // Match all paths EXCEPT static assets like _next, favicon, etc.
    '/((?!_next/static|_next/image|favicon.ico).*)'
  ]
};
