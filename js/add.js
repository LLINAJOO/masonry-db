import { sb, $, esc, shell, toast } from "./common.js";
shell("add.html", "Добавить эксперимент");
const EX_CSV =
  "Test unit,WS1.100\nReference,Example Author (2024)\ntop_displacement," +
  "horizontal_force,drift\n[mm],[kN],[%]\n-1.62,-16.5,-0.122\n-0.96," +
  "-8.1,-0.072\n-0.04,3,-0.003\n0.62,9.9,0.047\n1.7,17.9,0.129\n2.2," +
  "21.1,0.166\n";
const EX_BIB =
  "@article{example_key,\n  title={Example title},\n  author={Surname," +
  " Name and Surname2, Name2},\n  year={2024},\n  journal={Example Journal}," +
  "\n  doi={10.1234/example.doi}\n}";
const file = (n, t) => {
  const a = Object.assign(document.createElement("a"), {
    href: URL.createObjectURL(new Blob([t])),
    download: n,
  });
  a.click();
  URL.revokeObjectURL(a.href);
};
const rd = async (f) => {
  const b = await f.arrayBuffer();
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(b);
  } catch {
    return new TextDecoder("latin1").decode(b);
  }
};

function parseBib(t) {
  const norm = (s) => (s == null ? null : s.replace(/\s+/g, " ").trim() || null);
  const field = (n) => {
    const m = new RegExp("\\b" + n + "\\s*=\\s*", "i").exec(t);
    if (!m) return null;
    const i = m.index + m[0].length,
      c = t[i];
    if (c === "{") {
      let d = 0;
      for (let j = i; j < t.length; j++) {
        if (t[j] === "{") d++;
        else if (t[j] === "}" && --d === 0) return norm(t.slice(i + 1, j));
      }
      return null;
    }
    if (c === '"') {
      for (let j = i + 1; j < t.length; j++)
        if (t[j] === '"' && t[j - 1] !== "\\") return norm(t.slice(i + 1, j));
      return null;
    }
    const e = t.slice(i).search(/[,\r\n]/);
    return norm(e < 0 ? t.slice(i) : t.slice(i, i + e));
  };
  const y = field("year");
  return {
    title: field("title"),
    authors: field("author"),
    year: /^\d+$/.test(y || "") ? +y : null,
    doi: field("doi"),
    journal: field("journal"),
  };
}

// картинка сжимается в браузере: до 1600 px по длинной стороне, JPEG ~0.82
async function shrink(f) {
  const bmp = await createImageBitmap(f);
  const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const c = Object.assign(document.createElement("canvas"), {
    width: Math.round(bmp.width * k),
    height: Math.round(bmp.height * k),
  });
  const g = c.getContext("2d");
  g.fillStyle = "#fff";
  g.fillRect(0, 0, c.width, c.height);
  g.drawImage(bmp, 0, 0, c.width, c.height);
  let out;
  for (const q of [0.82, 0.7, 0.55, 0.4]) {
    out = c.toDataURL("image/jpeg", q);
    if (out.length < 850000) break; // лимит на стороне базы — 900 000 символов
  }
  return out;
}
const IMG_LIMIT = 10;
const imgBlock = (base, kind, title, hint) => {
  const list = getP(base + ".images") || [];
  const mine = list.map((im, i) => [im, i]).filter(([im]) => im.kind === kind);
  return (
    `<div class="imgs"><h5>${title}</h5><p class="hint">${hint}</p>` +
    `<div class="gallery">${mine
      .map(
        ([im, i]) =>
          `<figure><img src="${im.data}" alt=""><figcaption>${esc(im.filename)}</figcaption>` +
          `<button type="button" class="lnk" data-a="delimg" data-p="${base}.images" data-i="${i}">Убрать</button></figure>`
      )
      .join("")}</div>` +
    `<label class="btn upl">+ Добавить изображения<input type="file" accept="image/*" multiple hidden` +
    ` data-img="${base}.images" data-kind="${kind}"></label></div>`
  );
};

// ---------- состояние (черновик живёт в браузере до отправки) ----------
let R,
  D,
  done = false,
  unused = false;
const mk = {
  tests: () => ({ result: {} }),
  bricks: () => ({ type_id: R.bt[0]?.[0], tests: [mk.tests()] }),
  mortars: () => ({ tests: [mk.tests()] }),
  masonries: () => ({
    brick_i: 0,
    mortar_i: 0,
    type_id: R.mt[0]?.[0],
    tests: [mk.tests()],
    images: [],
  }),
};
const fresh = () =>
  (D = {
    step: 0,
    paper: null,
    bricks: [mk.bricks()],
    mortars: [mk.mortars()],
    masonries: [mk.masonries()],
  });
const getP = (p) => p.split(".").reduce((o, k) => o?.[k], D);
const setP = (p, v) => {
  const ks = p.split(".");
  let o = D;
  ks.slice(0, -1).forEach((k) => (o = o[k] ??= {}));
  o[ks.at(-1)] = v;
};

// ---------- поля ----------
const inp = (p, l, a = {}) =>
  `<label class="f">${l}<input type="number" data-p="${p}" data-n${a.i ? " data-i" : ""}` +
  `${a.r ? " required" : ""} step="${a.s ?? "any"}" min="${a.min ?? 0}"` +
  ` max="${a.max ?? ""}" value="${getP(p) ?? ""}"></label>`;
const txt = (p, l, a = {}) =>
  `<label class="f">${l}<input data-p="${p}"${a.r ? " required" : ""} value="${esc(getP(p), "")}">` +
  `</label>`;
const sel = (p, l, opts, none) =>
  `<label class="f">${l}<select data-p="${p}" data-n>${none ? `<option value="">— не указан —</option>` : ""}` +
  `${opts
    .map(
      ([v, t]) => `<option value="${v}"${getP(p) == v ? " selected" : ""}>${esc(t)}` + `</option>`
    )
    .join("")}` +
  `</select></label>`;
const testHTML = (base, j) => {
  const b = `${base}.tests.${j}`;
  return (
    `<div class="card sub"><div class="chead"><h5>Испытание ${j + 1}` +
    `</h5>${j ? `<button class="lnk" data-a="del" data-p="${b}">Удалить</button>` : ""}` +
    `</div>
  <div class="g3">${sel(b + ".standard_id", "Стандарт", R.st, 1)}` +
    `${inp(b + ".stress_state", "Напряжённое состояние", { min: -2, max: 2, s: 0.01 })}` +
    `${inp(b + ".orientation", "Ориентация (°)", { max: 90 })}
  ${inp(b + ".size_max", "Макс. размер образца (м)", { max: 99.999, s: 0.001 })}` +
    `${inp(b + ".size_avg", "Средний размер (м)", { max: 99.999, s: 0.001 })}` +
    `${inp(b + ".size_min", "Мин. размер (м)", { max: 99.999, s: 0.001 })}` +
    `</div>
  <div class="g3">${txt(b + ".result.title", "Название результата")}` +
    `${inp(b + ".result.el_modulus", "Упругий модуль (МПа)", { max: 9999 })}` +
    `${inp(b + ".result.displ_ult", "Пред. перемещение (мм)", { max: 99.99 })}
  ${inp(b + ".result.force_ult", "Пред. сила (Н)", { max: 99999 })}` +
    `${inp(b + ".result.work_fracture", "Работа разрушения (Н·мм)", { max: 9999999 })}` +
    `</div>
  <div class="csvrow">Кривая «сила — перемещение» (CSV, по желанию)<button type="button"` +
    ` class="btn" data-a="exCsv">Пример CSV</button><input type="file"` +
    ` accept=".csv" data-csv="${b}.result"><span>${esc(getP(b + ".result.curve_filename"), "")}` +
    `</span></div></div>`
  );
};

function list(key, title, hint, noun, fields) {
  return (
    `<h3>${title}</h3><p class="hint">${hint}</p>` +
    D[key]
      .map(
        (it, i) =>
          `<div class="card"><div class="chead"><h4>${noun} ${i + 1}</h4>` +
          `${D[key].length > 1 ? `<button class="lnk" data-a="del" data-p="${key}.${i}">Удалить</button>` : ""}` +
          `</div>
  <div class="g2">${fields(`${key}.${i}`)}</div><h5 style="margin:6px 0 10px">Испытания</h5>` +
          `${it.tests.map((_, j) => testHTML(`${key}.${i}`, j)).join("")}` +
          `<button class="btn" data-a="add" data-p="${key}.${i}.tests">+ Ещё испытание</button>` +
          `</div>`
      )
      .join("") +
    `<button class="btn" data-a="add" data-p="${key}">+ Добавить ${noun.toLowerCase()}` +
    `</button>`
  );
}
const bLabel = (b, i) =>
  `#${i + 1} — ${R.bt.find((t) => t[0] == b.type_id)?.[1] ?? "?"} | ${b.density ?? "—"} кг/м³`;
const mLabel = (m, i) =>
  `#${i + 1} | плотность ${m.density ?? "—"} кг/м³, E ${m.elastic_modulus ?? "—"} МПа`;
const VIEWS = [
  () =>
    `<h3>Статья</h3><p class="hint">Загрузите файл .bib — название, авторы и год подставятся сами. Их можно поправить вручную.</p>
    <div class="card">` +
    `<div class="csvrow"><input type="file" accept=".bib" data-bib>` +
    `<button class="btn" data-a="exBib">Пример .bib</button></div>` +
    `</div>` +
    (D.paper
      ? `<div class="card">${txt("paper.title", "Название статьи *", { r: 1 })}` +
        `<label class="f" style="margin:12px 0">Авторы<textarea rows="3"` +
        ` data-p="paper.authors" placeholder="Surname, Name and Surname2, Name2">` +
        `${esc(D.paper.authors, "")}</textarea></label>
      <div class="g3">` +
        `${inp("paper.year", "Год публикации *", { i: 1, s: 1, min: 1, max: 3000, r: 1 })}` +
        `${txt("paper.doi", "DOI")}${txt("paper.journal", "Журнал / источник")}` +
        `</div></div>`
      : ""),
  () =>
    list(
      "bricks",
      "Кирпич",
      "Можно добавить несколько кирпичей.",
      "Кирпич",
      (p) =>
        sel(p + ".type_id", "Тип кирпича *", R.bt) +
        inp(p + ".density", "Плотность (кг/м³)", { i: 1, s: 1, max: 9999 }) +
        inp(p + ".voidness", "Пустотность (%)", { i: 1, s: 1, max: 100 }) +
        inp(p + ".specific_perimeter", "Удельный периметр (1/мм)", { max: 0.999, s: 0.001 })
    ),
  () =>
    list(
      "mortars",
      "Раствор",
      "Растворов тоже может быть несколько.",
      "Раствор",
      (p) =>
        inp(p + ".density", "Плотность (кг/м³)", { i: 1, s: 1, max: 9999 }) +
        inp(p + ".elastic_modulus", "Упругий модуль (МПа)", { i: 1, s: 1, max: 9999 }) +
        inp(p + ".strain_ult", "Предельная деформация", { max: 9.999, s: 0.001 }) +
        inp(p + ".stress_ult", "Предельное напряжение", { max: 9999.99, s: 0.01 })
    ),
  () =>
    list(
      "masonries",
      "Кладка",
      "Соберите кладку из добавленных кирпича и раствора.",
      "Кладка",
      (p) =>
        sel(
          p + ".brick_i",
          "Кирпич *",
          D.bricks.map((b, i) => [i, bLabel(b, i)])
        ) +
        sel(
          p + ".mortar_i",
          "Раствор *",
          D.mortars.map((m, i) => [i, mLabel(m, i)])
        ) +
        sel(p + ".type_id", "Тип кладки *", R.mt) +
        inp(p + ".mortar_thickness", "Толщина шва (мм)", { i: 1, s: 1, max: 99 }) +
        `<div class="span2">${imgBlock(p, "masonry", "Фото кладки", "Общий вид образца, можно несколько снимков.")}` +
        `${imgBlock(p, "scheme", "Схема испытания", "Схема нагружения, установка, расположение датчиков.")}</div>`
    ),
];
const TITLES = ["Статья", "Кирпич", "Раствор", "Кладка"];

function render() {
  if (done) {
    $("#main").innerHTML =
      `<div class="donep"><div class="tick">✓</div><h1>Заявка отправлена на проверку</h1>` +
      `<p class="hint">Спасибо! Администратор посмотрит данные; после одобрения эксперимент появится в каталоге.${unused ? "<br>Кирпичи и растворы, не вошедшие ни в одну кладку, не сохранены." : ""}` +
      `</p>
    <div class="acts" style="justify-content:center"><button class="btn primary"` +
      ` data-a="again">Добавить ещё эксперимент</button><a class="btn"` +
      ` href="index.html" style="text-decoration:none">Перейти в каталог</a>` +
      `</div></div>`;
    return;
  }
  if (D.step === 3)
    D.masonries.forEach((m) => {
      m.brick_i = Math.min(m.brick_i ?? 0, D.bricks.length - 1);
      m.mortar_i = Math.min(m.mortar_i ?? 0, D.mortars.length - 1);
    });
  $("#main").innerHTML =
    `<h1>Добавить эксперимент</h1><p class="hint">Четыре шага: статья, кирпич, раствор и кладка. Заявка уходит администратору на проверку.</p>
  <div class="stepper">` +
    `${TITLES.map(
      (t, i) =>
        `<div class="${i < D.step ? "done" : i === D.step ? "on" : ""}">` +
        `<span>${t}</span></div>`
    ).join("")}` +
    `</div>
  ${D.step ? `<div class="warn">Кирпичи и растворы, которые не войдут ни в одну кладку, при отправке не сохраняются.</div>` : ""}
  <div id="body">` +
    `${VIEWS[D.step]()}</div>
  <div class="acts">${D.step ? `<button class="btn" data-a="go" data-to="${D.step - 1}">← Назад</button>` : "<span></span>"}
  <button class="btn primary"` +
    ` ${D.step === 0 && !D.paper ? "disabled" : ""} data-a="${D.step === 3 ? "send" : "go"}"` +
    ` data-to="${D.step + 1}">${D.step === 3 ? "Отправить на проверку" : "Далее →"}` +
    `</button></div>`;
}
const valid = () => {
  const bad = $("#body").querySelector(":invalid");
  if (bad) {
    bad.reportValidity();
    return false;
  }
  return true;
};
const go = (to) => {
  if (to > D.step && !valid()) return;
  D.step = to;
  render();
  scrollTo({ top: 0, behavior: "smooth" });
};

async function send() {
  if (!valid()) return;
  const ub = [...new Set(D.masonries.map((m) => m.brick_i))],
    um = [...new Set(D.masonries.map((m) => m.mortar_i))];
  unused = ub.length < D.bricks.length || um.length < D.mortars.length;
  const payload = {
    paper: D.paper,
    bricks: ub.map((i) => ({ key: i, ...D.bricks[i] })),
    mortars: um.map((i) => ({ key: i, ...D.mortars[i] })),
    masonries: D.masonries.map((m) => ({
      brick_key: m.brick_i,
      mortar_key: m.mortar_i,
      type_id: m.type_id,
      mortar_thickness: m.mortar_thickness,
      tests: m.tests,
      images: m.images || [],
    })),
  };
  const body = JSON.parse(
    JSON.stringify(payload, (k, v) => (typeof v === "string" ? v.trim() || null : v))
  );
  const btn = $("[data-a=send]");
  btn.disabled = true;
  btn.textContent = "Сохранение…";
  const { error } = await sb.rpc("submit_experiment", { payload: body });
  if (error) {
    toast("Ошибка сохранения: " + error.message);
    btn.disabled = false;
    btn.textContent = "Отправить на проверку";
    return;
  }
  done = true;
  render();
  scrollTo({ top: 0 });
}

document.addEventListener("input", (e) => {
  const t = e.target;
  if (!t.dataset?.p) return;
  let v = t.value;
  if ("n" in t.dataset) {
    v = v === "" ? null : +v;
    if (v != null && "i" in t.dataset) v = Math.round(v);
  }
  setP(t.dataset.p, v);
  if (t.dataset.p.startsWith("paper.title"))
    $("[data-a=go]")?.toggleAttribute("disabled", !D.paper?.title);
});
document.addEventListener("change", async (e) => {
  const t = e.target,
    f = t.files?.[0];
  if (!f) return;
  if (t.dataset.img) {
    const arr = getP(t.dataset.img);
    for (const file of t.files) {
      if (arr.length >= IMG_LIMIT * 2) return toast("Слишком много изображений");
      if (arr.filter((x) => x.kind === t.dataset.kind).length >= IMG_LIMIT)
        return toast(`Не больше ${IMG_LIMIT} изображений в одной группе`);
      try {
        arr.push({ kind: t.dataset.kind, filename: file.name, data: await shrink(file) });
      } catch {
        toast(`Не удалось прочитать «${file.name}» как изображение`);
      }
    }
    render();
    return;
  }
  if ("bib" in t.dataset) {
    const bib = await rd(f);
    D.paper = { ...parseBib(bib), bib_filename: f.name, bib_content: bib };
    toast("Файл прочитан — проверьте поля");
    render();
  } else if (t.dataset.csv) {
    setP(t.dataset.csv + ".curve_content", await rd(f));
    setP(t.dataset.csv + ".curve_filename", f.name);
    t.nextElementSibling.textContent = f.name;
  }
});
document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-a]");
  if (!b) return;
  const a = b.dataset.a,
    p = b.dataset.p;
  if (a === "add") {
    getP(p).push(mk[p.split(".").at(-1)]());
    render();
  } else if (a === "del") {
    const ks = p.split("."),
      i = +ks.pop();
    getP(ks.join(".")).splice(i, 1);
    const f = { bricks: "brick_i", mortars: "mortar_i" }[ks[0]];
    if (f && ks.length === 1)
      D.masonries.forEach((m) => (m[f] = m[f] === i ? 0 : m[f] > i ? m[f] - 1 : m[f]));
    render();
  } else if (a === "delimg") {
    getP(p).splice(+b.dataset.i, 1);
    render();
  } else if (a === "go") go(+b.dataset.to);
  else if (a === "send") send();
  else if (a === "exCsv") file("example_curve.csv", EX_CSV);
  else if (a === "exBib") file("example.bib", EX_BIB);
  else if (a === "again") {
    done = false;
    fresh();
    render();
  }
});

(async () => {
  const q = (t) =>
    sb
      .from(t)
      .select("id,title")
      .order("id")
      .then((r) => (r.data || []).map((x) => [x.id, x.title]));
  const [bt, mt, st] = await Promise.all([q("brick_type"), q("masonry_type"), q("standard")]);
  R = { bt, mt, st };
  if (!bt.length || !mt.length) {
    $("#main").innerHTML =
      `<div class="note">Справочники пусты или недоступны. Проверьте js/config.js и политики чтения в Supabase.</div>`;
    return;
  }
  fresh();
  render();
})();
