import { FileText } from 'lucide-react';
export function attachmentUrl(value) {
  if (typeof value !== 'string' || /[\u0000-\u0020\u007f\\]/.test(value)) return null;
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password && !url.port && ['cdn.discordapp.com', 'media.discordapp.net'].includes(url.hostname) ? url.href : null; } catch { return null; }
}
export default function MessageAttachments({ attachments = [] }) {
  return <div className="ticket-attachments">{attachments.flatMap((file, index) => {
    const url = attachmentUrl(file.url);
    if (!url) return [];
    const image = /^image\/(png|jpeg|gif|webp|avif)$/.test(file.contentType || '') && /\.(png|jpe?g|gif|webp|avif)$/i.test(file.name || '');
    return [<a key={index} href={url} target="_blank" rel="noopener noreferrer" className="ticket-attachment">
      {image ? <img src={url} alt={file.name || 'Imagem anexada'} loading="lazy" referrerPolicy="no-referrer" /> : <FileText size={20} aria-hidden="true" />}
      <span>{file.name || 'Arquivo'}<small>{Number(file.size) > 0 ? `${(file.size / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} KB · ` : ''}Abrir anexo ↗</small></span>
    </a>];
  })}</div>;
}
