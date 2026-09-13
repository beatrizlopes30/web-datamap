"use client";

import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import dynamic from "next/dynamic";
import {
  Menu, Share2, Eye, EyeOff, HelpCircle, LayoutGrid, Layers, Globe,
  RefreshCcw, MousePointer2, ChevronDown, CheckSquare, Search,
  Map as MapIcon, Plus, Locate, MoreVertical, Circle, Hexagon,
  Settings2, Pencil, Trash2, X, Bell, AlertTriangle
} from "lucide-react";
import { PatientData, RegionData } from "../types";
import { patientService } from "../services/patientService";
import { regionService } from "../services/regionService";
import { SYMPTOM_OPTIONS, DISEASE_OPTIONS, getSymptomColor } from "../lib/constants";
import { computeAlerts, HealthAlert } from "../lib/alerts";
import Dropdown from "../components/Dropdown";
import RegionModal from "../components/RegionModal";
import ChipSelect from "../components/ChipSelect";
import type { FlyToTarget } from "../components/Map";

const Map = dynamic(() => import("../components/Map"), {
  ssr: false,
  loading: () => null
});

function downloadCsv(filename: string, rows: PatientData[]) {
  const header = ['id', 'faixa_etaria', 'sintomas', 'doencas', 'endereco', 'lat', 'lng'];
  const csvRows = rows.map(p => [
    p.id, p.faixa_etaria, p.symptoms.join('; '), p.diseases.join('; '), p.address, p.lat, p.lng
  ].map(field => `"${String(field).replace(/"/g, '""')}"`).join(','));
  const csv = [header.join(','), ...csvRows].join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

async function geocodeAddress(query: string): Promise<{ lat: number; lng: number; label: string } | null> {
  const res = await fetch(
    `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`,
    { headers: { 'Accept-Language': 'pt-BR' } }
  );
  if (!res.ok) return null;
  const results = await res.json();
  if (!Array.isArray(results) || results.length === 0) return null;
  return { lat: parseFloat(results[0].lat), lng: parseFloat(results[0].lon), label: results[0].display_name };
}

export default function Home() {
  const [activeTool, setActiveTool] = useState<'radius' | 'polygon' | null>(null);
  const [viewMode, setViewMode] = useState<'points' | 'heatmap'>('points');
  const [patients, setPatients] = useState<PatientData[]>([]);
  const [filteredPatients, setFilteredPatients] = useState<PatientData[]>([]);
  const [selectedRegionIds, setSelectedRegionIds] = useState<string[]>([]);
  const [regions, setRegions] = useState<RegionData[]>([]);
  const [isRegionModalOpen, setIsRegionModalOpen] = useState(false);
  const [hideOutside, setHideOutside] = useState(false);
  const [isFilterActive, setIsFilterActive] = useState(false);
  const [isRegionEditMode, setIsRegionEditMode] = useState(false);
  const [regionToEdit, setRegionToEdit] = useState<RegionData | null>(null);
  const [regionToDelete, setRegionToDelete] = useState<RegionData | null>(null);
  const [isRegionSearchOpen, setIsRegionSearchOpen] = useState(false);
  const [regionSearchQuery, setRegionSearchQuery] = useState('');
  const [activeSidebarTab, setActiveSidebarTab] = useState<'visualizacoes' | 'filtros'>('visualizacoes');
  const [symptomSearchQuery, setSymptomSearchQuery] = useState('');
  const [selectedDiseaseFilters, setSelectedDiseaseFilters] = useState<string[]>([]);
  const [selectedSymptomFilters, setSelectedSymptomFilters] = useState<string[]>([]);

  const [leftSidebarVisible, setLeftSidebarVisible] = useState(true);
  const [rightSidebarVisible, setRightSidebarVisible] = useState(true);
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [tileStyle, setTileStyle] = useState<'light' | 'dark'>('light');
  const [showLegend, setShowLegend] = useState(true);
  const [helpOpen, setHelpOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [isAddressSearchOpen, setIsAddressSearchOpen] = useState(false);
  const [addressQuery, setAddressQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [flyTo, setFlyTo] = useState<FlyToTarget | null>(null);
  const [resetViewToken, setResetViewToken] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [dismissedAlertKeys, setDismissedAlertKeys] = useState<string[]>([]);
  const [simulatedAlerts, setSimulatedAlerts] = useState<HealthAlert[]>([]);
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seenAlertKeysRef = useRef<Set<string> | null>(null);

  const showToast = useCallback((message: string) => {
    setToast(message);
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    toastTimeoutRef.current = setTimeout(() => setToast(null), 3000);
  }, []);

  const filteredBySymptoms = useMemo(() => {
    let result = patients;

    if (selectedDiseaseFilters.length > 0) {
      result = result.filter(p => p.diseases.some(d => selectedDiseaseFilters.includes(d)));
    }
    if (selectedSymptomFilters.length > 0) {
      result = result.filter(p => p.symptoms.some(s => selectedSymptomFilters.includes(s)));
    }
    if (symptomSearchQuery.trim()) {
      const terms = symptomSearchQuery.toLowerCase().split(' ').filter(Boolean);
      result = result.filter(p => {
        const allText = [...p.symptoms, ...p.diseases, p.address, p.faixa_etaria].join(' ').toLowerCase();
        return terms.every(term => allText.includes(term));
      });
    }
    return result;
  }, [patients, symptomSearchQuery, selectedDiseaseFilters, selectedSymptomFilters]);

  const toggleDiseaseFilter = useCallback((disease: string) => {
    setSelectedDiseaseFilters(prev => prev.includes(disease) ? prev.filter(d => d !== disease) : [...prev, disease]);
  }, []);

  const toggleSymptomFilter = useCallback((symptom: string) => {
    setSelectedSymptomFilters(prev => prev.includes(symptom) ? prev.filter(s => s !== symptom) : [...prev, symptom]);
  }, []);

  const loadData = useCallback(async () => {
    try {
      const [pts, regs] = await Promise.all([
        patientService.getPatients(),
        regionService.getRegions()
      ]);
      setPatients(pts);
      setFilteredPatients(pts);
      setRegions(regs);
    } catch (error) {
      console.error("Erro ao carregar dados:", error);
      showToast("Erro ao carregar dados do banco.");
    }
  }, [showToast]);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await loadData();
    setIsRefreshing(false);
    showToast("Dados atualizados.");
  }, [loadData, showToast]);

  const handleShare = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      showToast("Link copiado para a área de transferência!");
    } catch {
      showToast("Não foi possível copiar o link.");
    }
  }, [showToast]);

  const handleAddressSearch = useCallback(async () => {
    if (!addressQuery.trim()) return;
    setIsSearching(true);
    try {
      const result = await geocodeAddress(addressQuery);
      if (result) {
        setFlyTo({ lat: result.lat, lng: result.lng, zoom: 16 });
        showToast(`Local encontrado: ${result.label.split(',').slice(0, 2).join(', ')}`);
      } else {
        showToast("Endereço não encontrado.");
      }
    } catch {
      showToast("Falha ao buscar endereço.");
    } finally {
      setIsSearching(false);
    }
  }, [addressQuery, showToast]);

  const handleLocateMe = useCallback(() => {
    if (!navigator.geolocation) {
      showToast("Geolocalização não é suportada neste navegador.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setFlyTo({ lat: pos.coords.latitude, lng: pos.coords.longitude, zoom: 16 });
        showToast("Mapa centralizado na sua localização.");
      },
      () => showToast("Não foi possível obter sua localização."),
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }, [showToast]);

  const allRegionsSelected = regions.length > 0 && selectedRegionIds.length === regions.length;
  const toggleSelectAllRegions = useCallback(() => {
    setSelectedRegionIds(allRegionsSelected ? [] : regions.map(r => r.id));
  }, [allRegionsSelected, regions]);

  useEffect(() => {
    loadData();

    // Setup Supabase Realtime
    const { createClient } = require('../lib/supabase/client');
    const supabase = createClient();
    const channel = supabase
      .channel('records-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'records' },
        (payload: any) => {
          console.log('Realtime change received for records:', payload);
          // Reload all patients to ensure data consistency and to trigger map updates
          patientService.getPatients().then(pts => {
            setPatients(pts);
            // We only update filteredPatients here if no filter is active. 
            // If a filter is active, Map.tsx will re-run the spatial filter automatically 
            // because `patients` is a dependency in its useEffect.
            setFilteredPatients(prevFiltered => {
              // Wait, we need to access the current isFilterActive state.
              // It's better to rely on Map.tsx re-filtering. But Map.tsx calls onFilterChange.
              // So if we just update `patients`, Map.tsx's useEffect will run triggerSpatialFilter
              // which will call `onFilterChange` and update `filteredPatients`.
              return prevFiltered;
            });
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);
  
  const selectedRegions = useMemo(() => {
    return regions.filter(r => selectedRegionIds.includes(r.id));
  }, [selectedRegionIds, regions]);

  // Cruza todos os casos (não só os filtrados na tela) com as microrregiões para detectar
  // agrupamentos de doença/sintoma dignos de alerta.
  const alerts = useMemo(() => computeAlerts(patients, regions), [patients, regions]);
  const visibleAlerts = useMemo(
    () => [...simulatedAlerts, ...alerts].filter(a => !dismissedAlertKeys.includes(a.key)),
    [alerts, simulatedAlerts, dismissedAlertKeys]
  );

  // Gera um alerta de mentirinha (não mexe no banco) só pra mostrar como fica a notificação
  // em toast — útil pra demonstrar o recurso sem precisar esperar um agrupamento real de casos.
  const handleSimulateAlert = useCallback(() => {
    const isDisease = Math.random() < 0.5;
    const regionName = regions[Math.floor(Math.random() * regions.length)]?.name || 'Zona de Teste';
    const options = isDisease ? DISEASE_OPTIONS : SYMPTOM_OPTIONS;
    const label = options[Math.floor(Math.random() * options.length)];
    const count = 2 + Math.floor(Math.random() * 4);
    const message = isDisease
      ? `${regionName}: ${count} casos de ${label}`
      : `${regionName}: agrupamento de ${label} (${count} casos)`;
    const fakeAlert: HealthAlert = {
      key: `sim-${Date.now()}`,
      type: isDisease ? 'disease' : 'symptom',
      regionId: 'sim',
      regionName,
      label,
      count,
      message: `${message} (simulado)`,
    };
    setSimulatedAlerts(prev => [fakeAlert, ...prev]);
    showToast(`⚠️ ${fakeAlert.message}`);
  }, [regions, showToast]);

  // Notifica só quando um alerta é NOVO (não existia na última checagem) — na primeira
  // carga apenas registra o estado atual como base, sem disparar um toast pra cada um.
  useEffect(() => {
    const currentKeys = new Set(alerts.map(a => a.key));
    if (seenAlertKeysRef.current === null) {
      seenAlertKeysRef.current = currentKeys;
      return;
    }
    const newAlerts = alerts.filter(a => !seenAlertKeysRef.current!.has(a.key));
    newAlerts.forEach(a => showToast(`⚠️ ${a.message}`));
    seenAlertKeysRef.current = currentKeys;
  }, [alerts, showToast]);

  // Calculate widget data based on filtered patients
  const stats = useMemo(() => {
    const total = filteredPatients.length;
    if (total === 0) return { total: 0, diseaseCounts: [], symptomCounts: [], diagnosedCount: 0, notDiagnosedCount: 0 };

    const diseaseMap: Record<string, number> = {};
    const symptomMap: Record<string, number> = {};
    let diagnosedCount = 0;

    filteredPatients.forEach(p => {
      p.diseases.forEach(d => { diseaseMap[d] = (diseaseMap[d] || 0) + 1; });
      p.symptoms.forEach(s => { symptomMap[s] = (symptomMap[s] || 0) + 1; });
      if (p.diseases.length > 0) diagnosedCount++;
    });
    const notDiagnosedCount = total - diagnosedCount;

    const diseaseCounts = Object.entries(diseaseMap)
      .map(([name, count]) => ({ name, count, percent: Math.round((count / total) * 100) }))
      .sort((a, b) => b.count - a.count);

    const symptomCounts = Object.entries(symptomMap)
      .map(([name, count]) => ({ name, count, percent: Math.round((count / total) * 100) }))
      .sort((a, b) => b.count - a.count);

    return { total, diseaseCounts, symptomCounts, diagnosedCount, notDiagnosedCount };
  }, [filteredPatients]);

  const COLORS = ['#ef4444', '#f59e0b', '#3b82f6', '#10b981', '#8b5cf6', '#ec4899'];

  const handleFilterChange = useCallback((filtered: PatientData[], isActive: boolean) => {
    setFilteredPatients(filtered);
    setIsFilterActive(isActive);
  }, []);

  if (isPreviewMode) {
    return (
      <div className="h-screen w-screen relative bg-[#0a1428]">
        <Map
          activeTool={null}
          patients={filteredBySymptoms}
          displayPatients={hideOutside ? (isFilterActive ? filteredPatients : []) : filteredBySymptoms}
          onFilterChange={handleFilterChange}
          viewMode={viewMode}
          externalRegions={selectedRegions}
          tileStyle={tileStyle}
          flyTo={flyTo}
          onFlyToHandled={() => setFlyTo(null)}
          resetViewToken={resetViewToken}
          showLegend={showLegend}
        />
        <button
          onClick={() => setIsPreviewMode(false)}
          className="absolute top-4 right-4 z-[500] flex items-center gap-1.5 h-9 px-3 bg-white/95 hover:bg-white text-gray-800 text-xs font-semibold rounded shadow-lg transition-colors"
        >
          <X className="w-3.5 h-3.5" /> Sair da visualização
        </button>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen flex flex-col bg-[#f0f2f5] overflow-hidden text-[#1e2a3b] font-sans">
      
      {/* Top Navigation Bar */}
      <header className="h-12 bg-[#121c2d] flex items-center justify-between px-4 shrink-0 shadow-sm z-50 relative">
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 flex items-center justify-center shrink-0">
            <img src="/logo.svg" alt="DataMap" className="w-full h-full object-contain" />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-white font-medium text-[13px]">DataMap</span>
          </div>
        </div>
        
        <div className="flex items-center gap-3 relative">
          <button onClick={handleShare} className="h-7 px-3 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded flex items-center gap-1.5 transition-colors">
            <Share2 className="w-3.5 h-3.5" /> Share
          </button>
          <div className="h-7 flex rounded bg-[#202c3f] border border-[#2d3a4e]">
            <button
              onClick={() => setIsPreviewMode(true)}
              className="px-3 text-white text-xs font-medium hover:bg-[#2d3a4e] transition-colors border-r border-[#2d3a4e] flex items-center gap-1.5 rounded-l"
              title="Ver mapa em tela cheia"
            >
              Preview
            </button>
            <button
              onClick={() => setShowLegend(v => !v)}
              className={`px-2 transition-colors rounded-r ${showLegend ? 'text-white bg-[#2d3a4e]' : 'text-white/70 hover:text-white hover:bg-[#2d3a4e]'}`}
              title={showLegend ? "Ocultar legenda do mapa" : "Mostrar legenda do mapa"}
            >
              <Layers className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="w-px h-4 bg-white/20 mx-1" />
          <button onClick={() => setHelpOpen(true)} className="text-white/70 hover:text-white transition-colors" title="Ajuda">
            <HelpCircle className="w-4 h-4" />
          </button>
          <button
            onClick={() => setNotificationsOpen(v => !v)}
            className="relative text-white/70 hover:text-white transition-colors"
            title="Notificações"
          >
            <Bell className="w-4 h-4" />
            {visibleAlerts.length > 0 && (
              <span className="absolute -top-1.5 -right-1.5 min-w-[15px] h-[15px] px-[3px] rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center leading-none">
                {visibleAlerts.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setUserMenuOpen(v => !v)}
            className="w-7 h-7 rounded-full bg-indigo-500 overflow-hidden border border-[#2d3a4e] ml-1 flex items-center justify-center text-white text-[10px] font-bold"
            title="Conta"
          >
            U
          </button>
          {notificationsOpen && (
            <>
              <div className="fixed inset-0 z-[499]" onClick={() => setNotificationsOpen(false)} />
              <div className="absolute top-9 right-16 w-80 bg-white rounded shadow-xl border border-gray-200 z-[500] text-gray-700 max-h-96 flex flex-col">
                <div className="px-3 py-2.5 text-[13px] font-semibold border-b border-gray-100 flex items-center justify-between gap-1.5">
                  <span className="flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-500" /> Notificações
                  </span>
                  <button
                    onClick={handleSimulateAlert}
                    className="text-[10px] font-medium text-blue-600 hover:underline"
                    title="Disparar uma notificação de teste"
                  >
                    Simular
                  </button>
                </div>
                <div className="overflow-y-auto">
                  {visibleAlerts.length === 0 ? (
                    <p className="px-3 py-4 text-[12px] text-gray-400 italic">Nenhum alerta no momento.</p>
                  ) : (
                    visibleAlerts.map(alert => (
                      <div key={alert.key} className="px-3 py-2.5 border-b border-gray-50 last:border-b-0 flex items-start gap-2 hover:bg-gray-50">
                        <span className={`w-2 h-2 rounded-full mt-1 shrink-0 ${alert.type === 'disease' ? 'bg-red-500' : 'bg-amber-500'}`} />
                        <div className="flex-1">
                          <p className="text-[12px] font-medium text-gray-800">{alert.message}</p>
                          <p className="text-[10px] text-gray-400">{alert.type === 'disease' ? 'Concentração de diagnóstico' : 'Agrupamento de sintoma'}</p>
                        </div>
                        <button
                          onClick={() => setDismissedAlertKeys(prev => [...prev, alert.key])}
                          className="text-gray-300 hover:text-gray-500"
                          title="Dispensar"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </>
          )}
          {userMenuOpen && (
            <>
              <div className="fixed inset-0 z-[499]" onClick={() => setUserMenuOpen(false)} />
              <div className="absolute top-9 right-0 w-56 bg-white rounded shadow-xl border border-gray-200 z-[500] py-2 text-gray-700">
                <div className="px-3 py-1.5 text-[13px] font-semibold border-b border-gray-100 mb-1">Painel de Saúde Pública</div>
                <div className="px-3 py-1 text-[11px] text-gray-500">{patients.length} casos carregados</div>
                <div className="px-3 py-1 text-[11px] text-gray-500">{regions.length} microrregiões</div>
              </div>
            </>
          )}
        </div>
      </header>

      {/* Secondary Toolbar */}
      <div className="h-11 bg-white border-b border-gray-200 flex items-center justify-between px-2 shrink-0 z-40 relative">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setLeftSidebarVisible(v => !v)}
            className={`p-1.5 rounded transition-colors ${leftSidebarVisible ? 'text-blue-600 bg-blue-50 hover:bg-blue-100' : 'text-gray-500 hover:text-gray-800 hover:bg-gray-100'}`}
            title={leftSidebarVisible ? "Ocultar painel lateral" : "Mostrar painel lateral"}
          >
            <Layers className="w-4 h-4" />
          </button>
          <button
            onClick={() => setRightSidebarVisible(v => !v)}
            className={`p-1.5 rounded transition-colors ${rightSidebarVisible ? 'text-blue-600 bg-blue-50 hover:bg-blue-100' : 'text-gray-500 hover:text-gray-800 hover:bg-gray-100'}`}
            title={rightSidebarVisible ? "Ocultar painéis de indicadores" : "Mostrar painéis de indicadores"}
          >
            <LayoutGrid className="w-4 h-4" />
          </button>
          <button
            onClick={() => setTileStyle(t => t === 'light' ? 'dark' : 'light')}
            className={`p-1.5 rounded transition-colors ${tileStyle === 'dark' ? 'text-blue-600 bg-blue-50 hover:bg-blue-100' : 'text-gray-500 hover:text-gray-800 hover:bg-gray-100'}`}
            title="Alternar estilo do mapa base"
          >
            <Globe className="w-4 h-4" />
          </button>
          <button
            onClick={() => setResetViewToken(t => t + 1)}
            className="p-1.5 rounded text-gray-500 hover:text-gray-800 hover:bg-gray-100 transition-colors"
            title="Centralizar mapa"
          >
            <MapIcon className="w-4 h-4" />
          </button>
          <div className="w-px h-4 bg-gray-300 mx-1" />
          <button
            onClick={handleRefresh}
            className="p-1.5 rounded text-gray-500 hover:text-gray-800 hover:bg-gray-100 transition-colors"
            title="Atualizar dados"
          >
            <RefreshCcw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>

        <div className="flex items-center gap-1 border border-gray-200 rounded p-0.5 bg-gray-50 relative">

          <button
            onClick={() => setActiveTool(activeTool === 'radius' ? null : 'radius')}
            className={`p-1 rounded flex items-center justify-center transition-colors ${activeTool === 'radius' ? 'bg-white text-blue-600 border border-gray-200' : 'text-gray-400 hover:text-gray-700 border border-transparent'}`}
            title="Raio"
          >
            <Circle className="w-4 h-4" />
          </button>
          <button
            onClick={() => setActiveTool(activeTool === 'polygon' ? null : 'polygon')}
            className={`p-1 rounded flex items-center justify-center transition-colors ${activeTool === 'polygon' ? 'bg-white text-blue-600 border border-gray-200' : 'text-gray-400 hover:text-gray-700 border border-transparent'}`}
            title="Polígono"
          >
            <Hexagon className="w-4 h-4" />
          </button>

          <div className="w-px h-3 bg-gray-300 mx-1" />
          <button
            onClick={toggleSelectAllRegions}
            className={`p-1 rounded flex items-center justify-center transition-colors border ${allRegionsSelected ? 'bg-white text-blue-600 border-gray-200' : 'text-gray-400 hover:text-gray-700 border-transparent'}`}
            title={allRegionsSelected ? "Desmarcar todas as microrregiões" : "Selecionar todas as microrregiões"}
          >
            <CheckSquare className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setActiveTool(null)}
            className={`p-1 rounded flex items-center justify-center transition-colors border ${activeTool === null ? 'bg-white text-blue-600 border-gray-200' : 'text-gray-400 hover:text-gray-700 border-transparent'}`}
            title="Ponteiro (cancelar ferramenta de desenho)"
          >
            <MousePointer2 className="w-3.5 h-3.5" />
          </button>
          <div className="w-px h-3 bg-gray-300 mx-1" />
          <button
            onClick={() => setIsAddressSearchOpen(v => !v)}
            className={`p-1 rounded flex items-center justify-center transition-colors border ${isAddressSearchOpen ? 'bg-white text-blue-600 border-gray-200' : 'text-gray-400 hover:text-gray-700 border-transparent'}`}
            title="Buscar endereço no mapa"
          >
            <Search className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleLocateMe}
            className="p-1 rounded flex items-center justify-center transition-colors border border-transparent text-gray-400 hover:text-gray-700"
            title="Centralizar na minha localização"
          >
            <Locate className="w-3.5 h-3.5" />
          </button>

          {isAddressSearchOpen && (
            <div className="absolute top-full mt-1 right-0 w-64 bg-white border border-gray-200 rounded shadow-lg z-[100] p-2 flex items-center gap-1">
              <input
                autoFocus
                type="text"
                placeholder="Buscar endereço…"
                className="flex-1 border border-gray-300 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                value={addressQuery}
                onChange={e => setAddressQuery(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleAddressSearch(); }}
              />
              <button
                onClick={handleAddressSearch}
                disabled={isSearching}
                className="p-1.5 rounded bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50"
                title="Buscar"
              >
                <Search className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          <button onClick={() => setHelpOpen(true)} className="p-1.5 rounded text-gray-400 hover:text-gray-700" title="Ajuda">
            <HelpCircle className="w-4 h-4" />
          </button>
          <button
            onClick={() => setRightSidebarVisible(v => !v)}
            className={`flex items-center gap-1.5 h-8 px-2.5 rounded border transition-colors text-xs font-semibold ${rightSidebarVisible ? 'bg-blue-50 text-blue-600 border-blue-100 hover:bg-blue-100' : 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100'}`}
          >
            <LayoutGrid className="w-3.5 h-3.5" /> Painéis
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-row overflow-hidden relative">

        {/* Left Sidebar (Settings) */}
        {leftSidebarVisible && (
        <aside className="w-72 bg-white border-r border-gray-200 flex flex-col shrink-0 overflow-y-auto z-30">
          {/* Tabs */}
          <div className="flex border-b border-gray-200">
            <button 
              onClick={() => setActiveSidebarTab('visualizacoes')}
              className={`flex-1 py-3 text-[12px] font-medium transition-colors border-b-2 ${activeSidebarTab === 'visualizacoes' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-800 hover:bg-gray-50'}`}
            >
              Visualizações
            </button>
            <button 
              onClick={() => setActiveSidebarTab('filtros')}
              className={`flex-1 py-3 text-[12px] font-medium transition-colors border-b-2 ${activeSidebarTab === 'filtros' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-800 hover:bg-gray-50'}`}
            >
              Filtros
            </button>
          </div>

          {activeSidebarTab === 'visualizacoes' && (
            <>
              <div className="p-4 border-b border-gray-100 hidden">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-semibold text-[13px] text-gray-800">Camada Base</h2>
              <div className="flex gap-1 text-gray-400">
                <Eye className="w-3.5 h-3.5 cursor-pointer hover:text-gray-700" />
                <Menu className="w-3.5 h-3.5 cursor-pointer hover:text-gray-700" />
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 rounded bg-purple-600 flex items-center justify-center text-white text-[10px] font-bold">A</div>
              <span className="text-[12px] font-medium text-gray-700">Dados</span>
              <span className="text-[10px] text-gray-400 ml-auto bg-gray-100 px-1.5 py-0.5 rounded">Agregado · Quadbin</span>
            </div>
          </div>

          <div className="p-4 border-b border-gray-100">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-[13px] text-gray-800">Visualização</h2>
            </div>
            <Dropdown 
              options={[
                { id: 'points', label: 'Marcadores', icon: <LayoutGrid className="w-4 h-4" /> },
                { id: 'heatmap', label: 'Mapa de Calor', icon: <Layers className="w-4 h-4" /> }
              ]}
              value={viewMode}
              onChange={(val) => setViewMode(val as 'points' | 'heatmap')}
            />
          </div>

          <div className="p-4 border-b border-gray-100 hidden">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-[13px] text-gray-800">Célula</h2>
            </div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[12px] text-gray-600 flex items-center gap-1">Tamanho da agregação <HelpCircle className="w-3 h-3 text-gray-400" /></span>
              <div className="px-2 py-0.5 border border-gray-200 rounded text-[12px] text-gray-700">9</div>
            </div>
            <div className="mt-2 relative h-1.5 bg-gray-200 rounded-full">
              <div className="absolute left-0 top-0 h-full bg-blue-500 rounded-full w-[80%]"></div>
              <div className="absolute left-[80%] top-1/2 -translate-y-1/2 -ml-2 w-4 h-4 bg-white border border-gray-300 rounded-full shadow-sm cursor-pointer hover:scale-110 transition-transform"></div>
            </div>
          </div>

          <div className="p-4 border-b border-gray-100 flex flex-col gap-3">
            <div className="flex items-center justify-between">
                  <h2 className="font-semibold text-[13px] text-gray-800">Microrregiões</h2>
                  <div className="flex items-center gap-1">
                    <button 
                      onClick={() => setIsRegionSearchOpen(!isRegionSearchOpen)}
                      className={`p-1 rounded transition-colors ${isRegionSearchOpen ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 hover:bg-gray-200 text-gray-600'}`}
                      title="Buscar microrregião"
                    >
                      <Search className="w-3.5 h-3.5" />
                    </button>
                    <button 
                      onClick={() => setIsRegionEditMode(!isRegionEditMode)}
                      className={`p-1 rounded transition-colors ${isRegionEditMode ? 'bg-gray-200 text-gray-800' : 'bg-gray-100 hover:bg-gray-200 text-gray-600'}`}
                      title={isRegionEditMode ? "Sair do modo de edição" : "Editar microrregiões"}
                    >
                      <Settings2 className="w-3.5 h-3.5" />
                    </button>
                    <button 
                      onClick={() => setHideOutside(!hideOutside)}
                      className={`p-1 rounded transition-colors ${hideOutside ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 hover:bg-gray-200 text-gray-600'}`}
                      title={hideOutside ? "Mostrar todos os pacientes" : "Ocultar pacientes fora das microrregiões"}
                    >
                      {hideOutside ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                    </button>
                    <button 
                      onClick={() => { setRegionToEdit(null); setIsRegionModalOpen(true); }}
                      className="p-1 rounded bg-gray-100 hover:bg-gray-200 text-gray-600 transition-colors"
                      title="Adicionar Microrregião"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                {isRegionSearchOpen && (
                  <div>
                    <input 
                      type="text"
                      placeholder="Buscar região..."
                      className="w-full border border-gray-300 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                      value={regionSearchQuery}
                      onChange={e => setRegionSearchQuery(e.target.value)}
                    />
                  </div>
                )}
                <div className="flex flex-col max-h-40 overflow-y-auto border border-gray-200 rounded-md divide-y divide-gray-100 bg-white">
                  {regions.length === 0 ? (
                    <button 
                      onClick={() => { setRegionToEdit(null); setIsRegionModalOpen(true); }}
                      className="bg-blue-600 hover:bg-blue-700 text-white text-[12px] font-medium py-2 px-4 rounded-md transition-colors w-full"
                    >
                      Adicionar nova micro região
                    </button>
                  ) : (
                    regions.filter(r => r.name.toLowerCase().includes(regionSearchQuery.toLowerCase())).map(region => (
                      <div key={region.id} className="flex items-center justify-between group p-2 hover:bg-gray-50 transition-colors">
                      <label className="flex items-center gap-2 cursor-pointer flex-1">
                        <input 
                          type="checkbox" 
                          className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                          checked={selectedRegionIds.includes(region.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedRegionIds([...selectedRegionIds, region.id]);
                            } else {
                              setSelectedRegionIds(selectedRegionIds.filter(id => id !== region.id));
                            }
                          }}
                        />
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: region.color }}></div>
                        <span className="text-[13px] font-medium text-gray-700 group-hover:text-blue-600 transition-colors">{region.name}</span>
                      </label>
                      
                      {isRegionEditMode && (
                        <div className="flex items-center gap-1 opacity-100 transition-opacity ml-2">
                          <button 
                            onClick={() => { setRegionToEdit(region); setIsRegionModalOpen(true); }}
                            className="p-1 text-gray-400 hover:text-blue-600 bg-gray-50 hover:bg-blue-50 rounded"
                            title="Editar"
                          >
                            <Pencil className="w-3 h-3" />
                          </button>
                          <button 
                            onClick={() => setRegionToDelete(region)}
                            className="p-1 text-gray-400 hover:text-red-600 bg-gray-50 hover:bg-red-50 rounded"
                            title="Excluir"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      )}
                    </div>
                  )))}
                </div>
              </div>
            </>
          )}

          {activeSidebarTab === 'filtros' && (
            <div className="p-4 flex flex-col gap-4">
              <h2 className="font-semibold text-[13px] text-gray-800">Filtrar Pacientes</h2>

              <div>
                <input
                  type="text"
                  placeholder="Busca livre (endereço, faixa etária...)"
                  className="w-full border border-gray-300 rounded px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                  value={symptomSearchQuery}
                  onChange={e => setSymptomSearchQuery(e.target.value)}
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-semibold text-gray-600 uppercase tracking-wide">Diagnóstico</span>
                  {selectedDiseaseFilters.length > 0 && (
                    <button onClick={() => setSelectedDiseaseFilters([])} className="text-[10px] text-blue-600 hover:underline">Limpar</button>
                  )}
                </div>
                <ChipSelect options={DISEASE_OPTIONS} selected={selectedDiseaseFilters} onToggle={toggleDiseaseFilter} activeColor="#ef4444" />
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-semibold text-gray-600 uppercase tracking-wide">Sintoma</span>
                  {selectedSymptomFilters.length > 0 && (
                    <button onClick={() => setSelectedSymptomFilters([])} className="text-[10px] text-blue-600 hover:underline">Limpar</button>
                  )}
                </div>
                <ChipSelect options={SYMPTOM_OPTIONS} selected={selectedSymptomFilters} onToggle={toggleSymptomFilter} colorFor={getSymptomColor} />
              </div>

              <div className="pt-2 border-t border-gray-100 flex items-center justify-between">
                <p className="text-[11px] font-medium text-gray-700">
                  {filteredBySymptoms.length} pacientes encontrados
                </p>
                {(selectedDiseaseFilters.length > 0 || selectedSymptomFilters.length > 0 || symptomSearchQuery) && (
                  <button
                    onClick={() => { setSelectedDiseaseFilters([]); setSelectedSymptomFilters([]); setSymptomSearchQuery(''); }}
                    className="text-[10px] text-gray-500 hover:text-gray-700 underline"
                  >
                    Limpar tudo
                  </button>
                )}
              </div>
            </div>
          )}

        </aside>
        )}

        {/* Center Map Area */}
        <main className="flex-1 relative bg-[#0a1428] z-10">

          <div className="absolute inset-0 z-10">
            <Map
              activeTool={activeTool}
              patients={filteredBySymptoms}
              displayPatients={hideOutside ? (isFilterActive ? filteredPatients : []) : filteredBySymptoms}
              onFilterChange={handleFilterChange}
              viewMode={viewMode}
              externalRegions={selectedRegions}
              tileStyle={tileStyle}
              flyTo={flyTo}
              onFlyToHandled={() => setFlyTo(null)}
              resetViewToken={resetViewToken}
              showLegend={showLegend}
            />
          </div>

        </main>

        {/* Right Sidebar (Widgets) */}
        {rightSidebarVisible && (
        <aside className="w-[300px] bg-white border-l border-gray-200 flex flex-col shrink-0 overflow-y-auto z-30">

          {/* Total Cases Summary */}
          <div className="p-4 border-b border-gray-100">
            <h2 className="font-semibold text-[13px] text-gray-800 mb-2">{stats.total} casos em análise</h2>
            <div className="flex items-center gap-3 text-[10px] text-gray-500">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#ef4444]" />{stats.diagnosedCount} diagnosticados</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#f59e0b]" />{stats.notDiagnosedCount} sem diagnóstico</span>
            </div>
          </div>

          {/* Widget 1 - Doenças */}
          <div className="p-4 border-b border-gray-100">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-[13px] text-gray-800">Proporção</h3>
              <button onClick={() => downloadCsv('diagnosticos.csv', filteredPatients)} title="Exportar CSV">
                <MoreVertical className="w-3.5 h-3.5 text-gray-400 hover:text-gray-700 cursor-pointer" />
              </button>
            </div>

            <div className="relative w-36 h-36 mx-auto mb-4">
              {/* Dynamic Donut Chart via SVG */}
              <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                <circle cx="50" cy="50" r="40" fill="none" stroke="#e2e8f0" strokeWidth="12" />
                {stats.diseaseCounts.map((d, idx) => {
                  const dashOffset = 251.2 - (251.2 * (d.percent / 100));
                  // Calculate start angle based on previous segments
                  let accumPercent = 0;
                  for(let i = 0; i < idx; i++) accumPercent += stats.diseaseCounts[i].percent;
                  const rotateAngle = (accumPercent / 100) * 360;
                  
                  return (
                    <circle 
                      key={d.name}
                      cx="50" cy="50" r="40" 
                      fill="none" 
                      stroke={COLORS[idx % COLORS.length]} 
                      strokeWidth="12" 
                      strokeDasharray="251.2" 
                      strokeDashoffset={dashOffset}
                      transform={`rotate(${rotateAngle} 50 50)`}
                    />
                  );
                })}
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                <span className="text-xl font-bold text-gray-800">{stats.diseaseCounts.length > 0 ? stats.diseaseCounts[0].percent : 0}%</span>
                <span className="text-[9px] font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1 mt-1">
                  {stats.diseaseCounts.length > 0 ? stats.diseaseCounts[0].name.substring(0, 10) : 'N/A'}
                </span>
              </div>
            </div>
          </div>

          {/* Widget 2 - Casos Totais */}
          <div className="p-4 border-b border-gray-100">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-[13px] text-gray-800">Total na Área</h3>
              <button onClick={() => downloadCsv('diagnosticos.csv', filteredPatients)} title="Exportar CSV">
                <MoreVertical className="w-3.5 h-3.5 text-gray-400 hover:text-gray-700 cursor-pointer" />
              </button>
            </div>
            <p className="text-[11px] text-gray-500 mb-3">{stats.total} registrados</p>

            {stats.diseaseCounts.length === 0 ? (
              <p className="text-[11px] text-gray-400 italic">Nenhum diagnóstico registrado nos casos filtrados.</p>
            ) : (
              <div className="space-y-4">
                {stats.diseaseCounts.map((d, i) => (
                  <div key={d.name}>
                    <div className="flex justify-between text-[12px] font-semibold text-gray-700 mb-1">
                      <span className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                        {d.name}
                      </span>
                      <span className="flex items-center gap-2">
                        <span>{d.count}</span>
                        <span className="text-gray-400 font-normal">({d.percent}%)</span>
                      </span>
                    </div>
                    <div className="h-1.5 bg-gray-100 overflow-hidden">
                      <div className="h-full transition-all duration-300" style={{ width: `${d.percent}%`, backgroundColor: COLORS[i % COLORS.length] }}></div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Widget 3 - Sintomas mais comuns */}
          <div className="p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-[13px] text-gray-800">Sintomas mais comuns</h3>
              <button onClick={() => downloadCsv('sintomas.csv', filteredPatients)} title="Exportar CSV">
                <MoreVertical className="w-3.5 h-3.5 text-gray-400 hover:text-gray-700 cursor-pointer" />
              </button>
            </div>
            <p className="text-[11px] text-gray-500 mb-3">{stats.total} registrados</p>

            {stats.symptomCounts.length === 0 ? (
              <p className="text-[11px] text-gray-400 italic">Nenhum sintoma registrado nos casos filtrados.</p>
            ) : (
              <div className="space-y-3">
                {stats.symptomCounts.slice(0, 6).map((s) => (
                  <div key={s.name}>
                    <div className="flex justify-between text-[12px] font-semibold text-gray-700 mb-1">
                      <span className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: getSymptomColor(s.name) }} />
                        {s.name}
                      </span>
                      <span className="flex items-center gap-2">
                        <span>{s.count}</span>
                        <span className="text-gray-400 font-normal">({s.percent}%)</span>
                      </span>
                    </div>
                    <div className="h-1.5 bg-gray-100 overflow-hidden">
                      <div className="h-full transition-all duration-300" style={{ width: `${s.percent}%`, backgroundColor: getSymptomColor(s.name) }}></div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

        </aside>
        )}

      </div>

      {isRegionModalOpen && (
        <RegionModal 
          onClose={() => {
            setIsRegionModalOpen(false);
            setRegionToEdit(null);
          }}
          initialData={regionToEdit || undefined}
          existingRegions={regions.filter(r => r.id !== regionToEdit?.id)}
          onSave={async (newRegion) => {
            try {
              if (regionToEdit) {
                const saved = await regionService.updateRegion(regionToEdit.id, newRegion);
                setRegions(regions.map(r => r.id === saved.id ? saved : r));
              } else {
                const id = 'custom-' + Date.now();
                const regionToSave = { ...newRegion, id };
                const saved = await regionService.createRegion(regionToSave);
                setRegions([...regions, saved]);
                setSelectedRegionIds([...selectedRegionIds, saved.id]);
              }
              setIsRegionModalOpen(false);
              setRegionToEdit(null);
            } catch (error) {
              alert("Erro ao salvar a microrregião.");
            }
          }}
        />
      )}

      {regionToDelete && (
        <div className="fixed inset-0 z-[999] bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded shadow-xl w-full max-w-sm overflow-hidden">
            <div className="p-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="font-semibold text-gray-800">Excluir Microrregião</h2>
              <button onClick={() => setRegionToDelete(null)} className="text-gray-400 hover:text-gray-600">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 text-sm text-gray-600">
              Tem certeza que deseja apagar a microrregião <strong>{regionToDelete.name}</strong>?
            </div>
            <div className="p-4 border-t border-gray-100 flex gap-2 justify-end bg-gray-50">
              <button 
                onClick={() => setRegionToDelete(null)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button 
                onClick={async () => {
                  try {
                    await regionService.deleteRegion(regionToDelete.id);
                    setRegions(regions.filter(r => r.id !== regionToDelete.id));
                    setSelectedRegionIds(selectedRegionIds.filter(id => id !== regionToDelete.id));
                    setRegionToDelete(null);
                  } catch (e) {
                    alert("Erro ao excluir microrregião.");
                  }
                }}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded hover:bg-red-700 shadow-sm"
              >
                Apagar
              </button>
            </div>
          </div>
        </div>
      )}

      {helpOpen && (
        <div className="fixed inset-0 z-[999] bg-black/50 flex items-center justify-center p-4" onClick={() => setHelpOpen(false)}>
          <div className="bg-white rounded shadow-xl w-full max-w-md overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="font-semibold text-gray-800">Como usar o painel</h2>
              <button onClick={() => setHelpOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 text-[13px] text-gray-600 space-y-2 max-h-[70vh] overflow-y-auto">
              <p><strong>Bolinhas do mapa:</strong> vermelha = caso com diagnóstico confirmado, amarela = sem diagnóstico confirmado.</p>
              <p><strong>Filtros</strong> (aba na barra lateral): selecione doenças e/ou sintomas específicos, ou use a busca livre.</p>
              <p><strong>Raio / Polígono:</strong> desenhe uma área no mapa para filtrar espacialmente os casos exibidos.</p>
              <p><strong>Ponteiro:</strong> cancela a ferramenta de desenho ativa.</p>
              <p><strong>Selecionar tudo:</strong> marca/desmarca todas as microrregiões cadastradas de uma vez.</p>
              <p><strong>Busca (lupa na barra de ferramentas):</strong> localiza um endereço e centraliza o mapa nele.</p>
              <p><strong>Globo:</strong> alterna entre mapa base claro e escuro. <strong>Ícone de mapa:</strong> recentraliza a visualização.</p>
              <p><strong>Atualizar (seta circular):</strong> recarrega os dados mais recentes do banco.</p>
              <p><strong>Exportar (⋮ nos painéis à direita):</strong> baixa em CSV os casos atualmente filtrados.</p>
              <p><strong>Preview:</strong> mostra o mapa em tela cheia, sem os painéis.</p>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[999] bg-gray-900 text-white text-xs font-medium px-4 py-2 rounded shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
