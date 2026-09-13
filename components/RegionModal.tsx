import { useState } from 'react';
import dynamic from 'next/dynamic';
import { X } from 'lucide-react';

const Map = dynamic(() => import('./Map'), { 
  ssr: false,
  loading: () => <div className="w-full h-full bg-gray-100 flex items-center justify-center">Carregando mapa...</div>
});

interface RegionModalProps {
  onClose: () => void;
  onSave: (region: { name: string; color: string; polygon: [number, number][] }) => void;
  initialData?: { name: string; color: string; polygon: [number, number][] };
  existingRegions?: { id: string, name: string, polygon: [number, number][], color: string }[];
}

export default function RegionModal({ onClose, onSave, initialData, existingRegions }: RegionModalProps) {
  const [name, setName] = useState(initialData?.name || '');
  const [color, setColor] = useState(initialData?.color || '#3b82f6');
  const [polygon, setPolygon] = useState<[number, number][]>(initialData?.polygon || []);

  const handleSave = () => {
    if (!name.trim()) {
      alert('Por favor, informe o nome da microrregião.');
      return;
    }
    if (polygon.length < 3) {
      alert('Por favor, desenhe um polígono válido no mapa (pelo menos 3 pontos).');
      return;
    }
    onSave({ name, color, polygon });
  };

  return (
    <div className="fixed inset-0 z-[999] bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-md shadow-xl w-full max-w-4xl flex flex-col overflow-hidden h-[80vh]">
        
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-100 shrink-0">
          <h2 className="text-lg font-semibold text-gray-800">Nova Microrregião</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-full transition-colors">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 flex flex-col md:flex-row min-h-0">
          
          {/* Map Area */}
          <div className="flex-1 relative border-r border-gray-100 bg-gray-50">
            <div className="absolute top-2 left-2 z-[400] bg-white px-3 py-1.5 rounded shadow text-xs font-semibold text-gray-600 pointer-events-none">
              Clique no mapa para desenhar sua região
            </div>
            <Map 
              activeTool="polygon" 
              patients={[]} 
              onPolygonDrawn={setPolygon}
              viewMode="points"
              initialPolygon={initialData?.polygon}
              activeColor={color}
              activeName={name}
              externalRegions={existingRegions}
            />
          </div>

          {/* Form Area */}
          <div className="w-full md:w-80 p-6 flex flex-col shrink-0 overflow-y-auto">
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-1">Nome da Região</label>
              <input 
                type="text" 
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Ex: Zona Sul, Centro..."
                value={name}
                onChange={e => setName(e.target.value)}
              />
            </div>

            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-1">Cor de Preenchimento</label>
              <div className="flex items-center gap-3">
                <input 
                  type="color" 
                  className="w-10 h-10 rounded cursor-pointer border-0 p-0"
                  value={color}
                  onChange={e => setColor(e.target.value)}
                />
                <span className="text-sm text-gray-600 font-mono uppercase bg-gray-50 px-2 py-1 rounded border border-gray-200">
                  {color}
                </span>
              </div>
            </div>

            <div className="mt-auto pt-6 border-t border-gray-100 flex gap-2">
              <button 
                onClick={onClose}
                className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50 transition-colors"
              >
                Cancelar
              </button>
              <button 
                onClick={handleSave}
                className="flex-1 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded hover:bg-blue-700 transition-colors shadow-sm"
              >
                Salvar Região
              </button>
            </div>
          </div>
          
        </div>
      </div>
    </div>
  );
}
