export interface PatientData {
  id: string;
  lat: number;
  lng: number;
  address: string;
  faixa_etaria: string;
  symptoms: string[];
  diseases: string[];
}

export interface RegionData {
  id: string;
  name: string;
  polygon: [number, number][]; // [lat, lng][]
  color: string;
}
