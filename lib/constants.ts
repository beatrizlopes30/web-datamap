// Mesmo vocabulário fixo usado pelo app mobile (mobile-app/lib/publicHealthFeed.ts) para
// classificar sintomas/doenças ao publicar um caso — mantém os filtros daqui em sincronia
// com o que realmente pode vir preenchido no banco.
export const SYMPTOM_OPTIONS = [
  'Febre',
  'Tosse',
  'Cansaço',
  'Dor de cabeça',
  'Coriza',
  'Náusea',
  'Falta de ar',
  'Manchas na pele',
  'Dor no corpo',
  'Dor nas articulações',
] as const;

export const DISEASE_OPTIONS = [
  'Gripe',
  'Dengue',
  'Hipertensão',
  'Asma',
  'Zika',
  'COVID-19',
  'Diabetes',
  'Malária',
  'Tuberculose',
  'Chikungunya',
] as const;

// Vermelho: caso com diagnóstico/doença confirmada. Amarelo: qualquer outro caso (só
// sintoma, ou sem nenhuma classificação ainda) — sempre um dos dois, nunca uma terceira cor.
export const MARKER_COLOR_DIAGNOSIS = '#ef4444';
export const MARKER_COLOR_SYMPTOM = '#f59e0b';

export function getMarkerColor(patient: { diseases?: string[] }): string {
  return patient.diseases && patient.diseases.length > 0 ? MARKER_COLOR_DIAGNOSIS : MARKER_COLOR_SYMPTOM;
}
