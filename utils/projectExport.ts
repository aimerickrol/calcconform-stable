/**
 * Système complet d'export/import de fichiers .calcprojet pour Siemens CalcConform
 * Compatible web, Android et iOS avec gestion robuste des erreurs
 */

import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Platform, Alert } from 'react-native';
import { Project, Note } from '@/types';
import { CALCPROJET_EXTENSION, isValidCalcProjetFile, generateSafeFileName, isValidImportFile } from '@/utils/fileTypes';

export interface ExportData {
  version: string;
  exportDate: string;
  project: Project;
  relatedNotes: Note[];
  metadata: {
    appVersion: string;
    platform: string;
    exportedBy: string;
  };
}

/**
 * Exporte un projet vers un fichier .calcprojet
 */
export async function exportProject(project: Project, relatedNotes: Note[] = []): Promise<boolean> {
  try {
    console.log('📤 Début export du projet:', project.name);
    console.log('📊 Données à exporter:', {
      buildings: project.buildings.length,
      zones: project.buildings.reduce((total, b) => total + b.functionalZones.length, 0),
      shutters: project.buildings.reduce((total, b) => 
        total + b.functionalZones.reduce((zTotal, z) => zTotal + z.shutters.length, 0), 0),
      notes: relatedNotes.length
    });
    
    // Préparer les données d'export
    const exportData: ExportData = {
      version: '1.0.0',
      exportDate: new Date().toISOString(),
      project: {
        ...project,
        buildings: project.buildings.map(building => ({
          ...building,
          functionalZones: building.functionalZones.map(zone => ({
            ...zone,
            shutters: zone.shutters.map(shutter => ({
              ...shutter,
            }))
          }))
        }))
      },
      relatedNotes: relatedNotes.map(note => ({
        ...note,
        images: note.images || []
      })),
      metadata: {
        appVersion: '2.1.1',
        platform: Platform.OS,
        exportedBy: 'Siemens CalcConform'
      }
    };

    // Générer le nom de fichier sécurisé
    const fileName = generateSafeFileName(project.name);
    
    // Convertir en JSON
    const jsonData = JSON.stringify(exportData, null, 2);
    const dataSize = (jsonData.length / 1024 / 1024).toFixed(2);
    console.log(`📊 Taille des données d'export: ${dataSize} MB`);

    if (Platform.OS === 'web') {
      console.log('🌐 Export web avec téléchargement automatique');
      
      // Export pour web avec téléchargement direct
      const blob = new Blob([jsonData], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      console.log('✅ Export web réussi:', fileName);
      return true;
    } else {
      console.log('📱 Export mobile avec partage');
      
      // Export pour mobile avec expo-file-system et expo-sharing
      const fileUri = `${FileSystem.documentDirectory}${fileName}`;
      
      // Écrire le fichier
      await FileSystem.writeAsStringAsync(fileUri, jsonData, {
        encoding: FileSystem.EncodingType.UTF8,
      });
      
      console.log('📁 Fichier créé:', fileUri);
      
      // Partager le fichier si possible
      if (await Sharing.isAvailableAsync()) {
        console.log('📤 Ouverture du partage...');
        await Sharing.shareAsync(fileUri, {
          mimeType: 'application/json',
          dialogTitle: `Exporter ${project.name}`,
        });
        console.log('✅ Partage ouvert avec succès');
      } else {
        console.log('⚠️ Partage non disponible, fichier sauvegardé dans:', fileUri);
      }
      
      console.log('✅ Export mobile réussi:', fileName);
      return true;
    }
  } catch (error) {
    console.error('❌ Erreur lors de l\'export:', error);
    return false;
  }
}

/**
 * Import universel qui fonctionne sur web et mobile
 */
export async function importProjectUniversal(onImport: (data: ExportData) => Promise<void>): Promise<void> {
  try {
    if (Platform.OS === 'web') {
      console.log('🌐 Import web avec input file');
      
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.calcprojet,.json';
      input.style.display = 'none';
      
      input.onchange = async (e: any) => {
        try {
          const file: File | undefined = e.target.files?.[0];
          if (!file || !isValidImportFile(file.name)) {
            Alert.alert('Format invalide', 'Veuillez sélectionner un fichier .calcprojet ou .json');
            return;
          }
          
          console.log('📁 Fichier sélectionné:', file.name);
          const text = await file.text();
          const data = JSON.parse(text);
          
          // Valider la structure
          if (!data.project || !data.version) {
            Alert.alert('Fichier invalide', 'Le fichier semble corrompu ou ne contient pas de données de projet valides.');
            return;
          }
          
          await onImport(data);
        } catch (error) {
          console.error('❌ Erreur traitement fichier web:', error);
          Alert.alert('Erreur d\'import', 'Impossible de traiter le fichier sélectionné.');
        }
      };
      
      document.body.appendChild(input);
      input.click();
      document.body.removeChild(input);
      return;
    }

    // Mobile: import dynamique pour ne pas casser le build web
    console.log('📱 Import mobile avec DocumentPicker dynamique');
    const DocumentPicker = await import('expo-document-picker');
    const res = await DocumentPicker.getDocumentAsync({ type: '*/*' });
    
    if ((res as any).canceled || (res as any).type === 'cancel') {
      console.log('📁 Import annulé par l\'utilisateur');
      return;
    }

    const fileData = (res as any).assets ? (res as any).assets[0] : res;
    const { name, uri } = fileData;
    
    if (!isValidImportFile(name)) {
      Alert.alert('Format invalide', 'Veuillez sélectionner un fichier .calcprojet ou .json');
      return;
    }
    
    console.log('📁 Fichier mobile sélectionné:', name);
    const content = await FileSystem.readAsStringAsync(uri);
    const data = JSON.parse(content);
    
    // Valider la structure
    if (!data.project || !data.version) {
      Alert.alert('Fichier invalide', 'Le fichier semble corrompu ou ne contient pas de données de projet valides.');
      return;
    }
    
    await onImport(data);
  } catch (err) {
    console.error('❌ Erreur import:', err);
    Alert.alert('Erreur d\'import', 'Erreur lors de l\'import du projet.');
  }
}

/**
 * Filtre les notes liées à un projet
 */
export function getRelatedNotes(project: Project, allNotes: Note[]): Note[] {
  if (!allNotes || allNotes.length === 0) return [];
  
  // Créer une liste de tous les noms d'éléments du projet pour la recherche
  const projectKeywords = [
    project.name.toLowerCase(),
    project.city?.toLowerCase() || '',
    ...project.buildings.map(b => b.name.toLowerCase()),
    ...project.buildings.flatMap(b => 
      b.functionalZones.map(z => z.name.toLowerCase())
    ),
    ...project.buildings.flatMap(b => 
      b.functionalZones.flatMap(z => 
        z.shutters.map(s => s.name.toLowerCase())
      )
    )
  ].filter(keyword => keyword.length > 0);
  
  // Filtrer les notes qui contiennent des mots-clés du projet
  return allNotes.filter(note => {
    const noteText = [
      note.title?.toLowerCase() || '',
      note.description?.toLowerCase() || '',
      note.location?.toLowerCase() || '',
      note.tags?.toLowerCase() || '',
      note.content?.toLowerCase() || ''
    ].join(' ');
    
    return projectKeywords.some(keyword => 
      noteText.includes(keyword) && keyword.length > 2
    );
  });
}