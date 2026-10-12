// Minimal Redis client (RESP2) for the few commands the relay needs. Dependency-free, like the relay.
// One short-lived connection per command: the relay talks to Redis a handful of times a day.
//
//   const r = redis('redis://:password@host:6379/2');  await r.set('k', 'v');  await r.get('k');
import net from 'node:net';

function encode(args) {
  return `*${args.length}\r\n` + args.map((a) => { const s = String(a); return `$${Buffer.byteLength(s)}\r\n${s}\r\n`; }).join('');
}

/** Parses one RESP reply starting at `i`. Returns [value, nextIndex] or null if the buffer is incomplete. */
export function parseReply(buf, i = 0) {
  const eol = buf.indexOf('\r\n', i);
  if (eol < 0) return null;
  const type = String.fromCharCode(buf[i]), line = buf.toString('utf8', i + 1, eol);
  if (type === '+') return [line, eol + 2];
  if (type === '-') return [new Error(line), eol + 2];
  if (type === ':') return [Number(line), eol + 2];
  if (type === '$') {
    const n = Number(line);
    if (n < 0) return [null, eol + 2];
    if (buf.length < eol + 2 + n + 2) return null;
    return [buf.toString('utf8', eol + 2, eol + 2 + n), eol + 2 + n + 2];
  }
  if (type === '*') {
    const n = Number(line);
    if (n < 0) return [null, eol + 2];
    const out = []; let j = eol + 2;
    for (let k = 0; k < n; k++) { const r = parseReply(buf, j); if (!r) return null; out.push(r[0]); j = r[1]; }
    return [out, j];
  }
  throw new Error(`RESP: unexpected type ${type}`);
}

export function redis(url, { timeout = 5000 } = {}) {
  const u = new URL(url);
  const pre = [];
  if (u.password) pre.push(u.username && u.username !== 'default' ? ['AUTH', decodeURIComponent(u.username), decodeURIComponent(u.password)] : ['AUTH', decodeURIComponent(u.password)]);
  const db = parseInt(u.pathname.slice(1), 10);
  if (db > 0) pre.push(['SELECT', db]);

  function command(...args) {
    const cmds = [...pre, args];
    return new Promise((resolve, reject) => {
      const sock = net.connect(+(u.port || 6379), u.hostname);
      let buf = Buffer.alloc(0); const replies = [];
      const fail = (e) => { sock.destroy(); reject(e); };
      sock.setTimeout(timeout, () => fail(new Error('redis timeout')));
      sock.on('error', fail);
      sock.on('connect', () => sock.write(cmds.map(encode).join('')));
      sock.on('data', (chunk) => {
        buf = Buffer.concat([buf, chunk]);
        let r;
        while (replies.length < cmds.length && (r = parseReply(buf))) { replies.push(r[0]); buf = buf.subarray(r[1]); }
        if (replies.length < cmds.length) return;
        sock.end();
        const err = replies.find((x) => x instanceof Error);
        err ? reject(err) : resolve(replies[replies.length - 1]);
      });
    });
  }
  return { command, get: (k) => command('GET', k), set: (k, v) => command('SET', k, v) };
}
