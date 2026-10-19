import { sb, $, esc, shell, toast, parseCurve } from "./common.js";

shell("", "Панель администратора");

const main = $("#main");

// ---------- состояние ----------
let rows = []; // все заявки (лёгкий список, без кривых)
let filter = "pending"; // pending / approved / rejected / all
let firstLoad = true;
let email = "";
const curves = new Map(); // кривые из раскрытых заявок: номер → результат испытания
let curveCount = 0;

const STATUS = {
  pending: { label: "на проверке", color: "var(--wait)" },
  approved: { label: "одобрено", color: "var(--ok)" },
  rejected: { label: "отклонено", color: "var(--bad)" },
};

const FILTERS = [
  ["pending", "На проверке", "var(--wait)"],
  ["approved", "Одобрено", "var(--ok)"],
  ["rejected", "Отклонено", "var(--bad)"],
  ["all", "Все заявки", "var(--blue)"],
];

const HINTS = {
  pending: "Самые старые — сверху. Раскройте заявку, чтобы проверить данные и кривые.",
  approved: "Эти записи видны всем в каталоге. Номер здесь совпадает с номером в каталоге.",
  rejected: "Отклонённые заявки можно вернуть на проверку, одобрить или удалить.",
  all: "Все заявки, новые сверху. Раскройте заявку, чтобы увидеть данные и действия.",
};

const EMPTY = {
  pending: [
    "Всё проверено",
    "Новых заявок нет. Когда кто-нибудь отправит эксперимент, он появится здесь.",
  ],
  approved: ["Пока ничего не одобрено", "Одобренные заявки появятся здесь и в каталоге."],
  rejected: ["Отклонённых заявок нет", "Здесь будут заявки, которые вы отклонили."],
  all: ["Заявок пока нет", "Когда кто-нибудь отправит эксперимент, он появится здесь."],
};

// ---------- запросы к базе ----------
// испытания одной сущности (кирпича, раствора или кладки) вместе с результатами и кривыми
const tests = (kind) =>
  `${kind}_test(stress_state,orientation,size_max,size_avg,size_min,standard(title),` +
  `${kind}_test_result(title,el_modulus,displ_ult,force_ult,work_fracture,curve_filename,curve_content))`;

// для списка: только то, что нужно в строке заявки
const LIST_SELECT =
  "id,status,mortar_thickness,submitted_at,reviewed_at,note," +
  "paper(title,authors,year),masonry_type(title,description),brick(brick_type(title))";

// для раскрытой заявки: всё, включая кривые
const FULL_SELECT =
  "id,status,mortar_thickness,submitted_at,note," +
  "paper(id,title,authors,year,doi,journal,bib_filename,bib_content)," +
  "masonry_type(title,description)," +
  `brick(id,density,voidness,specific_perimeter,brick_type(title),${tests("brick")}),` +
  `mortar(id,density,elastic_modulus,strain_ult,stress_ult,${tests("mortar")}),` +
  tests("masonry");

// ---------- вспомогательное ----------
const formatDate = (iso) => (iso ? iso.slice(0, 10).split("-").reverse().join(".") : "—");

const typeName = (type) => {
  if (!type) return "—";
  return type.description ? `${type.title} — ${type.description}` : type.title;
};

const count = (status) =>
  status === "all" ? rows.length : rows.filter((r) => r.status === status).length;

// ---------- вход ----------
const LOCK =
  `<svg viewBox="0 0 24 24" width="44" height="44" fill="none"` +
  ` stroke="currentColor" stroke-width="2">` +
  `<rect x="5" y="11" width="14" height="9" rx="2"/>` +
  `<path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>`;

function login(message = "") {
  main.innerHTML = `
    <form class="login card" id="loginForm">
      ${LOCK}
      <h2>Вход для администратора</h2>
      <p class="hint">
        Здесь проверяют и публикуют заявки.
        Учётные записи создаются в Supabase → Authentication.
      </p>
      <label class="f">Почта
        <input name="email" type="email" required placeholder="admin@example.ru" autocomplete="username">
      </label>
      <label class="f">Пароль
        <input name="password" type="password" required autocomplete="current-password">
      </label>
      <button class="btn primary">Войти</button>
      <div class="err">${message}</div>
    </form>`;

  $("#loginForm").onsubmit = async (e) => {
    e.preventDefault();
    const form = e.target;
    $("button", form).disabled = true;
    const { data, error } = await sb.auth.signInWithPassword({
      email: form.email.value,
      password: form.password.value,
    });
    if (error || !data.user) {
      return login("Не подошли почта или пароль. Проверьте раскладку и попробуйте ещё раз.");
    }
    panel(data.user.email);
  };
}

// ---------- содержимое заявки ----------
const kv = (title, color, items) => `
  <div class="kv" style="--c:${color}">
    <h4>${title}</h4>
    <dl>
      ${items
        .map(([name, value, unit]) => {
          const withUnit = unit && value != null ? `<i>${unit}</i>` : "";
          return `<dt>${name}</dt><dd>${esc(value)}${withUnit}</dd>`;
        })
        .join("")}
    </dl>
  </div>`;

function testsTable(title, list, kind) {
  if (!list?.length) return "";
  let body = "";
  let curveButtons = "";

  for (const test of list) {
    const results = test[kind + "_test_result"]?.length ? test[kind + "_test_result"] : [{}];
    for (const res of results) {
      body += `
        <tr>
          <td>${esc(test.standard?.title)}</td>
          <td>${esc(test.stress_state)}</td>
          <td>${esc(test.orientation)}°</td>
          <td>${esc(test.size_min)}–${esc(test.size_max)} м</td>
          <td>${esc(res.el_modulus)}</td>
          <td>${esc(res.displ_ult)}</td>
          <td>${esc(res.force_ult)}</td>
          <td>${esc(res.work_fracture)}</td>
        </tr>`;

      if (res.curve_content) {
        const id = curveCount++;
        curves.set(id, res);
        curveButtons += `
          <details class="d" data-cv="${id}">
            <summary class="btn">Кривая ${esc(res.curve_filename)}</summary>
            <div class="cvplot"></div>
            <button class="btn" data-dl="${id}">Скачать ${esc(res.curve_filename)}</button>
          </details>`;
      }
    }
  }

  return `
    <div class="tt">${title}</div>
    <div class="tw">
      <table>
        <thead>
          <tr>
            <th>Стандарт</th><th>Напр. сост.</th><th>Ориентация</th><th>Размер</th>
            <th>E, МПа</th><th>Пред. перемещ., мм</th><th>Пред. сила, Н</th>
            <th>Работа разр., Н·мм</th>
          </tr>
        </thead>
        <tbody>${body}</tbody>
      </table>
    </div>
    ${curveButtons}`;
}

// кнопки зависят от статуса заявки
function actions(status) {
  const buttons = {
    pending: `
      <button class="btn primary" data-a="approve">Одобрить</button>
      <button class="btn" data-a="rej">Отклонить</button>`,
    approved: `
      <button class="btn" data-a="reopen">Вернуть на проверку</button>`,
    rejected: `
      <button class="btn primary" data-a="approve">Одобрить</button>
      <button class="btn" data-a="reopen">Вернуть на проверку</button>`,
  };

  return `
    <div class="acts2">
      ${buttons[status] || ""}
      <button class="btn danger" data-a="del">Удалить</button>

      <div class="box rej" hidden>
        <input type="search" class="note"
          placeholder="Причина отклонения, например: не хватает кривой испытания кладки">
        <button class="btn primary" data-a="reject">Подтвердить отклонение</button>
        <button class="btn" data-a="cancel">Отмена</button>
      </div>

      <div class="box del" hidden>
        <span class="warn" style="margin:0">
          Удалить заявку насовсем? Вместе с ней удалятся её испытания и кривые.
          Это действие нельзя отменить.
        </span>
        <button class="btn primary" data-a="delete">Да, удалить</button>
        <button class="btn" data-a="cancel">Отмена</button>
      </div>
    </div>`;
}

function requestBody(r) {
  const paper = r.paper || {};
  const brick = r.brick || {};
  const mortar = r.mortar || {};
  const doi = paper.doi && /^10\./.test(paper.doi) ? encodeURI(paper.doi) : null;
  const meta = [paper.authors, paper.year, paper.journal].filter(Boolean).join(", ");
  const doiLink = doi
    ? ` — DOI <a href="https://doi.org/${doi}" target="_blank" rel="noopener">${esc(paper.doi)}</a>`
    : "";
  const rejectedNote =
    r.status === "rejected" && r.note
      ? `<div class="warn">Причина отклонения: ${esc(r.note)}</div>`
      : "";

  return `
    ${rejectedNote}
    <div class="paper">
      <b>${esc(paper.title)}</b>
      <small>${esc(meta, "")}${doiLink}</small>
    </div>

    <details class="d">
      <summary class="btn">Исходный файл .bib</summary>
      ${
        paper.bib_content
          ? `<pre>${esc(paper.bib_content)}</pre>`
          : `<p class="hint">Файл не приложен</p>`
      }
    </details>

    <div class="kvrow">
      ${kv("Кладка", "var(--blue)", [
        ["Тип", typeName(r.masonry_type)],
        ["Толщина шва", r.mortar_thickness, "мм"],
      ])}
      ${kv("Кирпич", "#c4573a", [
        ["Тип", brick.brick_type?.title],
        ["Плотность", brick.density, "кг/м³"],
        ["Пустотность", brick.voidness, "%"],
        ["Уд. периметр", brick.specific_perimeter, "1/мм"],
      ])}
      ${kv("Раствор", "var(--wait)", [
        ["Плотность", mortar.density, "кг/м³"],
        ["Модуль упругости", mortar.elastic_modulus, "МПа"],
        ["Пред. деформация", mortar.strain_ult],
        ["Пред. напряжение", mortar.stress_ult],
      ])}
    </div>

    ${testsTable("Испытания кирпича", brick.brick_test, "brick")}
    ${testsTable("Испытания раствора", mortar.mortar_test, "mortar")}
    ${testsTable("Испытания кладки", r.masonry_test, "masonry")}
    ${actions(r.status)}`;
}

// ---------- список заявок ----------
function requestRow(r) {
  const paper = r.paper || {};
  const status = STATUS[r.status];
  const number = r.no ? `№${r.no}` : "—";
  const brickType = r.brick?.brick_type?.title;

  return `
    <details class="card req" data-req="${r.id}">
      <summary class="rsum">
        <span class="rno" title="Номер в каталоге">${number}</span>
        <span class="rmain">
          <b>${esc(paper.title)}</b>
          <small>
            кладка ${esc(r.masonry_type?.title)} · кирпич: ${esc(brickType)}
            · подана ${formatDate(r.submitted_at)}
          </small>
        </span>
        <i class="badge" style="--c:${status.color}">${status.label}</i>
      </summary>
      <div class="rbody"><p class="hint">Загрузка…</p></div>
    </details>`;
}

function visibleRows() {
  const list = filter === "all" ? [...rows] : rows.filter((r) => r.status === filter);
  if (filter === "pending") return list.sort((a, b) => a.id - b.id); // старые сверху
  if (filter === "approved") return list.sort((a, b) => a.no - b.no); // как в каталоге
  return list.sort((a, b) => b.id - a.id); // новые сверху
}

function render() {
  const list = visibleRows();
  const [emptyTitle, emptyText] = EMPTY[filter];
  const title = FILTERS.find((f) => f[0] === filter)[1];

  curves.clear();
  curveCount = 0;

  main.innerHTML = `
    <div class="top">
      <div>
        <h1>Панель администратора</h1>
        <p class="hint" style="margin:0">Вы вошли как ${esc(email)}</p>
      </div>
      <button class="btn" data-a="out">Выйти</button>
    </div>

    <div class="tiles">
      ${FILTERS.map(
        ([key, label, color]) => `
          <button class="tile${key === filter ? " on" : ""}" data-f="${key}" style="--c:${color}">
            <b>${count(key)}</b><span>${label}</span>
          </button>`
      ).join("")}
    </div>

    <h3 class="sec" style="margin-top:0">${title}: ${list.length}</h3>
    <p class="hint">${HINTS[filter]}</p>
    ${
      list.length
        ? list.map(requestRow).join("")
        : `<div class="empty"><h3>${emptyTitle}</h3>${emptyText}</div>`
    }`;
}

async function panel(mail) {
  email = mail || email;
  const { data, error } = await sb.from("masonry").select(LIST_SELECT).order("id");
  if (error) {
    main.innerHTML = `<div class="note">Не удалось загрузить заявки: ${esc(error.message)}</div>`;
    return;
  }

  rows = data;
  // Номер как в каталоге: порядковый номер среди одобренных, без дыр от удалённых заявок
  let n = 0;
  for (const r of rows) r.no = r.status === "approved" ? ++n : null;

  if (firstLoad) {
    filter = count("pending") ? "pending" : "all";
    firstLoad = false;
  }
  render();
}

// ---------- раскрытие заявки и кривых ----------
async function loadRequest(details) {
  if (details.dataset.loaded) return;
  details.dataset.loaded = 1;
  const body = $(".rbody", details);

  const { data, error } = await sb
    .from("masonry")
    .select(FULL_SELECT)
    .eq("id", +details.dataset.req)
    .single();

  if (error) {
    details.dataset.loaded = "";
    body.innerHTML = `<div class="note">Не удалось загрузить заявку: ${esc(error.message)}</div>`;
    return;
  }
  body.innerHTML = requestBody(data);
}

function drawCurve(details) {
  details.dataset.done = 1;
  const result = curves.get(+details.dataset.cv);
  const curve = parseCurve(result.curve_content);
  const target = $(".cvplot", details);

  if (!curve) {
    target.innerHTML =
      `<div class="warn">Кривую не удалось построить: ` +
      `в файле нет двух числовых столбцов после 4 строк шапки.</div>`;
    return;
  }

  const dark = matchMedia("(prefers-color-scheme:dark)").matches;
  const grid = "rgba(128,128,128,.18)";
  Plotly.newPlot(
    target,
    [
      {
        ...curve,
        type: "scatter",
        mode: "lines",
        line: { width: 2.2, shape: "spline", smoothing: 0.4, color: dark ? "#e05a3c" : "#c2452d" },
        hovertemplate: "Перемещение: %{x:.2f} мм<br>Сила: %{y:.2f} кН<extra></extra>",
      },
    ],
    {
      height: 280,
      paper_bgcolor: "rgba(0,0,0,0)",
      plot_bgcolor: "rgba(0,0,0,0)",
      margin: { l: 56, r: 8, t: 8, b: 44 },
      font: { family: "IBM Plex Sans", size: 12, color: getComputedStyle(document.body).color },
      xaxis: { title: "Перемещение, мм", gridcolor: grid },
      yaxis: { title: "Сила, кН", gridcolor: grid },
    },
    { responsive: true, displayModeBar: false }
  );
}

// событие toggle не всплывает, поэтому слушаем на стадии перехвата
main.addEventListener(
  "toggle",
  (e) => {
    const el = e.target;
    if (!el.open) return;
    if (el.dataset.req) loadRequest(el);
    else if (el.dataset.cv != null && !el.dataset.done) drawCurve(el);
  },
  true
);

// ---------- кнопки ----------
const DONE_MESSAGE = {
  approve: "Заявка одобрена и опубликована в каталоге",
  reject: "Заявка отклонена",
  reopen: "Заявка возвращена на проверку",
  delete: "Заявка удалена",
};

async function review(button, id, action, note) {
  button.disabled = true;
  const { error } = await sb.rpc("admin_review", { mid: id, act: action, note });
  if (error) {
    const outdated = error.message.includes("Неизвестное действие");
    toast(
      outdated
        ? "В базе устаревшая функция admin_review: обновите её (SQL из инструкции)."
        : "Ошибка: " + error.message
    );
    button.disabled = false;
    return;
  }
  toast(DONE_MESSAGE[action]);
  panel();
}

main.addEventListener("click", async (e) => {
  const button = e.target.closest("[data-a],[data-dl],[data-f]");
  if (!button) return;

  if (button.dataset.f) {
    filter = button.dataset.f;
    render();
    return;
  }

  if (button.dataset.dl) {
    const result = curves.get(+button.dataset.dl);
    const link = Object.assign(document.createElement("a"), {
      href: URL.createObjectURL(new Blob([result.curve_content], { type: "text/csv" })),
      download: result.curve_filename || "curve.csv",
    });
    link.click();
    URL.revokeObjectURL(link.href);
    return;
  }

  const action = button.dataset.a;
  const card = button.closest(".req");
  const id = +card?.dataset.req;

  if (action === "out") {
    await sb.auth.signOut();
    login();
  } else if (action === "rej") {
    $(".del", card).hidden = true;
    $(".rej", card).hidden = false;
    $(".note", card).focus();
  } else if (action === "del") {
    $(".rej", card).hidden = true;
    $(".del", card).hidden = false;
  } else if (action === "cancel") {
    card.querySelectorAll(".box").forEach((box) => (box.hidden = true));
  } else if (["approve", "reject", "reopen", "delete"].includes(action)) {
    const note = action === "reject" ? $(".note", card).value.trim() || null : null;
    review(button, id, action, note);
  }
});

sb.auth.getSession().then(({ data }) => {
  if (data.session) panel(data.session.user.email);
  else login();
});
