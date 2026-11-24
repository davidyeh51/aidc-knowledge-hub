import { findDecks } from "../search.js?v=3";

const screen = document.querySelector("#screen");
let decks = [];
let query = "";
let notesOpen = false;

function node(tag, props = {}, ...children) {
  const element = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key.startsWith("on")) element.addEventListener(key.slice(2), value);
    else if (value === true) element.setAttribute(key, "");
    else if (value !== false) element.setAttribute(key, value);
  }
  element.append(...children.flat().filter((value) => value != null));
  return element;
}

const route = (id, number) => "#deck/" + id + "/" + number;
const cue = (seconds) => Math.floor(seconds / 60) + ":" + String(seconds % 60).padStart(2, "0");
const image = (slug, cls = "") => node("img", { src: "../assets/" + slug + ".svg", alt: "", width: 640, height: 360, class: cls });

function home() {
  const results = node("div", { class: "meeting-list" });
  const status = node("p", { class: "result-count muted", role: "status" });
  const search = node("input", { id: "meeting-query", type: "search", maxlength: 120, value: query,
    placeholder: "例如 促參法、共址、PUE 或會議日期",
    oninput: (event) => { query = event.target.value; refresh(); } });
  function refresh() {
    const matches = findDecks(decks, query);
    status.textContent = "顯示 " + matches.length + " 場會議，共收錄 " + decks.length + " 場";
    const entries = matches.map(({ deck, matchPage }) => {
      const page = Math.max(1, matchPage + 1);
      const linkText = matchPage < 0 ? "開啟簡報" : "第 " + page + " 頁　" + deck.slides[matchPage].title;
      const copy = node("div", { class: "card-body" },
        node("p", { class: "card-meta" }, node("time", { datetime: deck.date }, deck.date), "　10 分鐘"),
        node("h2", {}, deck.title), node("p", {}, deck.summary), node("span", { class: "card-action" }, linkText));
      return node("article", { class: "card" },
        node("a", { class: "card-link", href: route(deck.id, page) }, image(deck.cover), copy));
    });
    results.replaceChildren(...entries);
    if (!entries.length) results.append(node("p", { class: "empty" }, "找不到符合的會議。請試試其他關鍵字。"));
  }
  const heading = node("div", {}, node("p", { class: "eyebrow" }, "會議資料館"),
    node("h1", { tabindex: -1 }, "台灣 AIDC 政策法規"),
    node("p", { class: "intro" }, "依會議日期查閱十分鐘簡報、逐頁講稿與法規來源。"));
  screen.replaceChildren(node("section", { class: "meeting-intro" }, heading, image("meeting-gate")),
    node("div", { class: "filters meeting-search" }, node("label", { for: "meeting-query" }, "搜尋會議", search)), status, results);
  refresh();
}

function sources(deck, slide) {
  const items = slide.refs.map((index) => {
    const source = deck.sources[index];
    if (!source) return null;
    const name = source.url?.startsWith("https://")
      ? node("a", { href: source.url, target: "_blank", rel: "noopener noreferrer" }, source.label)
      : source.label;
    return node("li", {}, name, source.date ? "（" + source.date + "）" : "");
  });
  return node("details", { class: "source-box", open: true }, node("summary", {}, "本頁來源"),
    node("ul", { class: "sources" }, items));
}

function drawing(data) {
  return data ? node("figure", { class: "evidence-figure" },
    node("img", { src: "data:image/svg+xml;charset=utf-8," + encodeURIComponent(data.svg), alt: data.alt }),
    node("figcaption", {}, data.caption)) : null;
}

function presentation(deck, page) {
  const current = deck.slides[page - 1];
  const elapsed = deck.slides.slice(0, page - 1).reduce((total, slide) => total + slide.seconds, 0);
  const notes = node("section", { class: "notes", id: "speaker", hidden: !notesOpen },
    node("h2", {}, "講者備註"), node("p", {}, current.notes));
  const noteButton = node("button", { type: "button", class: "button", "aria-controls": "speaker",
    "aria-expanded": String(notesOpen), onclick: () => {
      notesOpen = !notesOpen;
      notes.hidden = !notesOpen;
      noteButton.textContent = notesOpen ? "關閉講稿" : "開啟講稿";
      noteButton.setAttribute("aria-expanded", String(notesOpen));
    } }, notesOpen ? "關閉講稿" : "開啟講稿");
  const jump = node("select", { id: "jump", onchange: (event) => { location.hash = route(deck.id, event.target.value); } },
    deck.slides.map((slide, index) => node("option", { value: index + 1 }, (index + 1) + "　" + slide.title)));
  jump.value = String(page);
  const step = (label, target) => node("button", { type: "button", class: "button",
    disabled: target < 1 || target > deck.slides.length, onclick: () => { location.hash = route(deck.id, target); } }, label);
  const points = current.points.map(([title, detail]) => node("div", {}, node("dt", {}, title), node("dd", {}, detail)));
  const body = node("article", { class: "slide" },
    node("p", { class: "eyebrow" }, current.stage + "　" + cue(elapsed) + "–" + cue(elapsed + current.seconds)),
    node("h1", { tabindex: -1 }, current.title), node("p", { class: "slide-lead" }, current.lead),
    page === 1 ? image(deck.cover, "deck-cover") : null, drawing(current.figure), node("dl", { class: "points" }, points),
    node("div", { class: "slide-foot" }, node("span", {}, page + " / " + deck.slides.length),
      node("progress", { value: page, max: deck.slides.length, "aria-label": "簡報進度" })));
  screen.replaceChildren(node("div", { class: "deck-head" }, node("a", { href: "#home" }, "返回會議資料館"),
    node("p", { class: "muted" }, deck.title)), body, node("div", { class: "deck-controls" },
    step("上一頁", page - 1), node("label", { for: "jump" }, "跳至頁面", jump), step("下一頁", page + 1), noteButton),
    notes, sources(deck, current));
}

function resolveSlide() {
  const match = location.hash.match(/^#deck\/([a-z0-9-]+)\/(\d+)$/);
  const deck = match && decks.find((item) => item.id === match[1]);
  return deck ? { deck, page: Math.max(1, Math.min(Number(match[2]), deck.slides.length)) } : null;
}

function render(focus) {
  const selection = resolveSlide();
  if (selection) presentation(selection.deck, selection.page);
  else home();
  if (focus) screen.querySelector("h1")?.focus();
}

try {
  const response = await fetch("./decks.json?v=1");
  if (!response.ok) throw new Error("簡報讀取失敗");
  const data = await response.json();
  decks = data.sort((a, b) => b.date.localeCompare(a.date)).map((deck) => ({
    ...deck, tags: [...deck.tags, deck.date, ...deck.sources.map((item) => item.label)],
    slides: deck.slides.map((slide) => ({ ...slide, text: [slide.title, slide.lead, ...slide.points.flat(), slide.notes].join(" ") })),
  }));
  render(false);
  window.addEventListener("hashchange", () => { if (location.hash !== "#main") render(true); });
  document.addEventListener("keydown", (event) => {
    if (!["ArrowLeft", "ArrowRight"].includes(event.key) || event.altKey || event.ctrlKey || event.metaKey ||
      event.target instanceof Element && event.target.closest("input, select, textarea, button, a")) return;
    const selection = resolveSlide();
    if (!selection) return;
    const next = selection.page + (event.key === "ArrowRight" ? 1 : -1);
    if (next >= 1 && next <= selection.deck.slides.length) location.hash = route(selection.deck.id, next);
  });
} catch {
  screen.replaceChildren(node("p", { class: "empty", role: "alert" }, "暫時無法載入會議簡報。請重新整理頁面。"));
}
