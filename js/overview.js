import { $, esc, shell, isDark } from "./common.js";
import { load } from "./data.js";
shell("overview.html", "Обзор базы");

const PALETTE_L = ["#2f6db5", "#c2452d", "#a87700", "#8a4fb0", "#2f8a55", "#5b6770"];
const PALETTE_D = ["#4a88d6", "#e05a3c", "#c99a22", "#a674d4", "#3aa86b", "#9aa5b1"];
const state = { rows: [], types: new Set(), bricks: new Set(), minJoint: 0 };

// оси графика: числовые берутся как есть, текстовые превращаются в номера с подписями
const NUM = [
  ["joint", "Шов, мм"],
  ["bdens", "ρ кирпича"],
  ["void", "Пустот., %"],
  ["perim", "Периметр"],
  ["mdens", "ρ раствора"],
  ["mE", "E раствора"],
  ["mstrain", "ε пред."],
  ["mstress", "σ пред."],
];
const uniq = (k) => [...new Set(state.rows.map((r) => r[k]).filter(Boolean))].sort();

function checks(title, key, values, note) {
  return (
    `<div class="fgrp"><h4>${title}</h4>${note ? `<p class="hint">${note}</p>` : ""}` +
    values
      .map(
        ([v, d]) =>
          `<label class="chk"><input type="checkbox" data-f="${key}" value="${esc(v)}" checked>` +
          `<span><b>${esc(v)}</b>${d ? `<small>${esc(d)}</small>` : ""}</span></label>`
      )
      .join("") +
    `</div>`
  );
}

function filtered() {
  return state.rows.filter(
    (r) => state.types.has(r.mtype) && state.bricks.has(r.btype) && (r.joint ?? 0) >= state.minJoint
  );
}

function draw() {
  const el = $("#ovplot"),
    rows = filtered(),
    dark = isDark(),
    pal = dark ? PALETTE_D : PALETTE_L;
  try {
    Plotly.purge(el);
  } catch {}
  $("#cnt").textContent = `Показано ${rows.length} из ${state.rows.length}`;
  if (!rows.length) {
    el.innerHTML = `<div class="empty"><h3>Ничего не выбрано</h3>Включите хотя бы один тип в фильтрах.</div>`;
    return;
  }
  el.innerHTML = "";
  const types = uniq("mtype"),
    bricks = uniq("btype");
  const cat = (label, list, key) => ({
    label,
    values: rows.map((r) => list.indexOf(r[key])),
    tickvals: list.map((_, i) => i),
    ticktext: list,
    range: [0, Math.max(list.length - 1, 1)],
  });
  const dims = [
    { label: "№", values: rows.map((r) => r.no), range: [1, Math.max(state.rows.length, 2)] },
    cat("Кладка", types, "mtype"),
    cat("Кирпич", bricks, "btype"),
  ];
  for (const [k, label] of NUM) {
    const vals = rows.map((r) => r[k]);
    if (!vals.some((v) => v != null)) continue; // ось без данных не рисуем
    const nums = vals.filter((v) => v != null),
      lo = Math.min(0, ...nums),
      hi = Math.max(...nums, lo + 1);
    // пустое значение рисуем на нуле оси, чтобы линия не обрывалась
    dims.push({ label, values: vals.map((v) => v ?? lo), range: [lo, hi] });
  }
  const n = Math.max(types.length, 2);
  Plotly.newPlot(
    el,
    [
      {
        type: "parcoords",
        line: {
          color: rows.map((r) => types.indexOf(r.mtype)),
          colorscale: pal.slice(0, n).flatMap((c, i) => [
            [i / n, c],
            [(i + 1) / n, c],
          ]),
          cmin: -0.5,
          cmax: n - 0.5,
        },
        dimensions: dims,
        labelfont: { size: 12, color: getComputedStyle(document.body).color },
        tickfont: { size: 11, color: getComputedStyle(document.body).color },
        rangefont: { size: 11, color: getComputedStyle(document.body).color },
      },
    ],
    {
      height: 560,
      margin: { l: 50, r: 50, t: 60, b: 20 },
      paper_bgcolor: "rgba(0,0,0,0)",
      plot_bgcolor: "rgba(0,0,0,0)",
      font: { family: "IBM Plex Sans", color: getComputedStyle(document.body).color },
    },
    { responsive: true, displayModeBar: false }
  );
  $("#legend").innerHTML = types
    .filter((t) => rows.some((r) => r.mtype === t))
    .map(
      (t) =>
        `<span><i style="background:${pal[types.indexOf(t) % pal.length]}"></i>${esc(t)}</span>`
    )
    .join("");
}

async function init() {
  const main = $("#main");
  try {
    state.rows = await load();
  } catch (e) {
    main.innerHTML = `<div class="note">Не удалось загрузить данные: ${esc(e.message)}</div>`;
    return;
  }
  if (typeof Plotly === "undefined") {
    main.innerHTML = `<div class="note">Не загрузилась библиотека графиков Plotly. Проверьте интернет или блокировщик рекламы.</div>`;
    return;
  }
  if (!state.rows.length) {
    main.innerHTML = `<div class="empty"><h3>Записей пока нет</h3>Здесь появится обзор одобренных экспериментов.</div>`;
    return;
  }
  const desc = new Map(state.rows.map((r) => [r.mtype, r.mdesc]));
  state.types = new Set(uniq("mtype"));
  state.bricks = new Set(uniq("btype"));
  const maxJoint = Math.max(0, ...state.rows.map((r) => r.joint ?? 0));
  main.innerHTML =
    `<h1>Обзор базы</h1><p class="hint">Каждая линия — одна запись каталога. Тяните по оси, чтобы выделить диапазон значений; фильтры слева убирают записи целиком. Оси: ρ — плотность (кг/м³), E — модуль упругости (МПа), ε и σ — предельные деформация и напряжение раствора.</p>` +
    `<div class="ovw"><div class="filters"><h3>Фильтры</h3>` +
    checks(
      "Типы кладки",
      "types",
      uniq("mtype").map((t) => [t, desc.get(t)])
    ) +
    checks(
      "Типы кирпича",
      "bricks",
      uniq("btype").map((t) => [t, ""])
    ) +
    `<div class="fgrp"><h4>Минимальная толщина шва</h4><input id="mj" type="range" min="0" max="${maxJoint}" value="0" step="1">` +
    `<p class="hint"><span id="mjv">0</span> мм и больше</p></div>` +
    `<p class="hint" id="cnt"></p><a class="btn" href="index.html" style="text-decoration:none">Открыть каталог →</a></div>` +
    `<div class="ovmain"><div id="ovplot"></div><div class="legend" id="legend"></div></div></div>`;
  main.addEventListener("change", (e) => {
    const t = e.target;
    if (t.dataset.f) {
      const set = t.dataset.f === "types" ? state.types : state.bricks;
      t.checked ? set.add(t.value) : set.delete(t.value);
      draw();
    }
  });
  $("#mj").oninput = (e) => {
    state.minJoint = +e.target.value;
    $("#mjv").textContent = e.target.value;
    draw();
  };
  addEventListener("themechange", draw);
  draw();
}
init();
