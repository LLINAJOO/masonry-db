import { sb, $, esc, shell, toast, parseCurve, isDark } from "./common.js";
shell("index.html", "Каталог экспериментов");

const CLAY = [
  "#b8432a",
  "#c4573a",
  "#a63d27",
  "#cf6a4b",
  "#9c3b26",
  "#bf4d33",
  "#d27556",
  "#ad4630",
];
const COLS = [
  // [поле, подпись, группа]
  ["src", "Источник", "Кладка"],
  ["mtype", "Тип кладки", "Кладка"],
  ["joint", "Толщина шва (мм)", "Кладка"],
  ["btype", "Тип кирпича", "Кирпич"],
  ["bdens", "Плотность кирпича (кг/м³)", "Кирпич"],
  ["void", "Пустотность (%)", "Кирпич"],
  ["perim", "Уд. периметр (1/мм)", "Кирпич"],
  ["mdens", "Плотность раствора (кг/м³)", "Раствор"],
  ["mE", "E раствора (МПа)", "Раствор"],
  ["mstrain", "Пред. деформация раствора", "Раствор"],
  ["mstress", "Пред. напряжение раствора", "Раствор"],
];
const state = {
  rows: [],
  id: null,
  tab: "overview",
  sub: "masonry",
  q: "",
  type: "",
  hidden: new Set(),
};
const cache = new Map();

async function load() {
  const { data, error } = await sb
    .from("masonry")
    .select(
      "id,mortar_thickness,brick_id,mortar_id,paper(authors,year)," +
        "masonry_type(title,description),brick(id,density,voidness,specific_perimeter," +
        "brick_type(title)),mortar(id,density,elastic_modulus,strain_ult," +
        "stress_ult)"
    )
    .eq("status", "approved")
    .order("id");
  if (error) throw error;
  // «№» — сквозной номер по порядку: в отличие от id, не имеет дыр от отклонённых и удалённых заявок
  return data.map((r, i) => {
    const p = r.paper || {},
      b = r.brick || {},
      m = r.mortar || {};
    return {
      id: r.id,
      no: i + 1,
      brick_id: b.id,
      mortar_id: m.id,
      src: p.authors && p.year ? `${p.authors}, ${p.year}` : p.authors || p.year || "—",
      mtype: r.masonry_type?.title,
      mdesc: r.masonry_type?.description,
      joint: r.mortar_thickness,
      btype: b.brick_type?.title,
      bdens: b.density,
      void: b.voidness,
      perim: b.specific_perimeter,
      mdens: m.density,
      mE: m.elastic_modulus,
      mstrain: m.strain_ult,
      mstress: m.stress_ult,
    };
  });
}

// ---------- шапка: кирпичи укладываются в стену, рисуется кривая ----------
function wall(rows = 7, W = 560) {
  let s = 7;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const bw = 64,
    bh = 26,
    g = 6,
    h = rows * (bh + g) - g;
  let out = "";
  for (let r = 0; r < rows; r++)
    for (let c = 0, x = r % 2 ? -(bw + g) / 2 : 0; x < W; c++, x += bw + g)
      out +=
        `<rect class="w-brick" x="${x.toFixed(1)}" y="${(rows - 1 - r) * (bh + g)}"` +
        ` width="${bw}" height="${bh}" rx="2.5" fill="${CLAY[Math.floor(rnd() * 8)]}"` +
        ` style="--d:${(0.12 + r * 0.16 + c * 0.035 + rnd() * 0.05).toFixed(2)}s"/>`;
  const d =
    `M 18 ${h - 18} C 90 ${h - 120}, 150 ${h - 168}, 230 ${h - 178} S 360 ${h - 150}, 430 ${h - 118} S 520 ${h - 92}, ${W - 14} ${h - 86}` +
    ``;
  return (
    `<svg class="wall" viewBox="0 0 ${W} ${h}"><defs><clipPath id="wc">` +
    `<rect width="${W}" height="${h}" rx="14"/></clipPath></defs>` +
    `<g clip-path="url(#wc)">${out}<rect class="w-shade" width="${W}"` +
    ` height="${h}"/></g>
  <path class="w-axis" d="M 18 10 L 18 ${h - 18} L ${W - 10} ${h - 18}"/>` +
    `<path class="w-halo" d="${d}" pathLength="1"/><path class="w-curve"` +
    ` d="${d}" pathLength="1"/>
  <circle class="w-dot" r="6" cx="${W - 14}"` +
    ` cy="${h - 86}"/><text class="w-label" x="26" y="26">F, кН</text>` +
    `<text class="w-label" x="${W - 74}" y="${h - 26}">Δ, мм</text>` +
    `</svg>`
  );
}
function hero(rows) {
  const first = !sessionStorage.getItem("hero");
  sessionStorage.setItem("hero", 1);
  const n = (k) => new Set(rows.map((r) => r[k]).filter((v) => v && v !== "—")).size;
  const stats = [];
  return (
    `<section class="hero ${first ? "is-animated" : ""}"><div><h1>База экспериментов по каменной кладке</h1>
  <p>Результаты испытаний кирпича, раствора и кладки из научных статей.</p>
  <div class="stats">` +
    `${stats
      .map(
        ([v, l], i) =>
          `<div class="stat" style="--i:${i}"><span class="count" style="--target:${v}">` +
          `</span><small>${l}</small></div>`
      )
      .join("")}` +
    `</div></div>
  <div class="hero__art">${wall()}</div></section>`
  );
}

// ---------- карточки выбранной записи ----------
const kv = (t, c, rows) =>
  `<div class="kv" style="--c:${c}"><h4>${t}</h4><dl>${rows
    .map(
      ([k, v, u]) => `<dt>${k}</dt><dd>${esc(v)}${u && v != null ? `<i>${u}</i>` : ""}` + `</dd>`
    )
    .join("")}` + `</dl></div>`;
function renderRecord() {
  const r = cur();
  $("#rec").innerHTML =
    `<div class="rec-head"><b>Запись №${r.no}</b><span>${esc(r.src)}` +
    `</span></div>` +
    kv("Кладка", "var(--blue)", [
      ["Тип", r.mdesc ? `${r.mtype} — ${r.mdesc}` : r.mtype],
      ["Толщина шва", r.joint, "мм"],
    ]) +
    kv("Кирпич", "#c4573a", [
      ["Тип", r.btype],
      ["Плотность", r.bdens, "кг/м³"],
      ["Пустотность", r.void, "%"],
      ["Уд. периметр", r.perim, "1/мм"],
    ]) +
    kv("Раствор", "var(--wait)", [
      ["Плотность", r.mdens, "кг/м³"],
      ["Модуль упругости E", r.mE, "МПа"],
      ["Пред. деформация", r.mstrain],
      ["Пред. напряжение", r.mstress],
    ]);
}

// ---------- кривые ----------
const cur = () => state.rows.find((r) => r.id === state.id);
async function tests(kind, id) {
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
const KIND_NAME = { masonry: "кладки", brick: "кирпича", mortar: "раствора" };
// все кривые выбранного объекта (кладка / кирпич / раствор) в удобном виде
async function curvesOf(kind) {
  const r = cur(),
    id = kind === "masonry" ? r.id : r[kind + "_id"];
  if (!id) return null;
  const out = [];
  for (const t of await tests(kind, id))
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
let token = 0;
async function drawPlot() {
  const my = ++token,
    kind = state.sub,
    el = $("#plot");
  if (!el) return;
  try {
    Plotly.purge(el);
  } catch {} // сбрасываем прежний график, иначе повторная отрисовка в том же блоке ломается
  el.innerHTML = `<div class="note">Загрузка кривых…</div>`;
  let cv;
  try {
    cv = await curvesOf(kind);
  } catch (e) {
    cache.delete(kind + cur().id);
    if (my === token)
      el.innerHTML =
        `<div class="note">Не удалось загрузить кривые: ${esc(e.message)}` +
        `<br>Проверьте политики чтения таблиц *_test и *_test_result в Supabase.</div>`;
    return;
  }
  if (my !== token) return;
  if (!cv) {
    el.innerHTML = `<div class="note">Для этой записи ${kind === "brick" ? "кирпич" : "раствор"} не указан.</div>`;
    return;
  }
  if (typeof Plotly === "undefined") {
    el.innerHTML = `<div class="note">Не загрузилась библиотека графиков Plotly. Проверьте интернет или блокировщик рекламы.</div>`;
    return;
  }
  const fg = getComputedStyle(document.body).color;
  const colors = isDark()
    ? ["#e05a3c", "#4a88d6", "#b8850c", "#a674d4", "#3aa86b"]
    : ["#c2452d", "#2f6db5", "#a87700", "#8a4fb0", "#2f8a55"];
  const traces = cv.map((c) => ({
    x: c.x,
    y: c.y,
    type: "scatter",
    mode: "lines",
    line: { width: 2.2, shape: "spline", smoothing: 0.4 },
    name: c.label,
    hovertemplate: `Перемещение: %{x:.2f} мм<br>Сила: %{y:.2f} кН<extra>${esc(c.name)}</extra>`,
  }));
  el.innerHTML = "";
  Plotly.newPlot(
    el,
    traces,
    {
      height: 460,
      colorway: colors,
      paper_bgcolor: "rgba(0,0,0,0)",
      plot_bgcolor: "rgba(0,0,0,0)",
      margin: { l: 56, r: 8, t: 8, b: 48 },
      font: { family: "IBM Plex Sans", size: 12, color: fg },
      hovermode: "closest",
      transition: { duration: 500, easing: "cubic-in-out" },
      showlegend: traces.length > 0,
      legend: { orientation: "h", y: -0.25, font: { size: 11 } },
      xaxis: {
        title: "Перемещение, мм",
        gridcolor: "rgba(128,128,128,.18)",
        zerolinecolor: "rgba(128,128,128,.45)",
        visible: traces.length > 0,
      },
      yaxis: {
        title: "Сила, кН",
        gridcolor: "rgba(128,128,128,.18)",
        zerolinecolor: "rgba(128,128,128,.45)",
        visible: traces.length > 0,
      },
      annotations: traces.length
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

// ---------- фото кладки и схемы испытаний ----------
const imgCache = new Map();
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
async function drawGallery(kind, text) {
  const el = $("#gal"),
    id = state.id;
  el.innerHTML = `<div class="note">Загрузка изображений…</div>`;
  let list;
  try {
    list = (await imagesOf(id)).filter((i) => i.kind === kind);
  } catch (e) {
    imgCache.delete(id);
    if (id === state.id)
      el.innerHTML = `<div class="note">Не удалось загрузить изображения: ${esc(e.message)}</div>`;
    return;
  }
  if (id !== state.id) return;
  el.innerHTML = list.length
    ? `<div class="gallery">${list
        .map(
          (i) =>
            `<figure><button class="thumb" data-img="${i.id}" title="Открыть крупно">` +
            `<img src="${i.data}" alt="${esc(i.filename, text)}" loading="lazy"></button>` +
            `<figcaption>${esc(i.filename)}</figcaption></figure>`
        )
        .join("")}</div>`
    : `<div class="empty"><h3>Изображений нет</h3>Для этой записи ${text} не загружены.</div>`;
  el.onclick = (e) => {
    const b = e.target.closest("[data-img]");
    if (!b) return;
    const im = list.find((x) => x.id === +b.dataset.img);
    const box = Object.assign(document.createElement("div"), { className: "lightbox" });
    box.innerHTML = `<img src="${im.data}" alt=""><span>${esc(im.filename, "")}</span>`;
    box.onclick = () => box.remove();
    document.body.append(box);
  };
}

// ---------- вкладка «Данные» ----------
function saveText(name, text) {
  const a = Object.assign(document.createElement("a"), {
    href: URL.createObjectURL(new Blob(["\ufeff" + text], { type: "text/csv" })),
    download: name,
  });
  a.click();
  URL.revokeObjectURL(a.href);
}
async function drawData() {
  const el = $("#dat"),
    r = cur();
  el.innerHTML = `<div class="note">Загрузка…</div>`;
  let html = "";
  try {
    for (const k of ["masonry", "brick", "mortar"]) {
      const cv = await curvesOf(k);
      html +=
        `<h4 class="subh">Кривые ${KIND_NAME[k]}</h4>` +
        (cv && cv.length
          ? cv
              .map(
                (c, i) =>
                  `<div class="drow"><span>${esc(c.label)}</span>` +
                  `<button class="btn" data-dl="${k}:${i}">Скачать CSV</button></div>`
              )
              .join("")
          : `<p class="hint">Нет загруженных кривых.</p>`);
    }
  } catch (e) {
    el.innerHTML = `<div class="note">Не удалось загрузить данные: ${esc(e.message)}</div>`;
    return;
  }
  if (r.id !== state.id) return;
  el.innerHTML =
    `<div class="drow"><span><b>Параметры записи №${r.no}</b> (кладка, кирпич, раствор)</span>` +
    `<button class="btn primary" data-dl="params">Скачать CSV</button></div>` +
    html;
  el.onclick = async (e) => {
    const b = e.target.closest("[data-dl]");
    if (!b) return;
    if (b.dataset.dl === "params") {
      const q = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
      saveText(
        `record_${r.no}.csv`,
        [["Параметр", "Значение"], ...COLS.map((c) => [c[1], r[c[0]]])]
          .map((l) => l.map(q).join(","))
          .join("\r\n")
      );
    } else {
      const [k, i] = b.dataset.dl.split(":");
      const c = (await curvesOf(k))[+i];
      saveText(c.name.replace(/\.csv$/i, "") + ".csv", c.content);
    }
  };
}

// ---------- вкладки просмотра записи ----------
const TABS = [
  ["overview", "Обзор"],
  ["plot", "График F–Δ"],
  ["photo", "Фото кладки"],
  ["scheme", "Схема испытания"],
  ["data", "Данные"],
];
function renderTab() {
  const t = state.tab,
    pane = $("#pane");
  document
    .querySelectorAll("#vtabs button")
    .forEach((b) => b.classList.toggle("on", b.dataset.t === t));
  token++; // отменяем незавершённую отрисовку графика
  if (t === "overview") {
    pane.innerHTML = `<div id="rec"></div>`;
    renderRecord();
  } else if (t === "plot") {
    pane.innerHTML = `<div class="seg" id="sub">${[
      ["masonry", "Кладка"],
      ["brick", "Кирпич"],
      ["mortar", "Раствор"],
    ]
      .map(([k, n]) => `<button data-s="${k}" class="${k === state.sub ? "on" : ""}">${n}</button>`)
      .join("")}</div><div id="plot"></div>`;
    $("#sub").onclick = (e) => {
      const b = e.target.closest("[data-s]");
      if (!b) return;
      state.sub = b.dataset.s;
      document.querySelectorAll("#sub button").forEach((x) => x.classList.toggle("on", x === b));
      drawPlot();
    };
    drawPlot();
  } else if (t === "data") {
    pane.innerHTML = `<div id="dat"></div>`;
    drawData();
  } else {
    pane.innerHTML = `<div id="gal"></div>`;
    drawGallery(
      t === "photo" ? "masonry" : "scheme",
      t === "photo" ? "фото кладки" : "схемы испытания"
    );
  }
}

// ---------- таблица ----------
const view = () => {
  const q = state.q.trim().toLowerCase();
  return state.rows.filter(
    (r) =>
      (!state.type || r.mtype === state.type) &&
      (!q ||
        ["no", ...COLS.map((c) => c[0])].some((k) =>
          String(r[k] ?? "")
            .toLowerCase()
            .includes(q)
        ))
  );
};
const shown = () => COLS.filter((c) => !state.hidden.has(c[0]));
function renderTable() {
  const v = view(),
    cols = shown();
  $("#cap").textContent =
    `Показано ${v.length} из ${state.rows.length}` +
    (state.q.trim() ? ` — по запросу «${state.q.trim()}»` : "") +
    (state.type ? ` — тип ${state.type}` : "");
  $("#dl").disabled = !v.length;
  $("#tbl").innerHTML = v.length
    ? `<thead><tr><th>№</th>${cols.map((c) => `<th>${c[1]}</th>`).join("")}` +
      `</tr></thead><tbody>${v
        .map(
          (r) =>
            `<tr data-id="${r.id}" class="${r.id === state.id ? "on" : ""}">` +
            `<td>${r.no}</td>${cols.map((c) => `<td>${esc(r[c[0]])}</td>`).join("")}` +
            `</tr>`
        )
        .join("")}` +
      `</tbody>`
    : `<tbody><tr><td><div class="empty"><h3>Ничего не нашлось</h3>Попробуйте другое слово или очистите поиск.</div>` +
      `</td></tr></tbody>`;
}
function downloadCsv() {
  const cols = shown(),
    q = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const csv = [
    ["№", ...cols.map((c) => c[1])],
    ...view().map((r) => [r.no, ...cols.map((c) => r[c[0]])]),
  ]
    .map((l) => l.map(q).join(","))
    .join("\r\n");
  const a = Object.assign(document.createElement("a"), {
    href: URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv" })),
    download: "masonry_database.csv",
  });
  a.click();
  URL.revokeObjectURL(a.href);
}

function select(id, fromTable) {
  state.id = id;
  $("#sel").value = id;
  renderTab();
  document.querySelectorAll("#tbl tr.on").forEach((t) => t.classList.remove("on"));
  document.querySelector(`#tbl tr[data-id="${id}"]`)?.classList.add("on");
  if (fromTable) {
    $("#viewer").scrollIntoView({ behavior: "smooth", block: "start" });
    toast(`Открыта запись №${cur().no}`);
  }
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
    main.innerHTML =
      `<div class="empty"><h3>Записей пока нет</h3>Здесь появятся одобренные эксперименты. <a href="add.html">Добавить эксперимент</a>` +
      `</div>`;
    return;
  }
  state.id = state.rows[0].id;
  main.innerHTML =
    hero(state.rows) +
    `<section class="viewer" id="viewer"><label class="lbl">Запись<select id="sel">` +
    `${state.rows
      .map(
        (r) => `<option value="${r.id}">№${r.no} — ${esc(r.mtype)} / ${esc(r.btype)}` + `</option>`
      )
      .join("")}` +
    `</select></label><div class="tabs" id="vtabs">` +
    `${TABS.map(([k, t]) => `<button data-t="${k}">${t}</button>`).join("")}` +
    `</div><div id="pane"></div></section>
    <h3 class="sec">Все записи</h3>` +
    `<p class="hint">Нажмите на строку, чтобы открыть запись. Поиск ищет по всем столбцам.</p>
  <div class="chips" id="types">` +
    `<button data-ty="" class="on">Все типы</button>${[...new Set(state.rows.map((r) => r.mtype))]
      .filter(Boolean)
      .sort()
      .map((t) => `<button data-ty="${esc(t)}">${esc(t)}</button>`)
      .join("")}</div>
  <div class="bar">` +
    `<input id="q" type="search" placeholder="Автор, год, тип кирпича или кладки…">` +
    `<details class="pop"><summary>Столбцы</summary><div class="menu">` +
    `${["Кладка", "Кирпич", "Раствор"]
      .map(
        (g) =>
          `<b>${g}</b>` +
          COLS.filter((c) => c[2] === g)
            .map(
              (c) => `<label><input type="checkbox" data-c="${c[0]}" checked> ${c[1]}` + `</label>`
            )
            .join("")
      )
      .join("")}` +
    `</div></details><button id="dl" class="btn">Скачать CSV</button>` +
    `</div>
  <p id="cap" class="hint"></p><div class="tw"><table id="tbl">` +
    `</table></div>`;
  $("#sel").onchange = (e) => select(+e.target.value);
  $("#vtabs").onclick = (e) => {
    const b = e.target.closest("[data-t]");
    if (!b) return;
    state.tab = b.dataset.t;
    renderTab();
  };
  $("#types").onclick = (e) => {
    const b = e.target.closest("[data-ty]");
    if (!b) return;
    state.type = b.dataset.ty;
    document.querySelectorAll("#types button").forEach((x) => x.classList.toggle("on", x === b));
    renderTable();
  };
  addEventListener("themechange", () => state.tab === "plot" && drawPlot());
  $("#q").oninput = (e) => {
    state.q = e.target.value;
    renderTable();
  };
  document.querySelectorAll("[data-c]").forEach(
    (c) =>
      (c.onchange = () => {
        c.checked ? state.hidden.delete(c.dataset.c) : state.hidden.add(c.dataset.c);
        renderTable();
      })
  );
  $("#tbl").onclick = (e) => {
    const tr = e.target.closest("tr[data-id]");
    if (tr) select(+tr.dataset.id, true);
  };
  $("#dl").onclick = downloadCsv;
  renderTab();
  renderTable();
}
init();
