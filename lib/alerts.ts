import { PatientData, RegionData } from "../types";
import { pointInPolygon } from "./geo";

// Quantos casos do mesmo diagnóstico/sintoma numa mesma microrregião já contam como
// agrupamento digno de alerta. Baixo de propósito: o objetivo é sinalizar cedo, não esperar
// um surto óbvio.
export const ALERT_THRESHOLD = 2;

export interface HealthAlert {
  key: string;
  type: 'disease' | 'symptom';
  regionId: string;
  regionName: string;
  label: string;
  count: number;
  message: string;
}

/**
 * Cruza os casos (tabela "records") com as microrregiões desenhadas e sinaliza quando uma
 * mesma doença ou sintoma se repete >= ALERT_THRESHOLD vezes dentro de uma região — usado
 * para notificar "área tal com muitos casos de tal doença/sintoma".
 */
export function computeAlerts(patients: PatientData[], regions: RegionData[]): HealthAlert[] {
  const alerts: HealthAlert[] = [];

  for (const region of regions) {
    if (!Array.isArray(region.polygon) || region.polygon.length < 3) continue;
    const inside = patients.filter(p => pointInPolygon(p.lat, p.lng, region.polygon));
    if (inside.length === 0) continue;

    const diseaseCounts: Record<string, number> = {};
    const symptomCounts: Record<string, number> = {};
    inside.forEach(p => {
      p.diseases.forEach(d => { diseaseCounts[d] = (diseaseCounts[d] || 0) + 1; });
      p.symptoms.forEach(s => { symptomCounts[s] = (symptomCounts[s] || 0) + 1; });
    });

    Object.entries(diseaseCounts).forEach(([disease, count]) => {
      if (count < ALERT_THRESHOLD) return;
      alerts.push({
        key: `disease-${region.id}-${disease}`,
        type: 'disease',
        regionId: region.id,
        regionName: region.name,
        label: disease,
        count,
        message: `${region.name}: ${count} casos de ${disease}`,
      });
    });

    Object.entries(symptomCounts).forEach(([symptom, count]) => {
      if (count < ALERT_THRESHOLD) return;
      alerts.push({
        key: `symptom-${region.id}-${symptom}`,
        type: 'symptom',
        regionId: region.id,
        regionName: region.name,
        label: symptom,
        count,
        message: `${region.name}: agrupamento de ${symptom} (${count} casos)`,
      });
    });
  }

  return alerts.sort((a, b) => b.count - a.count);
}
