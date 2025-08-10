import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Project, Building, FunctionalZone, Shutter, SearchResult, Note } from '@/types';
import { compressImageFromFile, validateImageBase64 } from '@/utils/imageCompression';
import { Platform } from 'react-native';

// Clés de stockage simplifiées
const PROJECTS_KEY = 'SIEMENS_PROJECTS_STORAGE';
const NOTES_KEY = 'SIEMENS_NOTES_STORAGE';
const FAVORITES_KEY = 'SIEMENS_FAVORITES_STORAGE';
const QUICK_CALC_HISTORY_KEY = 'SIEMENS_QUICK_CALC_HISTORY';

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
  // Projects
  projects: Project[];
  createProject: (projectData: Omit<Project, 'id' | 'createdAt' | 'updatedAt' | 'buildings'>) => Promise<Project>;
  updateProject: (id: string, updates: Partial<Project>) => Promise<Project | null>;
  deleteProject: (id: string) => Promise<boolean>;
  importProject: (project: Project, relatedNotes?: Note[]) => Promise<boolean>;

  // Buildings
  createBuilding: (projectId: string, buildingData: Omit<Building, 'id' | 'projectId' | 'createdAt' | 'functionalZones'>) => Promise<Building | null>;
  updateBuilding: (buildingId: string, updates: Partial<Building>) => Promise<Building | null>;
  deleteBuilding: (buildingId: string) => Promise<boolean>;

  // Zones
  createFunctionalZone: (buildingId: string, zoneData: Omit<FunctionalZone, 'id' | 'buildingId' | 'createdAt' | 'shutters'>) => Promise<FunctionalZone | null>;
  updateFunctionalZone: (zoneId: string, updates: Partial<FunctionalZone>) => Promise<FunctionalZone | null>;
  deleteFunctionalZone: (zoneId: string) => Promise<boolean>;

  // Shutters
  createShutter: (zoneId: string, shutterData: Omit<Shutter, 'id' | 'zoneId' | 'createdAt' | 'updatedAt'>) => Promise<Shutter | null>;
  updateShutter: (shutterId: string, updates: Partial<Shutter>) => Promise<Shutter | null>;
  deleteShutter: (shutterId: string) => Promise<boolean>;

  // Search
  searchShutters: (query: string) => SearchResult[];

  // Notes
  notes: Note[];
  createNote: (noteData: Omit<Note, 'id' | 'createdAt' | 'updatedAt'>) => Promise<Note | null>;
  updateNote: (id: string, updates: Partial<Note>) => Promise<Note | null>;
  deleteNote: (id: string) => Promise<boolean>;

  // Favorites
  favoriteProjects: string[];
  favoriteBuildings: string[];
  favoriteZones: string[];
  favoriteShutters: string[];
  favoriteNotes: string[];
  setFavoriteProjects: (favorites: string[]) => Promise<void>;
  setFavoriteBuildings: (favorites: string[]) => Promise<void>;
  setFavoriteZones: (favorites: string[]) => Promise<void>;
  setFavoriteShutters: (favorites: string[]) => Promise<void>;
  setFavoriteNotes: (favorites: string[]) => Promise<void>;

  // Quick calc history
  quickCalcHistory: QuickCalcHistoryItem[];
  addQuickCalcHistory: (item: Omit<QuickCalcHistoryItem, 'id' | 'timestamp'>) => Promise<void>;
  clearQuickCalcHistory: () => Promise<void>;
  removeQuickCalcHistoryItem: (itemId: string) => Promise<void>;

  // Utilities
  clearAllData: () => Promise<void>;
  getStorageInfo: () => { projectsCount: number; totalShutters: number; storageSize: string; notesCount: number };
}

const StorageContext = createContext<StorageContextType | undefined>(undefined);

interface StorageProviderProps {
  children: ReactNode;
}


// Fonction pour générer un ID unique
function generateUniqueId(): string {
  return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Compression automatique des images
async function compressImages(images?: string[]): Promise<string[] | undefined> {
  if (!images || images.length === 0) {
    return undefined;
  }

  console.log('📸 Traitement de', images.length, 'images (sans limite globale)...');
  const compressedImages: string[] = [];

  for (let i = 0; i < images.length; i++) {
    const image = images[i];
    
    try {
      // Si c'est déjà une image compressée ou un file://, la garder
      if (!image.startsWith('data:image/')) {
        compressedImages.push(image);
        continue;
      }

      // Compression sur web uniquement
      if (Platform.OS === 'web') {
        try {
          // Créer un fichier temporaire pour la compression
          const response = await fetch(image);
          const blob = await response.blob();
          const file = new File([blob], `image_${i}.jpg`, { type: 'image/jpeg' });
          
          const compressed = await compressImageFromFile(file, {
            maxWidth: 1280,
            maxHeight: 1280,
            quality: 0.75
          });
          
          compressedImages.push(compressed);
          console.log(`✅ Image ${i} compressée avec succès`);
        } catch (compressionError) {
          console.warn(`⚠️ Compression échouée pour image ${i}, conservation originale:`, compressionError);
          compressedImages.push(image);
        }
      } else {
        // Sur mobile, garder l'image originale
        compressedImages.push(image);
      }
      
    } catch (error) {
      console.warn(`⚠️ Erreur traitement image ${i}, conservation originale:`, error);
      compressedImages.push(image);
    }
  }

  console.log(`✅ Traitement terminé: ${compressedImages.length}/${images.length} images traitées (stockage illimité)`);
  return compressedImages;
}


export function StorageProvider({ children }: StorageProviderProps) {
  // États React pour les mises à jour en temps réel
  const [projects, setProjects] = useState<Project[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [favorites, setFavorites] = useState({
    projects: [] as string[],
    buildings: [] as string[],
    zones: [] as string[],
    shutters: [] as string[],
    notes: [] as string[]
  });
  const [quickCalcHistory, setQuickCalcHistory] = useState<QuickCalcHistoryItem[]>([]);
  const [isReady, setIsReady] = useState(false);

  // Fonctions de sauvegarde avec états React
  const saveProjects = async (newProjects: Project[]): Promise<void> => {
    try {
      await AsyncStorage.setItem(PROJECTS_KEY, JSON.stringify(newProjects));
      setProjects([...newProjects]); // Mise à jour de l'état React
    } catch (error) {
      console.error('Erreur sauvegarde projets:', error);
      throw error;
    }
  };

  const saveNotes = async (newNotes: Note[]): Promise<void> => {
    try {
      await AsyncStorage.setItem(NOTES_KEY, JSON.stringify(newNotes));
      setNotes([...newNotes]); // Mise à jour de l'état React
    } catch (error) {
      console.error('Erreur sauvegarde notes:', error);
      throw error;
    }
  };

  const saveFavorites = async (newFavorites: typeof favorites): Promise<void> => {
    try {
      await AsyncStorage.setItem(FAVORITES_KEY, JSON.stringify(newFavorites));
      setFavorites({ ...newFavorites }); // Mise à jour de l'état React
    } catch (error) {
      console.error('Erreur sauvegarde favoris:', error);
      throw error;
    }
  };

  const saveQuickCalcHistoryState = async (newHistory: QuickCalcHistoryItem[]): Promise<void> => {
    try {
      await AsyncStorage.setItem(QUICK_CALC_HISTORY_KEY, JSON.stringify(newHistory));
      setQuickCalcHistory([...newHistory]); // Mise à jour de l'état React
    } catch (error) {
      console.error('Erreur sauvegarde historique:', error);
      throw error;
    }
  };

  // Fonction de chargement initial
  const loadData = async (): Promise<void> => {
    try {
      const [projectsData, notesData, favoritesData, historyData] = await Promise.all([
        AsyncStorage.getItem(PROJECTS_KEY),
        AsyncStorage.getItem(NOTES_KEY),
        AsyncStorage.getItem(FAVORITES_KEY),
        AsyncStorage.getItem(QUICK_CALC_HISTORY_KEY)
      ]);

      // Charger projets
      if (projectsData) {
        const parsedProjects = JSON.parse(projectsData);
        const loadedProjects = parsedProjects.map((project: any) => ({
          ...project,
          createdAt: new Date(project.createdAt),
          updatedAt: new Date(project.updatedAt),
          startDate: project.startDate ? new Date(project.startDate) : undefined,
          endDate: project.endDate ? new Date(project.endDate) : undefined,
          buildings: project.buildings.map((building: any) => ({
            ...building,
            createdAt: new Date(building.createdAt),
            functionalZones: building.functionalZones.map((zone: any) => ({
              ...zone,
              createdAt: new Date(zone.createdAt),
              shutters: zone.shutters.map((shutter: any) => ({
                ...shutter,
                createdAt: new Date(shutter.createdAt),
                updatedAt: new Date(shutter.updatedAt)
              }))
            }))
          }))
        }));
        setProjects(loadedProjects);
      }

      // Charger notes
      if (notesData) {
        const parsedNotes = JSON.parse(notesData);
        const loadedNotes = parsedNotes.map((note: any) => ({
          ...note,
          createdAt: new Date(note.createdAt),
          updatedAt: new Date(note.updatedAt)
        }));
        setNotes(loadedNotes);
      }

      // Charger favoris
      if (favoritesData) {
        const loadedFavorites = JSON.parse(favoritesData);
        setFavorites(loadedFavorites);
      }

      // Charger historique
      if (historyData) {
        const parsedHistory = JSON.parse(historyData);
        const loadedHistory = parsedHistory.map((item: any) => ({
          ...item,
          timestamp: new Date(item.timestamp)
        }));
        setQuickCalcHistory(loadedHistory);
      }

      console.log('✅ Données chargées:', {
        projects: projects.length,
        notes: notes.length,
        history: quickCalcHistory.length
      });

    } catch (error) {
      console.error('Erreur chargement données:', error);
      // Initialiser avec des valeurs par défaut
      setProjects([]);
      setNotes([]);
      setFavorites({ projects: [], buildings: [], zones: [], shutters: [], notes: [] });
      setQuickCalcHistory([]);
    }
  };

  useEffect(() => {
    const initialize = async () => {
      try {
        await loadData();
      } catch (error) {
        console.error('Erreur initialisation storage:', error);
      } finally {
        setIsReady(true);
      }
    };

    initialize();
  }, []);

  // Projects
  const createProjectFunc = async (projectData: Omit<Project, 'id' | 'createdAt' | 'updatedAt' | 'buildings'>): Promise<Project> => {
    const project: Project = {
      ...projectData,
      id: generateUniqueId(),
      createdAt: new Date(),
      updatedAt: new Date(),
      buildings: []
    };
    
    const newProjects = [...projects, project];
    await saveProjects(newProjects);
    return project;
  };

  const updateProjectFunc = async (id: string, updates: Partial<Project>): Promise<Project | null> => {
    const index = projects.findIndex(p => p.id === id);
    if (index === -1) return null;
    
    const newProjects = [...projects];
    newProjects[index] = { ...newProjects[index], ...updates, updatedAt: new Date() };
    await saveProjects(newProjects);
    return newProjects[index];
  };

  const deleteProjectFunc = async (id: string): Promise<boolean> => {
    const index = projects.findIndex(p => p.id === id);
    if (index === -1) return false;
    
    const newProjects = projects.filter(p => p.id !== id);
    const newFavorites = {
      ...favorites,
      projects: favorites.projects.filter(fId => fId !== id)
    };
    
    await Promise.all([saveProjects(newProjects), saveFavorites(newFavorites)]);
    return true;
  };

  const importProjectFunc = async (project: Project, relatedNotes: Note[] = []): Promise<boolean> => {
    try {
      // Générer de nouveaux IDs pour éviter les conflits
      const newProject: Project = {
        ...project,
        id: generateUniqueId(),
        createdAt: new Date(),
        updatedAt: new Date(),
        buildings: project.buildings.map(building => ({
          ...building,
          id: generateUniqueId(),
          projectId: project.id,
          createdAt: new Date(),
          functionalZones: building.functionalZones.map(zone => ({
            ...zone,
            id: generateUniqueId(),
            buildingId: building.id,
            createdAt: new Date(),
            shutters: zone.shutters.map(shutter => ({
              ...shutter,
              id: generateUniqueId(),
              zoneId: zone.id,
              createdAt: new Date(),
              updatedAt: new Date()
            }))
          }))
        }))
      };

      const newProjects = [...projects, newProject];

      // Importer les notes liées
      let newNotesArray = [...notes];
      if (relatedNotes.length > 0) {
        const importedNotes = relatedNotes.map(note => ({
          ...note,
          id: generateUniqueId(),
          createdAt: new Date(),
          updatedAt: new Date()
        }));
        newNotesArray = [...notes, ...importedNotes];
        await saveNotes(newNotesArray);
      }

      await saveProjects(newProjects);
      return true;
    } catch (error) {
      console.error('Erreur import projet:', error);
      return false;
    }
  };

  // Buildings
  const createBuildingFunc = async (projectId: string, buildingData: Omit<Building, 'id' | 'projectId' | 'createdAt' | 'functionalZones'>): Promise<Building | null> => {
    const project = projects.find(p => p.id === projectId);
    if (!project) return null;

    const building: Building = {
      ...buildingData,
      id: generateUniqueId(),
      projectId,
      createdAt: new Date(),
      functionalZones: []
    };

    const newProjects = projects.map(p => 
      p.id === projectId 
        ? { ...p, buildings: [...p.buildings, building] }
        : p
    );
    await saveProjects(newProjects);
    return building;
  };

  const updateBuildingFunc = async (buildingId: string, updates: Partial<Building>): Promise<Building | null> => {
    const newProjects = [...projects];
    let updatedBuilding: Building | null = null;
    
    for (const project of newProjects) {
      const buildingIndex = project.buildings.findIndex(b => b.id === buildingId);
      if (buildingIndex !== -1) {
        project.buildings[buildingIndex] = { ...project.buildings[buildingIndex], ...updates };
        updatedBuilding = project.buildings[buildingIndex];
        break;
      }
    }
    
    if (updatedBuilding) {
      await saveProjects(newProjects);
    }
    return updatedBuilding;
  };

  const deleteBuildingFunc = async (buildingId: string): Promise<boolean> => {
    const newProjects = [...projects];
    let found = false;
    
    for (const project of newProjects) {
      const buildingIndex = project.buildings.findIndex(b => b.id === buildingId);
      if (buildingIndex !== -1) {
        project.buildings.splice(buildingIndex, 1);
        found = true;
        break;
      }
    }
    
    if (found) {
      const newFavorites = {
        ...favorites,
        buildings: favorites.buildings.filter(fId => fId !== buildingId)
      };
      await Promise.all([saveProjects(newProjects), saveFavorites(newFavorites)]);
      return true;
    }
    return false;
  };

  // Zones
  const createFunctionalZoneFunc = async (buildingId: string, zoneData: Omit<FunctionalZone, 'id' | 'buildingId' | 'createdAt' | 'shutters'>): Promise<FunctionalZone | null> => {
    const newProjects = [...projects];
    let createdZone: FunctionalZone | null = null;
    
    for (const project of newProjects) {
      const building = project.buildings.find(b => b.id === buildingId);
      if (building) {
        const zone: FunctionalZone = {
          ...zoneData,
          id: generateUniqueId(),
          buildingId,
          createdAt: new Date(),
          shutters: []
        };
        building.functionalZones.push(zone);
        createdZone = zone;
        break;
      }
    }
    
    if (createdZone) {
      await saveProjects(newProjects);
    }
    return createdZone;
  };

  const updateFunctionalZoneFunc = async (zoneId: string, updates: Partial<FunctionalZone>): Promise<FunctionalZone | null> => {
    const newProjects = [...projects];
    let updatedZone: FunctionalZone | null = null;
    
    for (const project of newProjects) {
      for (const building of project.buildings) {
        const zoneIndex = building.functionalZones.findIndex(z => z.id === zoneId);
        if (zoneIndex !== -1) {
          building.functionalZones[zoneIndex] = { ...building.functionalZones[zoneIndex], ...updates };
          updatedZone = building.functionalZones[zoneIndex];
          break;
        }
      }
      if (updatedZone) break;
    }
    
    if (updatedZone) {
      await saveProjects(newProjects);
    }
    return updatedZone;
  };

  const deleteFunctionalZoneFunc = async (zoneId: string): Promise<boolean> => {
    const newProjects = [...projects];
    let found = false;
    
    for (const project of newProjects) {
      for (const building of project.buildings) {
        const zoneIndex = building.functionalZones.findIndex(z => z.id === zoneId);
        if (zoneIndex !== -1) {
          building.functionalZones.splice(zoneIndex, 1);
          found = true;
          break;
        }
      }
      if (found) break;
    }
    
    if (found) {
      const newFavorites = {
        ...favorites,
        zones: favorites.zones.filter(fId => fId !== zoneId)
      };
      await Promise.all([saveProjects(newProjects), saveFavorites(newFavorites)]);
      return true;
    }
    return false;
  };

  // Shutters
  const createShutterFunc = async (zoneId: string, shutterData: Omit<Shutter, 'id' | 'zoneId' | 'createdAt' | 'updatedAt'>): Promise<Shutter | null> => {
    const newProjects = [...projects];
    let createdShutter: Shutter | null = null;
    
    for (const project of newProjects) {
      for (const building of project.buildings) {
        const zone = building.functionalZones.find(z => z.id === zoneId);
        if (zone) {
          const shutter: Shutter = {
            ...shutterData,
            id: generateUniqueId(),
            zoneId,
            createdAt: new Date(),
            updatedAt: new Date()
          };
          zone.shutters.push(shutter);
          createdShutter = shutter;
          break;
        }
      }
      if (createdShutter) break;
    }
    
    if (createdShutter) {
      await saveProjects(newProjects);
    }
    return createdShutter;
  };

  const updateShutterFunc = async (shutterId: string, updates: Partial<Shutter>): Promise<Shutter | null> => {
    const newProjects = [...projects];
    let updatedShutter: Shutter | null = null;
    
    for (const project of newProjects) {
      for (const building of project.buildings) {
        for (const zone of building.functionalZones) {
          const shutterIndex = zone.shutters.findIndex(s => s.id === shutterId);
          if (shutterIndex !== -1) {
            zone.shutters[shutterIndex] = { ...zone.shutters[shutterIndex], ...updates, updatedAt: new Date() };
            updatedShutter = zone.shutters[shutterIndex];
            break;
          }
        }
        if (updatedShutter) break;
      }
      if (updatedShutter) break;
    }
    
    if (updatedShutter) {
      await saveProjects(newProjects);
    }
    return updatedShutter;
  };

  const deleteShutterFunc = async (shutterId: string): Promise<boolean> => {
    const newProjects = [...projects];
    let found = false;
    
    for (const project of newProjects) {
      for (const building of project.buildings) {
        for (const zone of building.functionalZones) {
          const shutterIndex = zone.shutters.findIndex(s => s.id === shutterId);
          if (shutterIndex !== -1) {
            zone.shutters.splice(shutterIndex, 1);
            found = true;
            break;
          }
        }
        if (found) break;
      }
      if (found) break;
    }
    
    if (found) {
      const newFavorites = {
        ...favorites,
        shutters: favorites.shutters.filter(fId => fId !== shutterId)
      };
      await Promise.all([saveProjects(newProjects), saveFavorites(newFavorites)]);
      return true;
    }
    return false;
  };

  // Search
  const searchShuttersFunc = (query: string): SearchResult[] => {
    const results: SearchResult[] = [];
    const queryWords = query.toLowerCase().trim().split(/\s+/).filter(word => word.length > 0);

    for (const project of projects) {
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

  // Notes avec compression automatique
  const createNoteFunc = async (noteData: Omit<Note, 'id' | 'createdAt' | 'updatedAt'>): Promise<Note | null> => {
    try {
      console.log('📝 Création note avec', noteData.images?.length || 0, 'images (stockage illimité)');
      
      // Compression automatique des images
      const compressedImages = await compressImages(noteData.images);
      
      const note: Note = {
        ...noteData,
        id: generateUniqueId(),
        createdAt: new Date(),
        updatedAt: new Date(),
        images: compressedImages
      };
      
      const newNotes = [...notes, note];
      await saveNotes(newNotes);
      
      console.log('✅ Note créée avec succès:', note.id, 'avec', compressedImages?.length || 0, 'images stockées');
      return note;
    } catch (error) {
      console.error('❌ Erreur création note:', error);
      return null;
    }
  };

  const updateNoteFunc = async (id: string, updates: Partial<Note>): Promise<Note | null> => {
    try {
      const index = notes.findIndex(n => n.id === id);
      if (index === -1) return null;
      
      // Compression automatique des nouvelles images
      let finalUpdates = { ...updates };
      if (updates.images) {
        console.log('📝 Mise à jour note avec', updates.images.length, 'images (stockage illimité)');
        finalUpdates.images = await compressImages(updates.images);
      }
      
      const newNotes = [...notes];
      newNotes[index] = { ...newNotes[index], ...finalUpdates, updatedAt: new Date() };
      await saveNotes(newNotes);
      console.log('✅ Note mise à jour avec succès:', id, 'avec', finalUpdates.images?.length || 0, 'images stockées');
      return newNotes[index];
    } catch (error) {
      console.error('❌ Erreur mise à jour note:', error);
      return null;
    }
  };

  const deleteNoteFunc = async (id: string): Promise<boolean> => {
    try {
      const index = notes.findIndex(n => n.id === id);
      if (index === -1) return false;
      
      const newNotes = notes.filter(n => n.id !== id);
      const newFavorites = {
        ...favorites,
        notes: favorites.notes.filter(fId => fId !== id)
      };
      
      await Promise.all([saveNotes(newNotes), saveFavorites(newFavorites)]);
      return true;
    } catch (error) {
      console.error('❌ Erreur suppression note:', error);
      return false;
    }
  };

  // Favorites
  const setFavoriteProjectsFunc = async (newFavoriteProjects: string[]): Promise<void> => {
    const newFavorites = { ...favorites, projects: newFavoriteProjects };
    await saveFavorites(newFavorites);
  };

  const setFavoriteBuildingsFunc = async (newFavoriteBuildings: string[]): Promise<void> => {
    const newFavorites = { ...favorites, buildings: newFavoriteBuildings };
    await saveFavorites(newFavorites);
  };

  const setFavoriteZonesFunc = async (newFavoriteZones: string[]): Promise<void> => {
    const newFavorites = { ...favorites, zones: newFavoriteZones };
    await saveFavorites(newFavorites);
  };

  const setFavoriteShuttersFunc = async (newFavoriteShutters: string[]): Promise<void> => {
    const newFavorites = { ...favorites, shutters: newFavoriteShutters };
    await saveFavorites(newFavorites);
  };

  const setFavoriteNotesFunc = async (newFavoriteNotes: string[]): Promise<void> => {
    const newFavorites = { ...favorites, notes: newFavoriteNotes };
    await saveFavorites(newFavorites);
  };

  // Quick calc history
  const addQuickCalcHistoryFunc = async (item: Omit<QuickCalcHistoryItem, 'id' | 'timestamp'>): Promise<void> => {
    const newItem: QuickCalcHistoryItem = {
      ...item,
      id: generateUniqueId(),
      timestamp: new Date()
    };
    
    const newHistory = [newItem, ...quickCalcHistory].slice(0, 5);
    
    await saveQuickCalcHistoryState(newHistory);
  };

  const clearQuickCalcHistoryFunc = async (): Promise<void> => {
    await saveQuickCalcHistoryState([]);
  };

  const removeQuickCalcHistoryItemFunc = async (itemId: string): Promise<void> => {
    const newHistory = quickCalcHistory.filter(item => item.id !== itemId);
    await saveQuickCalcHistoryState(newHistory);
  };

  // Utilities
  const clearAllDataFunc = async (): Promise<void> => {
    try {
      await AsyncStorage.multiRemove([
        PROJECTS_KEY,
        NOTES_KEY,
        FAVORITES_KEY,
        QUICK_CALC_HISTORY_KEY
      ]);
      
      setProjects([]);
      setNotes([]);
      setFavorites({ projects: [], buildings: [], zones: [], shutters: [], notes: [] });
      setQuickCalcHistory([]);
    } catch (error) {
      console.error('Erreur suppression données:', error);
    }
  };

  const getStorageInfoFunc = () => {
    const totalShutters = projects.reduce((total, project) => 
      total + project.buildings.reduce((buildingTotal, building) => 
        buildingTotal + building.functionalZones.reduce((zoneTotal, zone) => 
          zoneTotal + zone.shutters.length, 0), 0), 0);

    const dataString = JSON.stringify({ projects, notes });
    const storageSize = `${(dataString.length / 1024).toFixed(2)} KB`;

    return {
      projectsCount: projects.length,
      totalShutters,
      storageSize,
      notesCount: notes.length
    };
  };

  if (!isReady) {
    return null;
  }

  return (
    <StorageContext.Provider value={{
      // Projects
      projects,
      createProject: createProjectFunc,
      updateProject: updateProjectFunc,
      deleteProject: deleteProjectFunc,
      importProject: importProjectFunc,

      // Buildings
      createBuilding: createBuildingFunc,
      updateBuilding: updateBuildingFunc,
      deleteBuilding: deleteBuildingFunc,

      // Zones
      createFunctionalZone: createFunctionalZoneFunc,
      updateFunctionalZone: updateFunctionalZoneFunc,
      deleteFunctionalZone: deleteFunctionalZoneFunc,

      // Shutters
      createShutter: createShutterFunc,
      updateShutter: updateShutterFunc,
      deleteShutter: deleteShutterFunc,

      // Search
      searchShutters: searchShuttersFunc,

      // Notes
      notes,
      createNote: createNoteFunc,
      updateNote: updateNoteFunc,
      deleteNote: deleteNoteFunc,

      // Favorites
      favoriteProjects: favorites.projects,
      favoriteBuildings: favorites.buildings,
      favoriteZones: favorites.zones,
      favoriteShutters: favorites.shutters,
      favoriteNotes: favorites.notes,
      setFavoriteProjects: setFavoriteProjectsFunc,
      setFavoriteBuildings: setFavoriteBuildingsFunc,
      setFavoriteZones: setFavoriteZonesFunc,
      setFavoriteShutters: setFavoriteShuttersFunc,
      setFavoriteNotes: setFavoriteNotesFunc,

      // Quick calc history
      quickCalcHistory,
      addQuickCalcHistory: addQuickCalcHistoryFunc,
      clearQuickCalcHistory: clearQuickCalcHistoryFunc,
      removeQuickCalcHistoryItem: removeQuickCalcHistoryItemFunc,

      // Utilities
      clearAllData: clearAllDataFunc,
      getStorageInfo: getStorageInfoFunc
    }}>
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