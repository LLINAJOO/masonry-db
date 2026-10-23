// Страница «База данных»: вкладки «Обзор» и «Каталог» + общая таблица «Все записи».
// Таблица — единый источник: её поиск, сортировка и фильтры определяют и список записей,
// и линии на графике «Обзор».
import { $, esc, shell, toast, addFullscreen } from "./common.js";
import { COLS, GROUPS, show, load } from "./data.js";
import { mountRecord, showRecord } from "./record.js";
import { mountParcoords } from "./parcoords.js";
shell("index.html", "База данных");

const state = {
  rows: [],
  id: null,
  page: location.hash === "#overview" ? "overview" : "catalog",
  q: "",
  sort: null, // { k, dir: 1 | -1 }
  filters: {}, // k → { ex: Set } | { min, max } | { text }
  showFilters: false,
  hidden: new Set(COLS.filter((c) => c.off).map((c) => c.k)),
};
const ALL = { k: "no", label: "№", type: "num", get: (r) => [r.no] };
const colOf = (k) => (k === "no" ? ALL : COLS.find((c) => c.k === k));
const cur = () => state.rows.find((r) => r.id === state.id);
let overview = null;

// ---------- значения столбцов ----------
const EMPTY = "—";
const vals = (c, r) => c.get(r);
const distinct = (c) => {
  const set = new Set();
  let empty = false;
  for (const r of state.rows) {
    const v = vals(c, r);
    if (!v.length) empty = true;
    v.forEach((x) => set.add(String(x)));
  }
  const list = [...set].sort((a, b) => a.localeCompare(b, "ru", { numeric: true }));
  return empty ? [...list, EMPTY] : list;
};
// текстовые столбцы с малым числом значений фильтруются кнопками, остальные — вводом
const chipCols = () => {
  const m = new Map();
  for (const c of COLS) if (c.type === "txt") m.set(c.k, distinct(c));
  return new Map([...m].filter(([, v]) => v.length > 0 && v.length <= 8));
};
let CHIPS = new Map();

function passes(r) {
  const q = state.q.trim().toLowerCase();
  if (
    q &&
    ![String(r.no), ...COLS.map((c) => show(c, r))].some((t) => String(t).toLowerCase().includes(q))
  )
    return false;
  for (const [k, f] of Object.entries(state.filters)) {
    const c = colOf(k),
      v = vals(c, r);
    if (f.ex) {
      if (!(v.length ? v : [EMPTY]).some((x) => !f.ex.has(String(x)))) return false;
    } else if (f.text) {
      if (!v.some((x) => String(x).toLowerCase().includes(f.text.toLowerCase()))) return false;
    } else if (f.min != null || f.max != null) {
      if (!v.some((x) => (f.min == null || x >= f.min) && (f.max == null || x <= f.max)))
        return false;
    }
  }
  return true;
}
function compare(a, b) {
  const { k, dir } = state.sort,
    c = colOf(k),
    va = vals(c, a)[0],
    vb = vals(c, b)[0];
  if (va == null && vb == null) return 0;
  if (va == null) return 1; // пустые всегда внизу
  if (vb == null) return -1;
  return (
    dir *
    (c.type === "num" ? va - vb : String(va).localeCompare(String(vb), "ru", { numeric: true }))
  );
}
const view = () => {
  const list = state.rows.filter(passes);
  return state.sort ? list.sort(compare) : list;
};
const shown = () => COLS.filter((c) => !state.hidden.has(c.k));
const activeFilters = () => Object.keys(state.filters).length + (state.q.trim() ? 1 : 0);

// ---------- таблица ----------
function renderHead() {
  const arrow = (k) => (state.sort?.k === k ? (state.sort.dir > 0 ? "▲" : "▼") : "↕");
  const th = (c) =>
    `<th data-sort="${c.k}" class="${state.sort?.k === c.k ? "sorted" : ""}" title="Сортировать">` +
    `<span>${esc(c.label)}</span><i>${arrow(c.k)}</i></th>`;
  let h = `<tr>${[ALL, ...shown()].map(th).join("")}</tr>`;
  if (state.showFilters) {
    h += `<tr class="frow"><td></td>${shown()
      .map((c) => `<td>${filterCell(c)}</td>`)
      .join("")}</tr>`;
  }
  $("#tbl thead").innerHTML = h;
}
function filterCell(c) {
  const f = state.filters[c.k];
  if (CHIPS.has(c.k))
    return `<div class="fchips">${CHIPS.get(c.k)
      .map(
        (v) =>
          `<button data-fk="${c.k}" data-v="${esc(v)}" class="fchip${f?.ex?.has(v) ? "" : " on"}">${esc(v)}</button>`
      )
      .join("")}</div>`;
  if (c.type === "num")
    return `<div class="frange"><input type="number" data-fk="${c.k}" data-b="min" placeholder="от" value="${f?.min ?? ""}"><input type="number" data-fk="${c.k}" data-b="max" placeholder="до" value="${f?.max ?? ""}"></div>`;
  return `<input type="search" class="ftext" data-fk="${c.k}" data-b="text" placeholder="содержит…" value="${esc(f?.text, "")}">`;
}
function renderBody() {
  const v = view(),
    cols = shown();
  $("#cap").textContent =
    `Показано ${v.length} из ${state.rows.length}` +
    (activeFilters() ? ` — применены фильтры (${activeFilters()})` : "");
  $("#tdl").disabled = !v.length;
  $("#reset").hidden = !activeFilters();
  $("#ftoggle").classList.toggle("on", state.showFilters);
  $("#tbl tbody").innerHTML = v.length
    ? v
        .map(
          (r) =>
            `<tr data-id="${r.id}" class="${r.id === state.id ? "on" : ""}"><td>${r.no}</td>` +
            cols.map((c) => `<td>${esc(show(c, r))}</td>`).join("") +
            `</tr>`
        )
        .join("")
    : `<tr><td colspan="${cols.length + 1}"><div class="empty"><h3>Ничего не нашлось</h3>Измените поиск или сбросьте фильтры.</div></td></tr>`;
  overview?.redraw();
}
function renderTable() {
  renderHead();
  renderBody();
}
function downloadCsv() {
  const cols = shown(),
    q = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const csv = [
    ["№", ...cols.map((c) => c.label)],
    ...view().map((r) => [r.no, ...cols.map((c) => show(c, r))]),
  ]
    .map((l) => l.map(q).join(","))
    .join("\r\n");
  const a = Object.assign(document.createElement("a"), {
    href: URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv" })),
    download: "masonry_database.csv",
  });
  a.click();
  URL.revokeObjectURL(a.href);
}

// ---------- выбор записи и вкладки страницы ----------
function select(id, fromTable) {
  state.id = id;
  showRecord(cur());
  document.querySelectorAll("#tbl tr.on").forEach((t) => t.classList.remove("on"));
  document.querySelector(`#tbl tr[data-id="${id}"]`)?.classList.add("on");
  if (fromTable) {
    document.querySelector(".fsbox.fs")?.fsSet(false);
    if (state.page === "catalog") $("#viewer").scrollIntoView({ block: "start" });
    toast(`Открыта запись №${cur().no}`);
  }
}
function setPage(p) {
  state.page = p;
  history.replaceState(null, "", p === "overview" ? "#overview" : location.pathname);
  document
    .querySelectorAll("#ptabs button")
    .forEach((b) => b.classList.toggle("on", b.dataset.p === p));
  $("#pcat").hidden = p !== "catalog";
  $("#pov").hidden = p !== "overview";
  if (p === "overview") overview.redraw();
}

async function init() {
  const main = $("#main");
  try {
    state.rows = await load();
  } catch (e) {
    main.innerHTML =
      `<div class="note">Не удалось загрузить данные: ${esc(e.message)}` +
      `<br>Проверьте js/config.js и политики доступа в Supabase.</div>`;
    return;
  }
  if (!state.rows.length) {
    main.innerHTML = `<div class="empty"><h3>Записей пока нет</h3>Здесь появятся одобренные эксперименты. <a href="add.html">Добавить эксперимент</a></div>`;
    return;
  }
  CHIPS = chipCols();
  state.id = state.rows[0].id;
  main.innerHTML =
    `<div class="ptabs" id="ptabs"><button data-p="overview">Обзор</button><button data-p="catalog">Каталог</button></div>` +
    `<div id="pcat"></div><div id="pov" hidden></div>` +
    `<h3 class="sec">Все записи</h3>` +
    `<p class="hint">Нажмите на строку, чтобы открыть запись. Сортировка — по заголовку столбца, фильтры — кнопка «Фильтры». Те же записи показаны на графике во вкладке «Обзор».</p>` +
    `<div id="tblbox"><div class="bar"><input id="q" type="search" placeholder="Поиск по всем столбцам…">` +
    `<button id="ftoggle" class="btn" title="Показать или скрыть фильтры под заголовками">Фильтры</button>` +
    `<button id="reset" class="btn" hidden>Сбросить</button>` +
    `<details class="pop"><summary>Столбцы</summary><div class="menu">${GROUPS.map(
      (g) =>
        `<b>${g}</b>` +
        COLS.filter((c) => c.group === g)
          .map(
            (c) =>
              `<label><input type="checkbox" data-c="${c.k}"${state.hidden.has(c.k) ? "" : " checked"}> ${esc(c.label)}</label>`
          )
          .join("")
    ).join("")}</div></details><button id="tdl" class="btn">Скачать CSV</button></div>` +
    `<p id="cap" class="hint"></p><div class="tw"><table id="tbl"><thead></thead><tbody></tbody></table></div></div>`;

  mountRecord($("#pcat"));
  overview = mountParcoords($("#pov"), {
    all: () => state.rows,
    visible: view,
    columns: COLS,
  });
  addFullscreen($("#tblbox"));

  $("#ptabs").onclick = (e) => {
    const b = e.target.closest("[data-p]");
    if (b) setPage(b.dataset.p);
  };
  $("#q").oninput = (e) => {
    state.q = e.target.value;
    renderBody();
  };
  $("#ftoggle").onclick = () => {
    state.showFilters = !state.showFilters;
    renderTable();
  };
  $("#reset").onclick = () => {
    state.filters = {};
    state.q = "";
    $("#q").value = "";
    renderTable();
  };
  document.querySelectorAll("[data-c]").forEach(
    (c) =>
      (c.onchange = () => {
        c.checked ? state.hidden.delete(c.dataset.c) : state.hidden.add(c.dataset.c);
        renderTable();
      })
  );
  // заголовок: сортировка по кругу «по возрастанию → по убыванию → без сортировки»
  $("#tbl thead").onclick = (e) => {
    const chip = e.target.closest(".fchip");
    if (chip) {
      const k = chip.dataset.fk,
        f = (state.filters[k] ??= { ex: new Set() });
      const v = chip.dataset.v;
      f.ex.has(v) ? f.ex.delete(v) : f.ex.add(v);
      chip.classList.toggle("on", !f.ex.has(v));
      if (!f.ex.size) delete state.filters[k];
      renderBody();
      return;
    }
    const th = e.target.closest("th[data-sort]");
    if (!th) return;
    const k = th.dataset.sort;
    state.sort =
      !state.sort || state.sort.k !== k
        ? { k, dir: 1 }
        : state.sort.dir > 0
          ? { k, dir: -1 }
          : null;
    renderTable();
  };
  $("#tbl thead").oninput = (e) => {
    const i = e.target.closest("input[data-fk]");
    if (!i) return;
    const k = i.dataset.fk,
      b = i.dataset.b,
      f = (state.filters[k] ??= {});
    f[b] = b === "text" ? i.value.trim() : i.value === "" ? null : +i.value;
    if (b === "text" ? !f.text : f.min == null && f.max == null) delete state.filters[k];
    renderBody();
  };
  $("#tbl tbody").onclick = (e) => {
    const tr = e.target.closest("tr[data-id]");
    if (tr) select(+tr.dataset.id, true);
  };
  $("#tdl").onclick = downloadCsv;

  showRecord(cur());
  renderTable();
  setPage(state.page);
}
init();
