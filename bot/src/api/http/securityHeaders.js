const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};
function setSecurityHeaders(response, { hsts = false } = {}) {
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) response.setHeader(name, value);
  if (hsts) response.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
}
module.exports = { setSecurityHeaders, SECURITY_HEADERS };
