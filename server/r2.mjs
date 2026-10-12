// Minimal client for Cloudflare R2 (S3 API, AWS Signature V4) for the three calls the relay needs.
// Dependency-free, like the relay. Credentials only live on the server: the browser never sees them.
//
//   const b = r2({ endpoint: 'https://<account>.r2.cloudflarestorage.com', key, secret, bucket });
//   await b.put('trip/photos/x.jpg', buffer, 'image/jpeg');  const res = await b.get('trip/photos/x.jpg');  await b.del(...)
import crypto from 'node:crypto';

const sha256 = (data) => crypto.createHash('sha256').update(data).digest('hex');
const hmac = (key, data) => crypto.createHmac('sha256', key).update(data).digest();
// S3 path encoding: every byte except unreserved characters and the "/" separators
const encodeKey = (k) => k.split('/').map((s) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase())).join('/');

export function r2({ endpoint, key, secret, bucket, region = 'auto' }) {
  const base = new URL(endpoint);

  async function call(method, objectKey, { body, contentType } = {}) {
    const pathname = `/${bucket}/${encodeKey(objectKey)}`;
    const now = new Date();
    const amzDate = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');   // 20261012T180000Z
    const day = amzDate.slice(0, 8);
    const payloadHash = sha256(body || '');
    const headers = { host: base.host, 'x-amz-content-sha256': payloadHash, 'x-amz-date': amzDate };
    if (contentType) headers['content-type'] = contentType;
    const names = Object.keys(headers).sort();
    const canonical = [method, pathname, '', ...names.map((n) => `${n}:${headers[n]}`), '', names.join(';'), payloadHash].join('\n');
    const scope = `${day}/${region}/s3/aws4_request`;
    const toSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256(canonical)].join('\n');
    const signingKey = ['s3', 'aws4_request'].reduce(hmac, hmac(hmac('AWS4' + secret, day), region));
    const signature = crypto.createHmac('sha256', signingKey).update(toSign).digest('hex');
    const { host, ...sent } = headers;
    sent.authorization = `AWS4-HMAC-SHA256 Credential=${key}/${scope}, SignedHeaders=${names.join(';')}, Signature=${signature}`;
    return fetch(new URL(pathname, base), { method, headers: sent, body });
  }
  const ok = async (res, what) => {
    if (res.ok || (what === 'delete' && res.status === 404)) return res;
    throw new Error(`r2 ${what} ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`);
  };

  return {
    put: async (k, body, contentType) => { await ok(await call('PUT', k, { body, contentType }), 'put'); },
    /** The raw fetch Response (404 included), so the caller can stream it. */
    get: (k) => call('GET', k),
    del: async (k) => { await ok(await call('DELETE', k), 'delete'); },
  };
}

/** R2 from the environment, or null when it is not configured. */
export function r2FromEnv(env = process.env) {
  const { R2_ENDPOINT: endpoint, R2_KEY: key, R2_SECRET: secret, R2_BUCKET: bucket } = env;
  return endpoint && key && secret && bucket ? r2({ endpoint, key, secret, bucket }) : null;
}
