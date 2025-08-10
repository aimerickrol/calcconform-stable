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

// Cache en mémoire
let projects: Project[] = [];
let notes: Note[] = [];
let favorites = {
  projects: [] as string[],
  buildings: [] as string[],
  zones: [] as string[],
  shutters: [] as string[],
  notes: [] as string[]
};
let quickCalcHistory: QuickCalcHistoryItem[] = [];

let isInitialized = false;

// Fonction pour générer un ID unique
function generateUniqueId(): string {
  return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Compression automatique des images
async function compressImages(images?: string[]): Promise<string[] | undefined> {
  if (!images || images.length === 0) {
    return undefined;
  }

  console.log('📸 Compression de', images.length, 'images...');
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

  console.log(`✅ Compression terminée: ${compressedImages.length}/${images.length} images traitées`);
  return compressedImages;
}

// Fonctions de sauvegarde simplifiées
async function saveProjects(): Promise<void> {
  try {
    await AsyncStorage.setItem(PROJECTS_KEY, JSON.stringify(projects));
  } catch (error) {
    console.error('Erreur sauvegarde projets:', error);
    throw error;
  }
}

async function saveNotes(): Promise<void> {
  try {
    await AsyncStorage.setItem(NOTES_KEY, JSON.stringify(notes));
  } catch (error) {
    console.error('Erreur sauvegarde notes:', error);
    throw error;
  }
}

async function saveFavorites(): Promise<void> {
  try {
    await AsyncStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites));
  } catch (error) {
    console.error('Erreur sauvegarde favoris:', error);
    throw error;
  }
}

async function saveQuickCalcHistory(): Promise<void> {
  try {
    await AsyncStorage.setItem(QUICK_CALC_HISTORY_KEY, JSON.stringify(quickCalcHistory));
  } catch (error) {
    console.error('Erreur sauvegarde historique:', error);
    throw error;
  }
}

// Fonctions de chargement simplifiées
async function loadData(): Promise<void> {
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
      projects = parsedProjects.map((project: any) => ({
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
    }

    // Charger notes
    if (notesData) {
      const parsedNotes = JSON.parse(notesData);
      notes = parsedNotes.map((note: any) => ({
        ...note,
        createdAt: new Date(note.createdAt),
        updatedAt: new Date(note.updatedAt)
      }));
    }

    // Charger favoris
    if (favoritesData) {
      favorites = JSON.parse(favoritesData);
    }

    // Charger historique
    if (historyData) {
      const parsedHistory = JSON.parse(historyData);
      quickCalcHistory = parsedHistory.map((item: any) => ({
        ...item,
        timestamp: new Date(item.timestamp)
      }));
    }

    console.log('✅ Données chargées:', {
      projects: projects.length,
      notes: notes.length,
      history: quickCalcHistory.length
    });

  } catch (error) {
    console.error('Erreur chargement données:', error);
    // Initialiser avec des valeurs par défaut
    projects = [];
    notes = [];
    favorites = { projects: [], buildings: [], zones: [], shutters: [], notes: [] };
    quickCalcHistory = [];
  }
}

export function StorageProvider({ children }: StorageProviderProps) {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const initialize = async () => {
      if (isInitialized) return;
      
      try {
        await loadData();
        isInitialized = true;
      } catch (error) {
        console.error('Erreur initialisation storage:', error);
      } finally {
        setIsReady(true);
      }
    };

    initialize();
  }, []);

  // Projects
  const createProject = async (projectData: Omit<Project, 'id' | 'createdAt' | 'updatedAt' | 'buildings'>): Promise<Project> => {
    const project: Project = {
      ...projectData,
      id: generateUniqueId(),
      createdAt: new Date(),
      updatedAt: new Date(),
      buildings: []
    };
    
    projects.push(project);
    await saveProjects();
    return project;
  };

  const updateProject = async (id: string, updates: Partial<Project>): Promise<Project | null> => {
    const index = projects.findIndex(p => p.id === id);
    if (index === -1) return null;
    
    projects[index] = { ...projects[index], ...updates, updatedAt: new Date() };
    await saveProjects();
    return projects[index];
  };

  const deleteProject = async (id: string): Promise<boolean> => {
    const index = projects.findIndex(p => p.id === id);
    if (index === -1) return false;
    
    projects.splice(index, 1);
    favorites.projects = favorites.projects.filter(fId => fId !== id);
    
    await Promise.all([saveProjects(), saveFavorites()]);
    return true;
  };

  const importProject = async (project: Project, relatedNotes: Note[] = []): Promise<boolean> => {
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

      projects.push(newProject);

      // Importer les notes liées
      if (relatedNotes.length > 0) {
        const newNotes = relatedNotes.map(note => ({
          ...note,
          id: generateUniqueId(),
          createdAt: new Date(),
          updatedAt: new Date()
        }));
        notes.push(...newNotes);
        await saveNotes();
      }

      await saveProjects();
      return true;
    } catch (error) {
      console.error('Erreur import projet:', error);
      return false;
    }
  };

  // Buildings
  const createBuilding = async (projectId: string, buildingData: Omit<Building, 'id' | 'projectId' | 'createdAt' | 'functionalZones'>): Promise<Building | null> => {
    const project = projects.find(p => p.id === projectId);
    if (!project) return null;

    const building: Building = {
      ...buildingData,
      id: generateUniqueId(),
      projectId,
      createdAt: new Date(),
      functionalZones: []
    };

    project.buildings.push(building);
    await saveProjects();
    return building;
  };

  const updateBuilding = async (buildingId: string, updates: Partial<Building>): Promise<Building | null> => {
    for (const project of projects) {
      const buildingIndex = project.buildings.findIndex(b => b.id === buildingId);
      if (buildingIndex !== -1) {
        project.buildings[buildingIndex] = { ...project.buildings[buildingIndex], ...updates };
        await saveProjects();
        return project.buildings[buildingIndex];
      }
    }
    return null;
  };

  const deleteBuilding = async (buildingId: string): Promise<boolean> => {
    for (const project of projects) {
      const buildingIndex = project.buildings.findIndex(b => b.id === buildingId);
      if (buildingIndex !== -1) {
        project.buildings.splice(buildingIndex, 1);
        favorites.buildings = favorites.buildings.filter(fId => fId !== buildingId);
        await Promise.all([saveProjects(), saveFavorites()]);
        return true;
      }
    }
    return false;
  };

  // Zones
  const createFunctionalZone = async (buildingId: string, zoneData: Omit<FunctionalZone, 'id' | 'buildingId' | 'createdAt' | 'shutters'>): Promise<FunctionalZone | null> => {
    for (const project of projects) {
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
        await saveProjects();
        return zone;
      }
    }
    return null;
  };

  const updateFunctionalZone = async (zoneId: string, updates: Partial<FunctionalZone>): Promise<FunctionalZone | null> => {
    for (const project of projects) {
      for (const building of project.buildings) {
        const zoneIndex = building.functionalZones.findIndex(z => z.id === zoneId);
        if (zoneIndex !== -1) {
          building.functionalZones[zoneIndex] = { ...building.functionalZones[zoneIndex], ...updates };
          await saveProjects();
          return building.functionalZones[zoneIndex];
        }
      }
    }
    return null;
  };

  const deleteFunctionalZone = async (zoneId: string): Promise<boolean> => {
    for (const project of projects) {
      for (const building of project.buildings) {
        const zoneIndex = building.functionalZones.findIndex(z => z.id === zoneId);
        if (zoneIndex !== -1) {
          building.functionalZones.splice(zoneIndex, 1);
          favorites.zones = favorites.zones.filter(fId => fId !== zoneId);
          await Promise.all([saveProjects(), saveFavorites()]);
          return true;
        }
      }
    }
    return false;
  };

  // Shutters
  const createShutter = async (zoneId: string, shutterData: Omit<Shutter, 'id' | 'zoneId' | 'createdAt' | 'updatedAt'>): Promise<Shutter | null> => {
    for (const project of projects) {
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
          await saveProjects();
          return shutter;
        }
      }
    }
    return null;
  };

  const updateShutter = async (shutterId: string, updates: Partial<Shutter>): Promise<Shutter | null> => {
    for (const project of projects) {
      for (const building of project.buildings) {
        for (const zone of building.functionalZones) {
          const shutterIndex = zone.shutters.findIndex(s => s.id === shutterId);
          if (shutterIndex !== -1) {
            zone.shutters[shutterIndex] = { ...zone.shutters[shutterIndex], ...updates, updatedAt: new Date() };
            await saveProjects();
            return zone.shutters[shutterIndex];
          }
        }
      }
    }
    return null;
  };

  const deleteShutter = async (shutterId: string): Promise<boolean> => {
    for (const project of projects) {
      for (const building of project.buildings) {
        for (const zone of building.functionalZones) {
          const shutterIndex = zone.shutters.findIndex(s => s.id === shutterId);
          if (shutterIndex !== -1) {
            zone.shutters.splice(shutterIndex, 1);
            favorites.shutters = favorites.shutters.filter(fId => fId !== shutterId);
            await Promise.all([saveProjects(), saveFavorites()]);
            return true;
          }
        }
      }
    }
    return false;
  };

  // Search
  const searchShutters = (query: string): SearchResult[] => {
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
  const createNote = async (noteData: Omit<Note, 'id' | 'createdAt' | 'updatedAt'>): Promise<Note | null> => {
    try {
      console.log('📝 Création note avec', noteData.images?.length || 0, 'images');
      
      // Compression automatique des images
      const compressedImages = await compressImages(noteData.images);
      
      const note: Note = {
        ...noteData,
        id: generateUniqueId(),
        createdAt: new Date(),
        updatedAt: new Date(),
        images: compressedImages
      };
      
      notes.push(note);
      await saveNotes();
      
      console.log('✅ Note créée avec succès:', note.id);
      return note;
    } catch (error) {
      console.error('❌ Erreur création note:', error);
      return null;
    }
  };

  const updateNote = async (id: string, updates: Partial<Note>): Promise<Note | null> => {
    try {
      const index = notes.findIndex(n => n.id === id);
      if (index === -1) return null;
      
      // Compression automatique des nouvelles images
      let finalUpdates = { ...updates };
      if (updates.images) {
        finalUpdates.images = await compressImages(updates.images);
      }
      
      notes[index] = { ...notes[index], ...finalUpdates, updatedAt: new Date() };
      await saveNotes();
      return notes[index];
    } catch (error) {
      console.error('❌ Erreur mise à jour note:', error);
      return null;
    }
  };

  const deleteNote = async (id: string): Promise<boolean> => {
    try {
      const index = notes.findIndex(n => n.id === id);
      if (index === -1) return false;
      
      notes.splice(index, 1);
      favorites.notes = favorites.notes.filter(fId => fId !== id);
      
      await Promise.all([saveNotes(), saveFavorites()]);
      return true;
    } catch (error) {
      console.error('❌ Erreur suppression note:', error);
      return false;
    }
  };

  // Favorites
  const setFavoriteProjects = async (newFavorites: string[]): Promise<void> => {
    favorites.projects = newFavorites;
    await saveFavorites();
  };

  const setFavoriteBuildings = async (newFavorites: string[]): Promise<void> => {
    favorites.buildings = newFavorites;
    await saveFavorites();
  };

  const setFavoriteZones = async (newFavorites: string[]): Promise<void> => {
    favorites.zones = newFavorites;
    await saveFavorites();
  };

  const setFavoriteShutters = async (newFavorites: string[]): Promise<void> => {
    favorites.shutters = newFavorites;
    await saveFavorites();
  };

  const setFavoriteNotes = async (newFavorites: string[]): Promise<void> => {
    favorites.notes = newFavorites;
    await saveFavorites();
  };

  // Quick calc history
  const addQuickCalcHistory = async (item: Omit<QuickCalcHistoryItem, 'id' | 'timestamp'>): Promise<void> => {
    const newItem: QuickCalcHistoryItem = {
      ...item,
      id: generateUniqueId(),
      timestamp: new Date()
    };
    
    quickCalcHistory.unshift(newItem);
    quickCalcHistory = quickCalcHistory.slice(0, 5);
    
    await saveQuickCalcHistory();
  };

  const clearQuickCalcHistory = async (): Promise<void> => {
    quickCalcHistory = [];
    await saveQuickCalcHistory();
  };

  const removeQuickCalcHistoryItem = async (itemId: string): Promise<void> => {
    quickCalcHistory = quickCalcHistory.filter(item => item.id !== itemId);
    await saveQuickCalcHistory();
  };

  // Utilities
  const clearAllData = async (): Promise<void> => {
    try {
      await AsyncStorage.multiRemove([
        PROJECTS_KEY,
        NOTES_KEY,
        FAVORITES_KEY,
        QUICK_CALC_HISTORY_KEY
      ]);
      
      projects = [];
      notes = [];
      favorites = { projects: [], buildings: [], zones: [], shutters: [], notes: [] };
      quickCalcHistory = [];
      isInitialized = false;
    } catch (error) {
      console.error('Erreur suppression données:', error);
    }
  };

  const getStorageInfo = () => {
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
      createProject,
      updateProject,
      deleteProject,
      importProject,

      // Buildings
      createBuilding,
      updateBuilding,
      deleteBuilding,

      // Zones
      createFunctionalZone,
      updateFunctionalZone,
      deleteFunctionalZone,

      // Shutters
      createShutter,
      updateShutter,
      deleteShutter,

      // Search
      searchShutters,

      // Notes
      notes,
      createNote,
      updateNote,
      deleteNote,

      // Favorites
      favoriteProjects: favorites.projects,
      favoriteBuildings: favorites.buildings,
      favoriteZones: favorites.zones,
      favoriteShutters: favorites.shutters,
      favoriteNotes: favorites.notes,
      setFavoriteProjects,
      setFavoriteBuildings,
      setFavoriteZones,
      setFavoriteShutters,
      setFavoriteNotes,

      // Quick calc history
      quickCalcHistory,
      addQuickCalcHistory,
      clearQuickCalcHistory,
      removeQuickCalcHistoryItem,

      // Utilities
      clearAllData,
      getStorageInfo
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