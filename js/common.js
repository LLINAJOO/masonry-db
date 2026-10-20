import { SUPABASE_URL, SUPABASE_KEY } from "./config.js";
export const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
export const $ = (s, r = document) => r.querySelector(s);
export const esc = (v, e = "—") =>
  v == null || v === ""
    ? e
    : String(v).replace(
        /[&<>"']/g,
        (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]
      );
// ---------- тема: светлая / тёмная, по умолчанию как в системе ----------
const getTheme = () => {
  try {
    const t = localStorage.getItem("theme");
    if (t === "light" || t === "dark") return t;
  } catch {}
  return matchMedia("(prefers-color-scheme:dark)").matches ? "dark" : "light";
};
export const isDark = () => document.documentElement.dataset.theme === "dark";
function applyTheme(t, save) {
  document.documentElement.dataset.theme = t;
  if (save)
    try {
      localStorage.setItem("theme", t);
    } catch {}
  const b = $("[data-theme-btn]");
  if (b) b.setAttribute("aria-checked", t === "dark");
  dispatchEvent(new Event("themechange"));
}
applyTheme(getTheme());
const ROOT = new URL("../", import.meta.url).href; // работает и из /admin/, и из подпапки хостинга
// три раздела, как на сайте-образце: обзор, каталог, о проекте
const NAV = [
  ["overview.html", "Обзор базы", "▦"],
  ["index.html", "Каталог", "⛏"],
  ["about.html", "О проекте", "ⓘ"],
];
export function shell(page, title) {
  document.title = title + " — База каменных кладок";
  $("#sidebar").innerHTML =
    `<div class="aside-in"><div class="brand"><svg viewBox="0 0 44 32">` +
    `<rect y="22" width="20" height="9" rx="1.5" fill="#b8432a"/>` +
    `<rect x="23" y="22" width="20" height="9" rx="1.5" fill="#c4573a"/>` +
    `<rect x="11" y="11" width="20" height="9" rx="1.5" fill="#cf6a4b"/>` +
    `<rect class="brand__top" x="17" width="20" height="9" rx="1.5"` +
    ` fill="#a63d27"/></svg><div><span class="brand__name">Каменная кладка</span>` +
    `<span class="brand__sub">экспериментальная база данных</span>` +
    `</div></div>` +
    NAV.map(
      ([h, t, i]) =>
        `<a class="nav${h === page ? " on" : ""}" href="${ROOT}${h}">` + `${i}&nbsp; ${t}</a>`
    ).join("") +
    `<a class="nav add${page === "add.html" ? " on" : ""}" href="${ROOT}add.html">＋&nbsp; Добавить эксперимент</a>` +
    `<button class="nav" data-nav title="Скрыть боковую панель">‹&nbsp; Скрыть панель</button>` +
    `<div class="themerow"><span class="tg-ico">☀</span>` +
    `<button class="tgl" role="switch" data-theme-btn aria-label="Тёмная тема" title="Переключить тему">` +
    `<i></i></button><span class="tg-ico">☾</span></div>` +
    `</div>`;
  initNav();
  footer();
  applyTheme(getTheme());
  $("[data-theme-btn]").onclick = () => applyTheme(isDark() ? "light" : "dark", true);
}
function footer() {
  if ($(".foot")) return;
  const f = document.createElement("footer");
  f.className = "foot";
  f.innerHTML =
    `<div class="foot-in"><div><b>Каменная кладка</b><span>экспериментальная база данных</span></div>` +
    `<nav>${NAV.map(([h, t]) => `<a href="${ROOT}${h}">${t}</a>`).join("")}` +
    `<a href="${ROOT}add.html">Добавить эксперимент</a></nav>` +
    `<small>Данные из открытых научных публикаций · © ${new Date().getFullYear()}</small></div>`;
  document.body.append(f);
}
function initNav() {
  if ($(".navbtn")) return;
  let off = false;
  try {
    off = localStorage.getItem("nav") === "off";
  } catch {}
  const set = (v) => {
    document.body.classList.toggle("nav-off", v);
    try {
      localStorage.setItem("nav", v ? "off" : "on");
    } catch {}
  };
  document.body.classList.toggle("nav-off", off);
  const b = Object.assign(document.createElement("button"), {
    className: "navbtn",
    textContent: "☰",
    title: "Показать боковую панель",
  });
  b.setAttribute("aria-label", "Показать боковую панель");
  document.body.append(b);
  document.addEventListener("click", (e) => {
    if (e.target.closest("[data-nav],.navbtn")) set(!document.body.classList.contains("nav-off"));
  });
  requestAnimationFrame(() => requestAnimationFrame(() => $(".app")?.classList.add("ready")));
}
export function toast(text) {
  const t = Object.assign(document.createElement("div"), { className: "toast", textContent: text });
  $("#toasts").append(t);
  setTimeout(() => t.remove(), 3500);
}
// CSV кривой: 4 строки шапки, дальше «перемещение, сила»
export function parseCurve(csv) {
  const pts = (csv || "")
    .trim()
    .split(/\r?\n/)
    .slice(4)
    .map((l) => l.split(",").slice(0, 2).map(Number))
    .filter((p) => p.length === 2 && p.every(Number.isFinite));
  return pts.length ? { x: pts.map((p) => p[0]), y: pts.map((p) => p[1]) } : null;
}
