// График «Обзор»: параллельные оси на чистом SVG.
// Диапазоны осей считаются по всей базе и не меняются при фильтрации: фильтры лишь скрывают линии.
import { $, esc, addFullscreen } from "./common.js";
import { show } from "./data.js";

const SVGNS = "http://www.w3.org/2000/svg";
// оси графика, слева направо (ключи столбцов из data.js; «no» — номер записи)
const AXES = [
  "no",
  "mtype",
  "btype",
  "joint",
  "mt_sig",
  "mt_alp",
  "bdens",
  "void",
  "perim",
  "mdens",
  "mE",
  "mstrain",
  "mstress",
];
const fmt = (v) => {
  const a = Math.abs(v);
  return String(a >= 100 || Number.isInteger(v) ? Math.round(v * 10) / 10 : +v.toPrecision(2));
};
// перенос по реальной ширине текста (в пикселях), а не по числу символов
const ctx = document.createElement("canvas").getContext("2d");
const textW = (t, font) => ((ctx.font = font), ctx.measureText(t).width);
const LABEL_FONT = "600 12.5px Inter, system-ui, sans-serif";
const TICK_FONT = "500 11px Inter, system-ui, sans-serif";
const wrapPx = (text, max) => {
  const lines = [];
  let cur = "";
  for (const w of String(text).split(" ")) {
    if (cur && textW(cur + " " + w, LABEL_FONT) > max) {
      lines.push(cur);
      cur = w;
    } else cur = cur ? cur + " " + w : w;
  }
  return [...lines, cur];
};
const clip = (t, max) => {
  if (textW(t, TICK_FONT) <= max) return t;
  let n = t.length;
  while (n > 1 && textW(t.slice(0, n) + "…", TICK_FONT) > max) n--;
  return t.slice(0, n) + "…";
};

export function mountParcoords(root, { all, visible, columns, selected }) {
  root.innerHTML =
    `<p class="hint">Каждая линия — одна запись. Проведите вдоль оси, чтобы выделить диапазон значений ` +
    `(клик по оси снимает выделение). Показываются записи, прошедшие поиск и фильтры в таблице «Все записи» ниже; ` +
    `терракотовым цветом выделена запись, выбранная в таблице.</p>` +
    `<div class="ovmain"><div id="ovplot"></div><div id="tip" class="tip" hidden></div></div>`;
  const wrapEl = $(".ovmain", root),
    el = $("#ovplot", root),
    tip = $("#tip", root);
  const brush = new Map(); // ключ оси → [от, до] в долях 0..1

  // оси строятся один раз для всей базы, поэтому не «прыгают» при фильтрации
  const defs = () => {
    const rows = all();
    return AXES.map((k) => {
      const c =
        k === "no"
          ? { k, name: "Номер записи", unit: "", type: "num", get: (r) => [r.no] }
          : columns.find((x) => x.k === k);
      const d = {
        k,
        c,
        name: c.name,
        unit: c.unit,
        cat: c.type === "txt",
        get: (r) => c.get(r)[0],
      };
      if (d.cat) {
        d.list = [...new Set(rows.map(d.get).filter((v) => v != null))].sort((a, b) =>
          String(a).localeCompare(String(b), "ru", { numeric: true })
        );
        d.lo = 0;
        d.hi = Math.max(d.list.length - 1, 1);
      } else {
        const v = rows.map(d.get).filter((x) => x != null);
        if (!v.length) return null; // нет данных — нет оси
        d.lo = Math.min(...v);
        d.hi = Math.max(...v);
        if (d.lo === d.hi) {
          d.lo -= 1;
          d.hi += 1;
        }
      }
      return d;
    }).filter(Boolean);
  };
  const pos = (d, r) => {
    const v = d.get(r);
    if (v == null) return null;
    if (d.cat) return d.list.length < 2 ? 0.5 : d.list.indexOf(v) / (d.list.length - 1);
    return (v - d.lo) / (d.hi - d.lo);
  };

  function draw() {
    if (root.hidden) return;
    const sel = selected?.(),
      rows = visible(),
      ax = defs(),
      fs = !!document.querySelector(".fsbox.fs");
    if (!rows.length) {
      el.innerHTML = `<div class="empty"><h3>Ничего не выбрано</h3>Под поиск и фильтры таблицы не подходит ни одна запись.</div>`;
      return;
    }
    const gap = 112,
      ml = gap / 2 + 8,
      mr = gap / 2 + 8,
      W = Math.max(el.clientWidth, ax.length * gap + ml + mr),
      step = (W - ml - mr) / (ax.length - 1),
      LH = 16, // высота строки названия
      names = ax.map((d) => wrapPx(d.name, step - 16)),
      nl = Math.max(...names.map((l) => l.length)),
      top = 20 + nl * LH + 22, // шапка одинаковой высоты для всех осей
      bot = 48,
      H = fs ? Math.max(460, innerHeight - 170) : 560,
      X = (i) => ml + i * step,
      Y = (t) => top + (1 - t) * (H - top - bot);
    let h = "";
    ax.forEach((d, i) => {
      h += `<line class="pc-axis" x1="${X(i)}" x2="${X(i)}" y1="${top}" y2="${H - bot}"/>`;
      // названия выровнены по верхней строке: у всех осей первая строка на одной высоте
      names[i].forEach((t, n) => {
        h += `<text class="pc-label" x="${X(i)}" y="${22 + n * LH}" text-anchor="middle">${esc(t)}</text>`;
      });
      if (d.unit)
        h += `<text class="pc-unit" x="${X(i)}" y="${H - bot + 22}" text-anchor="middle">${esc(d.unit)}</text>`;
      const ticks = d.cat
        ? d.list.map((t, k) => [d.list.length < 2 ? 0.5 : k / (d.list.length - 1), t])
        : [0, 0.25, 0.5, 0.75, 1].map((q) => [q, fmt(d.lo + q * (d.hi - d.lo))]);
      for (const [q, text] of ticks) {
        const t = String(text),
          short = clip(t, step - 18);
        h += `<text class="pc-tick" x="${X(i) + 7}" y="${Y(q) + 4}" text-anchor="start"><title>${esc(t)}</title>${esc(short)}</text>`;
      }
    });
    // линии: прерываются там, где у записи нет значения
    const path = (r) => {
      let p = "",
        pen = false;
      ax.forEach((d, i) => {
        const t = pos(d, r);
        if (t == null) return void (pen = false);
        p += `${pen ? "L" : "M"}${X(i).toFixed(1)} ${Y(t).toFixed(1)}`;
        pen = true;
      });
      return p;
    };
    rows.forEach((r, k) => {
      const p = path(r);
      h += `<g class="pc-row${r.id === sel ? " sel" : ""}" data-k="${k}"><path class="pc-hit" d="${p}"/><path class="pc-line" d="${p}"/></g>`;
    });
    // выбранная запись рисуется поверх остальных
    h =
      h.replace(/(<g class="pc-row sel"[\s\S]*?<\/g>)/, "") +
      (h.match(/<g class="pc-row sel"[\s\S]*?<\/g>/)?.[0] || "");
    h += `<g class="pc-brushes"></g>`;
    ax.forEach(
      (d, i) =>
        (h += `<rect class="pc-zone" data-ax="${d.k}" x="${X(i) - 14}" y="${top - 6}" width="28" height="${H - top - bot + 12}"/>`)
    );
    const svg = document.createElementNS(SVGNS, "svg");
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    svg.setAttribute("width", W);
    svg.setAttribute("height", H);
    svg.classList.add("pc");
    svg.innerHTML = h;
    el.replaceChildren(svg);

    const lines = [...svg.querySelectorAll(".pc-row")];
    const apply = () => {
      lines.forEach((g) => {
        const r = rows[+g.dataset.k],
          ok = [...brush].every(([k, [lo, hi]]) => {
            const d = ax.find((x) => x.k === k);
            if (!d) return true;
            const t = pos(d, r);
            return t != null && t >= lo - 1e-9 && t <= hi + 1e-9;
          });
        g.classList.toggle("dim", !ok);
      });
      svg.querySelector(".pc-brushes").innerHTML = [...brush]
        .map(([k, [lo, hi]]) => [ax.findIndex((x) => x.k === k), lo, hi])
        .filter(([i]) => i >= 0)
        .map(
          ([i, lo, hi]) =>
            `<rect class="pc-brush" x="${X(i) - 8}" width="16" y="${Y(hi)}" height="${Math.max(2, Y(lo) - Y(hi))}" rx="3"/>`
        )
        .join("");
    };
    apply();

    // подсвеченная линия и подсказка
    const hot = (g, ev) => {
      lines.forEach((x) => x.classList.remove("hot"));
      if (!g) return void (tip.hidden = true);
      g.classList.add("hot");
      svg.insertBefore(g, svg.querySelector(".pc-brushes"));
      const r = rows[+g.dataset.k];
      tip.innerHTML =
        `<b>№${r.no}</b> · ${esc(r.mtype)} · ${esc(r.btype)}<br>${esc(r.src)}` +
        `${r.joint != null ? `<br>шов ${r.joint} мм` : ""}`;
      tip.hidden = false;
      const box = wrapEl.getBoundingClientRect();
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

    // выделение диапазона по оси
    svg.querySelectorAll(".pc-zone").forEach((z) => {
      z.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        hot(null);
        const k = z.dataset.ax,
          box = svg.getBoundingClientRect(),
          sc = H / box.height,
          t = (ev) =>
            Math.min(1, Math.max(0, 1 - ((ev.clientY - box.top) * sc - top) / (H - top - bot))),
          t0 = t(e);
        z.setPointerCapture(e.pointerId);
        const move = (ev) => {
          brush.set(k, [Math.min(t0, t(ev)), Math.max(t0, t(ev))]);
          apply();
        };
        const up = (ev) => {
          z.removeEventListener("pointermove", move);
          z.removeEventListener("pointerup", up);
          if (Math.abs(t(ev) - t0) < 0.02) brush.delete(k);
          apply();
        };
        z.addEventListener("pointermove", move);
        z.addEventListener("pointerup", up);
      });
    });
  }

  addFullscreen(wrapEl, draw);
  let rt;
  addEventListener("resize", () => {
    clearTimeout(rt);
    rt = setTimeout(draw, 120);
  });
  return { redraw: draw };
}
