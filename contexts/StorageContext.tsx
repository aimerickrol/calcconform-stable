import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import { Project, Building, FunctionalZone, Shutter, SearchResult, Note } from '@/types';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { persistImagesIfNeeded, removeImages, loadImagesForDisplay, cleanupOrphanImages, debugStorageReport } from '@/utils/imageStorage';
import { splitStringByBytes, joinChunks } from '@/utils/chunk';

// Interface pour la gestion du cache Service Worker
interface CacheManager {
  cacheData: (key: string, data: any) => Promise<void>;
  getCachedData: (key: string) => Promise<any>;
  clearCache: () => Promise<void>;
}

// Interface pour l'historique des calculs rapides
export interface QuickCalcHistoryItem {
  id: string;
  referenceFlow: number;
  measuredFlow: number;
  deviation: number;
  status: 'compliant' | 'acceptable' | 'non-compliant';
  color: string;
  timestamp: Date;
}

interface StorageContextType {
  // État de chargement
  isLoading: boolean;
  isInitialized: boolean;
  
  // Données principales
  projects: Project[];
  favoriteProjects: string[];
  favoriteBuildings: string[];
  favoriteZones: string[];
  favoriteShutters: string[];
  favoriteNotes: string[];
  quickCalcHistory: QuickCalcHistoryItem[];
  notes: Note[];
  
  // Actions pour les projets
  createProject: (projectData: Omit<Project, 'id' | 'createdAt' | 'updatedAt' | 'buildings'>) => Promise<Project>;
  updateProject: (id: string, updates: Partial<Project>) => Promise<Project | null>;
  deleteProject: (id: string) => Promise<boolean>;
  
  // Actions pour les bâtiments
  createBuilding: (projectId: string, buildingData: Omit<Building, 'id' | 'projectId' | 'createdAt' | 'functionalZones'>) => Promise<Building | null>;
  updateBuilding: (buildingId: string, updates: Partial<Building>) => Promise<Building | null>;
  deleteBuilding: (buildingId: string) => Promise<boolean>;
  deleteBuildings: (ids: string[]) => Promise<boolean>;
  
  // Actions pour les zones
  createFunctionalZone: (buildingId: string, zoneData: Omit<FunctionalZone, 'id' | 'buildingId' | 'createdAt' | 'shutters'>) => Promise<FunctionalZone | null>;
  updateFunctionalZone: (zoneId: string, updates: Partial<FunctionalZone>) => Promise<FunctionalZone | null>;
  deleteFunctionalZone: (zoneId: string) => Promise<boolean>;
  deleteZones: (ids: string[]) => Promise<boolean>;
  
  // Actions pour les volets
  createShutter: (zoneId: string, shutterData: Omit<Shutter, 'id' | 'zoneId' | 'createdAt' | 'updatedAt'>) => Promise<Shutter | null>;
  updateShutter: (shutterId: string, updates: Partial<Shutter>) => Promise<Shutter | null>;
  deleteShutter: (shutterId: string) => Promise<boolean>;
  deleteShuttersBatch: (ids: string[]) => Promise<boolean>;
  
  // Actions pour les favoris
  setFavoriteProjects: (favorites: string[]) => Promise<void>;
  setFavoriteBuildings: (favorites: string[]) => Promise<void>;
  setFavoriteZones: (favorites: string[]) => Promise<void>;
  setFavoriteShutters: (favorites: string[]) => Promise<void>;
  setFavoriteNotes: (favorites: string[]) => Promise<void>;
  
  // Actions pour l'historique
  addQuickCalcHistory: (item: Omit<QuickCalcHistoryItem, 'id' | 'timestamp'>) => Promise<void>;
  clearQuickCalcHistory: () => Promise<void>;
  removeQuickCalcHistoryItem: (itemId: string) => Promise<void>;
  getQuickCalcHistory: () => Promise<QuickCalcHistoryItem[]>;
  
  // Actions pour les notes
  createNote: (noteData: Omit<Note, 'id' | 'createdAt' | 'updatedAt'>) => Promise<Note>;
  updateNote: (id: string, updates: Partial<Note>) => Promise<Note | null>;
  deleteNote: (id: string) => Promise<boolean>;
  deleteNotes: (ids: string[]) => Promise<boolean>;
  
  // Recherche
  searchShutters: (query: string) => SearchResult[];
  
  // Utilitaires
  clearAllData: () => Promise<void>;
  getStorageInfo: () => { projectsCount: number; totalShutters: number; storageSize: string };
  getProjects: () => Promise<Project[]>;
  getFavoriteBuildings: () => Promise<string[]>;
  getFavoriteZones: () => Promise<string[]>;
  getFavoriteShutters: () => Promise<string[]>;
  getFavoriteNotes: () => Promise<string[]>;
  
  // Import/Export
  importProject: (project: Project, relatedNotes?: Note[]) => Promise<boolean>;
}

const StorageContext = createContext<StorageContextType | undefined>(undefined);

// Clés de stockage simplifiées
const STORAGE_KEYS = {
  PROJECTS: 'SIEMENS_PROJECTS',
  FAVORITE_PROJECTS: 'SIEMENS_FAV_PROJECTS',
  FAVORITE_BUILDINGS: 'SIEMENS_FAV_BUILDINGS',
  FAVORITE_ZONES: 'SIEMENS_FAV_ZONES',
  FAVORITE_SHUTTERS: 'SIEMENS_FAV_SHUTTERS',
  FAVORITE_NOTES: 'SIEMENS_FAV_NOTES',
  QUICK_CALC_HISTORY: 'SIEMENS_CALC_HISTORY',
  NOTES: 'SIEMENS_NOTES',
  NOTES_TMP: 'SIEMENS_NOTES_TMP',
  NOTES_META: 'SIEMENS_NOTES_META',
};

// Fonction utilitaire pour générer un ID unique
function generateUniqueId(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substr(2, 9);
  return `${timestamp}_${random}`;
}

// Fonction utilitaire sécurisée pour AsyncStorage
async function safeStorageOperation<T>(
  operation: () => Promise<T>,
  fallback: T,
  operationName: string
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    console.warn(`Storage ${operationName} failed:`, error);
    return fallback;
  }
}

interface StorageProviderProps {
  children: ReactNode;
}

export function StorageProvider({ children }: StorageProviderProps) {
  // États React pour toutes les données
  const [isLoading, setIsLoading] = useState(true);
  const [isInitialized, setIsInitialized] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [favoriteProjects, setFavoriteProjectsState] = useState<string[]>([]);
  const [favoriteBuildings, setFavoriteBuildingsState] = useState<string[]>([]);
  const [favoriteZones, setFavoriteZonesState] = useState<string[]>([]);
  const [favoriteShutters, setFavoriteShuttersState] = useState<string[]>([]);
  const [favoriteNotes, setFavoriteNotesState] = useState<string[]>([]);
  const [quickCalcHistory, setQuickCalcHistoryState] = useState<QuickCalcHistoryItem[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);

  // Ref pour maintenir la version la plus récente des projets
  const projectsRef = useRef<Project[]>([]);

  // Mutex partagé pour sérialiser toutes les écritures
  const saveQueueRef = useRef(Promise.resolve() as Promise<any>);
  const enqueue = <T,>(fn: () => Promise<T>) => {
    const next = saveQueueRef.current.then(fn, fn);
    saveQueueRef.current = next.catch(() => {});
    return next;
  };

  // Mettre à jour la ref chaque fois que l'état projects change
  useEffect(() => {
    projectsRef.current = projects;
  }, [projects]);

  // Initialisation au montage du provider
  useEffect(() => {
    initializeStorage();
  }, []);

  const initializeStorage = async () => {
    try {
      console.log('📦 Initialisation du stockage...');
      setIsLoading(true);
      
      // Charger les projets
      const projectsData = await safeStorageOperation(
        () => AsyncStorage.getItem(STORAGE_KEYS.PROJECTS),
        null,
        'getProjects'
      );

      try {
        if (projectsData && projectsData !== 'undefined' && projectsData !== 'null') {
          const parsedProjects = JSON.parse(projectsData);
          const processedProjects = Array.isArray(parsedProjects) ? parsedProjects.map((project: any) => ({
            ...project,
            createdAt: new Date(project.createdAt || Date.now()),
            updatedAt: new Date(project.updatedAt || Date.now()),
            startDate: project.startDate ? new Date(project.startDate) : undefined,
            endDate: project.endDate ? new Date(project.endDate) : undefined,
            buildings: (project.buildings || []).map((building: any) => ({
              ...building,
              createdAt: new Date(building.createdAt || Date.now()),
              functionalZones: (building.functionalZones || []).map((zone: any) => ({
                ...zone,
                createdAt: new Date(zone.createdAt || Date.now()),
                shutters: (zone.shutters || []).map((shutter: any) => ({
                  ...shutter,
                  createdAt: new Date(shutter.createdAt || Date.now()),
                  updatedAt: new Date(shutter.updatedAt || Date.now())
                }))
              }))
            }))
          })) : [];
          setProjects(processedProjects);
          console.log(`✅ ${processedProjects.length} projets chargés`);
        } else {
          console.log('📝 Aucun projet existant ou données invalides');
          setProjects([]);
        }
      } catch (error) {
        console.warn('Erreur parsing projets, initialisation par défaut:', error);
        setProjects([]);
      }

      // Charger les favoris de manière séquentielle pour éviter les problèmes
      const favProjectsData = await safeStorageOperation(
        () => AsyncStorage.getItem(STORAGE_KEYS.FAVORITE_PROJECTS),
        null,
        'getFavProjects'
      );
      try {
        setFavoriteProjectsState(favProjectsData && favProjectsData !== 'undefined' && favProjectsData !== 'null' ? JSON.parse(favProjectsData) : []);
      } catch (error) {
        console.warn('Erreur parsing favoris projets:', error);
        setFavoriteProjectsState([]);
      }

      const favBuildingsData = await safeStorageOperation(
        () => AsyncStorage.getItem(STORAGE_KEYS.FAVORITE_BUILDINGS),
        null,
        'getFavBuildings'
      );
      try {
        setFavoriteBuildingsState(favBuildingsData && favBuildingsData !== 'undefined' && favBuildingsData !== 'null' ? JSON.parse(favBuildingsData) : []);
      } catch (error) {
        console.warn('Erreur parsing favoris bâtiments:', error);
        setFavoriteBuildingsState([]);
      }

      const favZonesData = await safeStorageOperation(
        () => AsyncStorage.getItem(STORAGE_KEYS.FAVORITE_ZONES),
        null,
        'getFavZones'
      );
      try {
        setFavoriteZonesState(favZonesData && favZonesData !== 'undefined' && favZonesData !== 'null' ? JSON.parse(favZonesData) : []);
      } catch (error) {
        console.warn('Erreur parsing favoris zones:', error);
        setFavoriteZonesState([]);
      }

      const favShuttersData = await safeStorageOperation(
        () => AsyncStorage.getItem(STORAGE_KEYS.FAVORITE_SHUTTERS),
        null,
        'getFavShutters'
      );
      try {
        setFavoriteShuttersState(favShuttersData && favShuttersData !== 'undefined' && favShuttersData !== 'null' ? JSON.parse(favShuttersData) : []);
      } catch (error) {
        console.warn('Erreur parsing favoris volets:', error);
        setFavoriteShuttersState([]);
      }

      const favNotesData = await safeStorageOperation(
        () => AsyncStorage.getItem(STORAGE_KEYS.FAVORITE_NOTES),
        null,
        'getFavNotes'
      );
      try {
        setFavoriteNotesState(favNotesData && favNotesData !== 'undefined' && favNotesData !== 'null' ? JSON.parse(favNotesData) : []);
      } catch (error) {
        console.warn('Erreur parsing favoris notes:', error);
        setFavoriteNotesState([]);
      }

      // Charger l'historique
      const historyData = await safeStorageOperation(
        () => AsyncStorage.getItem(STORAGE_KEYS.QUICK_CALC_HISTORY),
        null,
        'getHistory'
      );
      
      try {
        if (historyData && historyData !== 'undefined' && historyData !== 'null') {
          const parsedHistory = JSON.parse(historyData);
          const processedHistory = Array.isArray(parsedHistory) ? parsedHistory.map((item: any) => ({
            ...item,
            timestamp: new Date(item.timestamp || Date.now())
          })) : [];
          setQuickCalcHistoryState(processedHistory);
        } else {
          setQuickCalcHistoryState([]);
        }
      } catch (error) {
        console.warn('Erreur parsing historique:', error);
        setQuickCalcHistoryState([]);
      }

      // Charger les notes
      const notesData = await safeStorageOperation(
        () => AsyncStorage.getItem(STORAGE_KEYS.NOTES),
        null,
        'getNotes'
      );
      
      try {
        // Essayer de charger les notes normalement d'abord
        let loadedNotes: any[] = [];
        
        if (notesData && notesData !== 'undefined' && notesData !== 'null') {
          try {
            const parsedNotes = JSON.parse(notesData);
            loadedNotes = Array.isArray(parsedNotes) ? parsedNotes : [];
            console.log('✅ Notes chargées normalement:', loadedNotes.length);
          } catch (parseError) {
            console.warn('⚠️ Erreur parsing notes normales, tentative chunks:', parseError);
            
            // Essayer de charger depuis les chunks
            try {
              const chunksMetaData = await AsyncStorage.getItem(`${STORAGE_KEYS.NOTES}_chunks_meta`);
              if (chunksMetaData) {
                const meta = JSON.parse(chunksMetaData);
                console.log('📦 Chargement depuis', meta.totalChunks, 'chunks...');
                
                const allChunks: any[] = [];
                for (let i = 0; i < meta.totalChunks; i++) {
                  const chunkData = await AsyncStorage.getItem(`${STORAGE_KEYS.NOTES}_chunk_${i}`);
                  if (chunkData) {
                    const chunk = JSON.parse(chunkData);
                    allChunks.push(...chunk);
                  }
                }
                
                loadedNotes = allChunks;
                console.log('✅ Notes chargées depuis chunks:', loadedNotes.length);
              }
            } catch (chunkError) {
              console.warn('⚠️ Erreur chargement chunks:', chunkError);
              loadedNotes = [];
            }
          }
        } else {
          console.log('📝 Aucune note existante');
          loadedNotes = [];
        }
        
        // Traiter les notes chargées
        const processedNotes = loadedNotes.map((note: any) => ({
          ...note,
          createdAt: new Date(note.createdAt || Date.now()),
          updatedAt: new Date(note.updatedAt || Date.now()),
          images: note.images || []
        }));
        
        setNotes(processedNotes);
        console.log(`✅ ${processedNotes.length} notes traitées et chargées`);
      } catch (error) {
        console.warn('Erreur parsing notes:', error);
        setNotes([]);
      }

      console.log('✅ Stockage initialisé avec succès');
      setIsInitialized(true);
    } catch (error) {
      console.error('❌ Erreur initialisation storage:', error);
      setIsInitialized(true);
    } finally {
      setIsLoading(false);
    }
  };

  // Fonction utilitaire pour sauvegarder les projets
  const saveProjects = (newProjects: Project[]) =>
    enqueue(async () => {
      try {
        await AsyncStorage.setItem(STORAGE_KEYS.PROJECTS, JSON.stringify(newProjects));
        setProjects(newProjects);
        
        // Invalider le cache du service worker sur web
        if (Platform.OS === 'web' && 'serviceWorker' in navigator) {
          try {
            const registration = await navigator.serviceWorker.ready;
            if (registration.active) {
              registration.active.postMessage({ type: 'INVALIDATE_CACHE' });
            }
          } catch (swError) {
            console.warn('Service Worker cache invalidation failed:', swError);
          }
        }
      } catch (error) {
        console.error('Erreur lors de la sauvegarde des projets:', error);
        throw error;
      }
    });

  // Sanity check: convertir tout base64 restant en file:// sur mobile
  const sanitizeNotesImages = async (notes: Note[]): Promise<Note[]> => {
    if (Platform.OS === 'web') {
      return notes; // Pas de conversion sur web
    }

    const sanitizedNotes: Note[] = [];
    
    for (const note of notes) {
      if (note.images && note.images.some(img => img.startsWith('data:image/'))) {
        console.log('🔧 Sanity check: conversion base64 → file:// pour note', note.id);
        const persistedImages = await persistImagesIfNeeded(note.images);
        sanitizedNotes.push({
          ...note,
          images: persistedImages
        });
      } else {
        sanitizedNotes.push(note);
      }
    }
    
    return sanitizedNotes;
  };

  // Sauvegarde avec chunking UTF-8
  const saveNotesWithUTF8Chunks = async (notes: Note[], dataString: string) => {
    const maxChunkSize = 500 * 1024; // 500KB par chunk
    const chunks = splitStringByBytes(dataString, maxChunkSize);
    
    console.log(`📦 Division en ${chunks.length} chunks UTF-8`);
    
    // Sauvegarder les métadonnées
    const metadata = {
      totalChunks: chunks.length,
      timestamp: Date.now(),
      version: '2.0'
    };
    
    await AsyncStorage.setItem(STORAGE_KEYS.NOTES_META, JSON.stringify(metadata));
    
    // Sauvegarder chaque chunk
    for (let i = 0; i < chunks.length; i++) {
      const chunkKey = `${STORAGE_KEYS.NOTES}_chunk_${i}`;
      await AsyncStorage.setItem(chunkKey, chunks[i]);
    }
    
    // Supprimer la clé principale pour indiquer qu'on utilise les chunks
    await AsyncStorage.removeItem(STORAGE_KEYS.NOTES);
    
    console.log('✅ Sauvegarde par chunks UTF-8 terminée');
  };

  // Nettoyage des anciens chunks
  const cleanupOldChunks = async () => {
    try {
      const allKeys = await AsyncStorage.getAllKeys();
      const chunkKeys = allKeys.filter(key => key.startsWith(`${STORAGE_KEYS.NOTES}_chunk_`));
      
      if (chunkKeys.length > 0) {
        await AsyncStorage.multiRemove(chunkKeys);
        await AsyncStorage.removeItem(STORAGE_KEYS.NOTES_META);
        console.log(`🧹 ${chunkKeys.length} anciens chunks supprimés`);
      }
    } catch (error) {
      console.warn('⚠️ Erreur nettoyage chunks:', error);
    }
  };

  // Fonction utilitaire pour sauvegarder les notes
  const saveNotes = (newNotes: Note[]) =>
    enqueue(async () => {
      try {
        console.log('💾 Sauvegarde atomique de', newNotes.length, 'notes...');
        
        // Sanity check: s'assurer qu'aucun base64 ne reste sur mobile
        const sanitizedNotes = await sanitizeNotesImages(newNotes);
        
        const dataString = JSON.stringify(sanitizedNotes);
        const dataSizeKB = (dataString.length / 1024).toFixed(2);
        console.log(`📊 Taille des données notes: ${dataSizeKB} KB`);
        
        // Write-ahead: sauvegarder temporairement
        await AsyncStorage.setItem(STORAGE_KEYS.NOTES_TMP, dataString);
        
        // Si les données sont volumineuses (> 500KB), utiliser le chunking
        if (dataString.length > 500 * 1024) {
          console.log('📦 Chunking UTF-8 pour données volumineuses...');
          await saveNotesWithUTF8Chunks(sanitizedNotes, dataString);
        } else {
          // Sauvegarde directe
          await AsyncStorage.setItem(STORAGE_KEYS.NOTES, dataString);
          console.log('✅ Sauvegarde directe réussie');
        }
        
        // Commit: supprimer le temporaire
        await AsyncStorage.removeItem(STORAGE_KEYS.NOTES_TMP);
        
        // Cleanup anciens chunks
        await cleanupOldChunks();
        
        setNotes(sanitizedNotes);
        console.log('✅ Sauvegarde atomique terminée');
      } catch (error) {
        console.error('❌ Erreur sauvegarde atomique notes:', error);
        // Essayer de nettoyer le temporaire en cas d'erreur
        try {
          await AsyncStorage.removeItem(STORAGE_KEYS.NOTES_TMP);
        } catch (cleanupError) {
          console.warn('⚠️ Erreur nettoyage temporaire:', cleanupError);
        }
        throw error;
      }
    });

  // Chargement depuis les chunks
  const loadNotesFromChunks = async (): Promise<string | null> => {
    try {
      const metadataString = await AsyncStorage.getItem(STORAGE_KEYS.NOTES_META);
      if (!metadataString) {
        return null;
      }
      
      const metadata = JSON.parse(metadataString);
      console.log(`📦 Chargement depuis ${metadata.totalChunks} chunks...`);
      
      const chunks: string[] = [];
      for (let i = 0; i < metadata.totalChunks; i++) {
        const chunkKey = `${STORAGE_KEYS.NOTES}_chunk_${i}`;
        const chunk = await AsyncStorage.getItem(chunkKey);
        
        if (!chunk) {
          console.error(`❌ Chunk ${i} manquant`);
          return null;
        }
        
        chunks.push(chunk);
      }
      
      const reconstructedData = joinChunks(chunks);
      console.log('✅ Données reconstituées depuis les chunks');
      return reconstructedData;
      
    } catch (error) {
      console.error('❌ Erreur chargement chunks:', error);
      return null;
    }
  };

  // Actions pour les projets
  const createProject = async (projectData: Omit<Project, 'id' | 'createdAt' | 'updatedAt' | 'buildings'>): Promise<Project> => {
    const newProject: Project = {
      ...projectData,
      id: generateUniqueId(),
      createdAt: new Date(),
      updatedAt: new Date(),
      buildings: []
    };
    
    const newProjects = [...projectsRef.current, newProject];
    await saveProjects(newProjects);
    return newProject;
  };

  const updateProject = async (id: string, updates: Partial<Project>): Promise<Project | null> => {
    const projectIndex = projectsRef.current.findIndex(p => p.id === id);
    if (projectIndex === -1) {
      return null;
    }
    
    const updatedProject = { ...projectsRef.current[projectIndex], ...updates, updatedAt: new Date() };
    const newProjects = [...projectsRef.current];
    newProjects[projectIndex] = updatedProject;
    
    await saveProjects(newProjects);
    return updatedProject;
  };

  const deleteProject = async (id: string): Promise<boolean> => {
    const projectIndex = projectsRef.current.findIndex(p => p.id === id);
    if (projectIndex === -1) {
      return false;
    }
    
    const newProjects = projectsRef.current.filter(p => p.id !== id);
    const newFavoriteProjects = favoriteProjects.filter(fId => fId !== id);
    
    await Promise.all([
      saveProjects(newProjects),
      setFavoriteProjects(newFavoriteProjects)
    ]);
    
    return true;
  };

  // Actions pour les bâtiments
  const createBuilding = async (projectId: string, buildingData: Omit<Building, 'id' | 'projectId' | 'createdAt' | 'functionalZones'>): Promise<Building | null> => {
    const projectIndex = projectsRef.current.findIndex(p => p.id === projectId);
    if (projectIndex === -1) {
      return null;
    }

    const newBuilding: Building = {
      ...buildingData,
      id: generateUniqueId(),
      projectId,
      createdAt: new Date(),
      functionalZones: []
    };

    const newProjects = [...projectsRef.current];
    newProjects[projectIndex] = {
      ...newProjects[projectIndex],
      buildings: [...newProjects[projectIndex].buildings, newBuilding],
      updatedAt: new Date()
    };

    await saveProjects(newProjects);
    return newBuilding;
  };

  const updateBuilding = async (buildingId: string, updates: Partial<Building>): Promise<Building | null> => {
    const newProjects = [...projectsRef.current];
    
    for (let i = 0; i < newProjects.length; i++) {
      const buildingIndex = newProjects[i].buildings.findIndex(b => b.id === buildingId);
      if (buildingIndex !== -1) {
        const updatedBuilding = { ...newProjects[i].buildings[buildingIndex], ...updates };
        newProjects[i] = {
          ...newProjects[i],
          buildings: [
            ...newProjects[i].buildings.slice(0, buildingIndex),
            updatedBuilding,
            ...newProjects[i].buildings.slice(buildingIndex + 1)
          ],
          updatedAt: new Date()
        };
        
        await saveProjects(newProjects);
        return updatedBuilding;
      }
    }
    
    return null;
  };

  const deleteBuilding = async (buildingId: string): Promise<boolean> => {
    const newProjects = [...projectsRef.current];
    let found = false;
    
    console.log('🗑️ Début suppression bâtiment:', buildingId);
    
    for (let i = 0; i < newProjects.length; i++) {
      // Vérification de sécurité pour le projet
      if (!newProjects[i] || !newProjects[i].buildings) {
        console.warn('⚠️ Projet ou liste de bâtiments introuvable à l\'index:', i);
        continue;
      }
      
      const buildingIndex = newProjects[i].buildings.findIndex(b => b.id === buildingId);
      if (buildingIndex !== -1) {
        console.log('✅ Bâtiment trouvé dans projet:', newProjects[i].name);
        newProjects[i] = {
          ...newProjects[i],
          buildings: (newProjects[i].buildings || []).filter(b => b.id !== buildingId),
          updatedAt: new Date()
        };
        found = true;
        break;
      }
    }
    
    if (found) {
      console.log('💾 Sauvegarde après suppression bâtiment');
      const newFavoriteBuildings = (favoriteBuildings || []).filter(fId => fId !== buildingId);
      await Promise.all([
        saveProjects(newProjects),
        setFavoriteBuildings(newFavoriteBuildings)
      ]);
      console.log('✅ Bâtiment supprimé avec succès');
    } else {
      console.error('❌ Bâtiment non trouvé pour suppression:', buildingId);
    }
    
    return found;
  };

  // Suppression multiple de bâtiments (batch)
  const deleteBuildings = async (ids: string[]): Promise<boolean> => {
    try {
      console.log('🗑️ Suppression batch de', ids.length, 'bâtiments');
      
      const newProjects = projects.map(project => ({
        ...project,
        buildings: project.buildings.filter(b => !ids.includes(b.id))
      }));
      
      // Supprimer des favoris
      const newFavoriteBuildings = favoriteBuildings.filter(fId => !ids.includes(fId));
      await setFavoriteBuildings(newFavoriteBuildings);
      
      await saveProjects(newProjects);
      
      console.log('✅ Suppression batch bâtiments terminée');
      return true;
    } catch (error) {
      console.error('❌ Erreur suppression batch bâtiments:', error);
      return false;
    }
  };

  // Actions pour les zones
  const createFunctionalZone = async (buildingId: string, zoneData: Omit<FunctionalZone, 'id' | 'buildingId' | 'createdAt' | 'shutters'>): Promise<FunctionalZone | null> => {
    const newProjects = [...projectsRef.current];
    
        // CORRECTION: Persistance sécurisée avec fallback
        let persistedImages: string[] | undefined;
        try {
          persistedImages = await persistImagesIfNeeded(noteData.images);
        } catch (error) {
          console.warn('⚠️ Erreur persistance images, conservation base64:', error);
          persistedImages = noteData.images; // Fallback vers base64
        }
      if (buildingIndex !== -1) {
        const newZone: FunctionalZone = {
          ...zoneData,
          id: generateUniqueId(),
          buildingId,
          createdAt: new Date(),
          shutters: []
        };
        
        newProjects[i] = {
          ...newProjects[i],
        
        // CORRECTION: Sauvegarde sécurisée
        try {
          await saveNotes(newNotes);
        } catch (saveError) {
          console.error('❌ Erreur sauvegarde note:', saveError);
          throw new Error('Impossible de sauvegarder la note');
        }
            ...newProjects[i].buildings.slice(0, buildingIndex),
            {
              ...newProjects[i].buildings[buildingIndex],
              functionalZones: [...newProjects[i].buildings[buildingIndex].functionalZones, newZone]
            },
            ...newProjects[i].buildings.slice(buildingIndex + 1)
          ],
          updatedAt: new Date()
        };
        
        await saveProjects(newProjects);
        return newZone;
      }
    }
    
    return null;
  };

  const updateFunctionalZone = async (zoneId: string, updates: Partial<FunctionalZone>): Promise<FunctionalZone | null> => {
    const newProjects = [...projectsRef.current];
    
    for (let i = 0; i < newProjects.length; i++) {
      for (let j = 0; j < newProjects[i].buildings.length; j++) {
        const zoneIndex = newProjects[i].buildings[j].functionalZones.findIndex(z => z.id === zoneId);
        if (zoneIndex !== -1) {
          const updatedZone = { ...newProjects[i].buildings[j].functionalZones[zoneIndex], ...updates };
          
          newProjects[i] = {
            ...newProjects[i],
            buildings: [
              ...newProjects[i].buildings.slice(0, j),
              {
                ...newProjects[i].buildings[j],
                functionalZones: [
                  ...newProjects[i].buildings[j].functionalZones.slice(0, zoneIndex),
                  updatedZone,
                  ...newProjects[i].buildings[j].functionalZones.slice(zoneIndex + 1)
                ]
              },
              ...newProjects[i].buildings.slice(j + 1)
            ],
            updatedAt: new Date()
          };
          
          await saveProjects(newProjects);
          return updatedZone;
        }
      }
    }
    
    return null;
  };

  const deleteFunctionalZone = async (zoneId: string): Promise<boolean> => {
    const newProjects = [...projectsRef.current];
    let found = false;
    
    console.log('🗑️ Début suppression zone:', zoneId);
    
    for (let i = 0; i < newProjects.length; i++) {
      // Vérification de sécurité pour le projet
      if (!newProjects[i] || !newProjects[i].buildings) {
        console.warn('⚠️ Projet ou liste de bâtiments introuvable à l\'index:', i);
        continue;
      }
      
      for (let j = 0; j < newProjects[i].buildings.length; j++) {
        // Vérification de sécurité pour le bâtiment
        if (!newProjects[i].buildings[j] || !newProjects[i].buildings[j].functionalZones) {
          console.warn('⚠️ Bâtiment ou liste de zones introuvable à l\'index:', j);
          continue;
        }
        
        const zoneIndex = newProjects[i].buildings[j].functionalZones.findIndex(z => z.id === zoneId);
        if (zoneIndex !== -1) {
          console.log('✅ Zone trouvée dans bâtiment:', newProjects[i].buildings[j].name);
          newProjects[i] = {
            ...newProjects[i],
            buildings: [
              ...newProjects[i].buildings.slice(0, j),
              {
                ...newProjects[i].buildings[j],
                functionalZones: (newProjects[i].buildings[j].functionalZones || []).filter(z => z && z.id !== zoneId)
              },
              ...newProjects[i].buildings.slice(j + 1)
            ],
            updatedAt: new Date()
          };
          found = true;
          break;
        }
      }
      if (found) break;
    }
    
    if (found) {
      console.log('💾 Sauvegarde après suppression zone');
      const newFavoriteZones = (favoriteZones || []).filter(fId => fId !== zoneId);
      await Promise.all([
        saveProjects(newProjects),
        setFavoriteZones(newFavoriteZones)
      ]);
      console.log('✅ Zone supprimée avec succès');
    } else {
      console.error('❌ Zone non trouvée pour suppression:', zoneId);
    }
    
    return found;
  };

  // Suppression multiple de zones (batch)
  const deleteZones = async (ids: string[]): Promise<boolean> => {
    try {
      console.log('🗑️ Suppression batch de', ids.length, 'zones');
      
      const newProjects = projects.map(project => ({
        ...project,
        buildings: project.buildings.map(building => ({
          ...building,
          functionalZones: building.functionalZones.filter(z => !ids.includes(z.id))
        }))
      }));
      
      // Supprimer des favoris
      const newFavoriteZones = favoriteZones.filter(fId => !ids.includes(fId));
      await setFavoriteZones(newFavoriteZones);
      
      await saveProjects(newProjects);
      
      console.log('✅ Suppression batch zones terminée');
      return true;
    } catch (error) {
      console.error('❌ Erreur suppression batch zones:', error);
      return false;
    }
  };

  // Actions pour les volets
  const createShutter = async (zoneId: string, shutterData: Omit<Shutter, 'id' | 'zoneId' | 'createdAt' | 'updatedAt'>): Promise<Shutter | null> => {
    const newProjects = [...projectsRef.current];
    
    console.log('🔍 Recherche de la zone:', zoneId, 'pour créer le volet:', shutterData.name);
    
    for (let i = 0; i < newProjects.length; i++) {
      for (let j = 0; j < newProjects[i].buildings.length; j++) {
        const zoneIndex = newProjects[i].buildings[j].functionalZones.findIndex(z => z.id === zoneId);
        if (zoneIndex !== -1) {
          console.log('✅ Zone trouvée dans le projet:', newProjects[i].name, 'bâtiment:', newProjects[i].buildings[j].name);
          
          const newShutter: Shutter = {
            ...shutterData,
            id: generateUniqueId(),
            zoneId,
            createdAt: new Date(),
            updatedAt: new Date()
          };
          
          console.log('💾 Préparation du volet:', newShutter.name, 'type:', newShutter.type, 'dans la zone:', zoneId);
          
          newProjects[i] = {
            ...newProjects[i],
            buildings: [
              ...newProjects[i].buildings.slice(0, j),
              {
                ...newProjects[i].buildings[j],
                functionalZones: [
                  ...newProjects[i].buildings[j].functionalZones.slice(0, zoneIndex),
                  {
                    ...newProjects[i].buildings[j].functionalZones[zoneIndex],
                    shutters: [...newProjects[i].buildings[j].functionalZones[zoneIndex].shutters, newShutter]
                  },
                  ...newProjects[i].buildings[j].functionalZones.slice(zoneIndex + 1)
                ]
              },
              ...newProjects[i].buildings.slice(j + 1)
            ],
            updatedAt: new Date()
          };
          
          await saveProjects(newProjects);
          console.log('✅ Volet sauvegardé avec succès:', newShutter.name, 'ID:', newShutter.id);
          return newShutter;
        }
      }
    }
    
    console.error('❌ Zone non trouvée pour créer le volet:', zoneId, 'Données du volet:', shutterData.name);
    return null;
  };

  const updateShutter = async (shutterId: string, updates: Partial<Shutter>): Promise<Shutter | null> => {
    const newProjects = [...projectsRef.current];
    
    for (let i = 0; i < newProjects.length; i++) {
      for (let j = 0; j < newProjects[i].buildings.length; j++) {
        for (let k = 0; k < newProjects[i].buildings[j].functionalZones.length; k++) {
          const shutterIndex = newProjects[i].buildings[j].functionalZones[k].shutters.findIndex(s => s.id === shutterId);
          if (shutterIndex !== -1) {
            const updatedShutter = { 
              ...newProjects[i].buildings[j].functionalZones[k].shutters[shutterIndex], 
              ...updates, 
              updatedAt: new Date() 
            };
            
            newProjects[i] = {
              ...newProjects[i],
              buildings: [
                ...newProjects[i].buildings.slice(0, j),
                {
                  ...newProjects[i].buildings[j],
                  functionalZones: [
                    ...newProjects[i].buildings[j].functionalZones.slice(0, k),
                    {
                      ...newProjects[i].buildings[j].functionalZones[k],
                      shutters: [
                        ...newProjects[i].buildings[j].functionalZones[k].shutters.slice(0, shutterIndex),
                        updatedShutter,
                        ...newProjects[i].buildings[j].functionalZones[k].shutters.slice(shutterIndex + 1)
                      ]
                    },
                    ...newProjects[i].buildings[j].functionalZones.slice(k + 1)
                  ]
                },
                ...newProjects[i].buildings.slice(j + 1)
              ],
              updatedAt: new Date()
            };
            
            await saveProjects(newProjects);
            return updatedShutter;
          }
        }
      }
    }
    
    return null;
  };

  const deleteShutter = async (shutterId: string): Promise<boolean> => {
    const newProjects = [...projectsRef.current];
    let found = false;
    
    console.log('🗑️ Début suppression volet:', shutterId);
    
    for (let i = 0; i < newProjects.length; i++) {
      // Vérification de sécurité pour le projet
      if (!newProjects[i] || !newProjects[i].buildings) {
        console.warn('⚠️ Projet ou liste de bâtiments introuvable à l\'index:', i);
        continue;
      }
      
      for (let j = 0; j < newProjects[i].buildings.length; j++) {
        // Vérification de sécurité pour le bâtiment
        if (!newProjects[i].buildings[j] || !newProjects[i].buildings[j].functionalZones) {
          console.warn('⚠️ Bâtiment ou liste de zones introuvable à l\'index:', j);
          continue;
        }
        
        for (let k = 0; k < newProjects[i].buildings[j].functionalZones.length; k++) {
          // Vérification de sécurité pour la zone
          if (!newProjects[i].buildings[j].functionalZones[k] || !newProjects[i].buildings[j].functionalZones[k].shutters) {
            console.warn('⚠️ Zone ou liste de volets introuvable à l\'index:', k);
            continue;
          }
          
          const shutterIndex = newProjects[i].buildings[j].functionalZones[k].shutters.findIndex(s => s.id === shutterId);
          if (shutterIndex !== -1) {
            console.log('✅ Volet trouvé dans zone:', newProjects[i].buildings[j].functionalZones[k].name);
            newProjects[i] = {
              ...newProjects[i],
              buildings: [
                ...newProjects[i].buildings.slice(0, j),
                {
                  ...newProjects[i].buildings[j],
                  functionalZones: [
                    ...newProjects[i].buildings[j].functionalZones.slice(0, k),
                    {
                      ...newProjects[i].buildings[j].functionalZones[k],
                      shutters: (newProjects[i].buildings[j].functionalZones[k].shutters || []).filter(s => s && s.id !== shutterId)
                    },
                    ...newProjects[i].buildings[j].functionalZones.slice(k + 1)
                  ]
                },
                ...newProjects[i].buildings.slice(j + 1)
              ],
              updatedAt: new Date()
            };
            found = true;
            break;
          }
        }
        if (found) break;
      }
      if (found) break;
    }
    
    if (found) {
      console.log('💾 Sauvegarde après suppression volet');
      const newFavoriteShutters = (favoriteShutters || []).filter(fId => fId !== shutterId);
      await Promise.all([
        saveProjects(newProjects),
        setFavoriteShutters(newFavoriteShutters)
      ]);
      console.log('✅ Volet supprimé avec succès');
    } else {
      console.error('❌ Volet non trouvé pour suppression:', shutterId);
    }
    
    return found;
  };

  // Suppression multiple de volets (batch)
  const deleteShuttersBatch = async (ids: string[]): Promise<boolean> => {
    try {
      console.log('🗑️ Suppression batch de', ids.length, 'volets');
      
      const newProjects = projects.map(project => ({
        ...project,
        buildings: project.buildings.map(building => ({
          ...building,
          functionalZones: building.functionalZones.map(zone => ({
            ...zone,
            shutters: zone.shutters.filter(s => !ids.includes(s.id))
          }))
        }))
      }));
      
      // Supprimer des favoris
      const newFavoriteShutters = favoriteShutters.filter(fId => !ids.includes(fId));
      await setFavoriteShutters(newFavoriteShutters);
      
      await saveProjects(newProjects);
      
      console.log('✅ Suppression batch volets terminée');
      return true;
    } catch (error) {
      console.error('❌ Erreur suppression batch volets:', error);
      return false;
    }
  };

  // Actions pour les favoris
  const setFavoriteProjects = async (favorites: string[]) => {
    await safeStorageOperation(
      () => AsyncStorage.setItem(STORAGE_KEYS.FAVORITE_PROJECTS, JSON.stringify(favorites)),
      undefined,
      'setFavoriteProjects'
    );
    setFavoriteProjectsState(favorites);
  };

  const setFavoriteBuildings = async (favorites: string[]) => {
    await safeStorageOperation(
      () => AsyncStorage.setItem(STORAGE_KEYS.FAVORITE_BUILDINGS, JSON.stringify(favorites)),
      undefined,
      'setFavoriteBuildings'
    );
    setFavoriteBuildingsState(favorites);
  };

  const setFavoriteZones = async (favorites: string[]) => {
    await safeStorageOperation(
      () => AsyncStorage.setItem(STORAGE_KEYS.FAVORITE_ZONES, JSON.stringify(favorites)),
      undefined,
      'setFavoriteZones'
    );
    setFavoriteZonesState(favorites);
  };

  const setFavoriteShutters = async (favorites: string[]) => {
    await safeStorageOperation(
      () => AsyncStorage.setItem(STORAGE_KEYS.FAVORITE_SHUTTERS, JSON.stringify(favorites)),
      undefined,
      'setFavoriteShutters'
    );
    setFavoriteShuttersState(favorites);
  };

  const setFavoriteNotes = async (favorites: string[]) => {
    await safeStorageOperation(
      () => AsyncStorage.setItem(STORAGE_KEYS.FAVORITE_NOTES, JSON.stringify(favorites)),
      undefined,
      'setFavoriteNotes'
    );
    setFavoriteNotesState(favorites);
  };

  // Actions pour l'historique
  const addQuickCalcHistory = async (item: Omit<QuickCalcHistoryItem, 'id' | 'timestamp'>) => {
    const newItem: QuickCalcHistoryItem = {
      ...item,
      id: generateUniqueId(),
      timestamp: new Date()
    };
    
    const newHistory = [newItem, ...quickCalcHistory];
    
    await safeStorageOperation(
      () => AsyncStorage.setItem(STORAGE_KEYS.QUICK_CALC_HISTORY, JSON.stringify(newHistory)),
      undefined,
      'addQuickCalcHistory'
    );
    setQuickCalcHistoryState(newHistory);
  };

  const clearQuickCalcHistory = async () => {
    await safeStorageOperation(
      () => AsyncStorage.setItem(STORAGE_KEYS.QUICK_CALC_HISTORY, JSON.stringify([])),
      undefined,
      'clearQuickCalcHistory'
    );
    setQuickCalcHistoryState([]);
  };

  const removeQuickCalcHistoryItem = async (itemId: string) => {
    const newHistory = quickCalcHistory.filter(item => item.id !== itemId);
    
    await safeStorageOperation(
      () => AsyncStorage.setItem(STORAGE_KEYS.QUICK_CALC_HISTORY, JSON.stringify(newHistory)),
      undefined,
      'removeQuickCalcHistoryItem'
    );
    setQuickCalcHistoryState(newHistory);
  };

  const getQuickCalcHistory = async (): Promise<QuickCalcHistoryItem[]> => {
    return quickCalcHistory;
  };

  // Actions pour les notes
  const createNote = async (noteData: Omit<Note, 'id' | 'createdAt' | 'updatedAt'>): Promise<Note> => {
    console.log('📝 StorageContext.createNote - Début création avec:', {
      title: noteData.title,
      imagesCount: noteData.images?.length || 0,
      contentLength: noteData.content?.length || 0
    });
    
    // Persister les images si nécessaire
    let persistedImages: string[] | undefined;
    try {
      persistedImages = await persistImagesIfNeeded(noteData.images);
      console.log('💾 Images persistées:', persistedImages?.length || 0);
    } catch (error) {
      console.error('❌ Erreur persistance images:', error);
      persistedImages = undefined;
    }
    
    const newNote: Note = {
      ...noteData,
      images: persistedImages,
      id: generateUniqueId(),
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    console.log('💾 StorageContext.createNote - Note préparée:', {
      id: newNote.id,
      title: newNote.title,
      finalImagesCount: newNote.images?.length || 0,
      hasImages: !!newNote.images
    });
    
    const newNotes = [newNote, ...notes];
    
    try {
      await saveNotes(newNotes);
      console.log('✅ StorageContext.createNote - Note sauvegardée avec succès');
      return newNote;
    } catch (saveError) {
      console.error('❌ StorageContext.createNote - Erreur sauvegarde:', saveError);
      throw saveError;
    }
  };

  const updateNote = async (id: string, updates: Partial<Note>): Promise<Note | null> => {
    console.log('📝 StorageContext.updateNote - Début mise à jour:', {
      id,
      hasImages: !!updates.images,
      imagesCount: updates.images?.length || 0,
      updateKeys: Object.keys(updates)
    });
    
    const noteIndex = notes.findIndex(n => n.id === id);
    if (noteIndex === -1) {
      console.error('❌ StorageContext.updateNote - Note non trouvée:', id);
      return null;
    }
    
    const currentNote = notes[noteIndex];
    
    // Persister les nouvelles images si nécessaire
    let finalImages = updates.images;
    if (updates.images) {
      try {
        finalImages = await persistImagesIfNeeded(updates.images);
        console.log('💾 Images mises à jour persistées:', finalImages?.length || 0);
      } catch (error) {
        console.error('❌ Erreur persistance images mise à jour:', error);
        return null; // CORRECTION: Retourner null au lieu de throw
      }
      
      // Supprimer les anciennes images qui ne sont plus utilisées
      if (currentNote.images) {
        try {
          const oldImages = currentNote.images.filter(img => 
            !finalImages?.includes(img)
          );
          if (oldImages.length > 0) {
            await removeImages(oldImages);
            console.log('🗑️ Anciennes images supprimées:', oldImages.length);
          }
        } catch (error) {
          console.error('❌ Erreur suppression anciennes images:', error);
        }
      }
    }
    
    const updatedNote: Note = {
      ...currentNote,
      ...updates,
      images: finalImages,
      updatedAt: new Date()
    };
    
    const newNotes = [...notes];
    newNotes[noteIndex] = updatedNote;
    
    try {
      await saveNotes(newNotes);
      console.log('✅ StorageContext.updateNote - Note mise à jour avec succès, images finales:', finalImages?.length || 0);
      return updatedNote;
    } catch (saveError) {
      console.error('❌ StorageContext.updateNote - Erreur sauvegarde:', saveError);
      throw saveError;
    }
  };

  const deleteNote = async (id: string): Promise<boolean> => {
    try {
      console.log('🗑️ Suppression note:', id);
      
      const noteIndex = notes.findIndex(n => n.id === id);
      if (noteIndex === -1) {
        console.error('❌ Note non trouvée pour suppression:', id);
        return false;
      }
      
      const noteToDelete = notes[noteIndex];
      
      // Supprimer les images associées
      if (noteToDelete.images) {
        await removeImages(noteToDelete.images);
      }
      
      const newNotes = notes.filter(n => n.id !== id);
      
      // Supprimer des favoris
      const newFavoriteNotes = favoriteNotes.filter(fId => fId !== id);
      await setFavoriteNotes(newFavoriteNotes);
      
      await saveNotes(newNotes);
      
      console.log('✅ Note supprimée:', id);
      return true;
    } catch (error) {
      console.error('❌ Erreur suppression note:', error);
      return false;
    }
  };

  // Suppression multiple de notes (batch)
  const deleteNotes = async (ids: string[]): Promise<boolean> => {
    try {
      console.log('🗑️ Suppression batch de', ids.length, 'notes');
      
      const notesToDelete = notes.filter(n => ids.includes(n.id));
      const allImagesToRemove: string[] = [];
      
      // Collecter toutes les images à supprimer
      notesToDelete.forEach(note => {
        if (note.images) {
          allImagesToRemove.push(...note.images);
        }
      });
      
      // Supprimer les images
      if (allImagesToRemove.length > 0) {
        try {
          await removeImages(allImagesToRemove);
          console.log('🗑️ Images supprimées:', allImagesToRemove.length);
        } catch (error) {
          console.error('❌ Erreur suppression images batch:', error);
        }
      }
      
      // Supprimer les notes
      const newNotes = notes.filter(n => !ids.includes(n.id));
      
      // Supprimer des favoris
      const newFavoriteNotes = favoriteNotes.filter(fId => !ids.includes(fId));
      await setFavoriteNotes(newFavoriteNotes);
      
      await saveNotes(newNotes);
      
      console.log('✅ Suppression batch terminée');
      return true;
    } catch (error) {
      console.error('❌ Erreur suppression batch notes:', error);
      return false;
    }
  };

  // Recherche
  const searchShutters = (query: string): SearchResult[] => {
    const results: SearchResult[] = [];
    const queryWords = query.toLowerCase().trim().split(/\s+/).filter(word => word.length > 0);

    for (const project of projectsRef.current) {
      for (const building of project.buildings) {
        for (const zone of building.functionalZones) {
          for (const shutter of zone.shutters) {
            const searchableText = [
              shutter.name,
              zone.name,
              building.name,
              project.name,
              project.city || '',
              shutter.remarks || ''
            ].join(' ').toLowerCase();
            
            const matchesAllWords = queryWords.every(word => searchableText.includes(word));
            
            if (matchesAllWords) {
              results.push({ shutter, zone, building, project });
            }
          }
        }
      }
    }

    return results;
  };

  // Utilitaires
  const clearAllData = async () => {
    try {
      console.log('🗑️ Suppression de toutes les données...');
      
      // Supprimer toutes les images sur mobile
      if (Platform.OS !== 'web') {
        const allImages = notes.flatMap(note => note.images || []);
        await removeImages(allImages);
      }
      
      await AsyncStorage.multiRemove([
        STORAGE_KEYS.PROJECTS,
        STORAGE_KEYS.NOTES,
        STORAGE_KEYS.NOTES_TMP,
        STORAGE_KEYS.NOTES_META,
        STORAGE_KEYS.FAVORITE_PROJECTS,
        STORAGE_KEYS.FAVORITE_BUILDINGS,
        STORAGE_KEYS.FAVORITE_ZONES,
        STORAGE_KEYS.FAVORITE_SHUTTERS,
        STORAGE_KEYS.FAVORITE_NOTES,
        STORAGE_KEYS.QUICK_CALC_HISTORY
      ]);
      
      // Nettoyer tous les chunks
      await cleanupOldChunks();
      
      // Réinitialiser les états
      setProjects([]);
      setNotes([]);
      setFavoriteProjectsState([]);
      setFavoriteBuildingsState([]);
      setFavoriteZonesState([]);
      setFavoriteShuttersState([]);
      setFavoriteNotesState([]);
      setQuickCalcHistoryState([]);
      
      console.log('✅ Toutes les données supprimées');
    } catch (error) {
      console.error('❌ Erreur suppression données:', error);
      throw error;
    }
  };

  const getStorageInfo = () => {
    const totalShutters = projectsRef.current.reduce((total, project) => 
      total + project.buildings.reduce((buildingTotal, building) => 
        buildingTotal + building.functionalZones.reduce((zoneTotal, zone) => 
          zoneTotal + zone.shutters.length, 0), 0), 0);

    const dataString = JSON.stringify(projectsRef.current);
    const storageSize = `${(dataString.length / 1024).toFixed(2)} KB`;

    return {
      projectsCount: projectsRef.current.length,
      totalShutters,
      storageSize
    };
  };

  // Fonctions de compatibilité
  const getProjects = async (): Promise<Project[]> => {
    return projectsRef.current;
  };

  const getFavoriteBuildings = async (): Promise<string[]> => {
    return favoriteBuildings;
  };

  const getFavoriteZones = async (): Promise<string[]> => {
    return favoriteZones;
  };

  const getFavoriteShutters = async (): Promise<string[]> => {
    return favoriteShutters;
  };

  const getFavoriteNotes = async (): Promise<string[]> => {
    return favoriteNotes;
  };

  // Import d'un projet avec ses notes liées
  const importProject = async (project: Project, relatedNotes: Note[] = []): Promise<boolean> => {
    try {
      console.log('📥 Import du projet:', project.name, 'avec', relatedNotes.length, 'notes');
      
      // Persister les images des notes importées
      const notesWithPersistedImages: Note[] = [];
      for (const note of relatedNotes) {
        const persistedImages = await persistImagesIfNeeded(note.images);
        notesWithPersistedImages.push({
          ...note,
          images: persistedImages
        });
      }
      
      // Générer de nouveaux IDs pour éviter les conflits
      const newProjectId = generateUniqueId();
      const buildingIdMap = new Map<string, string>();
      const zoneIdMap = new Map<string, string>();
      
      // Préparer le projet avec de nouveaux IDs
      const importedProject: Project = {
        ...project,
        id: newProjectId,
        createdAt: new Date(),
        updatedAt: new Date(),
        buildings: project.buildings.map(building => {
          const newBuildingId = generateUniqueId();
          buildingIdMap.set(building.id, newBuildingId);
          
          return {
            ...building,
            id: newBuildingId,
            projectId: newProjectId,
            createdAt: new Date(),
            functionalZones: building.functionalZones.map(zone => {
              const newZoneId = generateUniqueId();
              zoneIdMap.set(zone.id, newZoneId);
              
              return {
                ...zone,
                id: newZoneId,
                buildingId: newBuildingId,
                createdAt: new Date(),
                shutters: zone.shutters.map(shutter => ({
                  ...shutter,
                  id: generateUniqueId(),
                  zoneId: newZoneId,
                  createdAt: new Date(),
                  updatedAt: new Date()
                }))
              };
            })
          };
        })
      };
      
      // Ajouter le projet importé
      const newProjects = [...projectsRef.current, importedProject];
      const newNotes = [...notes, ...notesWithPersistedImages];
      
      await Promise.all([
        saveProjects(newProjects),
        saveNotes(newNotes)
      ]);
      
      console.log('✅ Import terminé avec succès');
      return true;
    } catch (error) {
      console.error('❌ Erreur lors de l\'import:', error);
      return false;
    }
  };

  const value: StorageContextType = {
    isLoading,
    isInitialized,
    projects,
    favoriteProjects,
    favoriteBuildings,
    favoriteZones,
    favoriteShutters,
    favoriteNotes,
    quickCalcHistory,
    notes,
    createProject,
    updateProject,
    deleteProject,
    createBuilding,
    updateBuilding,
    deleteBuilding,
    deleteBuildings,
    createFunctionalZone,
    updateFunctionalZone,
    deleteFunctionalZone,
    deleteZones,
    createShutter,
    updateShutter,
    deleteShutter,
    deleteShuttersBatch,
    setFavoriteProjects,
    setFavoriteBuildings,
    setFavoriteZones,
    setFavoriteShutters,
    setFavoriteNotes,
    addQuickCalcHistory,
    clearQuickCalcHistory,
    removeQuickCalcHistoryItem,
    getQuickCalcHistory,
    createNote,
    updateNote,
    deleteNote,
    deleteNotes,
    searchShutters,
    clearAllData,
    getStorageInfo,
    getProjects,
    getFavoriteBuildings,
    getFavoriteZones,
    getFavoriteShutters,
    getFavoriteNotes,
    importProject,
  };

  return (
    <StorageContext.Provider value={value}>
      {children}
    </StorageContext.Provider>
  );
}

export function useStorage(): StorageContextType {
  const context = useContext(StorageContext);
  if (context === undefined) {
    throw new Error('useStorage must be used within a StorageProvider');
  }
  return context;
}