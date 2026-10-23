import { sb } from "./common.js";

// Названия типов испытаний по объектам: m — кладка, b — кирпич, r — раствор
const OBJ = { m: "кладки", b: "кирпича", r: "раствора" };
const GROUP = { m: "Испытания кладки", b: "Испытания кирпича", r: "Испытания раствора" };

// Столбцы таблицы и осей графика.
// k — ключ, name — полное название, unit — единицы, type — num (число) или txt (текст),
// group — раздел в списке «Столбцы», off — по умолчанию скрыт, get(r) → массив значений
const one = (k) => (r) => (r[k] == null || r[k] === "" ? [] : [r[k]]);
const col = (k, name, unit, type, group, extra = {}) => ({
  k,
  name,
  unit,
  type,
  group,
  label: unit ? `${name}, ${unit}` : name,
  get: one(k),
  ...extra,
});
const testCols = (p) => {
  const g = GROUP[p],
    off = p !== "m",
    f = (field) => (r) => r.t[p].map((x) => x[field]).filter((v) => v != null && v !== "");
  return [
    col(`${p}t_n`, `Число испытаний ${OBJ[p]}`, "", "num", g, { off, get: (r) => [r.t[p].length] }),
    col(`${p}t_std`, "Стандарт испытания", "", "txt", g, { off, get: f("std") }),
    col(`${p}t_sig`, "Напряжённое состояние", "", "num", g, { off, get: f("sig") }),
    col(`${p}t_alp`, "Ориентация", "°", "num", g, { off, get: f("alp") }),
    col(`${p}t_size`, "Максимальный размер образца", "м", "num", g, { off: true, get: f("size") }),
    col(`${p}t_E`, "Упругий модуль", "МПа", "num", g, { off, get: f("E") }),
    col(`${p}t_du`, "Предельное перемещение", "мм", "num", g, { off, get: f("du") }),
    col(`${p}t_fu`, "Предельная сила", "Н", "num", g, { off, get: f("fu") }),
    col(`${p}t_w`, "Работа разрушения", "Н·мм", "num", g, { off: true, get: f("w") }),
  ];
};
export const COLS = [
  col("src", "Источник", "", "txt", "Кладка"),
  col("mtype", "Тип кладки", "", "txt", "Кладка"),
  col("joint", "Толщина шва", "мм", "num", "Кладка"),
  ...testCols("m"),
  col("btype", "Тип кирпича", "", "txt", "Кирпич"),
  col("bdens", "Плотность кирпича", "кг/м³", "num", "Кирпич"),
  col("void", "Пустотность", "%", "num", "Кирпич"),
  col("perim", "Удельный периметр", "1/мм", "num", "Кирпич"),
  ...testCols("b"),
  col("mdens", "Плотность раствора", "кг/м³", "num", "Раствор"),
  col("mE", "Модуль упругости раствора", "МПа", "num", "Раствор"),
  col("mstrain", "Предельная деформация раствора", "", "num", "Раствор"),
  col("mstress", "Предельное напряжение раствора", "", "num", "Раствор"),
  ...testCols("r"),
];
export const GROUPS = ["Кладка", GROUP.m, "Кирпич", GROUP.b, "Раствор", GROUP.r];
export const COL = Object.fromEntries(COLS.map((c) => [c.k, c]));

// строка таблицы → текст ячейки
export const show = (c, r) => {
  const v = c.get(r);
  if (!v.length) return "—";
  return (c.type === "txt" ? [...new Set(v)] : v).join("; ");
};

const T = (kind) =>
  `${kind}_test(standard(title),stress_state,orientation,size_max,size_avg,size_min,` +
  `${kind}_test_result(title,el_modulus,displ_ult,force_ult,work_fracture,curve_filename))`;
const tests = (list, kind) =>
  (list || []).flatMap((t) => {
    const base = {
      std: t.standard?.title,
      sig: t.stress_state,
      alp: t.orientation,
      size: t.size_max,
      smin: t.size_min,
      savg: t.size_avg,
    };
    const res = t[kind + "_test_result"]?.length ? t[kind + "_test_result"] : [{}];
    return res.map((x) => ({
      ...base,
      title: x.title,
      E: x.el_modulus,
      du: x.displ_ult,
      fu: x.force_ult,
      w: x.work_fracture,
      curve: x.curve_filename,
    }));
  });

// Одобренные кладки со всеми параметрами и испытаниями (общий загрузчик страницы «База данных»)
export async function load() {
  const query = (paperCols) =>
    sb
      .from("masonry")
      .select(
        `id,mortar_thickness,brick_id,mortar_id,paper(${paperCols}),` +
          `masonry_type(title,description),${T("masonry")},` +
          `brick(id,density,voidness,specific_perimeter,brick_type(title),${T("brick")}),` +
          `mortar(id,density,elastic_modulus,strain_ult,stress_ult,${T("mortar")})`
      )
      .eq("status", "approved")
      .order("id");
  const base = "title,authors,year,doi,journal";
  // текст .bib нужен для библиографической ссылки; если читать его нельзя — работаем по полям
  let { data, error } = await query(base + ",bib_content");
  if (error) ({ data, error } = await query(base));
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
      paper: p,
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
      t: {
        m: tests(r.masonry_test, "masonry"),
        b: tests(b.brick_test, "brick"),
        r: tests(m.mortar_test, "mortar"),
      },
    };
  });
}
