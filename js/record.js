// Карточка выбранной записи: вкладки «Кладка / Кирпич / Раствор / Фото кладки / Схема испытания»,
// график F–Δ, таблица испытаний, скачивание кривых и фото, сведения об источнике (из .bib).
import {
  sb,
  $,
  esc,
  toast,
  parseCurve,
  isDark,
  addFullscreen,
  plotHeight,
  watchResize,
  openLightbox,
} from "./common.js";
import { COLS, show } from "./data.js";
import { makeZip, dataUrlBytes } from "./zip.js";
import { sourceFromPaper } from "./bib.js";

const KINDS = {
  masonry: { p: "m", name: "Кладка", of: "кладки", color: "var(--blue)" },
  brick: { p: "b", name: "Кирпич", of: "кирпича", color: "#c4573a" },
  mortar: { p: "r", name: "Раствор", of: "раствора", color: "var(--wait)" },
};
const TABS = [
  ["plot", "График F–Δ"],
  ["photo", "Фото кладки"],
  ["scheme", "Схема испытания"],
];
// какие столбцы показывать в карточке объекта
const FIELDS = {
  masonry: [
    ["Тип", (r) => (r.mdesc ? `${r.mtype} — ${r.mdesc}` : r.mtype)],
    ["Толщина шва", (r) => r.joint, "мм"],
  ],
  brick: [
    ["Тип", (r) => r.btype],
    ["Плотность", (r) => r.bdens, "кг/м³"],
    ["Пустотность", (r) => r.void, "%"],
    ["Удельный периметр", (r) => r.perim, "1/мм"],
  ],
  mortar: [
    ["Плотность", (r) => r.mdens, "кг/м³"],
    ["Модуль упругости E", (r) => r.mE, "МПа"],
    ["Предельная деформация", (r) => r.mstrain],
    ["Предельное напряжение", (r) => r.mstress],
  ],
};

let row = null,
  tab = "plot",
  sub = "masonry", // какой объект показан на графике: masonry / brick / mortar
  token = 0,
  dlAction = null;
const cache = new Map(),
  imgCache = new Map();

// ---------- запросы ----------
function testsOf(kind, id) {
  const k = kind + id;
  if (!cache.has(k))
    cache.set(
      k,
      sb
        .from(kind + "_test")
        .select(
          `id,stress_state,orientation,standard(title),${kind}_test_result(curve_filename,curve_content)`
        )
        .eq(kind + "_id", id)
        .then((r) => {
          if (r.error) throw r.error;
          return r.data || [];
        })
    );
  return cache.get(k);
}
const objId = (kind) => (kind === "masonry" ? row.id : row[kind + "_id"]);
// все кривые объекта: { name, label, content, x, y }
async function curvesOf(kind) {
  const id = objId(kind);
  if (!id) return null;
  const out = [];
  for (const t of await testsOf(kind, id))
    for (const res of t[kind + "_test_result"] || []) {
      const c = parseCurve(res.curve_content);
      if (!c) continue;
      const name = res.curve_filename || `Испытание ${out.length + 1}`;
      out.push({
        ...c,
        name,
        content: res.curve_content,
        label: `${name}, ${t.standard?.title || "—"}, σ = ${t.stress_state ?? ""}, α = ${t.orientation ?? ""}°`,
      });
    }
  return out;
}
function imagesOf(id) {
  if (!imgCache.has(id))
    imgCache.set(
      id,
      sb
        .from("masonry_image")
        .select("id,kind,filename,data")
        .eq("masonry_id", id)
        .order("id")
        .then((r) => {
          if (r.error) throw r.error;
          return r.data || [];
        })
    );
  return imgCache.get(id);
}

// ---------- скачивание ----------
const safe = (s) => String(s).replace(/[\\/:*?"<>|]+/g, "_");
function save(name, blob) {
  const a = Object.assign(document.createElement("a"), {
    href: URL.createObjectURL(blob),
    download: name,
  });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
const csvBlob = (text) => new Blob(["﻿" + text], { type: "text/csv" });
const q = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
const toCsv = (lines) => lines.map((l) => l.map(q).join(",")).join("\r\n");
const jpgName = (f, i) => safe((f || `image_${i + 1}`).replace(/\.[^.]+$/, "")) + ".jpg";

function paramsCsv() {
  return toCsv([
    ["Параметр", "Значение"],
    ...COLS.filter((c) => !c.k.includes("t_")).map((c) => [c.label, show(c, row)]),
  ]);
}
function testsCsv() {
  const head = [
    "Объект",
    "Стандарт",
    "σ",
    "α, °",
    "Размер, м",
    "E, МПа",
    "Пред. перемещение, мм",
    "Пред. сила, Н",
    "Работа разрушения, Н·мм",
    "Файл кривой",
  ];
  const lines = [head];
  for (const [kind, k] of Object.entries(KINDS))
    for (const t of row.t[k.p])
      lines.push([k.name, t.std, t.sig, t.alp, t.size, t.E, t.du, t.fu, t.w, t.curve]);
  return toCsv(lines);
}
function sourceText() {
  return sourceFromPaper(row.paper);
}
async function downloadCurves(kind) {
  const list = (await curvesOf(kind)) || [];
  if (!list.length) return toast("Для этого объекта нет кривых");
  if (list.length === 1)
    return save(safe(list[0].name).replace(/(\.csv)?$/i, ".csv"), csvBlob(list[0].content));
  const used = new Set();
  save(
    `record_${row.no}_${kind}_curves.zip`,
    makeZip(
      list.map((c, i) => {
        let n = safe(c.name).replace(/(\.csv)?$/i, ".csv");
        if (used.has(n)) n = `${i + 1}_${n}`;
        used.add(n);
        return { name: n, data: c.content };
      })
    )
  );
}
async function downloadImages(kind) {
  const list = (await imagesOf(row.id)).filter((i) => i.kind === kind);
  if (!list.length) return toast("Изображений нет");
  if (list.length === 1)
    return save(
      jpgName(list[0].filename, 0),
      new Blob([dataUrlBytes(list[0].data)], { type: "image/jpeg" })
    );
  save(
    `record_${row.no}_${kind === "masonry" ? "photos" : "schemes"}.zip`,
    makeZip(
      list.map((i, n) => ({
        name: `${n + 1}_${jpgName(i.filename, n)}`,
        data: dataUrlBytes(i.data),
      }))
    )
  );
}
async function downloadAll() {
  const btn = $("#dlall");
  btn.disabled = true;
  try {
    const dir = `запись_${row.no}/`,
      files = [
        { name: dir + "параметры.csv", data: paramsCsv() },
        { name: dir + "испытания.csv", data: testsCsv() },
        { name: dir + "источник.txt", data: sourceText() },
      ];
    for (const kind of Object.keys(KINDS)) {
      const used = new Set();
      for (const [i, c] of ((await curvesOf(kind)) || []).entries()) {
        let n = `${dir}кривые/${KINDS[kind].name.toLowerCase()}_${safe(c.name).replace(/(\.csv)?$/i, ".csv")}`;
        if (used.has(n)) n = n.replace("кривые/", `кривые/${i + 1}_`);
        used.add(n);
        files.push({ name: n, data: c.content });
      }
    }
    for (const [n, im] of (await imagesOf(row.id)).entries())
      files.push({
        name: `${dir}${im.kind === "masonry" ? "фото_кладки" : "схемы_испытания"}/${n + 1}_${jpgName(im.filename, n)}`,
        data: dataUrlBytes(im.data),
      });
    save(`record_${row.no}.zip`, makeZip(files));
  } catch (e) {
    toast("Не удалось собрать архив: " + e.message);
  }
  btn.disabled = false;
}

// ---------- отрисовка ----------
const kv = (kind) =>
  `<div class="kv" style="--c:${KINDS[kind].color}"><h4>${KINDS[kind].name}</h4><dl>${FIELDS[kind]
    .map(([k, f, u]) => {
      const v = f(row);
      return `<dt>${k}</dt><dd>${esc(v)}${u && v != null ? `<i>${u}</i>` : ""}</dd>`;
    })
    .join("")}</dl></div>`;

function testsTable(kind) {
  const list = row.t[KINDS[kind].p];
  if (!list.length) return `<p class="hint">Испытания ${KINDS[kind].of} не добавлены.</p>`;
  const f = (v) => esc(v);
  return (
    `<h4 class="subh">Испытания ${KINDS[kind].of}</h4><div class="tw"><table class="mini"><thead><tr>` +
    `<th>№</th><th>Стандарт</th><th>σ</th><th>α, °</th><th>Размер, м</th><th>E, МПа</th>` +
    `<th>Пред. перемещение, мм</th><th>Пред. сила, Н</th><th>Работа разрушения, Н·мм</th><th>Файл кривой</th>` +
    `</tr></thead><tbody>${list
      .map(
        (t, i) =>
          `<tr><td>${i + 1}</td><td>${f(t.std)}</td><td>${f(t.sig)}</td><td>${f(t.alp)}</td><td>${f(t.size)}</td>` +
          `<td>${f(t.E)}</td><td>${f(t.du)}</td><td>${f(t.fu)}</td><td>${f(t.w)}</td><td>${f(t.curve)}</td></tr>`
      )
      .join("")}</tbody></table></div>`
  );
}

// библиографическая ссылка по ГОСТ, собранная из текста .bib
function sourceBlock() {
  const text = sourceFromPaper(row.paper);
  return `<div class="source"><h4>Источник</h4><p>${text ? esc(text) : "Сведения об источнике не указаны."}</p></div>`;
}

function setDownload(fn, hint, enabled = true) {
  dlAction = fn;
  const b = $("#dl");
  b.disabled = !enabled;
  b.title = hint;
  b.setAttribute("aria-label", hint);
}

async function drawPlot(kind) {
  const my = ++token,
    el = $("#plot");
  try {
    Plotly.purge(el);
  } catch {}
  el.innerHTML = `<div class="note">Загрузка кривых…</div>`;
  let cv;
  try {
    cv = await curvesOf(kind);
  } catch (e) {
    cache.delete(kind + objId(kind));
    if (my === token)
      el.innerHTML = `<div class="note">Не удалось загрузить кривые: ${esc(e.message)}</div>`;
    return;
  }
  if (my !== token) return;
  const n = cv?.length || 0;
  if (kind === sub && tab === "plot")
    setDownload(
      () => downloadCurves(kind),
      n > 1 ? `Скачать кривые (${n} шт., архивом)` : "Скачать кривую (CSV)",
      n > 0
    );
  if (!cv) {
    el.innerHTML = `<div class="note">Для этой записи ${kind === "brick" ? "кирпич" : "раствор"} не указан.</div>`;
    return;
  }
  if (typeof Plotly === "undefined") {
    el.innerHTML = `<div class="note">Не загрузилась библиотека графиков Plotly. Проверьте интернет или блокировщик рекламы.</div>`;
    return;
  }
  const fg = getComputedStyle(document.body).color,
    grid = "rgba(128,128,128,.18)",
    zero = "rgba(128,128,128,.45)",
    colors = isDark()
      ? ["#e0806d", "#4a88d6", "#b8850c", "#a674d4", "#3aa86b"]
      : ["#cc6c5c", "#2f6db5", "#a87700", "#8a4fb0", "#2f8a55"];
  el.innerHTML = "";
  Plotly.newPlot(
    el,
    cv.map((c) => ({
      x: c.x,
      y: c.y,
      type: "scatter",
      mode: "lines",
      line: { width: 2.2, shape: "spline", smoothing: 0.4 },
      name: c.label,
      hovertemplate: `Перемещение: %{x:.2f} мм<br>Сила: %{y:.2f} кН<extra>${esc(c.name)}</extra>`,
    })),
    {
      height: plotHeight(420),
      colorway: colors,
      paper_bgcolor: "rgba(0,0,0,0)",
      plot_bgcolor: "rgba(0,0,0,0)",
      margin: { l: 56, r: 8, t: 8, b: 48 },
      font: { family: "Inter", size: 12, color: fg },
      hovermode: "closest",
      showlegend: n > 0,
      legend: { orientation: "h", y: -0.25, font: { size: 11 } },
      xaxis: { title: "Перемещение, мм", gridcolor: grid, zerolinecolor: zero, visible: n > 0 },
      yaxis: { title: "Сила, кН", gridcolor: grid, zerolinecolor: zero, visible: n > 0 },
      annotations: n
        ? []
        : [
            {
              text: "Для этой записи кривые не загружены",
              xref: "paper",
              yref: "paper",
              x: 0.5,
              y: 0.5,
              showarrow: false,
              font: { size: 14 },
              opacity: 0.6,
            },
          ],
    },
    { responsive: true, displayModeBar: false }
  );
}

async function drawGallery(kind) {
  const el = $("#gal"),
    id = row.id,
    what = kind === "masonry" ? "фото кладки" : "схемы испытания";
  el.innerHTML = `<div class="note">Загрузка изображений…</div>`;
  let list;
  try {
    list = (await imagesOf(id)).filter((i) => i.kind === kind);
  } catch (e) {
    imgCache.delete(id);
    if (id === row.id)
      el.innerHTML = `<div class="note">Не удалось загрузить изображения: ${esc(e.message)}</div>`;
    return;
  }
  if (id !== row.id) return;
  setDownload(
    () => downloadImages(kind),
    list.length > 1 ? `Скачать изображения (${list.length} шт., архивом)` : "Скачать изображение",
    list.length > 0
  );
  el.innerHTML = list.length
    ? `<div class="gallery">${list
        .map(
          (i) =>
            `<figure><button class="thumb" data-img="${i.id}" title="Открыть крупно">` +
            `<img src="${i.data}" alt="${esc(i.filename, what)}" loading="lazy"></button>` +
            `<figcaption>${esc(i.filename)}</figcaption></figure>`
        )
        .join("")}</div>`
    : `<div class="empty"><h3>Изображений нет</h3>Для этой записи ${what} не загружены.</div>`;
  el.onclick = (e) => {
    const b = e.target.closest("[data-img]");
    if (!b) return;
    const im = list.find((x) => x.id === +b.dataset.img);
    openLightbox(im.data, im.filename);
  };
}

function renderTab() {
  token++;
  document
    .querySelectorAll("#vtabs button")
    .forEach((b) => b.classList.toggle("on", b.dataset.t === tab));
  const pane = $("#pane");
  $("#tests").innerHTML = "";
  if (tab === "photo" || tab === "scheme") {
    pane.innerHTML = `<div id="gal"></div>`;
    drawGallery(tab === "photo" ? "masonry" : "scheme");
    return;
  }
  pane.innerHTML = `<div class="seg" id="sub">${Object.entries(KINDS)
    .map(([k, v]) => `<button data-s="${k}" class="${k === sub ? "on" : ""}">${v.name}</button>`)
    .join("")}</div><div id="plotbox"><div id="plot"></div></div>`;
  $("#sub").onclick = (e) => {
    const b = e.target.closest("[data-s]");
    if (!b) return;
    sub = b.dataset.s;
    renderTab();
  };
  watchResize($("#plotbox"), $("#plot"));
  addFullscreen($("#plotbox"), () => {
    try {
      Plotly.relayout($("#plot"), { height: plotHeight(420) });
    } catch {}
  });
  $("#tests").innerHTML = testsTable(sub);
  drawPlot(sub);
}

// ---------- публичное ----------
export function mountRecord(el) {
  el.innerHTML =
    `<section class="viewer" id="viewer"><div class="vhead"><div class="vtitle"></div>` +
    `<button class="btn" id="dlall" title="Параметры, испытания, кривые, фото и источник одним архивом">Скачать все</button></div>` +
    `<div class="rgrid"><div class="rleft" id="cards"></div><div class="rright">` +
    `<div class="tabs" id="vtabs">${TABS.map(([k, t]) => `<button data-t="${k}">${t}</button>`).join("")}</div>` +
    `<div id="pane"></div><div class="dlrow"><button class="btn" id="dl">Скачать</button></div></div></div>` +
    `<div id="tests"></div><div id="source"></div></section>`;
  $("#vtabs").onclick = (e) => {
    const b = e.target.closest("[data-t]");
    if (!b || !row) return;
    tab = b.dataset.t;
    renderTab();
  };
  $("#dl").onclick = () => dlAction?.();
  $("#dlall").onclick = downloadAll;
  addEventListener("themechange", () => tab === "plot" && row && drawPlot(sub));
}

export function showRecord(r) {
  row = r;
  $(".vtitle").innerHTML =
    `<b>Запись №${r.no}</b> <span>${esc(r.src)}</span>` +
    (r.mdesc ? `<small>${esc(r.mtype)} — ${esc(r.mdesc)}</small>` : "");
  $("#cards").innerHTML = Object.keys(KINDS).map(kv).join("");
  $("#source").innerHTML = sourceBlock();
  renderTab();
}
