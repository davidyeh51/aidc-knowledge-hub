import { audiences as libraryAudiences, findDecks } from "./search.js?v=3";

const policyMeetings = document.body.hasAttribute("data-policy-meetings");
const audiences = policyMeetings ? { personal: "自己", team: "團隊成員" } : libraryAudiences;
const assets = policyMeetings ? "../assets/" : "./assets/";
const api = "https://cowljafosekwvxithwjd.supabase.co/functions/v1/" +
  (policyMeetings ? "aidc-policy-meetings" : "aidc-knowledge-hub");
const gate = document.querySelector("#gate");
const screen = document.querySelector("#screen");
const nav = document.querySelector("#nav");
const loginForm = document.querySelector("#login");
const loginInput = document.querySelector("#access-key");
const loginMessage = document.querySelector("#login-message");
const state = { key: "", member: null, decks: [], query: "", audience: "", kind: "", notes: false };
let navigation = 0;

function el(tag, attributes = {}, ...children) {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attributes)) {
    if (name.startsWith("on")) node.addEventListener(name.slice(2), value);
    else if (name === "value") node.value = value;
    else if (value !== false && value != null) node.setAttribute(name, value === true ? "" : value);
  }
  for (const child of children.flat(Infinity)) {
    if (child != null) node.append(child instanceof Node ? child : String(child));
  }
  return node;
}

const btn = (label, handler, extra = {}) => el("button", { type: "button", class: "button", onclick: handler, ...extra }, label);
const dateTime = (value) => new Intl.DateTimeFormat("zh-TW", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Taipei" }).format(new Date(value));
const kindNames = { policy: "政策法規", article: "產業剪藏", book: "書籍", report: "研究報告" };
const route = (id, page = 1) => `#deck/${id}/${page}`;
function art(name, cls = "") {
  const slug = typeof name === "string" && /^[a-z0-9-]{1,64}$/.test(name) ? name : "book";
  const picture = el("img", { class: cls, src: `${assets}${slug}.svg`, alt: "", width: 640, height: 360 });
  if (slug !== "book") {
    picture.addEventListener("error", () => { picture.src = `${assets}book.svg`; }, { once: true });
  }
  return picture;
}

async function call(action, data = {}, key = state.key) {
  const response = await fetch(api, {
    method: "POST", cache: "no-store", credentials: "omit", signal: AbortSignal.timeout(15000),
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ ...data, action }),
  });
  if (!response.ok) throw Object.assign(new Error("Request failed"), { status: response.status });
  return response.json();
}

function clearSession(message = "金鑰自簽發起有效 60 天。") {
  navigation += 1;
  Object.assign(state, { key: "", member: null, decks: [], query: "", audience: "", kind: "", notes: false });
  screen.replaceChildren();
  screen.hidden = true;
  nav.hidden = true;
  document.querySelector("#validity").textContent = "存取金鑰有效期：60 天";
  gate.hidden = false;
  loginInput.value = "";
  loginMessage.textContent = message;
  loginInput.focus();
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const submit = loginForm.querySelector("button");
  const key = loginInput.value.trim();
  submit.disabled = true;
  loginMessage.textContent = "正在驗證金鑰";
  try {
    const { member, decks } = await call("catalog", {}, key);
    Object.assign(state, { key, member, decks });
    loginInput.value = "";
    gate.hidden = true;
    nav.hidden = false;
    document.querySelector("#validity").textContent = "金鑰到期（台北）：" + dateTime(member.expires_at);
    screen.hidden = false;
    document.querySelector("#admin-nav").hidden = member.role !== "admin";
    render();
  } catch (error) {
    loginMessage.textContent = error.status === 401 ? "金鑰無效、已撤銷或已到期。請向管理員取得新金鑰。" : "暫時無法連線，請稍後重試。";
  } finally { submit.disabled = false; }
});
document.querySelector("#logout").addEventListener("click", () => { location.hash = "home"; clearSession("已登出。"); });

async function checkSession() {
  if (!state.key) return;
  const key = state.key;
  if (new Date(state.member.expires_at).getTime() <= Date.now()) {
    clearSession("金鑰已到期。請使用新金鑰登入。");
    return;
  }
  try { await call("session", {}, key); }
  catch (error) {
    if (state.key === key && error.status === 401) clearSession("金鑰已失效。請使用新金鑰登入。");
  }
}
setInterval(checkSession, 60_000);
window.addEventListener("focus", checkSession);
window.addEventListener("hashchange", render);

const collections = {
  policies: { kind: "policy", label: "6.X.2 政策法規", title: "AIDC 政策法規",
    intro: "查找選址與供電、能源與建築、BOO 及資金法規。逐頁查閱官方來源與決策問題。" },
  books: { kind: "book", label: "專題閱讀", title: "AIDC 書籍",
    intro: "已收錄的書籍簡報可依書名、作者或主題搜尋，並在各頁回查出處。" },
};

function meetingHome() {
  const catalog = el("div", { class: "meeting-list" });
  const count = el("p", { class: "result-count muted", role: "status" });
  const ordered = [...state.decks].sort((a, b) => b.date.localeCompare(a.date));
  const search = el("input", { type: "search", id: "meeting-query", maxlength: 120,
    placeholder: "例如 促參法、共址、供電、投資抵減", value: state.query,
    oninput: (event) => { state.query = event.target.value; refresh(); } });
  function refresh() {
    const matches = findDecks(ordered, state.query);
    count.textContent = `顯示 ${matches.length} 場會議，共收錄 ${ordered.length} 場`;
    const cards = matches.map(({ deck, matchPage }) => {
      const page = Math.max(1, matchPage + 1);
      const action = matchPage < 0 ? "開啟簡報" : `第 ${page} 頁　${deck.slides[matchPage].title}`;
      const description = el("div", { class: "card-body" },
        el("p", { class: "card-meta" }, el("time", { datetime: deck.date }, deck.date), "　10 分鐘"),
        el("h2", {}, deck.title), el("p", {}, deck.summary),
        el("span", { class: "card-action" }, action));
      return el("article", { class: "card" },
        el("a", { class: "card-link", href: route(deck.id, page) }, art(deck.cover), description));
    });
    catalog.replaceChildren(...cards);
    if (!matches.length) catalog.append(el("p", { class: "empty" }, "找不到符合的會議。請試試其他關鍵字。"));
  }
  screen.replaceChildren(
    el("div", { class: "page-heading" }, el("p", { class: "eyebrow" }, "內部會議資料"),
      el("h1", { tabindex: "-1" }, "政策法規會議簡報"),
      el("p", { class: "intro" }, "按日期回顧會議。搜尋摘要、簡報內容或講稿，直接開啟最符合的頁次。")),
    el("div", { class: "filters meeting-search" }, el("label", { for: "meeting-query" }, "搜尋會議", search)),
    count, catalog);
  refresh();
}

function home(collection) {
  if (policyMeetings) { meetingHome(); return; }
  let results;
  const catalog = el("div", { class: "register", id: "results" });
  const count = el("p", { class: "muted result-count", role: "status" });
  const refresh = () => {
    const kind = collection?.kind ?? state.kind;
    const ordered = [...state.decks].sort((a, b) => b.date.localeCompare(a.date));
    results = findDecks(ordered, state.query, state.audience, kind);
    count.textContent = `找到 ${results.length} 套簡報`;
    catalog.replaceChildren();
    if (results.length) catalog.append(el("table", {"aria-label":"簡報清單"},
      el("thead", {}, el("tr", {}, ["簡報主題", "類型", "資料日期", "頁數"].map(t => el("th", {scope:"col"}, t)))),
      el("tbody", {}, results.map(({deck, matchPage}) => el("tr", {},
        el("td", {}, el("a", {href:route(deck.id, matchPage + 1 || 1)}, deck.title),
          el("small", {}, matchPage >= 0 ? `第 ${matchPage+1} 頁 · ${deck.slides[matchPage].title}` : deck.summary)),
        el("td", {}, kindNames[deck.kind] || deck.kind), el("td", {}, deck.date), el("td", {}, deck.slides.length))))));
    if (!results.length) catalog.append(el("div", { class: "empty" },
      kind === "book" && !state.decks.some((deck) => deck.kind === "book")
        ? el("div", { class: "book-empty" }, art("book-collection"), el("p", {}, "目前尚未收錄書籍。"))
        : el("p", {}, "找不到符合的簡報。可試試「BOO」「PUE」或「投資抵減」。")));
  };
  const search = el("input", { id: "query", type: "search", maxlength: 120, placeholder: "例如 BOO、PUE、投資抵減", value: state.query,
    oninput: (e) => { state.query = e.target.value; refresh(); } });
  const select = (id, selected, labels, all, setter) => {
    const node = el("select", { id, onchange: (e) => { setter(e.target.value); refresh(); } },
      el("option", { value: "" }, all),
      Object.entries(labels).map(([value, label]) => el("option", { value }, label)));
    node.value = selected;
    return node;
  };
  screen.replaceChildren(
    el("div", { class: "page-heading" }, el("p", { class: "eyebrow" }, collection?.label ?? "台灣算力基礎設施"),
      el("h1", { tabindex: "-1" }, collection?.title ?? "AIDC 資料館"),
      el("p", { class: "intro" }, collection?.intro ??
        "搜尋簡報與逐頁講稿，掌握台灣 AIDC 的政策、同業發展、供電條件與專案進度。")),
    !collection ? el("div", {class:"metrics"}, [
      [state.decks.length,"收錄簡報（套）"], [state.decks.reduce((sum,d)=>sum+d.slides.length,0),"簡報總頁數"],
      [state.decks.filter(d=>d.kind==="policy").length,"政策法規（套）"], [state.decks.filter(d=>d.kind==="book").length,"書籍簡報（套）"]
    ].map(([n,label])=>el("div",{},el("strong",{},n),el("span",{},label)))) : null,
    el("h2", {class:"list-heading"}, "簡報清單"),
    el("div", { class: collection ? "filters collection-filters" : "filters" },
      el("label", { for: "query" }, "關鍵字", search),
      el("label", { for: "audience" }, "閱讀對象", select("audience", state.audience, audiences, "所有對象", (v) => { state.audience = v; })),
      !collection ? el("label", { for: "kind" }, "資料類型", select("kind", state.kind, kindNames, "所有類型", (v) => { state.kind = v; })) : null
    ),
    count, catalog);
  refresh();
}

function sourceLinks(deck, refs) {
  return el("ul", { class: "sources" }, refs.map((index) => {
    const source = deck.sources[index];
    if (!source) return null;
    if (!source.url && policyMeetings) return el("li", {}, source.label, source.date ? `（${source.date}）` : "");
    let link;
    try { link = new URL(source.url); } catch { return null; }
    if (link.protocol !== "https:") return null;
    return el("li", {}, el("a", { href: link.href, target: "_blank", rel: "noopener noreferrer" }, source.label), ` · ${source.date}`);
  }));
}

function evidenceFigure(figure) {
  if (!figure || typeof figure.svg !== "string" || !figure.svg.startsWith("<svg ")) return null;
  return el("figure", { class: "evidence-figure" },
    el("img", { src: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(figure.svg)}`, alt: figure.alt }),
    el("figcaption", {}, figure.caption));
}

function deckPage(deck, page) {
  const index = Math.max(0, Math.min(deck.slides.length - 1, page - 1));
  const slide = deck.slides[index];
  const elapsed = deck.slides.slice(0, index).reduce((n, s) => n + s.seconds, 0);
  const cue = (n) => `${Math.floor(n / 60)}:${String(n % 60).padStart(2, "0")}`;
  const notes = el("section", { class: "notes", id: "speaker", hidden: !state.notes },
    el("h3", {}, "講者備註"), el("p", {}, slide.notes));
  const noteButton = btn(state.notes ? "關閉講稿" : "開啟講稿", () => {
    state.notes = !state.notes;
    notes.hidden = !state.notes;
    noteButton.textContent = state.notes ? "關閉講稿" : "開啟講稿";
    noteButton.setAttribute("aria-expanded", String(state.notes));
  }, { "aria-expanded": String(state.notes), "aria-controls": "speaker" });
  const jump = el("select", { id: "jump", onchange: (e) => { location.hash = route(deck.id, Number(e.target.value)); } },
    deck.slides.map((s, i) => el("option", { value: i + 1 }, `${i + 1}　${s.title}`)));
  jump.value = String(index + 1);
  screen.replaceChildren(
    el("div", { class: "deck-head" }, el("a", { href: deck.kind === "policy" ? "#policies" : deck.kind === "book" ? "#books" : "#home" },
      deck.kind === "policy" ? "返回政策法規" : deck.kind === "book" ? "返回書籍" : "返回資料館"), el("p", { class: "muted" }, deck.title)),
    el("article", { class: "slide" },
      el("p", { class: "eyebrow" }, `${slide.stage}　${cue(elapsed)}–${cue(elapsed + slide.seconds)}`),
      el("h1", { tabindex: "-1" }, slide.title), el("p", { class: "slide-lead" }, slide.lead),
      index === 0 ? art(deck.cover, "deck-cover") : null,
      evidenceFigure(slide.figure),
      el("dl", { class: "points" }, slide.points.map(([name, description]) =>
        el("div", {}, el("dt", {}, name), el("dd", {}, description)))),
      el("div", { class: "slide-foot" }, el("span", {}, `${index + 1} / ${deck.slides.length}`),
        el("progress", { value: index + 1, max: deck.slides.length, "aria-label": "簡報進度" })),
    ),
    el("div", { class: "deck-controls" },
      btn("上一頁", () => { location.hash = route(deck.id, index); }, { disabled: index === 0 }),
      el("label", { for: "jump" }, "跳至頁面", jump),
      btn("下一頁", () => { location.hash = route(deck.id, index + 2); }, { disabled: index === deck.slides.length - 1 }),
      noteButton),
    notes,
    el("details", { class: "source-box", open: true }, el("summary", {}, "本頁來源"), sourceLinks(deck, slide.refs))
  );
}

function showError(message) {
  screen.replaceChildren(el("div", { class: "empty", role: "status" }, message, " ", el("a", { href: "#home" }, "返回資料館")));
}

async function keysPage(ticket) {
  const { keys } = await call("keys.list");
  if (ticket !== navigation || !state.key) return;
  const feedback = el("p", { class: "message", role: "status" });
  const receipt = el("div", { class: "receipt", hidden: true });
  const list = el("div", { class: "key-list" });
  const label = el("input", { id: "key-label", maxlength: 80, required: true, placeholder: policyMeetings ? "例如 專案團隊成員" : "例如 投資評估小組" });
  const audience = el("select", { id: "key-audience" }, Object.entries(audiences).map(([value, text]) => el("option", { value }, text)));
  const role = el("select", { id: "key-role" }, el("option", { value: "reader" }, "閱讀者"), el("option", { value: "admin" }, "管理員"));
  function listKeys(items) {
    list.replaceChildren(...items.map((key) => {
      const current = key.id === state.member.id;
      const status = key.revoked_at ? "已撤銷" : new Date(key.expires_at) <= new Date() ? "已到期" : "有效";
      return el("div", { class: "key-row" },
        el("div", {}, el("strong", {}, key.label, current ? "（目前使用）" : ""),
          el("p", { class: "muted" }, `${audiences[key.audience]} · ${key.role === "admin" ? "管理員" : "閱讀者"} · ${status} · 到期 ${dateTime(key.expires_at)}`)),
        key.revoked_at ? null : el("div", { class: "row-actions" },
          btn("換發", () => change("rotate", { id: key.id }, key.label)),
          !current && btn("撤銷", () => change("revoke", { id: key.id }, key.label)) || null));
    }));
  }
  async function change(operation, data, name = "") {
    if (operation !== "issue" && !window.confirm(`確定${operation === "rotate" ? "換發" : "撤銷"}「${name}」金鑰？現行金鑰將立即失效。`)) return;
    feedback.textContent = "正在處理";
    receipt.replaceChildren();
    receipt.hidden = true;
    const controls = [...screen.querySelectorAll("button, input, select")];
    controls.forEach((control) => { control.disabled = true; });
    try {
      const result = await call(`keys.${operation}`, data);
      if (ticket !== navigation) {
        if (result.self) clearSession("目前使用的金鑰已換發。");
        return;
      }
      if (result.key) {
        const field = el("input", { type: "text", readonly: true, autocomplete: "off", value: result.key, "aria-label": "新金鑰" });
        receipt.replaceChildren(el("strong", {}, "新金鑰僅顯示這一次"), el("div", { class: "login-row" }, field,
          btn("複製", async () => {
            try { await navigator.clipboard.writeText(field.value); feedback.textContent = "已複製新金鑰。"; }
            catch { field.select(); feedback.textContent = "請手動複製已選取的金鑰。"; }
          })), btn("清除顯示", () => { receipt.replaceChildren(); receipt.hidden = true; }));
        receipt.hidden = false;
      }
      if (result.self && result.key) {
        state.key = result.key;
        const { member } = await call("session");
        state.member = member;
      }
      if (operation === "issue") label.value = "";
      feedback.textContent = operation === "revoke" ? "金鑰已撤銷。" : "金鑰已簽發，效期 60 天。";
      const next = await call("keys.list");
      if (ticket === navigation) listKeys(next.keys);
    } catch (error) {
      if (ticket !== navigation) return;
      if (error.status === 401) clearSession("金鑰已失效。請使用新金鑰登入。");
      else feedback.textContent = "操作尚未確認，請重新開啟清單查看狀態。";
    } finally { controls.forEach((control) => { control.disabled = false; }); }
  }
  const form = el("form", { class: "filters key-form", onsubmit: (e) => {
    e.preventDefault();
    change("issue", { label: label.value, audience: audience.value, role: role.value });
  } }, el("label", { for: "key-label" }, "金鑰名稱", label),
    el("label", { for: "key-audience" }, "使用對象", audience),
    el("label", { for: "key-role" }, "權限", role),
    el("button", { type: "submit", class: "button primary" }, "簽發金鑰"));
  screen.replaceChildren(
    el("div", { class: "page-heading" }, el("h1", { tabindex: "-1" }, "金鑰管理"),
      el("p", { class: "intro" }, "每把金鑰自簽發起有效 60 天。換發後，舊金鑰立即失效。"),
      el("p", { class: "muted" }, "目前所有閱讀者可看見相同內容。使用對象用於識別與管理。")),
    form, feedback, receipt, el("h2", {}, "金鑰清單"), list);
  listKeys(keys);
}

async function render() {
  if (!state.key) return;
  const ticket = ++navigation;
  const currentKey = state.key;
  const path = location.hash.slice(1);
  for (const a of nav.querySelectorAll("a")) {
    if (a.hash === "#" + (path.startsWith("deck/") || !path ? "home" : path)) a.setAttribute("aria-current","page");
    else a.removeAttribute("aria-current");
  }
  try {
    if (path === "keys") {
      if (state.member.role !== "admin") { showError("此頁僅限管理員。"); return; }
      screen.replaceChildren(el("p", { class: "empty", role: "status" }, "載入金鑰清單"));
      await keysPage(ticket);
    } else {
      const match = path.match(/^deck\/([a-z0-9-]{3,64})(?:\/(\d+))?$/);
      if (match) {
        screen.replaceChildren(el("p", { class: "empty", role: "status" }, "載入簡報"));
        const { deck } = await call("deck", { id: match[1] });
        if (ticket !== navigation) return;
        deckPage(deck, Number(match[2]) || 1);
      } else home(Object.hasOwn(collections, path) ? collections[path] : undefined);
    }
    if (ticket === navigation) screen.querySelector("h1")?.focus();
  } catch (error) {
    if (ticket !== navigation || state.key !== currentKey) return;
    if (error.status === 401) clearSession("金鑰已失效。請使用新金鑰登入。");
    else showError(error.status === 404 ? "找不到這套簡報。" : "暫時無法載入。");
  }
}

document.addEventListener("keydown", (event) => {
  if (!state.key || !["ArrowLeft", "ArrowRight"].includes(event.key) || event.altKey || event.ctrlKey ||
      event.metaKey || event.target.closest("input, select, textarea, button, a")) return;
  const match = location.hash.match(/^#deck\/([a-z0-9-]+)\/(\d+)$/);
  if (!match) return;
  const deck = state.decks.find((item) => item.id === match[1]);
  const page = Number(match[2]) + (event.key === "ArrowRight" ? 1 : -1);
  if (deck && page >= 1 && page <= deck.slides.length) location.hash = route(deck.id, page);
});
