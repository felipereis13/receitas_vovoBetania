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
    if (event.key === "ArrowRight") next = (index + 1) % DATA.chapters.length
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
const builtInBooks = [
  { id: "geladeira", title: "Receitas com itens da geladeira" },
  { id: "vovo", title: "Caderno de Vovó Betânia" },
]
const libraryKey = "receitas-livros-v1"
let library = { books: [], recipes: [] }
let libraryReadable = true
try {
  const stored = JSON.parse(localStorage.getItem(libraryKey) || "null")
  if (stored) {
    const text = (value) => typeof value === "string" && value.trim().length > 0
    if (
      !Array.isArray(stored.books) ||
      !Array.isArray(stored.recipes) ||
      !stored.books.every(
        (book) =>
          text(book.id) && book.id.startsWith("livro-") && text(book.title),
      )
    )
      throw new Error("Livros inválidos")
    const ids = [...builtInBooks, ...stored.books].map((book) => book.id)
    if (
      new Set(ids).size !== ids.length ||
      !stored.recipes.every(
        (recipe) =>
          text(recipe.id) &&
          recipe.id.startsWith("receita-") &&
          ids.includes(recipe.bookId) &&
          text(recipe.title) &&
          text(recipe.category) &&
          recipe.source === "custom" &&
          text(recipe.practical?.serving) &&
          text(recipe.practical?.prep) &&
          Array.isArray(recipe.practical?.parts) &&
          recipe.practical.parts.every(
            (part) =>
              ["ingredient", "step", "note"].includes(part.kind) &&
              text(part.text),
          ),
      )
    )
      throw new Error("Receitas inválidas")
    library = stored
  }
} catch {
  libraryReadable = false
  $("library-status").textContent =
    "Não foi possível ler seus livros salvos. As receitas originais continuam disponíveis; tente abrir no navegador usado para cadastrá-los."
}
const allBooks = () => [...builtInBooks, ...library.books]
function indexRecipe(recipe) {
  const text = [
    recipe.title,
    recipe.category,
    ...recipe.practical.parts
      .filter((part) => part.kind === "ingredient")
      .map((part) => part.text.replace(/\((?:sopa|chá|café)\)/gi, "")),
  ].join(" ")
  return {
    ...recipe,
    search: normalize(text)
      .split(/[^a-z0-9]+/)
      .filter(Boolean),
  }
}
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
  ...library.recipes,
].map((recipe) =>
  indexRecipe({
    ...recipe,
    bookId:
      recipe.bookId || (recipe.source === "family" ? "vovo" : "geladeira"),
  }),
)
let selectedBook = ""
let kitchenRecipe =
  catalog.find((item) => item.id === "vovo-bolo-betania") || catalog[0]
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
function renderBooks() {
  $("book-tabs").replaceChildren()
  for (const book of allBooks()) {
    const button = makeButton(book.title, "book-tab")
    button.setAttribute("aria-pressed", String(book.id === selectedBook))
    button.addEventListener("click", () => {
      selectBook(book.id)
      $("book-tabs").querySelector('[aria-pressed="true"]').focus()
    })
    $("book-tabs").append(button)
  }
  $("practical-mode").setAttribute("aria-pressed", String(!selectedBook))
  $("library-name").textContent =
    allBooks().find((book) => book.id === selectedBook)?.title ||
    "Modo prático · todas as receitas"
}
function refreshCategories() {
  $("ingredient-filter").replaceChildren(new Option("Todas as categorias", ""))
  const categories = catalog
    .filter((item) => !selectedBook || item.bookId === selectedBook)
    .map((item) => item.category)
  for (const category of new Set(categories))
    $("ingredient-filter").append(new Option(category, category))
}
function selectBook(id, recipe = null) {
  selectedBook = id
  $("search").value = ""
  $("favorites-only").checked = false
  refreshCategories()
  renderBooks()
  const items = catalog.filter((item) => !id || item.bookId === id)
  const next =
    recipe || items.find((item) => item.id === kitchenRecipe?.id) || items[0]
  $("empty-book").hidden = Boolean(next)
  $("cook-reader").hidden = !next
  setMode("practical")
  if (next) chooseRecipe(next, false)
  else {
    kitchenRecipe = null
    setMode("practical")
    renderCatalog()
  }
}
function setMode(mode) {
  currentMode = mode
  $("practical-view").hidden = mode !== "practical"
  $("book-view").hidden = mode !== "book"
  $("vovo-view").hidden = mode !== "vovo"
  $("back-practical").hidden = mode === "practical"
  document.querySelector(".skip").href =
    mode === "practical"
      ? kitchenRecipe
        ? "#cook-reader"
        : "#empty-book"
      : mode === "vovo"
        ? "#bolo-betania"
        : "#chapter-panel"
}
$("practical-mode").addEventListener("click", () => selectBook(""))
$("back-practical").addEventListener("click", () => {
  const match =
    currentMode === "book"
      ? catalog.find(
          (item) =>
            item.source === "book" &&
            item.c === selectedChapter &&
            item.r === selectedRecipe,
        )
      : catalog.find((item) => item.id === "vovo-bolo-betania")
  selectBook("", match || kitchenRecipe)
})
$("open-original").addEventListener("click", () => {
  if (kitchenRecipe.source === "family") {
    setMode("vovo")
    $("vovo-photo").open = true
    $("vovo-photo").scrollIntoView({ block: "start" })
    return
  }
  if (kitchenRecipe.source !== "book") return
  selectChapter(kitchenRecipe.c)
  selectRecipe(kitchenRecipe.r)
  setMode("book")
  title.scrollIntoView({ block: "start" })
})
$("vovo-practical").addEventListener("click", () => {
  selectBook(
    "vovo",
    catalog.find((item) => item.id === "vovo-bolo-betania"),
  )
})

// Salva antes de alterar a tela: se faltar espaço, o formulário permanece preenchido.
function saveLibrary(next, errorId) {
  try {
    if (!libraryReadable) throw new Error("Armazenamento indisponível")
    localStorage.setItem(libraryKey, JSON.stringify(next))
    library = next
    return true
  } catch {
    $(errorId).textContent =
      "Não foi possível salvar neste navegador. Seu formulário foi mantido; verifique o espaço e a permissão de armazenamento e tente novamente."
    return false
  }
}
for (const button of document.querySelectorAll("[data-close]"))
  button.addEventListener("click", () => $(button.dataset.close).close())
for (const field of document.querySelectorAll(
  "dialog [required]:not(select)",
)) {
  field.addEventListener("input", () =>
    field.setCustomValidity(
      field.value.trim() ? "" : "Preencha este campo antes de continuar.",
    ),
  )
}
$("add-book").addEventListener("click", () => {
  $("book-form").reset()
  $("book-name").setCustomValidity("")
  $("book-error").textContent = ""
  $("book-dialog").showModal()
})
$("book-form").addEventListener("submit", (event) => {
  event.preventDefault()
  const name = $("book-name").value.trim()
  if (!name) return
  if (
    allBooks().some((book) => normalize(book.title.trim()) === normalize(name))
  ) {
    $("book-error").textContent =
      "Já existe um livro com esse nome. Escolha outro nome."
    return
  }
  const book = { id: `livro-${crypto.randomUUID()}`, title: name }
  if (
    !saveLibrary({ ...library, books: [...library.books, book] }, "book-error")
  )
    return
  $("book-dialog").close()
  selectBook(book.id)
  $("library-status").textContent =
    `Livro “${name}” criado. Agora você pode adicionar a primeira receita.`
  $("empty-book").querySelector("h2").focus()
})
$("add-recipe").addEventListener("click", () => {
  $("recipe-form").reset()
  for (const field of $("recipe-form").querySelectorAll("[required]"))
    field.setCustomValidity("")
  $("recipe-error").textContent = ""
  $("recipe-book").replaceChildren()
  for (const book of allBooks())
    $("recipe-book").append(new Option(book.title, book.id))
  $("recipe-book").value = selectedBook || kitchenRecipe?.bookId || "vovo"
  $("recipe-dialog").showModal()
  $("new-title").focus()
})
$("recipe-form").addEventListener("submit", (event) => {
  event.preventDefault()
  const values = new FormData(event.currentTarget)
  const value = (name) => values.get(name).trim()
  const lines = (name, kind) =>
    value(name)
      .split(/\r?\n/)
      .map((text) => text.trim())
      .filter(Boolean)
      .map((text) => ({ kind, text }))
  if (!value("title") || !value("ingredients") || !value("steps")) return
  const recipe = {
    id: `receita-${crypto.randomUUID()}`,
    bookId: value("bookId"),
    source: "custom",
    title: value("title"),
    category: value("category") || "Receitas da casa",
    practical: {
      serving: value("serving") || "Não informado",
      prep: value("prep") || "Não informado",
      parts: [
        ...lines("ingredients", "ingredient"),
        ...lines("steps", "step"),
        ...(value("notes") ? [{ kind: "note", text: value("notes") }] : []),
      ],
    },
  }
  if (!allBooks().some((book) => book.id === recipe.bookId)) return
  if (
    !saveLibrary(
      { ...library, recipes: [...library.recipes, recipe] },
      "recipe-error",
    )
  )
    return
  catalog.push(indexRecipe(recipe))
  $("recipe-dialog").close()
  selectBook(recipe.bookId, catalog[catalog.length - 1])
  $("library-status").textContent =
    `Receita “${recipe.title}” salva. Já pode começar o preparo!`
  $("cook-reader").focus()
})

function filteredRecipes() {
  const words = normalize($("search").value.trim())
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
  const category = $("ingredient-filter").value
  return catalog.filter(
    (item) =>
      (!selectedBook || item.bookId === selectedBook) &&
      (category === "" || item.category === category) &&
      (!$("favorites-only").checked || saved.favorites.includes(item.id)) &&
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
    button.setAttribute("aria-current", String(item.id === kitchenRecipe?.id))
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
      selectedBook && !catalog.some((item) => item.bookId === selectedBook)
        ? "Nenhuma receita neste livro ainda."
        : "Nenhuma receita encontrada. Tente outro termo ou retire um filtro."
    $("catalog-list").append(p)
  }
}
$("search").addEventListener("input", renderCatalog)
$("ingredient-filter").addEventListener("change", renderCatalog)
$("favorites-only").addEventListener("change", renderCatalog)

function updateFavorite() {
  const favorite = saved.favorites.includes(kitchenRecipe.id)
  $("favorite-button").textContent = favorite ? "★ Favorita" : "☆ Favoritar"
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
  $("cook-reader").hidden = false
  $("empty-book").hidden = true
  setMode("practical")
  $("open-original").hidden = item.source === "custom"
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
    if (!kitchenRecipe) return
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
selectBook("")
