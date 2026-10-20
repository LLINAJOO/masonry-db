import { sb } from "./common.js";

// Столбцы каталога: [поле, подпись, группа]
export const COLS = [
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

// Одобренные кладки со всеми параметрами (общий загрузчик каталога и обзора)
export async function load() {
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
