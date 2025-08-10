/**
 * Utilitaires de chunking UTF-8 pour AsyncStorage
 * Divise les données en chunks respectant les limites de bytes UTF-8
 */

/**
 * Divise une chaîne en chunks respectant les limites UTF-8
 */
export function splitByBytes(str: string, maxBytes: number): string[] {
  if (!str) return [];
  
  const encoder = new TextEncoder();
  const chunks: string[] = [];
  let currentChunk = '';
  
  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    const testChunk = currentChunk + char;
    const testBytes = encoder.encode(testChunk);
    
    if (testBytes.length > maxBytes && currentChunk.length > 0) {
      // Le chunk actuel dépasse la limite, le sauvegarder
      chunks.push(currentChunk);
      currentChunk = char;
    } else {
      currentChunk = testChunk;
    }
  }
  
  // Ajouter le dernier chunk s'il n'est pas vide
  if (currentChunk.length > 0) {
    chunks.push(currentChunk);
  }
  
  return chunks;
}

/**
 * Reconstitue une chaîne depuis des chunks
 */
export function joinChunks(chunks: string[]): string {
  return chunks.join('');
}

/**
 * Fallback pour les environnements sans TextEncoder
 */
export function splitByBytesLegacy(str: string, maxBytes: number): string[] {
  if (!str) return [];
  
  const chunks: string[] = [];
  let currentChunk = '';
  
  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    const testChunk = currentChunk + char;
    
    // Approximation: 1 caractère = 1-4 bytes en UTF-8
    // On utilise une estimation conservative
    const estimatedBytes = testChunk.length * 3; // Estimation haute
    
    if (estimatedBytes > maxBytes && currentChunk.length > 0) {
      chunks.push(currentChunk);
      currentChunk = char;
    } else {
      currentChunk = testChunk;
    }
  }
  
  if (currentChunk.length > 0) {
    chunks.push(currentChunk);
  }
  
  return chunks;
}

/**
 * Fonction principale qui utilise TextEncoder si disponible, sinon fallback
 */
export function splitStringByBytes(str: string, maxBytes: number): string[] {
  try {
    if (typeof TextEncoder !== 'undefined' && typeof window !== 'undefined') {
      return splitByBytes(str, maxBytes);
    } else {
      return splitByBytesLegacy(str, maxBytes);
    }
  } catch (error) {
    console.warn('⚠️ Erreur splitByBytes, utilisation fallback:', error);
    return splitByBytesLegacy(str, maxBytes);
  }
}