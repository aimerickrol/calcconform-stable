/**
 * Système de stockage d'images optimisé pour mobile
 * Stocke les images en fichiers séparés sur mobile, garde base64 sur web
 */

import * as FileSystem from 'expo-file-system';
import { Platform } from 'react-native';

const IMAGES_DIR = 'notes/';

/**
 * Persiste les images si nécessaire (mobile: fichiers, web: base64 inchangé)
 */
export async function persistImagesIfNeeded(images?: string[]): Promise<string[] | undefined> {
  if (!images || images.length === 0) {
    return undefined;
  }

  // Sur web, retourner les images inchangées
  if (Platform.OS === 'web') {
    return images;
  }

  console.log('📱 Persistance mobile de', images.length, 'images...');
  
  // S'assurer que le dossier existe
  const imagesDir = `${FileSystem.documentDirectory}${IMAGES_DIR}`;
  try {
    const dirInfo = await FileSystem.getInfoAsync(imagesDir);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(imagesDir, { intermediates: true });
      console.log('📁 Dossier images créé:', imagesDir);
    }
  } catch (error) {
    console.error('❌ Erreur création dossier images:', error);
  }

  const persistedImages: string[] = [];

  for (let i = 0; i < images.length; i++) {
    const image = images[i];
    
    try {
      // Si c'est déjà un file://, le garder tel quel
      if (image.startsWith('file://')) {
        persistedImages.push(image);
        continue;
      }

      // Si c'est du base64, le convertir en fichier
      if (image.startsWith('data:image/')) {
        const imageId = `img_${Date.now()}_${i}_${Math.random().toString(36).substr(2, 9)}`;
        const extension = getImageExtension(image);
        const fileName = `${imageId}.${extension}`;
        const filePath = `${imagesDir}${fileName}`;

        // Extraire les données base64
        const base64Data = image.split(',')[1];
        if (!base64Data) {
          console.warn(`⚠️ Image ${i} invalide (pas de données base64), ignorée`);
          continue;
        }

        // Écrire le fichier
        await FileSystem.writeAsStringAsync(filePath, base64Data, {
          encoding: FileSystem.EncodingType.Base64,
        });

        const fileUri = `file://${filePath}`;
        persistedImages.push(fileUri);
        console.log(`✅ Image ${i} persistée: ${fileName}`);
        
      } else {
        console.warn(`⚠️ Image ${i} format inconnu, ignorée:`, image.substring(0, 50));
      }
      
    } catch (error) {
      console.error(`❌ Erreur persistance image ${i}:`, error);
      // Continuer sans cette image pour ne pas bloquer la note
    }
  }

  console.log(`✅ Persistance terminée: ${persistedImages.length}/${images.length} images sauvegardées`);
  return persistedImages.length > 0 ? persistedImages : undefined;
}

/**
 * Supprime les images stockées en fichiers
 */
export async function removeImages(uris?: string[]): Promise<void> {
  if (!uris || uris.length === 0 || Platform.OS === 'web') {
    return;
  }

  console.log('🗑️ Suppression de', uris.length, 'fichiers images...');

  for (const uri of uris) {
    if (uri.startsWith('file://')) {
      try {
        const filePath = uri.replace('file://', '');
        const fileInfo = await FileSystem.getInfoAsync(filePath);
        
        if (fileInfo.exists) {
          await FileSystem.deleteAsync(filePath);
          console.log('✅ Fichier image supprimé:', filePath);
        }
      } catch (error) {
        console.warn('⚠️ Erreur suppression fichier image:', uri, error);
        // Continuer la suppression des autres fichiers
      }
    }
  }
}

/**
 * Convertit les file:// en base64 pour l'affichage (mobile uniquement)
 */
export async function loadImageForDisplay(uri: string): Promise<string> {
  if (Platform.OS === 'web' || !uri.startsWith('file://')) {
    return uri;
  }

  try {
    const filePath = uri.replace('file://', '');
    const base64 = await FileSystem.readAsStringAsync(filePath, {
      encoding: FileSystem.EncodingType.Base64,
    });
    
    const extension = getFileExtension(filePath);
    const mimeType = getMimeType(extension);
    
    return `data:${mimeType};base64,${base64}`;
  } catch (error) {
    console.error('❌ Erreur chargement image pour affichage:', uri, error);
    return uri; // Fallback vers l'URI original
  }
}

/**
 * Charge toutes les images d'une note pour l'affichage
 */
export async function loadImagesForDisplay(uris?: string[]): Promise<string[]> {
  if (!uris || uris.length === 0) {
    return [];
  }

  if (Platform.OS === 'web') {
    return uris;
  }

  const loadedImages: string[] = [];
  
  for (const uri of uris) {
    try {
      const displayUri = await loadImageForDisplay(uri);
      loadedImages.push(displayUri);
    } catch (error) {
      console.error('❌ Erreur chargement image:', uri, error);
      // Continuer avec les autres images
    }
  }

  return loadedImages;
}

/**
 * Obtient l'extension d'image depuis le type MIME base64
 */
function getImageExtension(base64Image: string): string {
  if (base64Image.includes('data:image/jpeg')) return 'jpg';
  if (base64Image.includes('data:image/jpg')) return 'jpg';
  if (base64Image.includes('data:image/png')) return 'png';
  if (base64Image.includes('data:image/webp')) return 'webp';
  if (base64Image.includes('data:image/gif')) return 'gif';
  return 'jpg'; // Défaut
}

/**
 * Obtient l'extension depuis un chemin de fichier
 */
function getFileExtension(filePath: string): string {
  const parts = filePath.split('.');
  return parts[parts.length - 1] || 'jpg';
}

/**
 * Obtient le type MIME depuis l'extension
 */
function getMimeType(extension: string): string {
  switch (extension.toLowerCase()) {
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'png':
      return 'image/png';
    case 'webp':
      return 'image/webp';
    case 'gif':
      return 'image/gif';
    default:
      return 'image/jpeg';
  }
}

/**
 * Nettoie les images orphelines (fichiers sans référence dans les notes)
 */
export async function cleanupOrphanImages(allNoteImages: string[]): Promise<void> {
  if (Platform.OS === 'web') return;

  try {
    const imagesDir = `${FileSystem.documentDirectory}${IMAGES_DIR}`;
    const dirInfo = await FileSystem.getInfoAsync(imagesDir);
    
    if (!dirInfo.exists) return;

    const files = await FileSystem.readDirectoryAsync(imagesDir);
    const referencedFiles = new Set(
      allNoteImages
        .filter(uri => uri.startsWith('file://'))
        .map(uri => uri.split('/').pop())
        .filter(Boolean)
    );

    let cleanedCount = 0;
    for (const file of files) {
      if (!referencedFiles.has(file)) {
        try {
          await FileSystem.deleteAsync(`${imagesDir}${file}`);
          cleanedCount++;
        } catch (error) {
          console.warn('⚠️ Erreur suppression fichier orphelin:', file, error);
        }
      }
    }

    if (cleanedCount > 0) {
      console.log(`🧹 ${cleanedCount} fichiers images orphelins supprimés`);
    }
  } catch (error) {
    console.error('❌ Erreur nettoyage images orphelines:', error);
  }
}

/**
 * Rapport de debug sur le stockage des images
 */
export async function debugStorageReport(notes: any[]): Promise<void> {
  console.log('📊 === RAPPORT STOCKAGE IMAGES ===');
  
  let totalImages = 0;
  let base64Images = 0;
  let fileImages = 0;
  let totalBase64Size = 0;

  notes.forEach(note => {
    if (note.images) {
      totalImages += note.images.length;
      note.images.forEach((img: string) => {
        if (img.startsWith('data:image/')) {
          base64Images++;
          totalBase64Size += Math.round((img.length * 3) / 4);
        } else if (img.startsWith('file://')) {
          fileImages++;
        }
      });
    }
  });

  console.log(`📸 Total images: ${totalImages}`);
  console.log(`📊 Base64: ${base64Images} (${(totalBase64Size / 1024 / 1024).toFixed(2)} MB)`);
  console.log(`📁 Fichiers: ${fileImages}`);

  if (Platform.OS !== 'web') {
    try {
      const imagesDir = `${FileSystem.documentDirectory}${IMAGES_DIR}`;
      const dirInfo = await FileSystem.getInfoAsync(imagesDir);
      
      if (dirInfo.exists) {
        const files = await FileSystem.readDirectoryAsync(imagesDir);
        console.log(`📁 Fichiers sur disque: ${files.length}`);
      }
    } catch (error) {
      console.warn('⚠️ Erreur lecture dossier images:', error);
    }
  }

  console.log('📊 === FIN RAPPORT ===');
}