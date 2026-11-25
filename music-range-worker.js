/* Only the active page owns Firebase access. This worker translates the media
 * decoder's byte requests into reads of that page's verified immutable parts. */
'use strict';
const prefix = new URL('music/.play/', self.registration.scope).href;
self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || !event.request.url.startsWith(prefix) || !event.clientId) return;
  event.respondWith(serve(event));
});

function readPart(client, token, part) {
  return new Promise((resolve, reject) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => { channel.port1.close(); reject(new Error('Audio page unavailable.')); }, 20000);
    channel.port1.onmessage = ({ data }) => {
      clearTimeout(timer); channel.port1.close();
      if (data instanceof ArrayBuffer) resolve(new Uint8Array(data));
      else reject(new Error('Audio part unavailable.'));
    };
    client.postMessage({ type: 'music-part-v1', token, part }, [channel.port2]);
  });
}
async function serve(event) {
  const url = new URL(event.request.url), size = Number(url.searchParams.get('size'));
  const token = url.pathname.split('/').pop(), mime = url.searchParams.get('mime') || '';
  const chunk = 192 * 1024;
  if (!/^[a-f0-9-]{36}$/.test(token) || !/^audio\/[a-z0-9.+-]+$/i.test(mime) ||
      !Number.isSafeInteger(size) || size <= 0 || size > 100 * 1024 * 1024) return new Response(null, { status: 400 });
  const range = event.request.headers.get('Range'), match = range && /^bytes=(\d*)-(\d*)$/i.exec(range);
  let start = 0, end = size - 1;
  if (range) {
    if (!match || (!match[1] && !match[2])) start = size;
    else if (!match[1]) start = Math.max(0, size - Number(match[2]));
    else { start = Number(match[1]); if (match[2]) end = Math.min(end, Number(match[2])); }
    if (start > end || start >= size) return new Response(null, { status: 416, headers: { 'Content-Range': 'bytes */' + size } });
  }
  const client = await self.clients.get(event.clientId);
  if (!client) return new Response(null, { status: 410 });
  const headers = { 'Content-Type': mime, 'Content-Length': String(end - start + 1), 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store' };
  if (range) headers['Content-Range'] = 'bytes ' + start + '-' + end + '/' + size;
  let offset = start, canceled = false;
  const body = new ReadableStream({
    async pull(controller) {
      const index = Math.floor(offset / chunk), bytes = await readPart(client, token, index);
      if (canceled) return;
      const from = offset % chunk, length = Math.min(bytes.length - from, end - offset + 1);
      if (length <= 0) throw new Error('Invalid audio part.');
      controller.enqueue(bytes.subarray(from, from + length));
      offset += length;
      if (offset > end) controller.close();
    },
    cancel() { canceled = true; }
  });
  return new Response(body, { status: range ? 206 : 200, headers });
}
