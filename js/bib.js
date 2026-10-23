// .bib → библиографическая запись по ГОСТ (формат: «Фамилия, И. О. Название / И. О. Фамилия // Журнал. – Год. – …»)
const clean = (s) =>
  String(s ?? "")
    .replace(/\\&/g, "&")
    .replace(/[{}]/g, "")
    .replace(/\s+/g, " ")
    .trim();

// значение поля с учётом вложенных скобок
function fieldOf(body, name) {
  const m = new RegExp("(?:^|[\\s,])" + name + "\\s*=\\s*", "i").exec(body);
  if (!m) return "";
  const i = m.index + m[0].length,
    c = body[i];
  if (c === "{") {
    let d = 0;
    for (let j = i; j < body.length; j++) {
      if (body[j] === "{") d++;
      else if (body[j] === "}" && --d === 0) return clean(body.slice(i + 1, j));
    }
    return "";
  }
  if (c === '"') {
    for (let j = i + 1; j < body.length; j++)
      if (body[j] === '"' && body[j - 1] !== "\\") return clean(body.slice(i + 1, j));
    return "";
  }
  const e = body.slice(i).search(/[,\r\n]/);
  return clean(e < 0 ? body.slice(i) : body.slice(i, i + e));
}

export function parseBibEntry(text) {
  const t = String(text ?? "");
  const h = /@(\w+)\s*\{/.exec(t);
  if (!h) return null;
  const body = t.slice(h.index + h[0].length);
  const e = { type: h[1].toLowerCase() };
  for (const k of [
    "title",
    "author",
    "editor",
    "journal",
    "booktitle",
    "publisher",
    "address",
    "year",
    "volume",
    "number",
    "pages",
    "doi",
    "edition",
    "series",
  ])
    e[k] = fieldOf(body, k);
  return e.title || e.author ? e : null;
}

// «Фамилия, Имя Отчество» или «Имя Фамилия» → { last, ini: ["И.", "О."] }
function person(s) {
  s = clean(s);
  let last, first;
  if (s.includes(",")) [last, first] = s.split(/,(.*)/s).map((x) => x.trim());
  else {
    const w = s.split(" ");
    last = w.pop();
    first = w.join(" ");
  }
  const ini = (first || "")
    .split(/\s+/)
    .filter(Boolean)
    .map((w) =>
      w
        .split("-")
        .filter(Boolean)
        .map((p) => (/^[\p{L}]/u.test(p) ? p[0].toUpperCase() + "." : p))
        .join("-")
    );
  return { last, ini };
}
const people = (s) => {
  const list = clean(s)
    .split(/\s+and\s+/i)
    .filter(Boolean);
  const others = list.length && /^others$/i.test(list.at(-1));
  return { list: (others ? list.slice(0, -1) : list).map(person), others };
};

const DASH = " – ";

export function formatGost(e) {
  if (!e) return "";
  const ru = /[А-Яа-яЁё]/.test(e.title || "");
  const L = ru
    ? { vol: "Т.", pg: "С.", others: "[и др.]", ed: "-е изд.", tot: "с." }
    : { vol: "Vol.", pg: "P.", others: "[et al.]", ed: " ed.", tot: "p." };
  const { list, others } = people(e.author || e.editor);
  const full = (p) => `${p.ini.join(" ")} ${p.last}`.trim();
  const first = list[0] ? `${list[0].last}, ${list[0].ini.join(" ")}`.replace(/, $/, "") : "";
  // при более чем трёх авторах в сведениях об ответственности перечисляются первые три
  const shown = list.slice(0, 3),
    more = others || list.length > 3;
  const resp = shown.map(full).join(", ") + (more ? " " + L.others : "");

  const pages = e.pages.replace(/\s*[-–—]+\s*/g, "-");
  const container = e.journal || e.booktitle;
  const strip = (x) => String(x).replace(/[.\s]+$/, "");
  // главная часть: «Фамилия, И. Название / И. Фамилия // Журнал»
  let head = (first ? strip(first) + ". " : "") + strip(e.title || "");
  if (resp) head += " / " + resp;
  if (container) head += " // " + strip(container);
  const seg = [head];
  if (e.type === "book" || e.type === "phdthesis" || e.type === "mastersthesis") {
    if (e.edition) seg.push(e.edition + L.ed);
    const place = [e.address, e.publisher].filter(Boolean).join(" : ");
    const imprint = [place, e.year].filter(Boolean).join(", ");
    if (imprint) seg.push(imprint);
    if (pages) seg.push(pages + " " + L.tot);
  } else {
    if (e.year) seg.push(e.year);
    if (e.volume) seg.push(`${L.vol} ${e.volume}`);
    if (e.number) seg.push(`№ ${e.number}`);
    if (pages) seg.push(`${L.pg} ${pages}`);
  }
  return seg.map(strip).join(DASH.replace(" – ", ". – ")) + ".";
}

// запись для показа: из текста .bib, а если его нет (старые записи) — из отдельных полей
export function sourceFromPaper(p) {
  p = p || {};
  const e =
    parseBibEntry(p.bib_content) ||
    (p.title || p.authors
      ? {
          type: "article",
          title: clean(p.title),
          author: p.authors,
          journal: clean(p.journal),
          year: p.year ? String(p.year) : "",
          volume: "",
          number: "",
          pages: "",
        }
      : null);
  return e ? formatGost(e) : "";
}
