// Mate: mini juego para las esperas largas del viaje (vuelos, trenes, aeropuertos), con las reglas de Tapper
// (Bally Midway, 1983) y ambientación propia (mate o cerveza, a elección). Viene de otro proyecto; acá se
// juega sobre todo con el celular. Reglas tomadas de la ficha del juego y del manual:
//   - Cuatro barras; los clientes entran por la puerta (izquierda) y avanzan a los tirones hacia el cebador.
//   - Mantener Cebar (o Espacio) llena el mate en el termo y soltarlo lo desliza por la barra; si no se llenó,
//     no sale (ése es el tiempo mínimo entre mates). Apretar una flecha mientras llena cancela ese mate.
//   - El cliente que agarra el mate retrocede: si estaba en el primer tercio de la barra sale por la puerta;
//     si no, se queda, toma y devuelve el vacío. Un cliente que está tomando no agarra otro mate.
//   - ↑ ↓ cambian de barra (dan la vuelta); ← → caminan por la barra para agarrar vacíos antes y propinas.
//   - Se pierde una vida si un cliente llega al termo, si un mate llega a la puerta sin nadie que lo agarre o
//     si un vacío se cae al final de la barra. Al perderla se reinicia la pantalla y se conserva el puntaje.
//   - La pantalla termina cuando no queda ningún cliente. Puntos: 50 por cliente que sale por la puerta,
//     100 por vacío atrapado, 1.000 por la primera pantalla y 500 más por cada nivel, y las propinas. Vida extra a los 20.000 y cada 50.000.
//   - Juntar una propina arranca el show (las bailarinas del original): todos dejan de avanzar unos segundos,
//     aunque siguen agarrando mates. Queda afuera la ronda bonus de las latas.
//   - El villano 👺 (propio, no está en Tapper): cada cliente que entra tiene un 5% de chance de serlo, como mucho
//     uno por nivel (si se pierde una vida, no vuelve en ese nivel). Avanza 1,6 veces más rápido y no se frena con
//     el show; con el mate retrocede la mitad y sólo sale si lo agarra en el primer sexto de la barra. Sacarlo da
//     1.000 puntos y siempre deja una propina grande 💰 de 2.000, que también arranca el show. Valores en VILLAIN_*.
// Controles en pantalla: la cruz (↑ ↓ barra, ← → caminar) y el botón Cebar (mantener y soltar). Con teclado:
// ↑ ↓ (W S), ← → (A D), Espacio cebar, P o Esc pausa, M sonido, Enter jugar de nuevo.
// Se juega en vertical (la barra arriba, los controles abajo) y en horizontal (la cruz a la izquierda y Cebar a
// la derecha, como un joystick). Sonidos a la Tapper en mate-sound.js.
// mountMate(host, { onExit }) devuelve { setStatus, destroy }: destroy corta el juego y suelta los eventos.

import { createSound } from './mate-sound.js'

const W = 960, H = 400
const ROWS = 4
const X0 = 70, X1 = W - 130 // puerta y fin de cada barra
const KEG = X1 + 40 // donde está el cebador cuando ceba (junto al termo)
const FILL = 0.18 // segundos de Cebar apretado para llenar un mate
const TIP_POINTS = 500
const SCREEN_POINTS = 1000, SCREEN_STEP = 500 // bonus por vaciar la barra: 1.000 en el nivel 1, 1.500 en el 2…
const TIP_CHANCE = 0.12 // probabilidad de que un cliente deje propina al agarrar el mate
const SHOW_TIME = 3 // segundos que los clientes se frenan después de juntar una propina: una bailarina por segundo
const OUT_POINTS = 50 // por cliente que sale por la puerta
// el villano
const VILLAIN_FACE = '👺'
const VILLAIN_CHANCE = 0.05 // probabilidad de que el que entra sea el villano (como mucho uno por nivel)
const VILLAIN_SPEED = 1.6 // veces la velocidad de los clientes del nivel; no se frena con el show
const VILLAIN_PUSH = 0.5 // retrocede esta parte de lo que retrocede un cliente al agarrar el mate
const VILLAIN_OUT = 1 / 6 // sale por la puerta sólo si agarra el mate en este primer tramo de la barra
const VILLAIN_POINTS = 1000 // al salir por la puerta
const VILLAIN_TIP = 2000 // la propina grande 💰 que deja siempre al salir
// emojis de busto (se les ven los hombros), no sólo la cara
const CLIENTS = ['🧑‍💼', '👩‍💼', '👨‍🔧', '👩‍🔬', '👨‍🏫', '👩‍💻', '🧑‍🎤', '👷', '🧑‍🚀', '👩‍🌾']
const BARTENDER = '🧙‍♂️'
// qué se sirve: siempre arranca en mate; el botón lo alterna mientras dure la página
const DRINKS = {
  mate: { icon: '🧉', title: 'Cebá unos mates mientras esperás', verb: 'cebar', label: 'Cebar', other: 'cerveza', jug: '#4a86d0' },
  cerveza: { icon: '🍺', title: 'Serví unas cervezas mientras esperás', verb: 'servir', label: 'Servir', other: 'mate', jug: '#adb5bd' },
}
const RECORD_KEY = 'travell-mate-record'
// celular o tablet: los textos hablan de los botones en vez de las teclas
const TOUCH = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches

function readRecord() { try { return Number(localStorage.getItem(RECORD_KEY)) || 0 } catch { return 0 } }
function writeRecord(n) { try { localStorage.setItem(RECORD_KEY, String(n)) } catch { /* sin storage: el récord vive sólo en memoria */ } }
// Perspectiva, como en el original: todos los elementos tienen el mismo tamaño en toda la pantalla y las
// filas están a la misma distancia; la profundidad la dan las barras escalonadas (la de arriba, la del
// fondo, es un poco más corta: se acorta más del lado derecho, el del termo, que del de la puerta). La lógica
// usa x lógica entre X0 y X1; sólo el dibujo proyecta cada barra.
// La pantalla dibujada se adapta a la caja: en horizontal es la de siempre (960 × 400); en vertical es más
// angosta y alta (480 de ancho y todo el alto que haya), con las filas más separadas y todo más grande. La
// lógica no cambia (x lógica entre X0 y X1, mismas velocidades): sólo el dibujo aprieta la barra a lo ancho,
// y como los clientes avanzan a los tirones, una barra más corta se sigue jugando igual.
let VW = W, VH = H, SP = 1 // ancho y alto dibujados, tamaño de los emojis
// del lado del termo: RIGHT, del final de la barra de adelante al borde; GAP, del final de la barra al cebador
let RIGHT = W - X1, GAP = KEG - X1
function layout(boxW, boxH) {
  const aspect = boxW / boxH
  if (aspect >= 1.2) { VW = Math.min(W, Math.max(480, Math.round(H * aspect))); VH = H }
  else { VW = 480; VH = Math.min(1100, Math.round(VW / aspect)) }
  SP = Math.min(1.5, Math.max(1, (VH - TOP - 14) / ROWS / 68))
  // en vertical los termos van contra el borde derecho (el de adelante a unos pocos píxeles) y lo que se gana
  // alarga la barra y separa un poco más al cebador
  if (aspect >= 1.2) { RIGHT = W - X1; GAP = KEG - X1 }
  else { GAP = 56; RIGHT = 6 + 6 * SP + 34 + GAP }
}
const TOP = 112 // debajo del marcador y de las bailarinas
const rowH = () => (VH - TOP - 14) / ROWS
const rowY = (r) => TOP + r * rowH() + rowH() / 2
const SHIFT_LEFT = 14, SHIFT_RIGHT = 34 // cuánto se acorta cada barra hacia el fondo, de cada lado
// x lógica → x en pantalla para la barra r: la barra (X0..X1) se estira o aprieta al ancho dibujado; lo que
// queda antes (la puerta) y después (el termo, el cebador) se dibuja a su tamaño
function px(r, x) {
  const back = ROWS - 1 - r // 0 adelante, 3 al fondo
  const k = VW / W // en vertical el escalonado también se achica, si no la barra del fondo queda cortita
  const a = X0 + back * SHIFT_LEFT * k, b = VW - RIGHT - back * SHIFT_RIGHT * k
  if (x > KEG) return b + GAP + (x - KEG)
  if (x > X1) return b + ((x - X1) * GAP) / (KEG - X1)
  return a + ((x - X0) * (b - a)) / (X1 - X0)
}

const fa = (name) => `<i class="fa-solid fa-${name}" aria-hidden="true"></i>`

export function mountMate(host, { onExit } = {}) {
  host.innerHTML = `<div class="mate-zone">
    <div class="mate-idle">
      <div class="mate-big" data-mate-icon aria-hidden="true"></div>
      <div class="mate-title" data-mate-title></div>
      <div class="mate-status" data-mate-status></div>
      <button type="button" class="mate-play-btn" data-mate-play aria-label="Jugar">${fa('play')}</button>
      <div class="mate-record" data-mate-record></div>
      <div class="row-actions">
        <button type="button" class="btn small" data-mate-drink></button>
        ${onExit ? `<button type="button" class="btn small" data-mate-back>${fa('arrow-left')} Volver</button>` : ''}
      </div>
      <details class="mate-help"><summary>Cómo se juega</summary><ul>
        <li>Los clientes entran por la puerta y avanzan hacia vos: mandales un mate antes de que lleguen al termo.</li>
        <li>Mantené <b>Cebar</b> hasta que se llene y soltalo: el mate sale por la barra.</li>
        <li>Con <b>↑ ↓</b> cambiás de barra; con <b>← →</b> caminás para agarrar los vacíos y las propinas (💵 frena a todos un rato).</li>
        <li>Perdés una vida si un cliente llega al termo, si un mate llega a la puerta sin nadie o si se cae un vacío.</li>
      </ul></details>
    </div>
    <div class="mate-game" hidden>
      <div class="mate-bar">
        <span class="mate-status" data-mate-status></span>
        <span class="mate-keys" data-mate-keys></span>
        <button type="button" class="icon-btn sm" data-mate-drink-icon></button>
        <button type="button" class="icon-btn sm" data-mate-sound></button>
        <button type="button" class="icon-btn sm" data-mate-pause></button>
        <button type="button" class="icon-btn sm" data-mate-restart aria-label="Reiniciar" title="Reiniciar">${fa('rotate-right')}</button>
        <button type="button" class="icon-btn sm" data-mate-exit aria-label="Salir" title="Salir">${fa('xmark')}</button>
      </div>
      <div class="mate-stage">
        <div class="mate-screen"><canvas class="mate-canvas" tabindex="0" aria-label="Juego del mate"></canvas></div>
        <div class="mate-pad" role="group" aria-label="Moverse">
          <button type="button" data-mate-key="up" aria-label="Barra de arriba">${fa('caret-up')}</button>
          <button type="button" data-mate-key="left" aria-label="Caminar a la izquierda">${fa('caret-left')}</button>
          <button type="button" data-mate-key="right" aria-label="Caminar a la derecha">${fa('caret-right')}</button>
          <button type="button" data-mate-key="down" aria-label="Barra de abajo">${fa('caret-down')}</button>
        </div>
        <button type="button" class="mate-serve" data-mate-serve><span data-mate-serve-icon></span><b data-mate-serve-label></b></button>
        <p class="mate-turn">${fa('rotate')} Girá el celular para jugar en horizontal</p>
      </div>
    </div>
  </div>`
  const $ = (s) => host.querySelector(s)
  const idle = $('.mate-idle')
  const gameEl = $('.mate-game')
  const screenEl = $('.mate-screen')
  const canvas = $('canvas')
  const ctx = canvas.getContext('2d')
  const pauseBtn = $('[data-mate-pause]')
  const soundBtn = $('[data-mate-sound]')
  const serveBtn = $('[data-mate-serve]')
  const sound = createSound()

  let g = null // estado de la partida
  let open = false
  let last = 0
  let raf = 0
  let record = readRecord()
  let drink = 'mate'
  let ink = '#212529', muted = '#6c757d', colorsAt = 0
  const D = () => DRINKS[drink]
  function paintDrink() {
    $('[data-mate-title]').textContent = D().title
    $('[data-mate-icon]').textContent = D().icon
    $('[data-mate-keys]').textContent = `↑ ↓ barra · ← → caminar · mantené Espacio para ${D().verb} · P pausa · M sonido`
    $('[data-mate-drink]').textContent = `${DRINKS[D().other].icon} Cambiar a ${D().other}`
    const di = $('[data-mate-drink-icon]')
    di.textContent = DRINKS[D().other].icon
    di.title = di.ariaLabel = `Cambiar a ${D().other}`
    $('[data-mate-serve-icon]').textContent = D().icon
    $('[data-mate-serve-label]').textContent = D().label
  }
  function paintRecord() { $('[data-mate-record]').textContent = record ? `Récord en este celular: ${record.toLocaleString('es-AR')}` : '' }
  // los colores del texto salen de la página: en modo oscuro (de noche) el marcador se ve claro
  function readColors() {
    const cs = getComputedStyle(document.body)
    ink = cs.color || ink
    muted = getComputedStyle(document.documentElement).getPropertyValue('--muted').trim() || muted
  }

  function newGame() {
    g = { state: 'playing', score: 0, lives: 3, nextLife: 20000, level: 1, row: 0, bx: KEG, fill: null, walkDir: 0, msg: '', msgT: 0, rows: [] }
    startScreen()
  }
  // una pantalla: cuántos clientes entran, cada cuánto, a qué velocidad y cuánto retroceden al recibir
  function startScreen() {
    const lv = g.level
    // la dificultad sube más despacio: velocidad con tope, hasta 4 clientes por barra recién en el nivel 6 y
    // empujones largos (la mayoría retrocede bastante al recibir)
    Object.assign(g, { toSpawn: 3 + lv * 3, spawnT: 1, spawnEvery: Math.max(1.1, 2.4 - lv * 0.15), walk: Math.min(60, 30 + lv * 4), push: Math.max(120, 200 - lv * 8), perRow: Math.min(4, 1 + Math.floor(lv / 2)), bx: KEG, fill: null, showT: 0 })
    g.rows = Array.from({ length: ROWS }, () => ({ clients: [], full: [], empty: [], tips: [], doorT: 0 }))
  }
  function addScore(n) {
    g.score += n
    if (g.score >= g.nextLife) { g.lives += 1; g.nextLife += g.nextLife === 20000 ? 30000 : 50000; sound.extraLife() }
  }
  function say(msg, then = 'playing') { g.state = 'oops'; g.msg = msg; g.msgT = 1.5; g.after = then }
  function saveRecord() { if (g && g.score > record) { record = g.score; writeRecord(record) } }

  // kind: 'angry' (un cliente llegó al termo) o 'crash' (se rompió un mate o un vacío)
  function loseLife(why, kind) {
    g.lives -= 1
    sound[kind]()
    if (g.lives <= 0) {
      sound.gameOver()
      g.state = 'over'
      saveRecord()
      return
    }
    startScreen() // se reinicia la pantalla, el puntaje queda
    sound.lose()
    say(why)
  }

  // Cebar: el cebador vuelve al termo y empieza a llenar; al soltar, si está lleno, el mate sale.
  function fillStart() {
    if (g?.state !== 'playing' || g.fill) return
    g.bx = KEG
    g.fill = { row: g.row, t: 0 }
    sound.pourStart(FILL)
  }
  function fillEnd() {
    if (!g?.fill) return
    const f = g.fill
    g.fill = null
    if (g.state === 'playing' && f.t >= FILL && f.row === g.row) { g.rows[g.row].full.push({ x: X1 - 10 }); sound.slide() }
  }

  // ---------------------------------------------------------------- controles (los mismos para la cruz y el teclado)
  function press(key) {
    if (!g || g.state !== 'playing') return
    // una flecha mientras llena cancela el mate (no sale) y el cebador se mueve
    if (g.fill) g.fill = null
    if (key === 'up') g.row = (g.row + ROWS - 1) % ROWS
    else if (key === 'down') g.row = (g.row + 1) % ROWS
    else if (key === 'left') g.walkDir = -1
    else if (key === 'right') g.walkDir = 1
  }
  function release(key) {
    if (!g) return
    if ((key === 'left' && g.walkDir < 0) || (key === 'right' && g.walkDir > 0)) g.walkDir = 0
  }
  function serveDown() {
    if (!g) return
    if (g.state === 'over') { sound.resume(); return newGame() }
    if (g.state === 'paused') return resume()
    fillStart()
  }

  function step(dt) {
    if (g.state === 'oops') {
      g.msgT -= dt
      if (g.msgT <= 0) g.state = g.after || 'playing'
      return
    }
    if (g.state !== 'playing') return
    g.showT = Math.max(0, g.showT - dt)
    if (g.fill) {
      g.fill.t += dt
      if (g.fill.t >= FILL) sound.pourStop() // lleno: el chorro se corta aunque siga apretado Cebar
    }
    else if (g.walkDir) g.bx = Math.max(X0 + 30, Math.min(KEG, g.bx + g.walkDir * 300 * dt))
    // clientes nuevos, en una barra que todavía tenga lugar
    g.spawnT -= dt
    if (g.toSpawn > 0 && g.spawnT <= 0) {
      const free = g.rows.map((row, i) => (row.clients.length < g.perRow ? i : -1)).filter((i) => i >= 0)
      if (free.length) {
        const row = g.rows[free[Math.floor(Math.random() * free.length)]]
        row.doorT = 0.7 // la puerta se abre mientras entra
        sound.door()
        const villain = g.villainLevel !== g.level && Math.random() < VILLAIN_CHANCE
        if (villain) { g.villainLevel = g.level; sound.villainLaugh() } // como mucho uno por nivel: no vuelve aunque se pierda una vida
        row.clients.push({ x: X0 - 10, face: villain ? VILLAIN_FACE : CLIENTS[Math.floor(Math.random() * CLIENTS.length)], villain, drink: 0, push: 0, out: false, t: Math.random() })
        g.toSpawn -= 1
      }
      g.spawnT = g.spawnEvery * (0.7 + Math.random() * 0.6)
    }
    for (let r = 0; r < ROWS; r++) {
      const row = g.rows[r]
      row.doorT = Math.max(0, row.doorT - dt)
      for (const c of row.clients) {
        if (c.push > 0) { const d = Math.min(c.push, 300 * dt); c.x -= d; c.push -= d }
        else if (c.drink > 0) {
          c.drink -= dt
          if (c.drink <= 0) { row.empty.push({ x: c.x + 24 }); sound.emptyBack() } // devuelve el vacío y vuelve a avanzar
        } else {
          // avanzan a los tirones: un rato caminan, un rato esperan; con el show de la propina se frenan
          c.t += dt
          if ((g.showT <= 0 || c.villain) && c.t % 1.1 < 0.65) c.x += g.walk * 1.7 * (c.villain ? VILLAIN_SPEED : 1) * dt
        }
        if (c.x >= X1 - 18) return loseLife('¡Un cliente llegó al termo sin su mate!', 'angry')
      }
      // los que salieron por la puerta
      const gone = row.clients.filter((c) => c.x < X0 - 25)
      if (gone.length) {
        addScore(gone.reduce((n, c) => n + (c.villain ? VILLAIN_POINTS : OUT_POINTS), 0))
        gone.some((c) => c.villain) ? sound.villainOut() : sound.out()
        row.clients = row.clients.filter((c) => c.x >= X0 - 25)
      }
      for (const m of row.full) {
        m.x -= 380 * dt
        // lo agarra el cliente más cercano al cebador que no esté tomando ni retrocediendo
        const target = row.clients.filter((c) => c.drink <= 0 && c.push <= 0 && c.x <= m.x + 4).sort((a, b) => b.x - a.x)[0]
        if (target && m.x <= target.x + 14) {
          m.done = true
          sound.grab()
          if (target.villain) {
            // el villano sólo sale si lo agarra muy cerca de la puerta, y entonces deja siempre la propina grande
            if (target.x < X0 + (X1 - X0) * VILLAIN_OUT) { target.push = target.x - X0 + 40; row.tips.push({ x: Math.max(X0 + 30, target.x + 10), t: 6, big: true }) }
            else { target.push = g.push * VILLAIN_PUSH; target.drink = 1.5 }
          } else {
            if (target.x < X0 + (X1 - X0) / 3) target.push = target.x - X0 + 40 // en el primer tercio: sale por la puerta
            else { target.push = g.push; target.drink = 1.5 }
            if (Math.random() < TIP_CHANCE) row.tips.push({ x: target.x + 10, t: 6 }) // a veces deja propina
          }
        } else if (m.x <= X0) return loseLife(`Un ${drink === 'mate' ? 'mate' : 'vaso'} llegó a la puerta sin nadie`, 'crash')
      }
      row.full = row.full.filter((m) => !m.done)
      for (const e of row.empty) {
        e.x += 170 * dt
        // se agarra cuando llega a donde está el cebador en esa barra (en el termo, al final de la barra);
        // si el cebador está más a la izquierda, el vacío le pasa de largo
        const at = g.bx >= X1 ? X1 - 20 : g.bx - 20
        if (g.row === r && e.x >= at && e.x <= at + 40) { e.done = true; addScore(100); sound.clink() }
        else if (e.x >= X1) return loseLife('Se cayó un vacío al final de la barra', 'crash')
      }
      row.empty = row.empty.filter((e) => !e.done)
      for (const tip of row.tips) {
        tip.t -= dt
        // juntar una propina arranca el show (las bailarinas del original): todos dejan de avanzar un rato
        if (g.row === r && Math.abs(g.bx - tip.x) < 22) { tip.done = true; addScore(tip.big ? VILLAIN_TIP : TIP_POINTS); g.showT = SHOW_TIME; sound.tip() }
      }
      row.tips = row.tips.filter((tip) => !tip.done && tip.t > 0)
    }
    // pantalla terminada: no queda nadie por entrar ni en las barras
    if (g.toSpawn === 0 && g.rows.every((row) => !row.clients.length && !row.empty.length && !row.full.length)) {
      const bonus = SCREEN_POINTS + SCREEN_STEP * (g.level - 1)
      addScore(bonus)
      sound.levelUp()
      g.level += 1
      startScreen()
      say(`¡Barra vacía! +${bonus.toLocaleString('es-AR')} · nivel ${g.level}`)
    }
  }

  function draw() {
    ctx.clearRect(0, 0, VW, VH) // fondo transparente: se ve el de la página
    // show de la propina: tres bailarinas arriba al medio que se van de a una por segundo
    if (g.showT > 0) {
      ctx.font = '40px serif'
      ctx.textBaseline = 'middle'
      ctx.textAlign = 'center'
      ctx.fillText('💃'.repeat(Math.ceil(g.showT)), VW / 2, 52)
    }
    // marcador (más grande que en el original: en el celular la pantalla se achica)
    ctx.fillStyle = ink
    ctx.font = '700 22px ui-monospace, SFMono-Regular, Menlo, monospace'
    ctx.textBaseline = 'middle'
    ctx.textAlign = 'left'
    ctx.fillText(`Puntos ${g.score}`, 16, 24)
    ctx.fillText(`Nivel ${g.level}`, 16, 52)
    ctx.fillText(`Récord ${Math.max(record, g.score)}`, 16, 80)
    ctx.textAlign = 'right'
    ctx.font = '26px serif'
    ctx.fillText(D().icon.repeat(Math.max(0, g.lives)), VW - 16, 26)
    ctx.textAlign = 'center'
    for (let r = 0; r < ROWS; r++) {
      const y = rowY(r), s = SP
      const a = px(r, X0), b = px(r, X1)
      const emoji = (txt, x, dy, size) => { ctx.font = `${Math.round(size * s)}px serif`; ctx.fillText(txt, px(r, x), y + dy * s) }
      // barra de madera
      ctx.fillStyle = '#a5714a'
      ctx.beginPath(); ctx.roundRect(a, y + 6 * s, b - a, 14 * s, 4 * s); ctx.fill()
      ctx.fillStyle = '#7b5233'
      ctx.fillRect(a, y + 18 * s, b - a, 4 * s)
      // puerta: abierta (de canto) mientras entra alguien
      ctx.save()
      ctx.translate(a - 34 * s, y - 6 * s)
      if (g.rows[r].doorT > 0) ctx.scale(0.3, 1)
      ctx.font = `${Math.round(40 * s)}px serif`
      ctx.fillText('🚪', 0, 0)
      ctx.restore()
      const row = g.rows[r]
      for (const c of row.clients) emoji(c.face, c.x, -10, 30)
      for (const c of row.clients) if (c.drink > 0) emoji(D().icon, c.x + 20, -4, 18)
      for (const m of row.full) emoji(D().icon, m.x, 0, 18)
      ctx.globalAlpha = 0.45
      for (const e of row.empty) emoji(D().icon, e.x, 0, 18)
      ctx.globalAlpha = 1
      for (const tip of row.tips) emoji(tip.big ? '💰' : '💵', tip.x, 2, tip.big ? 22 : 18)
      // termo (o canilla) al final de cada barra
      ctx.fillStyle = D().jug
      ctx.beginPath(); ctx.roundRect(px(r, KEG + 34) - 6 * s, y - 22 * s, 12 * s, 34 * s, 4 * s); ctx.fill()
    }
    // cebador: en el termo o caminando por su barra
    const cy = rowY(g.row), cs = SP, cx = px(g.row, g.bx)
    ctx.font = `${Math.round(32 * cs)}px serif`
    ctx.fillText(BARTENDER, cx, cy - 8 * cs)
    if (g.fill) {
      // llenado: una línea que crece arriba del cebador
      ctx.fillStyle = ink
      ctx.fillRect(cx - 14 * cs, cy - 36 * cs, 28 * cs * Math.min(1, g.fill.t / FILL), 4)
    }
    if (g.state !== 'playing') overlay()
  }

  function veilColor() {
    const m = getComputedStyle(document.body).backgroundColor.match(/\d+(\.\d+)?/g) || [255, 255, 255]
    return `rgba(${m[0]}, ${m[1]}, ${m[2]}, .78)`
  }

  function overlay() {
    const text = g.state === 'paused' ? ['Pausa', TOUCH ? `Tocá ${D().label} para seguir` : 'P o Esc para seguir']
      : g.state === 'over' ? ['Fin del juego: te quedaste sin vidas', `${g.score} puntos · récord ${record} · ${TOUCH ? `tocá ${D().label}` : 'Enter'} para jugar de nuevo`]
      : [g.msg, '']
    // velo del color de fondo de la página (no blanco), para que no se vea un recuadro
    ctx.fillStyle = veilColor()
    ctx.fillRect(0, 0, VW, VH)
    ctx.fillStyle = ink
    ctx.textAlign = 'center'
    // en vertical la pantalla es angosta: el texto se parte en renglones
    const lines = (txt, font, max) => {
      ctx.font = font
      const out = []
      for (const w of String(txt).split(' ')) {
        const cur = out.length ? `${out[out.length - 1]} ${w}` : w
        if (out.length && ctx.measureText(cur).width <= max) out[out.length - 1] = cur
        else out.push(w)
      }
      return txt ? out : []
    }
    const big = lines(text[0], '700 34px system-ui, sans-serif', VW - 40), small = lines(text[1], '22px system-ui, sans-serif', VW - 40)
    let y = VH / 2 - ((big.length * 40 + small.length * 28) / 2) + 20
    ctx.font = '700 34px system-ui, sans-serif'
    for (const l of big) { ctx.fillText(l, VW / 2, y); y += 40 }
    ctx.font = '22px system-ui, sans-serif'
    ctx.fillStyle = muted
    for (const l of small) { ctx.fillText(l, VW / 2, y); y += 28 }
  }

  function frame(t) {
    const dt = Math.min(0.05, (t - last) / 1000 || 0)
    last = t
    if (t - colorsAt > 2000) { readColors(); colorsAt = t } // el modo oscuro cambia con la hora
    // un diálogo de la app (formulario, aviso) pausa la partida
    if (g.state === 'playing' && document.querySelector('dialog[open]')) pause()
    step(dt)
    if (!g.fill) sound.pourStop()
    draw()
    paintPause()
    raf = requestAnimationFrame(frame)
  }

  // el canvas ocupa toda su caja sin deformarse: la pantalla dibujada toma la forma de la caja (ver layout)
  function resize() {
    const box = screenEl.getBoundingClientRect()
    if (!box.width || !box.height) return
    const dpr = window.devicePixelRatio || 1
    layout(box.width, box.height)
    const scale = Math.min(box.width / VW, box.height / VH)
    canvas.style.width = `${Math.floor(VW * scale)}px`
    canvas.style.height = `${Math.floor(VH * scale)}px`
    canvas.width = Math.round(VW * scale * dpr)
    canvas.height = Math.round(VH * scale * dpr)
    ctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0)
    if (g) draw()
  }

  function pause() { if (g?.state === 'playing' || g?.state === 'oops') { g.state = 'paused'; g.fill = null; g.walkDir = 0; sound.suspend() } }
  function resume() { if (g?.state === 'paused') { g.state = 'playing'; last = performance.now(); sound.resume() } }
  function togglePause() { g?.state === 'paused' ? resume() : pause() }
  function paintPause() {
    const paused = g?.state === 'paused'
    pauseBtn.innerHTML = paused ? fa('play') : fa('pause')
    pauseBtn.title = pauseBtn.ariaLabel = paused ? 'Seguir' : 'Pausa'
    pauseBtn.disabled = g?.state === 'over'
  }
  function paintSound() {
    soundBtn.innerHTML = sound.muted ? fa('volume-xmark') : fa('volume-high')
    soundBtn.title = soundBtn.ariaLabel = sound.muted ? 'Activar el sonido (M)' : 'Silenciar (M)'
  }
  function toggleSound() { sound.toggleMute(); paintSound() }

  function start() {
    open = true
    idle.hidden = true
    gameEl.hidden = false
    host.classList.add('playing')
    sound.unlock()
    readColors()
    newGame()
    resize()
    last = performance.now()
    cancelAnimationFrame(raf)
    raf = requestAnimationFrame(frame)
    if (!TOUCH) canvas.focus()
  }
  function exit() {
    open = false
    cancelAnimationFrame(raf)
    sound.suspend()
    saveRecord()
    g = null
    gameEl.hidden = true
    idle.hidden = false
    host.classList.remove('playing')
    paintRecord()
  }
  const refocus = () => { if (open && !TOUCH) canvas.focus() }

  $('[data-mate-play]').addEventListener('click', start)
  $('[data-mate-back]')?.addEventListener('click', () => onExit())
  const switchDrink = () => { drink = D().other; paintDrink(); refocus() }
  $('[data-mate-drink]').addEventListener('click', switchDrink)
  $('[data-mate-drink-icon]').addEventListener('click', switchDrink)
  paintDrink()
  paintRecord()
  $('[data-mate-exit]').addEventListener('click', exit)
  // Reiniciar: partida nueva desde el nivel 1; si el puntaje superaba el récord, queda guardado
  $('[data-mate-restart]').addEventListener('click', () => {
    saveRecord()
    sound.resume() // si estaba en pausa, el audio quedó suspendido
    newGame()
    last = performance.now()
    refocus()
  })
  pauseBtn.addEventListener('click', () => { togglePause(); refocus() })
  soundBtn.addEventListener('click', () => { toggleSound(); refocus() })
  paintSound()
  canvas.addEventListener('click', refocus)

  // la cruz y Cebar: se aprietan y se sueltan (pointer events, con varios dedos a la vez); sin menú del
  // toque largo ni zoom ni scroll
  const hold = (el, down, up) => {
    const end = (e) => { if (el.classList.contains('on')) { el.classList.remove('on'); up?.(e) } }
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault()
      try { el.setPointerCapture(e.pointerId) } catch { /* sin captura: igual se suelta con pointerup */ }
      el.classList.add('on')
      sound.unlock()
      down(e)
    })
    el.addEventListener('pointerup', end)
    el.addEventListener('pointercancel', end)
    el.addEventListener('lostpointercapture', end)
    el.addEventListener('contextmenu', (e) => e.preventDefault())
  }
  for (const b of host.querySelectorAll('[data-mate-key]')) hold(b, () => press(b.dataset.mateKey), () => release(b.dataset.mateKey))
  hold(serveBtn, serveDown, fillEnd)

  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => { if (open) resize() }) : null
  ro?.observe(screenEl)
  const onResize = () => { if (open) resize() }
  const onVisibility = () => { if (document.hidden) pause() }
  const blocked = (e) => !open || !g || e.target.closest?.('input, textarea, select') || document.querySelector('dialog[open]')
  const KEYS = { ArrowUp: 'up', w: 'up', W: 'up', ArrowDown: 'down', s: 'down', S: 'down', ArrowLeft: 'left', a: 'left', A: 'left', ArrowRight: 'right', d: 'right', D: 'right' }
  const onKeyDown = (e) => {
    if (blocked(e)) return
    const k = e.key
    if (KEYS[k] || k === ' ') e.preventDefault()
    if (k === 'p' || k === 'P' || k === 'Escape') return togglePause()
    if (k === 'm' || k === 'M') return toggleSound()
    if (k === 'Enter' && g.state === 'over') { sound.resume(); return newGame() }
    if (g.state !== 'playing') return
    if (k === ' ') { if (!e.repeat) fillStart(); return }
    if (KEYS[k] && !(e.repeat && (KEYS[k] === 'up' || KEYS[k] === 'down'))) press(KEYS[k])
  }
  const onKeyUp = (e) => {
    if (!open || !g) return
    if (e.key === ' ') fillEnd()
    if (KEYS[e.key]) release(KEYS[e.key])
  }
  window.addEventListener('resize', onResize)
  document.addEventListener('visibilitychange', onVisibility)
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)

  return {
    // texto de lo que se está esperando (ej. "CA919 · aterrizás en 1 h 20 min")
    setStatus(text) {
      for (const el of host.querySelectorAll('[data-mate-status]')) el.textContent = text || ''
    },
    // al salir de la pantalla: corta el juego, guarda el récord y suelta los eventos de la ventana
    destroy() {
      if (open) exit()
      ro?.disconnect()
      window.removeEventListener('resize', onResize)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    },
  }
}
