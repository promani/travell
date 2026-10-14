// Sonidos del mate, a la Tapper: sintetizados con Web Audio (ondas cuadradas y ruido, como el arcade), sin
// archivos. El chorro mientras se ceba, el mate que se desliza, el cliente que lo agarra y el que sale por
// la puerta, el vacío que vuelve y se atrapa, el vidrio que se rompe, la propina, la vida extra, la risa y la
// fanfarria del villano y, al vaciar
// la barra, la primera frase de "Oh! Susanna" (Stephen Foster, 1848, dominio público), que suena en Tapper.
// El silencio se recuerda en localStorage. createSound() devuelve funciones que nunca fallan: sin Web Audio
// (o antes del primer toque) no suenan y listo.

const MUTED_KEY = 'travell-mate-muted'
const VOLUME = 0.16

function readMuted() { try { return localStorage.getItem(MUTED_KEY) === '1' } catch { return false } }
function writeMuted(v) { try { localStorage.setItem(MUTED_KEY, v ? '1' : '0') } catch { /* sin storage: dura lo que la página */ } }

// notas en Hz
const N = { C4: 262, D4: 294, E4: 330, F4: 349, G4: 392, A4: 440, B4: 494, C5: 523, D5: 587, E5: 659, G5: 784, C6: 1047, E6: 1319, G6: 1568, C7: 2093 }

export function createSound() {
  let ac = null, master = null, pour = null, noiseBuf = null
  let muted = readMuted()

  // el AudioContext se crea con el primer gesto del usuario (el ▶ o un botón), como piden los navegadores
  function audio() {
    if (!ac) {
      const AC = window.AudioContext || window.webkitAudioContext
      if (!AC) return null
      ac = new AC()
      master = ac.createGain()
      master.gain.value = muted ? 0 : VOLUME
      master.connect(ac.destination)
    }
    return ac
  }
  const ready = () => ac && ac.state === 'running' && !muted

  function tone(freq, at, dur, { type = 'square', vol = 1, to = null } = {}) {
    if (!ready()) return
    const t = ac.currentTime + at
    const o = ac.createOscillator(), env = ac.createGain()
    o.type = type
    o.frequency.setValueAtTime(freq, t)
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur)
    env.gain.setValueAtTime(vol, t)
    env.gain.exponentialRampToValueAtTime(0.001, t + dur)
    o.connect(env).connect(master)
    o.start(t)
    o.stop(t + dur + 0.02)
  }

  function noise(at, dur, { vol = 1, freq = 2000, to = null, q = 1, filter = 'bandpass' } = {}) {
    if (!ready()) return
    if (!noiseBuf) {
      noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate)
      const d = noiseBuf.getChannelData(0)
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
    }
    const t = ac.currentTime + at
    const src = ac.createBufferSource(), f = ac.createBiquadFilter(), env = ac.createGain()
    src.buffer = noiseBuf
    f.type = filter
    f.Q.value = q
    f.frequency.setValueAtTime(freq, t)
    if (to) f.frequency.exponentialRampToValueAtTime(to, t + dur)
    env.gain.setValueAtTime(vol, t)
    env.gain.exponentialRampToValueAtTime(0.001, t + dur)
    src.connect(f).connect(env).connect(master)
    src.start(t)
    src.stop(t + dur + 0.02)
  }

  // melodía: [nota, corcheas]; una corchea = beat segundos
  function tune(notes, beat, { type = 'square', vol = 0.7 } = {}) {
    let at = 0
    for (const [n, len] of notes) {
      if (n) tone(N[n], at, len * beat * 0.9, { type, vol })
      at += len * beat
    }
  }

  return {
    // con el clic del ▶: crea o despierta el audio
    unlock() { const a = audio(); if (a && a.state === 'suspended') a.resume() },
    // pausa, pestaña oculta o salir: se corta todo lo que esté sonando
    suspend() { this.pourStop(); if (ac && ac.state === 'running') ac.suspend() },
    resume() { if (ac && ac.state === 'suspended') ac.resume() },
    get muted() { return muted },
    toggleMute() {
      muted = !muted
      writeMuted(muted)
      if (master) master.gain.value = muted ? 0 : VOLUME
      if (muted) this.pourStop()
      return muted
    },

    // el chorro mientras se llena el mate: sube de tono y se corta al llenarse (o al soltar o cancelar)
    pourStart(fillSecs) {
      if (!ready() || pour) return
      const t = ac.currentTime
      const o = ac.createOscillator(), lfo = ac.createOscillator(), depth = ac.createGain(), env = ac.createGain()
      o.type = 'triangle'
      o.frequency.setValueAtTime(220, t)
      o.frequency.linearRampToValueAtTime(520, t + fillSecs)
      // burbujeo: el tono tiembla rápido
      lfo.frequency.value = 18
      depth.gain.value = 40
      lfo.connect(depth).connect(o.frequency)
      env.gain.setValueAtTime(0.0001, t)
      env.gain.exponentialRampToValueAtTime(0.35, t + 0.03)
      o.connect(env).connect(master)
      o.start(t)
      lfo.start(t)
      pour = { o, lfo, env }
    },
    pourStop() {
      if (!pour) return
      const { o, lfo, env } = pour
      pour = null
      if (!ac) return
      const t = ac.currentTime
      env.gain.cancelScheduledValues(t)
      env.gain.setValueAtTime(Math.max(env.gain.value, 0.0001), t)
      env.gain.exponentialRampToValueAtTime(0.0001, t + 0.05)
      o.stop(t + 0.06)
      lfo.stop(t + 0.06)
    },
    // el mate sale deslizándose por la barra
    slide() { noise(0, 0.35, { vol: 0.6, freq: 2400, to: 500, q: 2 }) },
    // un cliente lo agarra
    grab() { tone(N.C5, 0, 0.06, { vol: 0.6 }); tone(N.G5, 0.06, 0.08, { vol: 0.6 }) },
    // sale despedido por la puerta
    out() { tone(700, 0, 0.28, { vol: 0.5, to: 140 }) },
    // devuelve el vacío, que vuelve deslizándose
    emptyBack() { noise(0, 0.2, { vol: 0.25, freq: 600, to: 1400, q: 3 }) },
    // el cebador atrapa el vacío: tintineo de vidrio
    clink() { tone(N.C7, 0, 0.09, { type: 'triangle', vol: 0.7 }); tone(N.E6 * 2, 0.04, 0.12, { type: 'triangle', vol: 0.5 }) },
    // la puerta se abre: entra alguien
    door() { tone(170, 0, 0.18, { type: 'sawtooth', vol: 0.12, to: 260 }) },
    // propina: caja registradora y el arranque del show
    tip() {
      tone(N.G6, 0, 0.06, { vol: 0.5 })
      tone(N.C7, 0.07, 0.3, { vol: 0.5 })
      tune([['C5', 1], ['E5', 1], ['G5', 1], ['C6', 1], ['G5', 1], ['C6', 2]], 0.09, { vol: 0.35 })
    },
    // entra el villano: una risa grave, "ja ja ja" bajando
    villainLaugh() {
      for (let i = 0; i < 4; i++) {
        tone(150 - i * 14, i * 0.17, 0.13, { type: 'sawtooth', vol: 0.5, to: 105 - i * 10 })
        tone(75 - i * 7, i * 0.17, 0.13, { type: 'square', vol: 0.25 })
      }
    },
    // sacaron al villano por la puerta: fanfarria
    villainOut() {
      tone(700, 0, 0.22, { vol: 0.4, to: 140 })
      tune([[null, 2], ['G4', 1], ['C5', 1], ['E5', 1], ['G5', 3], ['E5', 1], ['G5', 5]], 0.08, { vol: 0.5 })
    },
    // vida extra
    extraLife() { tune([['C5', 1], ['E5', 1], ['G5', 1], ['C6', 3]], 0.07) },
    // vidrio roto: el mate llegó a la puerta o se cayó el vacío
    crash() {
      noise(0, 0.5, { vol: 0.9, freq: 3500, filter: 'highpass' })
      for (let i = 0; i < 5; i++) tone(2600 + Math.random() * 2400, 0.03 + i * 0.05, 0.08, { type: 'triangle', vol: 0.35 })
    },
    // un cliente llegó al termo: se enoja y te empuja
    angry() { tone(220, 0, 0.45, { vol: 0.6, to: 90 }); tone(233, 0, 0.45, { vol: 0.4, to: 95 }) },
    // se perdió una vida (después del choque)
    lose() { tune([[null, 3], ['C5', 2], ['A4', 2], ['F4', 2], ['C4', 4]], 0.09, { vol: 0.5 }) },
    gameOver() {
      tune([[null, 3], ['G4', 3], ['F4', 3], ['E4', 3], ['D4', 3], ['C4', 8]], 0.12, { vol: 0.5 })
      tone(65, 1.9, 0.9, { type: 'sawtooth', vol: 0.3, to: 45 })
    },
    // barra vacía: "I come from Alabama with my banjo on my knee"
    levelUp() {
      tune([
        ['C4', 1], ['D4', 1], ['E4', 2], ['G4', 2], ['G4', 3], ['A4', 1], ['G4', 2], ['E4', 2], ['C4', 3],
        ['D4', 1], ['E4', 2], ['E4', 2], ['D4', 2], ['C4', 2], ['D4', 6],
      ], 0.12, { vol: 0.55 })
    },
  }
}
