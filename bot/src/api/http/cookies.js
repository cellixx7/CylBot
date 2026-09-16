function readCookie(request, name) {
  const values = (request.headers?.cookie || '').split(';').map(part => part.trim())
    .filter(part => part.startsWith(`${name}=`));
  if (values.length !== 1) return undefined;
  const value = values[0].slice(name.length + 1);
  return /^[A-Za-z0-9_-]{43}$/.test(value) ? value : undefined;
}

function cookie(name, value, maxAge, secure) {
  return `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;
}

module.exports = { cookie, readCookie };
