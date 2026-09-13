import { createClient } from '../lib/supabase/client';
import { PatientData } from '../types';

export const patientService = {
  /**
   * Busca todos os pacientes no banco (exemplo)
   */
  getPatients: async (): Promise<PatientData[]> => {
    const supabase = createClient();
    const { data, error } = await supabase.from('records').select('*');
    
    if (error) {
      console.error('Erro ao buscar pacientes:', error);
      throw error;
    }
    
    return data as PatientData[];
  },

  /**
   * Adiciona um novo paciente (exemplo)
   */
  createPatient: async (patient: Omit<PatientData, 'id'>): Promise<PatientData> => {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('records')
      .insert(patient)
      .select()
      .single();
      
    if (error) {
      console.error('Erro ao criar paciente:', error);
      throw error;
    }
    
    return data as PatientData;
  }
};
