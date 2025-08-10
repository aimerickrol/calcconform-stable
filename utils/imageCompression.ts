/**
 * Système de compression d'images simple et fiable
 * Compatible web, iOS et Android
 */

export interface CompressionOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
}

export interface CompressionResult {
  compressedBase64: string;
  originalSize: number;
  compressedSize: number;
  compressionRatio: number;
}

/**
 * Compresse une image à partir d'un fichier File (web uniquement)
 */
export async function compressImageFromFile(
  file: File, 
  options: CompressionOptions = {}
): Promise<string> {
  const {
    maxWidth = 1280,
    maxHeight = 1280,
    quality = 0.75
  } = options;

  return new Promise((resolve, reject) => {
    const img = new Image();
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    if (!ctx) {
      reject(new Error('Canvas non disponible'));
      return;
    }

    img.onload = () => {
      try {
        // Calculer les nouvelles dimensions
        const { width: newWidth, height: newHeight } = calculateDimensions(
          img.width, 
          img.height, 
          maxWidth, 
          maxHeight
        );

        // Configurer le canvas
        canvas.width = newWidth;
        canvas.height = newHeight;

        // Dessiner l'image redimensionnée
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, newWidth, newHeight);

        // Convertir en base64 compressé
        const compressedBase64 = canvas.toDataURL('image/jpeg', quality);
        resolve(compressedBase64);

      } catch (error) {
        reject(error);
      }
    };

    img.onerror = () => {
      reject(new Error('Impossible de charger l\'image'));
    };

    // Charger l'image depuis le fichier
    const reader = new FileReader();
    reader.onload = (e) => {
      img.src = e.target?.result as string;
    };
    reader.onerror = () => {
      reject(new Error('Erreur FileReader'));
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Calcule les nouvelles dimensions en préservant le ratio
 */
function calculateDimensions(
  originalWidth: number, 
  originalHeight: number, 
  maxWidth: number, 
  maxHeight: number
): { width: number; height: number } {
  let { width, height } = { width: originalWidth, height: originalHeight };

  if (width <= maxWidth && height <= maxHeight) {
    return { width, height };
  }

  const widthRatio = maxWidth / width;
  const heightRatio = maxHeight / height;
  const ratio = Math.min(widthRatio, heightRatio);

  width = Math.round(width * ratio);
  height = Math.round(height * ratio);

  return { width, height };
}

/**
 * Valide qu'une image base64 est correcte
 */
export function validateImageBase64(base64: string): boolean {
  if (!base64 || typeof base64 !== 'string') {
    return false;
  }

  if (!base64.startsWith('data:image/')) {
    return false;
  }

  const commaIndex = base64.indexOf(',');
  if (commaIndex === -1 || base64.length - commaIndex < 100) {
    return false;
  }

  return true;
}

/**
 * Formate la taille en bytes
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}