// QR codes: read them with the phone's camera (or from a screenshot) and draw them again, big, to show at a gate.
// Reading uses the browser's BarcodeDetector when there is one (Android Chrome) and jsQR otherwise (iPhone).
// Both libraries are vendored and loaded only when needed, so they work offline once the service worker cached them.
import { esc, ic, openModal } from './util.js';

const scripts = {};
const load = (src, global) => (scripts[src] ||= new Promise((resolve, reject) => {
  if (window[global]) return resolve(window[global]);
  const s = document.createElement('script');
  s.src = src; s.onload = () => resolve(window[global]); s.onerror = () => { delete scripts[src]; reject(new Error('No se pudo cargar ' + src)); };
  document.head.appendChild(s);
}));

let detector;
async function decoder() {
  if ('BarcodeDetector' in window) {
    try {
      const formats = await BarcodeDetector.getSupportedFormats();
      if (formats.includes('qr_code')) {
        detector ||= new BarcodeDetector({ formats: formats.filter((f) => ['qr_code', 'aztec', 'pdf417', 'data_matrix'].includes(f)) });
        return async (src) => { const [b] = await detector.detect(src); return b ? { text: b.rawValue, format: b.format } : null; };
      }
    } catch { /* fall back to jsQR */ }
  }
  const jsQR = await load('vendor/jsqr/jsQR.min.js', 'jsQR');
  const canvas = document.createElement('canvas'), g = canvas.getContext('2d', { willReadFrequently: true });
  return async (src) => {
    const w = src.videoWidth || src.width, h = src.videoHeight || src.height;
    if (!w || !h) return null;
    const scale = Math.min(1, 1000 / Math.max(w, h));       // big photos: smaller is faster and still readable
    canvas.width = Math.round(w * scale); canvas.height = Math.round(h * scale);
    g.drawImage(src, 0, 0, canvas.width, canvas.height);
    const r = jsQR(g.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height);
    return r ? { text: r.data, format: 'qr_code' } : null;
  };
}

const snapshot = (video) => new Promise((res) => {
  const c = document.createElement('canvas'); c.width = video.videoWidth; c.height = video.videoHeight;
  c.getContext('2d').drawImage(video, 0, 0); c.toBlob(res, 'image/jpeg', 0.9);
});

/** Reads a code from an image file (screenshot, photo of a printout). */
export async function decodeImage(file) {
  const bmp = await createImageBitmap(file);
  try { return await (await decoder())(bmp); } finally { bmp.close?.(); }
}

/** Opens the camera and resolves with { text, format, image? } when it sees a code, or null if the user closes it. */
export function scanCode({ title = 'Escanear QR' } = {}) {
  return new Promise((resolve) => {
    let stream = null, stopped = false, result = null;
    const dlg = openModal(`<h3>${ic('qrcode')} ${esc(title)}</h3>
      <div class="scanner"><video playsinline muted></video><div class="scan-frame"></div></div>
      <p class="hint scan-msg">Apuntá la cámara al código.</p>
      <div class="row-actions"><label class="btn">${ic('image')} Desde una imagen<input type="file" accept="image/*" hidden class="scan-file"></label>
        <button class="btn" data-act="close-modal">Cancelar</button></div>`, { cls: 'wide', onClose: () => { stop(); resolve(result); } });
    const video = dlg.querySelector('video'), msg = dlg.querySelector('.scan-msg');
    const stop = () => { stopped = true; stream?.getTracks().forEach((t) => t.stop()); };
    const done = (r) => { result = r; stop(); dlg.close(); };

    dlg.querySelector('.scan-file').onchange = async (e) => {
      const f = e.target.files[0]; if (!f) return;
      msg.textContent = 'Leyendo la imagen…';
      try { const r = await decodeImage(f); if (r) done(r.format === 'qr_code' ? r : { ...r, image: f }); else msg.textContent = 'No se encontró un código en esa imagen. Probá con una captura más nítida.'; }
      catch { msg.textContent = 'No se pudo leer la imagen.'; }
    };

    (async () => {
      let detect;
      try { detect = await decoder(); } catch (e) { msg.textContent = e.message; return; }
      if (!navigator.mediaDevices?.getUserMedia) { msg.textContent = 'Este navegador no permite usar la cámara: elegí una imagen.'; return; }
      try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false }); }
      catch { msg.textContent = 'Sin permiso para la cámara: habilitalo o elegí una imagen.'; return; }
      if (stopped) return stop();
      video.srcObject = stream; await video.play().catch(() => null);
      const tick = async () => {
        if (stopped) return;
        try {
          const r = video.readyState >= 2 ? await detect(video) : null;
          // only QR codes can be drawn again; for other formats (Aztec / PDF417 boarding passes) keep a picture of it
          if (r?.text) return done(r.format === 'qr_code' ? r : { ...r, image: await snapshot(video) });
        } catch { /* keep trying */ }
        setTimeout(tick, 200);
      };
      tick();
    })();
  });
}

/** SVG of a QR code for `text` (UTF-8), black on white with a quiet zone. */
export async function qrSvg(text) {
  const qrcode = await load('vendor/qrcode/qrcode.js', 'qrcode');
  qrcode.stringToBytes = qrcode.stringToBytesFuncs['UTF-8'];
  const q = qrcode(0, 'M');
  q.addData(text, 'Byte'); q.make();
  return q.createSvgTag({ cellSize: 8, margin: 4, scalable: true });
}
