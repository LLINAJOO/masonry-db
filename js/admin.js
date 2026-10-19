import { sb, $, esc, shell, toast, parseCurve } from "./common.js";
shell("", "Панель администратора");
const main = $("#main"),
  curves = new Map();
let n = 0;
const T = (k) =>
  `${k}_test(stress_state,orientation,size_max,size_avg,size_min,standard(title),${k}_test_result(title,el_modulus,displ_ult,force_ult,work_fracture,curve_filename,curve_content))`;
const SEL =
  `id,status,mortar_thickness,submitted_at,note,paper(id,title,authors,year,doi,journal,bib_filename,bib_content),` +
  `masonry_type(title),brick(id,density,voidness,specific_perimeter,brick_type(title),${T("brick")}),` +
  `mortar(id,density,elastic_modulus,strain_ult,stress_ult,${T("mortar")}),${T("masonry")}` +
  ``;
const LOCK =
  `<svg viewBox="0 0 24 24" width="44" height="44" fill="none"` +
  ` stroke="currentColor" stroke-width="2"><rect x="5" y="11" width="14"` +
  ` height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>`;

function login(msg = "") {
  main.innerHTML =
    `<form class="login card" id="lf">${LOCK}<h2>Вход для администратора</h2>` +
    `<p class="hint">Здесь проверяют и публикуют заявки. Учётные записи создаются в Supabase → Authentication.</p>
  <label class="f">Почта<input name="e"` +
    ` type="email" required placeholder="admin@example.ru" autocomplete="username">` +
    `</label>
  <label class="f">Пароль<input name="p" type="password"` +
    ` required autocomplete="current-password"></label>
  <button class="btn primary">Войти</button>` +
    `<div class="err">${msg}</div></form>`;
  $("#lf").onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target,
      b = $("button", f);
    b.disabled = true;
    const { data, error } = await sb.auth.signInWithPassword({
      email: f.e.value,
      password: f.p.value,
    });
    if (error || !data.user)
      return login("Не подошли почта или пароль. Проверьте раскладку и попробуйте ещё раз.");
    panel(data.user.email);
  };
}

const kv = (t, c, rows) =>
  `<div class="kv" style="--c:${c}"><h4>${t}</h4><dl>${rows
    .map(
      ([k, v, u]) => `<dt>${k}</dt><dd>${esc(v)}${u && v != null ? `<i>${u}</i>` : ""}` + `</dd>`
    )
    .join("")}` + `</dl></div>`;
function tests(title, list, k) {
  if (!list?.length) return "";
  let rows = "",
    cv = "";
  for (const t of list)
    for (const r of t[k + "_test_result"]?.length ? t[k + "_test_result"] : [{}]) {
      rows +=
        `<tr><td>${esc(t.standard?.title)}</td><td>${esc(t.stress_state)}` +
        `</td><td>${esc(t.orientation)}°</td><td>${esc(t.size_min)}–${esc(t.size_max)} м</td>` +
        `<td>${esc(r.el_modulus)}</td><td>${esc(r.displ_ult)}</td><td>` +
        `${esc(r.force_ult)}</td><td>${esc(r.work_fracture)}</td></tr>`;
      if (r.curve_content) {
        const id = n++;
        curves.set(id, r);
        cv +=
          `<details class="d" data-cv="${id}"><summary class="btn">Кривая ${esc(r.curve_filename)}` +
          `</summary><div class="cvplot"></div><button class="btn" data-dl="${id}">Скачать ${esc(r.curve_filename)}` +
          `</button></details>`;
      }
    }
  return (
    `<div class="tt">${title}</div><div class="tw"><table><thead>` +
    `<tr><th>Стандарт</th><th>Напр. сост.</th><th>Ориентация</th>` +
    `<th>Размер</th><th>E, МПа</th><th>Пред. перемещ., мм</th><th>Пред. сила, Н</th>` +
    `<th>Работа разр., Н·мм</th></tr></thead><tbody>${rows}</tbody>` +
    `</table></div>${cv}`
  );
}
function card(r) {
  const p = r.paper || {},
    b = r.brick || {},
    m = r.mortar || {},
    mt = r.masonry_type || {},
    doi = p.doi && /^10\./.test(p.doi) ? encodeURI(p.doi) : null;
  const meta = [p.authors, p.year, p.journal].filter(Boolean).join(", ");
  return (
    `<div class="card req" data-id="${r.id}"><div class="req-head">` +
    `<b>Заявка #${r.id} — ${esc(mt.title)}</b><span>подана ${esc((r.submitted_at || "").slice(0, 10))}` +
    `<i class="badge" style="--c:var(--wait)">на проверке</i></span>` +
    `</div>
  <div class="paper"><b>${esc(p.title)}</b><small>${esc(meta, "")}` +
    `${
      doi
        ? ` — DOI <a href="https://doi.org/${doi}" target="_blank" rel="noopener">` +
          `${esc(p.doi)}</a>`
        : ""
    }` +
    `</small></div>
  <details class="d"><summary class="btn">Исходный файл .bib</summary>` +
    `${p.bib_content ? `<pre>${esc(p.bib_content)}</pre>` : `<p class="hint">Файл не приложен</p>`}` +
    `</details>
  <div class="kvrow">${kv("Кладка", "var(--blue)", [
    ["Тип", mt.title],
    ["Толщина шва", r.mortar_thickness, "мм"],
  ])}
  ${kv("Кирпич", "#c4573a", [
    ["Тип", b.brick_type?.title],
    ["Плотность", b.density, "кг/м³"],
    ["Пустотность", b.voidness, "%"],
    ["Уд. периметр", b.specific_perimeter, "1/мм"],
  ])}
  ${kv("Раствор", "var(--wait)", [
    ["Плотность", m.density, "кг/м³"],
    ["Модуль упругости", m.elastic_modulus, "МПа"],
    ["Пред. деформация", m.strain_ult],
    ["Пред. напряжение", m.stress_ult],
  ])}` +
    `</div>
  ${tests("Испытания кирпича", b.brick_test, "brick")}` +
    `${tests("Испытания раствора", m.mortar_test, "mortar")}${tests("Испытания кладки", r.masonry_test, "masonry")}
  <div class="acts2">` +
    `<button class="btn primary" data-a="approve">Одобрить</button>` +
    `<button class="btn" data-a="rej">Отклонить</button><button class="btn"` +
    ` data-a="del">Удалить</button>
  <div class="box rej" hidden>` +
    `<input type="search" class="note" placeholder="Причина отклонения, например: не хватает кривой испытания кладки">` +
    `<button class="btn primary" data-a="reject">Подтвердить отклонение</button>` +
    `<button class="btn" data-a="cancel">Отмена</button></div>
  <div class="box del"` +
    ` hidden><span class="warn" style="margin:0">Удалить заявку #${r.id} насовсем? Это действие нельзя отменить.</span>` +
    `<button class="btn primary" data-a="delete">Да, удалить</button>` +
    `<button class="btn" data-a="cancel">Отмена</button></div></div>` +
    `</div>`
  );
}

let email = "";
async function panel(mail) {
  email = mail || email;
  curves.clear();
  n = 0;
  const [all, pend] = await Promise.all([
    sb.from("masonry").select("status"),
    sb
      .from("masonry")
      .select(SEL)
      .eq("status", "pending")
      .order("submitted_at", { ascending: true }),
  ]);
  if (all.error || pend.error) {
    main.innerHTML =
      `<div class="note">Не удалось загрузить заявки: ${esc((all.error || pend.error).message)}` +
      `</div>`;
    return;
  }
  const c = (s) => all.data.filter((r) => r.status === s).length,
    list = pend.data;
  main.innerHTML =
    `<div class="top"><div><h1>Панель администратора</h1><p class="hint"` +
    ` style="margin:0">Вы вошли как ${esc(email)}</p></div><button class="btn"` +
    ` data-a="out">Выйти</button></div>
  <div class="tiles">${[
    ["На проверке", c("pending"), "var(--wait)"],
    ["Одобрено", c("approved"), "var(--ok)"],
    ["Отклонено", c("rejected"), "var(--bad)"],
  ]
    .map(
      ([l, v, col]) =>
        `<div class="tile" style="--c:${col}"><b>${v}</b><span>${l}</span>` + `</div>`
    )
    .join("")}` +
    `</div>` +
    (list.length
      ? `<h3 class="sec" style="margin-top:0">Заявки на проверку: ${list.length}` +
        `</h3><p class="hint">Самые старые — сверху. Раскройте кривые, чтобы проверить данные перед публикацией.</p>` +
        `${list.map(card).join("")}`
      : `<div class="empty"><h3>Всё проверено</h3>Новых заявок нет. Когда кто-нибудь отправит эксперимент, он появится здесь.</div>`);
}

main.addEventListener(
  "toggle",
  (e) => {
    // кривые строятся при первом раскрытии
    const d = e.target,
      id = d.dataset?.cv;
    if (id == null || !d.open || d.dataset.done) return;
    d.dataset.done = 1;
    const c = parseCurve(curves.get(+id).curve_content),
      el = $(".cvplot", d),
      dark = matchMedia("(prefers-color-scheme:dark)").matches;
    if (!c) {
      el.innerHTML = `<div class="warn">Кривую не удалось построить: в файле нет двух числовых столбцов после 4 строк шапки.</div>`;
      return;
    }
    Plotly.newPlot(
      el,
      [
        {
          ...c,
          type: "scatter",
          mode: "lines",
          line: {
            width: 2.2,
            shape: "spline",
            smoothing: 0.4,
            color: dark ? "#e05a3c" : "#c2452d",
          },
          hovertemplate: "Перемещение: %{x:.2f} мм<br>Сила: %{y:.2f} кН<extra></extra>",
        },
      ],
      {
        height: 280,
        paper_bgcolor: "rgba(0,0,0,0)",
        plot_bgcolor: "rgba(0,0,0,0)",
        margin: { l: 56, r: 8, t: 8, b: 44 },
        font: { family: "IBM Plex Sans", size: 12, color: getComputedStyle(document.body).color },
        xaxis: { title: "Перемещение, мм", gridcolor: "rgba(128,128,128,.18)" },
        yaxis: { title: "Сила, кН", gridcolor: "rgba(128,128,128,.18)" },
      },
      { responsive: true, displayModeBar: false }
    );
  },
  true
);

main.addEventListener("click", async (e) => {
  const b = e.target.closest("[data-a],[data-dl]");
  if (!b) return;
  if (b.dataset.dl) {
    const r = curves.get(+b.dataset.dl),
      a = Object.assign(document.createElement("a"), {
        href: URL.createObjectURL(new Blob([r.curve_content], { type: "text/csv" })),
        download: r.curve_filename || "curve.csv",
      });
    a.click();
    URL.revokeObjectURL(a.href);
    return;
  }
  const a = b.dataset.a,
    card = b.closest(".req"),
    id = +card?.dataset.id;
  if (a === "out") {
    await sb.auth.signOut();
    login();
  } else if (a === "rej") {
    $(".del", card).hidden = true;
    $(".rej", card).hidden = false;
    $(".note", card).focus();
  } else if (a === "del") {
    $(".rej", card).hidden = true;
    $(".del", card).hidden = false;
  } else if (a === "cancel") card.querySelectorAll(".box").forEach((x) => (x.hidden = true));
  else if (["approve", "reject", "delete"].includes(a)) {
    b.disabled = true;
    const { error } = await sb.rpc("admin_review", {
      mid: id,
      act: a,
      note: a === "reject" ? $(".note", card).value.trim() || null : null,
    });
    if (error) {
      toast("Ошибка: " + error.message);
      b.disabled = false;
      return;
    }
    toast(
      {
        approve: `Заявка #${id} одобрена и опубликована`,
        reject: `Заявка #${id} отклонена`,
        delete: `Заявка #${id} удалена`,
      }[a]
    );
    panel();
  }
});

sb.auth.getSession().then(({ data }) => (data.session ? panel(data.session.user.email) : login()));
