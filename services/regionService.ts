import { createClient } from '../lib/supabase/client';
import { RegionData } from '../types';

export const regionService = {
  getRegions: async (): Promise<RegionData[]> => {
    const supabase = createClient();
    const { data, error } = await supabase.from('microregions').select('*');
    
    if (error) {
      console.error('Erro ao buscar regiões:', error);
      throw error;
    }
    
    return data as RegionData[];
  },

  createRegion: async (region: RegionData): Promise<RegionData> => {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('microregions')
      .insert(region)
      .select()
      .single();
      
    if (error) {
      console.error('Erro ao criar região:', error);
      throw error;
    }
    
    return data as RegionData;
  },

  updateRegion: async (id: string, updates: Partial<RegionData>): Promise<RegionData> => {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('microregions')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
      
    if (error) {
      console.error('Erro ao atualizar região:', error);
      throw error;
    }
    
    return data as RegionData;
  },

  deleteRegion: async (id: string): Promise<void> => {
    const supabase = createClient();
    const { error } = await supabase
      .from('microregions')
      .delete()
      .eq('id', id);
      
    if (error) {
      console.error('Erro ao deletar região:', error);
      throw error;
    }
  }
};
