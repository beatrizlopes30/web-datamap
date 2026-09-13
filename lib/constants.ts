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

// Uma cor por sintoma (evita vermelho, reservado para "diagnóstico confirmado" no resto do
// app) — usado nos chips de filtro e no widget de sintomas mais comuns, pra diferenciar cada
// sintoma visualmente em vez de tudo ficar no mesmo amarelo.
export const SYMPTOM_COLORS = [
  '#f59e0b', // âmbar
  '#3b82f6', // azul
  '#10b981', // esmeralda
  '#8b5cf6', // violeta
  '#ec4899', // rosa
  '#06b6d4', // ciano
  '#f97316', // laranja
  '#84cc16', // lima
  '#6366f1', // índigo
  '#14b8a6', // teal
];

export function getSymptomColor(symptom: string): string {
  const index = SYMPTOM_OPTIONS.indexOf(symptom as (typeof SYMPTOM_OPTIONS)[number]);
  if (index === -1) return MARKER_COLOR_SYMPTOM;
  return SYMPTOM_COLORS[index % SYMPTOM_COLORS.length];
}
