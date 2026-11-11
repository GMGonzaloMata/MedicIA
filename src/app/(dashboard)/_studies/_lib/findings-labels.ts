import type { FindingKey } from "@/modules/analyses/domain/findings";

// Nombre en español de cada hallazgo, en el lenguaje de un posible hallazgo y no de un diagnóstico. Los umbrales
// salen de las propias claves del modelo (fracción de eyección ≤ 45 %, grosor de pared ≥ 13 mm, presión pulmonar
// sistólica ≥ 45 mmHg, velocidad máxima de la regurgitación tricuspídea ≥ 3,2 m/s). La severidad «moderada o mayor» de
// las válvulas y del derrame sigue la descripción de EchoNext y está pendiente de confirmar por el responsable
// (specs/008-analisis-estudio-ecg/research.md, «Resultados de la implementación»).
const FINDING_LABELS = new Map<FindingKey, string>([
  ["lvef_lte_45", "Fracción de eyección del ventrículo izquierdo de 45 % o menos"],
  ["lvwt_gte_13", "Engrosamiento de la pared del ventrículo izquierdo (13 mm o más)"],
  ["aortic_stenosis", "Estenosis de la válvula aórtica (moderada o mayor)"],
  ["aortic_regurgitation", "Regurgitación de la válvula aórtica (moderada o mayor)"],
  ["mitral_regurgitation", "Regurgitación de la válvula mitral (moderada o mayor)"],
  ["tricuspid_regurgitation", "Regurgitación de la válvula tricúspide (moderada o mayor)"],
  ["pulmonary_regurgitation", "Regurgitación de la válvula pulmonar (moderada o mayor)"],
  ["rv_systolic_dysfunction", "Función sistólica reducida del ventrículo derecho"],
  ["pericardial_effusion", "Derrame pericárdico (moderado o mayor)"],
  ["pasp_gte_45", "Presión sistólica de la arteria pulmonar de 45 mmHg o más"],
  ["tr_max_gte_32", "Velocidad máxima de la regurgitación tricuspídea de 3,2 m/s o más"],
  ["shd", "Cardiopatía estructural"],
]);

export function findingLabel(key: FindingKey): string {
  return FINDING_LABELS.get(key) ?? key;
}

// Aclaración del hallazgo compuesto, que se muestra junto a su nombre.
export const COMPOSITE_NOTE = "al menos uno de los otros once";
