function safeAttachmentUrl(value) {
  if (typeof value !== 'string' || value.length > 2048 || /[\u0000-\u0020\u007f\\]/.test(value)) return null;
  try {
    const url = new URL(value);
    if (url.protocol === 'https:' && !url.username && !url.password && !url.port
      && ['cdn.discordapp.com', 'media.discordapp.net'].includes(url.hostname)) return url.href;
  } catch {}
  return null;
}
function safeAttachments(items) {
  if (!Array.isArray(items)) return [];
  return items.slice(0, 10).flatMap(item => {
    const url = safeAttachmentUrl(item?.url);
    if (!url) return [];
    return [{ url, name: String(item.name || 'Arquivo').replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 255),
      size: Number.isSafeInteger(item.size) && item.size >= 0 ? item.size : 0,
      contentType: typeof item.contentType === 'string' ? item.contentType.slice(0, 100) : null }];
  });
}
module.exports = { safeAttachmentUrl, safeAttachments };
