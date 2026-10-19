import { sb, $, esc, shell, toast, parseCurve } from "./common.js";
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
const state = { rows: [], id: null, tab: "masonry", q: "", hidden: new Set() };
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
let token = 0;
async function drawPlot() {
  const my = ++token,
    r = cur(),
    kind = state.tab,
    id = kind === "masonry" ? r.id : r[kind + "_id"],
    el = $("#plot");
  try {
    Plotly.purge(el);
  } catch {} // сбрасываем прежний график, иначе повторная отрисовка в том же блоке ломается
  el.innerHTML = `<div class="note">Загрузка кривых…</div>`;
  if (!id) {
    el.innerHTML = `<div class="note">Для этой записи ${kind === "brick" ? "кирпич" : "раствор"} не указан.</div>`;
    return;
  }
  let ts;
  try {
    ts = await tests(kind, id);
  } catch (e) {
    cache.delete(kind + id);
    if (my === token)
      el.innerHTML =
        `<div class="note">Не удалось загрузить кривые: ${esc(e.message)}` +
        `<br>Проверьте политики чтения таблиц *_test и *_test_result в Supabase.</div>`;
    return;
  }
  if (my !== token) return;
  if (typeof Plotly === "undefined") {
    el.innerHTML = `<div class="note">Не загрузилась библиотека графиков Plotly. Проверьте интернет или блокировщик рекламы.</div>`;
    return;
  }
  const dark = matchMedia("(prefers-color-scheme:dark)").matches,
    fg = getComputedStyle(document.body).color;
  const colors = dark
    ? ["#e05a3c", "#4a88d6", "#b8850c", "#a674d4", "#3aa86b"]
    : ["#c2452d", "#2f6db5", "#a87700", "#8a4fb0", "#2f8a55"];
  const traces = [];
  for (const t of ts)
    for (const res of t[kind + "_test_result"] || []) {
      const c = parseCurve(res.curve_content);
      if (!c) continue;
      const name = res.curve_filename || `Испытание ${traces.length + 1}`;
      traces.push({
        ...c,
        type: "scatter",
        mode: "lines",
        line: { width: 2.2, shape: "spline", smoothing: 0.4 },
        name: `${name}, ${t.standard?.title || "—"}, σ = ${t.stress_state ?? ""}, α = ${t.orientation ?? ""}°`,
        hovertemplate: `Перемещение: %{x:.2f} мм<br>Сила: %{y:.2f} кН<extra>${name}` + `</extra>`,
      });
    }
  el.innerHTML = "";
  Plotly.newPlot(
    el,
    traces,
    {
      height: 380,
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

// ---------- таблица ----------
const view = () => {
  const q = state.q.trim().toLowerCase();
  return state.rows.filter(
    (r) =>
      !q ||
      ["no", ...COLS.map((c) => c[0])].some((k) =>
        String(r[k] ?? "")
          .toLowerCase()
          .includes(q)
      )
  );
};
const shown = () => COLS.filter((c) => !state.hidden.has(c[0]));
function renderTable() {
  const v = view(),
    cols = shown();
  $("#cap").textContent =
    `Показано ${v.length} из ${state.rows.length}` +
    (state.q.trim() ? ` — по запросу «${state.q.trim()}»` : "");
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
  renderRecord();
  drawPlot();
  document.querySelectorAll("#tbl tr.on").forEach((t) => t.classList.remove("on"));
  document.querySelector(`#tbl tr[data-id="${id}"]`)?.classList.add("on");
  if (fromTable) {
    scrollTo({ top: 0, behavior: "smooth" });
    toast(`Запись №${cur().no}: кривые и параметры обновлены наверху`);
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
    `<div class="grid"><div><label class="lbl">Запись<select id="sel">` +
    `${state.rows
      .map(
        (r) => `<option value="${r.id}">№${r.no} — ${esc(r.mtype)} / ${esc(r.btype)}` + `</option>`
      )
      .join("")}` +
    `</select></label><div id="rec"></div></div>
  <div><div class="tabs">` +
    `${[
      ["masonry", "Кладка"],
      ["brick", "Кирпич"],
      ["mortar", "Раствор"],
    ]
      .map(([k, t], i) => `<button data-t="${k}" class="${i ? "" : "on"}">${t}</button>`)
      .join("")}` +
    `</div><div id="plot"></div></div></div>
  <h3 class="sec">Все записи</h3>` +
    `<p class="hint">Нажмите на строку, чтобы посмотреть её кривые. Поиск ищет по всем столбцам.</p>
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
  document.querySelectorAll(".tabs button").forEach(
    (b) =>
      (b.onclick = () => {
        state.tab = b.dataset.t;
        document.querySelectorAll(".tabs button").forEach((x) => x.classList.toggle("on", x === b));
        drawPlot();
      })
  );
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
  renderRecord();
  renderTable();
  drawPlot();
}
init();
