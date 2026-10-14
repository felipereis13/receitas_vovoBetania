"use strict"
const tabs = document.getElementById("tabs")
const list = document.getElementById("recipes")
const pages = document.getElementById("pages")
const title = document.getElementById("recipe-title")
let selectedChapter = 0
let selectedRecipe = 0
let generation = 0
let urls = []
const remembered = new Map()

function makeButton(text, className) {
  const button = document.createElement("button")
  button.type = "button"
  button.className = className
  button.textContent = text
  return button
}

DATA.chapters.forEach((chapter, index) => {
  const tab = makeButton(chapter.title, "tab")
  tab.id = `tab-${index}`
  tab.setAttribute("role", "tab")
  tab.setAttribute("aria-controls", "chapter-panel")
  tab.addEventListener("click", () => selectChapter(index))
  tab.addEventListener("keydown", (event) => {
    let next = index
    if (event.key === "ArrowRight")
      next = (index + 1) % DATA.chapters.length
    else if (event.key === "ArrowLeft")
      next = (index + DATA.chapters.length - 1) % DATA.chapters.length
    else if (event.key === "Home") next = 0
    else if (event.key === "End") next = DATA.chapters.length - 1
    else return
    event.preventDefault()
    selectChapter(next)
    tabs.children[next].focus()
  })
  tabs.append(tab)
})

function selectChapter(index) {
  selectedChapter = index
  const chapter = DATA.chapters[index]
  Array.from(tabs.children).forEach((tab, i) => {
    tab.setAttribute("aria-selected", String(i === index))
    tab.tabIndex = i === index ? 0 : -1
  })
  document
    .getElementById("chapter-panel")
    .setAttribute("aria-labelledby", `tab-${index}`)
  document.getElementById("chapter-title").textContent = chapter.title
  document.getElementById("recipe-count").textContent =
    `${chapter.recipes.length} receitas`
  list.replaceChildren()
  chapter.recipes.forEach((recipe, i) => {
    const button = makeButton(recipe.title, "recipe")
    button.addEventListener("click", () => {
      selectRecipe(i)
      title.scrollIntoView({ block: "start" })
    })
    list.append(button)
  })
  selectRecipe(remembered.get(index) || 0)
}

async function decodePage(encoded) {
  const binary = atob(encoded)
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
  const stream = new Blob([bytes])
    .stream()
    .pipeThrough(new DecompressionStream("gzip"))
  return new Blob([await new Response(stream).arrayBuffer()], {
    type: "image/svg+xml",
  })
}

async function selectRecipe(index) {
  selectedRecipe = index
  remembered.set(selectedChapter, index)
  const recipe = DATA.chapters[selectedChapter].recipes[index]
  const token = ++generation
  urls.forEach((url) => URL.revokeObjectURL(url))
  urls = []
  pages.replaceChildren()
  pages.setAttribute("aria-busy", "true")
  title.textContent = recipe.title
  document.getElementById("page-range").textContent =
    `PDF · páginas ${recipe.start}–${recipe.end}`
  document.getElementById("previous").disabled = index === 0
  document.getElementById("next").disabled =
    index === DATA.chapters[selectedChapter].recipes.length - 1
  Array.from(list.children).forEach((button, i) => {
    button.setAttribute("aria-current", i === index ? "true" : "false")
  })
  try {
    for (let page = recipe.start; page <= recipe.end; page++) {
      const blob = await decodePage(DATA.pages[page])
      if (token !== generation) return
      const url = URL.createObjectURL(blob)
      urls.push(url)
      const figure = document.createElement("figure")
      const img = document.createElement("img")
      img.src = url
      img.alt = `${recipe.title} — página ${page} do PDF original`
      img.width = 612
      img.height = 792
      img.draggable = false
      const caption = document.createElement("figcaption")
      caption.textContent = `Página ${page}`
      figure.append(img, caption)
      pages.append(figure)
    }
  } catch (error) {
    if (token !== generation) return
    const message = document.createElement("p")
    message.className = "error"
    message.textContent =
      "Não foi possível abrir as páginas. Abra este arquivo em uma versão atual do Chrome, Edge, Firefox ou Safari."
    pages.replaceChildren(message)
  } finally {
    if (token === generation) pages.setAttribute("aria-busy", "false")
  }
}

document.getElementById("previous").addEventListener("click", () => {
  selectRecipe(selectedRecipe - 1)
  title.scrollIntoView({ block: "start" })
})
document.getElementById("next").addEventListener("click", () => {
  selectRecipe(selectedRecipe + 1)
  title.scrollIntoView({ block: "start" })
})
document.getElementById("zoom").addEventListener("change", (event) => {
  pages.style.setProperty("--page-zoom", event.target.value)
})

const $ = (id) => document.getElementById(id)
const clean = (text) => text.replace(/\n/g, " ").replace(/- /g, "-")
const normalize = (text) =>
  clean(text)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
const catalog = [
  ...DATA.chapters.flatMap((chapter, c) =>
    chapter.recipes.map((recipe, r) => ({
      ...recipe,
      c,
      r,
      id: String(recipe.start),
      category: chapter.title,
      source: "book",
    })),
  ),
  ...(DATA.extraRecipes || []),
].map((recipe) => ({
  ...recipe,
  search: normalize(
    [
      recipe.title,
      recipe.category,
      ...recipe.practical.parts
        .filter((p) => p.kind === "ingredient")
        .map((p) => p.text.replace(/\((?:sopa|chá|café)\)/gi, "")),
    ].join(" "),
  )
    .split(/[^a-z0-9]+/)
    .filter(Boolean),
}))
let kitchenRecipe = catalog.find((item) => item.id === "vovo-bolo-betania") || catalog[0]
let currentMode = "practical"
let checkInputs = new Map()
let timelineItems = new Map()
let saved = { favorites: [], checks: {} }
let storageOK = true
try {
  const stored = JSON.parse(
    localStorage.getItem("geladeira-pratica-v1") || "null",
  )
  if (
    stored &&
    Array.isArray(stored.favorites) &&
    stored.checks &&
    typeof stored.checks === "object"
  )
    saved = stored
} catch {
  storageOK = false
}
function saveKitchen() {
  try {
    localStorage.setItem("geladeira-pratica-v1", JSON.stringify(saved))
  } catch {
    storageOK = false
  }
  if (!storageOK)
    $("storage-note").textContent =
      "Neste navegador, as marcações ficam disponíveis apenas enquanto o app estiver aberto. Mantenha o app aberto durante o temporizador."
}
saveKitchen()
DATA.chapters.forEach((chapter, i) => {
  const option = document.createElement("option")
  option.value = String(i)
  option.textContent = chapter.title
  $("ingredient-filter").append(option)
})
const familyFilter = document.createElement("option")
familyFilter.value = "-1"
familyFilter.textContent = "Vovó Betânia"
$("ingredient-filter").append(familyFilter)

function setMode(mode) {
  currentMode = mode
  const practical = mode === "practical"
  $("practical-view").hidden = !practical
  $("book-view").hidden = mode !== "book"
  $("vovo-view").hidden = mode !== "vovo"
  $("vovo-mode").setAttribute("aria-pressed", String(mode === "vovo"))
  $("collection-author").textContent =
    mode === "vovo"
      ? "Memórias e sabores do caderno da Vovó Betânia."
      : "Escolha uma receita e sinta-se em casa."
  document.querySelector(".skip").href =
    mode === "practical" ? "#cook-reader" : mode === "vovo" ? "#bolo-betania" : "#chapter-panel"
  $("practical-mode").setAttribute("aria-pressed", String(practical))
  $("book-mode").setAttribute("aria-pressed", String(mode === "book"))
}
$("vovo-mode").addEventListener("click", () => setMode("vovo"))
$("practical-mode").addEventListener("click", () => {
  const match =
    currentMode === "vovo"
      ? catalog.find((item) => item.id === "vovo-bolo-betania")
      : currentMode === "book"
        ? kitchenRecipe.source === "book" &&
          kitchenRecipe.c === selectedChapter &&
          kitchenRecipe.r === selectedRecipe
          ? kitchenRecipe
          : catalog.find(
              (item) =>
                item.source === "book" &&
                item.c === selectedChapter &&
                item.r === selectedRecipe,
            )
        : kitchenRecipe
  if (match && match.id !== kitchenRecipe.id) chooseRecipe(match, false)
  setMode("practical")
})
$("book-mode").addEventListener("click", () => {
  if (kitchenRecipe.source === "book") {
    selectChapter(kitchenRecipe.c)
    selectRecipe(kitchenRecipe.r)
  } else {
    selectChapter(selectedChapter)
  }
  setMode("book")
})
$("open-original").addEventListener("click", () => {
  if (kitchenRecipe.source === "family") {
    setMode("vovo")
    $("vovo-photo").open = true
    $("vovo-photo").scrollIntoView({ block: "start" })
    return
  }
  selectChapter(kitchenRecipe.c)
  selectRecipe(kitchenRecipe.r)
  setMode("book")
  title.scrollIntoView({ block: "start" })
})
$("vovo-practical").addEventListener("click", () => {
  $("search").value = ""
  $("ingredient-filter").value = ""
  $("favorites-only").checked = false
  chooseRecipe(
    catalog.find((item) => item.id === "vovo-bolo-betania"),
    false,
  )
  setMode("practical")
})

function filteredRecipes() {
  const words = normalize($("search").value.trim())
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
  const category = $("ingredient-filter").value
  return catalog.filter(
    (item) =>
      (category === "" || item.c === Number(category)) &&
      (!$("favorites-only").checked ||
        saved.favorites.includes(item.id)) &&
      words.every((word) =>
        item.search.some((token) => token.startsWith(word)),
      ),
  )
}
function renderCatalog() {
  const found = filteredRecipes()
  $("result-count").textContent =
    `${found.length} ${found.length === 1 ? "receita encontrada" : "receitas encontradas"}`
  $("catalog-list").replaceChildren()
  for (const item of found) {
    const button = makeButton("", "catalog-recipe")
    button.setAttribute(
      "aria-current",
      String(item.id === kitchenRecipe.id),
    )
    const name = document.createElement("strong")
    name.textContent = clean(item.title)
    const detail = document.createElement("span")
    detail.textContent = `${saved.favorites.includes(item.id) ? "★ · " : ""}${item.practical.prep}`
    button.append(name, detail)
    button.addEventListener("click", () => chooseRecipe(item, true))
    $("catalog-list").append(button)
  }
  if (!found.length) {
    const p = document.createElement("p")
    p.className = "empty-results"
    p.textContent =
      "Nenhuma receita encontrada. Tente outro termo ou retire um filtro."
    $("catalog-list").append(p)
  }
}
$("search").addEventListener("input", renderCatalog)
$("ingredient-filter").addEventListener("change", renderCatalog)
$("favorites-only").addEventListener("change", renderCatalog)

function updateFavorite() {
  const favorite = saved.favorites.includes(kitchenRecipe.id)
  $("favorite-button").textContent = favorite
    ? "★ Favorita"
    : "☆ Favoritar"
  $("favorite-button").setAttribute("aria-pressed", String(favorite))
}
$("favorite-button").addEventListener("click", () => {
  const id = kitchenRecipe.id
  saved.favorites = saved.favorites.includes(id)
    ? saved.favorites.filter((item) => item !== id)
    : [...saved.favorites, id]
  saveKitchen()
  updateFavorite()
  renderCatalog()
})
function updateProgress() {
  const parts = kitchenRecipe.practical.parts
  const checked = saved.checks[kitchenRecipe.id] || []
  const ingredients = parts
    .map((p, i) => (p.kind === "ingredient" ? i : -1))
    .filter((i) => i >= 0)
  const steps = parts
    .map((p, i) => (p.kind === "step" ? i : -1))
    .filter((i) => i >= 0)
  $("check-progress").textContent =
    `${ingredients.filter((i) => checked.includes(i)).length}/${ingredients.length} ingredientes separados · ${steps.filter((i) => checked.includes(i)).length}/${steps.length} etapas concluídas`
  const next = steps.find((i) => !checked.includes(i))
  timelineItems.forEach((node, i) => {
    node.setAttribute(
      "data-state",
      checked.includes(i) ? "done" : i === next ? "next" : "pending",
    )
    node.setAttribute("aria-current", i === next ? "step" : "false")
  })
  $("timeline-progress").textContent =
    next === undefined
      ? "Todas as etapas foram marcadas como concluídas."
      : `Próxima etapa: ${steps.indexOf(next) + 1} de ${steps.length}`
}
function registerCheck(index, input) {
  const inputs = checkInputs.get(index) || []
  inputs.push(input)
  checkInputs.set(index, inputs)
  input.checked = (saved.checks[kitchenRecipe.id] || []).includes(index)
  const recipeId = kitchenRecipe.id
  input.addEventListener("change", () => {
    const current = saved.checks[recipeId] || []
    saved.checks[recipeId] = input.checked
      ? [...new Set([...current, index])]
      : current.filter((n) => n !== index)
    for (const peer of checkInputs.get(index) || [])
      peer.checked = input.checked
    saveKitchen()
    updateProgress()
  })
}
function renderTimeline(item) {
  $("prep-timeline").replaceChildren()
  timelineItems = new Map()
  let section = clean(item.title),
    sequence = 0,
    lastItem = null
  for (let i = 0; i < item.practical.parts.length; i++) {
    const part = item.practical.parts[i]
    if (part.kind === "heading") {
      section = part.text
      lastItem = null
    }
    if (part.kind === "ingredient") lastItem = null
    if (part.kind === "step") {
      const li = document.createElement("li")
      li.className = "timeline-step"
      const marker = document.createElement("span")
      marker.className = "timeline-marker"
      marker.textContent = String(++sequence)
      marker.setAttribute("aria-hidden", "true")
      const body = document.createElement("div")
      body.className = "timeline-body"
      const heading = document.createElement("p")
      heading.className = "timeline-section"
      heading.textContent = `Etapa ${sequence} · ${section}`
      const label = document.createElement("label")
      label.className = "timeline-check"
      const input = document.createElement("input")
      input.type = "checkbox"
      registerCheck(i, input)
      const text = document.createElement("span")
      text.textContent = part.text
      label.append(input, text)
      body.append(heading, label)
      li.append(marker, body)
      $("prep-timeline").append(li)
      timelineItems.set(i, li)
      lastItem = body
    } else if (part.kind === "note" && lastItem) {
      const note = document.createElement("p")
      note.className = "timeline-note"
      note.textContent = part.text
      lastItem.append(note)
    }
  }
}
function chooseRecipe(item, scroll) {
  kitchenRecipe = item
  // Mantém os dois modos de leitura na mesma receita.
  if (item.source === "book") {
    selectedChapter = item.c
    selectedRecipe = item.r
  }
  checkInputs = new Map()
  $("cook-cake-image").hidden = item.id !== "vovo-bolo-betania"
  if (item.id === "vovo-bolo-betania")
    $("cook-cake-image").src = $("betania-cake-image").src
  $("cook-category").textContent = item.category
  $("cook-title").textContent = clean(item.title)
  $("cook-serving").textContent = `Serve: ${item.practical.serving}`
  $("cook-prep").textContent = `Preparo: ${item.practical.prep}`
  $("open-original").textContent =
    item.source === "family"
      ? "Ver receita manuscrita"
      : "Ver páginas originais"
  $("cook-help").textContent =
    "Marque os ingredientes separados e acompanhe o preparo pela linha do tempo. As etapas seguem a ordem do texto de origem."
  $("cook-parts").replaceChildren()
  const checks = saved.checks[item.id] || []
  let previousKind = ""
  item.practical.parts.forEach((part, i) => {
    if (
      (part.kind === "ingredient" || part.kind === "step") &&
      part.kind !== previousKind
    ) {
      const sectionTitle = document.createElement("h3")
      sectionTitle.textContent =
        part.kind === "ingredient" ? "Ingredientes" : "Preparo"
      $("cook-parts").append(sectionTitle)
    }
    if (part.kind === "ingredient" || part.kind === "step") {
      const label = document.createElement("label")
      label.className = `check-row ${part.kind}`
      const input = document.createElement("input")
      input.type = "checkbox"
      input.checked = checks.includes(i)
      const span = document.createElement("span")
      span.textContent = part.text
      registerCheck(i, input)
      label.append(input, span)
      $("cook-parts").append(label)
    } else {
      const element = document.createElement(
        part.kind === "heading" ? "h3" : "p",
      )
      element.className = `part-${part.kind}`
      element.textContent = part.text
      $("cook-parts").append(element)
    }
    previousKind = part.kind
  })
  renderTimeline(item)
  updateFavorite()
  updateProgress()
  renderCatalog()
  if (scroll) $("cook-reader").scrollIntoView({ block: "start" })
}
$("reset-checks").addEventListener("click", () => {
  saved.checks[kitchenRecipe.id] = []
  saveKitchen()
  chooseRecipe(kitchenRecipe, false)
})
$("cook-font").addEventListener("change", (event) => {
  $("cook-parts").style.fontSize = event.target.value
  $("prep-timeline").style.fontSize = event.target.value
})

let timerRunning = false
let timerRemaining = 600000
let timerDeadline = 0
let timerOwner = ""
let timerRecipeName = ""
let audioContext
function showClock() {
  const seconds = Math.max(0, Math.ceil(timerRemaining / 1000))
  $("timer-display").textContent =
    `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`
}
function alarm() {
  try {
    if (!audioContext) return
    for (let i = 0; i < 3; i++) {
      const oscillator = audioContext.createOscillator()
      const gain = audioContext.createGain()
      oscillator.connect(gain)
      gain.connect(audioContext.destination)
      oscillator.frequency.value = 880
      gain.gain.value = 0.12
      const time = audioContext.currentTime + i * 0.5
      oscillator.start(time)
      oscillator.stop(time + 0.25)
    }
  } catch {}
}
function tickTimer() {
  if (!timerRunning) return
  timerRemaining = Math.max(0, timerDeadline - Date.now())
  showClock()
  if (!timerRemaining) {
    timerRunning = false
    $("timer-toggle").textContent = "Iniciar"
    $("timer-status").textContent = `Tempo encerrado: ${timerRecipeName}.`
    $("timer-minutes").disabled = false
    timerOwner = ""
    alarm()
  }
}
function resetTimer() {
  timerRunning = false
  timerOwner = ""
  timerRemaining = 0
  $("timer-toggle").textContent = "Iniciar"
  $("timer-minutes").disabled = false
  $("timer-status").textContent = ""
  $("timer-recipe").textContent = "Escolha o tempo que deseja contar."
  showClock()
}
$("timer-toggle").addEventListener("click", async () => {
  if (timerRunning) {
    tickTimer()
    if (!timerRunning) return
    timerRunning = false
    $("timer-toggle").textContent = "Continuar"
    $("timer-status").textContent = "Pausado."
    return
  }
  if (!timerOwner) {
    const minutes = Number($("timer-minutes").value)
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 1440) {
      $("timer-status").textContent =
        "Digite um tempo inteiro entre 1 e 1440 minutos."
      return
    }
    timerRemaining = minutes * 60000
    timerOwner = kitchenRecipe.id
    timerRecipeName = clean(kitchenRecipe.title)
  }
  try {
    const AC = window.AudioContext || window.webkitAudioContext
    if (AC) {
      audioContext ||= new AC()
      await audioContext.resume()
    }
  } catch {}
  timerDeadline = Date.now() + timerRemaining
  timerRunning = true
  $("timer-toggle").textContent = "Pausar"
  $("timer-minutes").disabled = true
  $("timer-recipe").textContent = timerRecipeName
  $("timer-status").textContent = "Em andamento."
  showClock()
})
$("timer-reset").addEventListener("click", resetTimer)
$("timer-minutes").addEventListener("input", () => {
  if (!timerOwner) {
    const value = Number($("timer-minutes").value)
    timerRemaining = Number.isFinite(value)
      ? Math.max(0, Math.min(1440, value)) * 60000
      : 0
    showClock()
  }
})
setInterval(tickTimer, 250)
document.addEventListener("visibilitychange", tickTimer)
chooseRecipe(kitchenRecipe, false)
setMode("practical")
