import { $, esc, shell, isDark, addFullscreen } from "./common.js";
import { load } from "./data.js";
shell("overview.html", "Обзор базы");

const PALETTE_L = ["#1f6feb", "#e8381f", "#e69500", "#9333ea", "#16a34a", "#0891b2"];
const PALETTE_D = ["#5aa9ff", "#ff6b4a", "#ffc233", "#c084fc", "#3ddc84", "#22d3ee"];
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

// ---------- график: параллельные оси на чистом SVG ----------
// Свой, а не Plotly: так можно задать толщину и цвет линий, подсветку при наведении и подсказку.
const SVGNS = "http://www.w3.org/2000/svg";
const shortText = (t, n = 13) => (t.length > n ? t.slice(0, n - 1) + "…" : t);
const fmt = (v) =>
  Math.abs(v) >= 1000 || Number.isInteger(v) ? String(Math.round(v)) : String(+v.toFixed(2));
const brush = new Map(); // индекс оси → [от, до] в долях 0..1

function axes(rows, types, bricks) {
  const cat = (label, list, key) => ({
    label,
    list,
    get: (r) => list.indexOf(r[key]),
    lo: 0,
    hi: Math.max(list.length - 1, 1),
  });
  const out = [
    { label: "№", get: (r) => r.no, lo: 1, hi: Math.max(state.rows.length, 2) },
    cat("Кладка", types, "mtype"),
    cat("Кирпич", bricks, "btype"),
  ];
  for (const [k, label] of NUM) {
    const nums = rows.map((r) => r[k]).filter((v) => v != null);
    if (!nums.length) continue; // ось без данных не рисуем
    const lo = Math.min(0, ...nums);
    out.push({ label, get: (r) => r[k] ?? lo, lo, hi: Math.max(...nums, lo + 1) });
  }
  return out;
}

function draw() {
  const el = $("#ovplot"),
    rows = filtered(),
    pal = isDark() ? PALETTE_D : PALETTE_L;
  $("#cnt").textContent = `Показано ${rows.length} из ${state.rows.length}`;
  if (!rows.length) {
    el.innerHTML = `<div class="empty"><h3>Ничего не выбрано</h3>Включите хотя бы один тип в фильтрах.</div>`;
    $("#legend").innerHTML = "";
    return;
  }
  const types = uniq("mtype"),
    bricks = uniq("btype"),
    ax = axes(rows, types, bricks),
    fs = !!document.querySelector(".fsbox.fs");
  const W = Math.max(640, el.clientWidth, ax.length * 76),
    H = fs ? Math.max(380, innerHeight - 150) : 520,
    top = 58,
    bot = 26,
    ml = 54,
    mr = 54;
  const X = (i) => ml + (i * (W - ml - mr)) / (ax.length - 1),
    Y = (t) => top + (1 - t) * (H - top - bot),
    norm = (a, v) => (a.list && a.list.length < 2 ? 0.5 : (v - a.lo) / (a.hi - a.lo));
  const colorOf = (r) => pal[types.indexOf(r.mtype) % pal.length];
  const svg = document.createElementNS(SVGNS, "svg");
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.setAttribute("width", W);
  svg.setAttribute("height", H);
  svg.classList.add("pc");
  let h = "";
  ax.forEach((a, i) => {
    h += `<line class="pc-axis" x1="${X(i)}" x2="${X(i)}" y1="${top}" y2="${H - bot}"/>`;
    h += `<text class="pc-label" x="${X(i)}" y="${top - 26}" text-anchor="middle">${esc(a.label)}</text>`;
    const ticks = a.list
      ? a.list.map((t, k) => [norm(a, k), shortText(t), t])
      : [0, 0.5, 1].map((q) => [q, fmt(a.lo + q * (a.hi - a.lo))]);
    for (const [q, text, full] of ticks)
      h += `<text class="pc-tick" x="${X(i) - 6}" y="${Y(q) + 4}" text-anchor="end"><title>${esc(full || text)}</title>${esc(text)}</text>`;
  });
  // линии: сначала невидимая «толстая» для попадания пальцем/мышью, затем видимая
  const pts = (r) =>
    ax.map((a, i) => `${X(i).toFixed(1)},${Y(norm(a, a.get(r))).toFixed(1)}`).join(" ");
  rows.forEach((r, k) => {
    const p = pts(r);
    h +=
      `<g class="pc-row" data-k="${k}"><polyline class="pc-hit" points="${p}"/>` +
      `<polyline class="pc-line" points="${p}" stroke="${colorOf(r)}"/></g>`;
  });
  h += `<g class="pc-brushes"></g>`;
  ax.forEach(
    (_, i) =>
      (h += `<rect class="pc-zone" data-ax="${i}" x="${X(i) - 14}" y="${top - 6}" width="28" height="${H - top - bot + 12}"/>`)
  );
  svg.innerHTML = h;
  el.replaceChildren(svg);

  const tip = $("#tip");
  const lines = [...svg.querySelectorAll(".pc-row")];
  const apply = () => {
    let n = 0;
    lines.forEach((g) => {
      const r = rows[+g.dataset.k],
        ok = [...brush].every(([i, [lo, hi]]) => {
          if (!ax[i]) return true;
          const t = norm(ax[i], ax[i].get(r));
          return t >= lo - 1e-9 && t <= hi + 1e-9;
        });
      g.classList.toggle("dim", !ok);
      if (ok) n++;
    });
    $("#cnt").textContent =
      `Показано ${rows.length} из ${state.rows.length}` +
      (brush.size ? `, выделено по осям: ${n}` : "");
    svg.querySelector(".pc-brushes").innerHTML = [...brush]
      .filter(([i]) => ax[i])
      .map(
        ([i, [lo, hi]]) =>
          `<rect class="pc-brush" x="${X(i) - 8}" width="16" y="${Y(hi)}" height="${Math.max(2, Y(lo) - Y(hi))}" rx="3"/>`
      )
      .join("");
  };
  apply();

  // подсветка и подсказка
  const hot = (g, ev) => {
    lines.forEach((x) => x.classList.remove("hot"));
    if (!g) return void (tip.hidden = true);
    g.classList.add("hot");
    svg.insertBefore(g, svg.querySelector(".pc-brushes")); // поднимаем линию поверх остальных
    const r = rows[+g.dataset.k];
    tip.innerHTML =
      `<b>№${r.no}</b> · ${esc(r.mtype)} · ${esc(r.btype)}<br>${esc(r.src)}` +
      `${r.joint != null ? `<br>шов ${r.joint} мм` : ""}`;
    tip.hidden = false;
    const box = $("#ovplot").getBoundingClientRect();
    tip.style.left = Math.min(ev.clientX - box.left + 12, box.width - 190) + "px";
    tip.style.top = ev.clientY - box.top + 14 + "px";
  };
  svg.addEventListener("pointermove", (e) => {
    if (e.target.closest(".pc-zone")) return;
    hot(e.target.closest(".pc-row"), e);
  });
  svg.addEventListener("pointerleave", () => hot(null));
  svg.addEventListener("click", (e) => {
    const g = e.target.closest(".pc-row");
    if (g && !g.classList.contains("dim")) hot(g, e);
  });

  // выделение диапазона по оси: потяните вдоль оси; клик по оси снимает выделение
  svg.querySelectorAll(".pc-zone").forEach((z) => {
    z.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      hot(null);
      const i = +z.dataset.ax,
        box = svg.getBoundingClientRect(),
        sc = H / box.height,
        t = (ev) =>
          Math.min(1, Math.max(0, 1 - ((ev.clientY - box.top) * sc - top) / (H - top - bot))),
        t0 = t(e);
      z.setPointerCapture(e.pointerId);
      const move = (ev) => {
        brush.set(i, [Math.min(t0, t(ev)), Math.max(t0, t(ev))]);
        apply();
      };
      const up = (ev) => {
        z.removeEventListener("pointermove", move);
        z.removeEventListener("pointerup", up);
        if (Math.abs(t(ev) - t0) < 0.02) brush.delete(i);
        apply();
      };
      z.addEventListener("pointermove", move);
      z.addEventListener("pointerup", up);
    });
  });

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
  if (!state.rows.length) {
    main.innerHTML = `<div class="empty"><h3>Записей пока нет</h3>Здесь появится обзор одобренных экспериментов.</div>`;
    return;
  }
  const desc = new Map(state.rows.map((r) => [r.mtype, r.mdesc]));
  state.types = new Set(uniq("mtype"));
  state.bricks = new Set(uniq("btype"));
  const maxJoint = Math.max(0, ...state.rows.map((r) => r.joint ?? 0));
  main.innerHTML =
    `<h1>Обзор базы</h1><p class="hint">Каждая линия — одна запись каталога. Проведите вдоль оси, чтобы выделить диапазон значений (клик по оси снимает выделение); наведите на линию или коснитесь её, чтобы увидеть запись; фильтры слева убирают записи целиком. Оси: ρ — плотность (кг/м³), E — модуль упругости (МПа), ε и σ — предельные деформация и напряжение раствора.</p>` +
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
    `<div class="ovmain"><div id="ovplot"></div><div id="tip" class="tip" hidden></div><div class="legend" id="legend"></div></div></div>`;
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
  addFullscreen($(".ovmain"), draw);
  addEventListener("themechange", draw);
  let rt;
  addEventListener("resize", () => {
    clearTimeout(rt);
    rt = setTimeout(draw, 120);
  });
  draw();
}
init();
