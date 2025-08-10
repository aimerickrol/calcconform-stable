import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, Platform, Dimensions, FlatList } from 'react-native';
import { Trash2, X, SquareCheck as CheckSquare, Square } from 'lucide-react-native';
import { router } from 'expo-router';
import { useTheme } from '@/contexts/ThemeContext';
import { validateImageBase64 } from '@/utils/imageCompression';
import { useModal } from '@/contexts/ModalContext';
import { loadImageForDisplay } from '@/utils/imageStorage';

interface NoteImageGalleryProps {
  images: string[];
  onRemoveImage: (index: number) => void;
  onRemoveMultipleImages?: (indices: number[]) => void;
  editable?: boolean;
  noteId?: string;
  isEditMode?: boolean;
  disableViewer?: boolean;
}

// Composant optimisé pour chaque image avec lazy loading
function OptimizedImageItem({ 
  imageBase64, 
  index, 
  editable, 
  selectionMode, 
  isSelected, 
  onPress, 
  onRemove, 
  theme,
  isVisible = true,
  shouldLoad = false
}: {
  imageBase64: string;
  index: number;
  editable: boolean;
  selectionMode: boolean;
  isSelected: boolean;
  onPress: () => void;
  onRemove: () => void;
  theme: any;
  isVisible?: boolean;
  shouldLoad?: boolean;
}) {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [displayUri, setDisplayUri] = useState(imageBase64);
  const [loadImage, setLoadImage] = useState(true); // Toujours charger les images

  // Charger l'image pour l'affichage si c'est un file://
  useEffect(() => {
    if (Platform.OS !== 'web') {
      const loadForDisplay = async () => {
        if (imageBase64.startsWith('file://')) {
          try {
            const loaded = await loadImageForDisplay(imageBase64);
            setDisplayUri(loaded);
          } catch (error) {
            console.error('❌ Erreur chargement image pour affichage:', error);
            setImageError(true);
          }
        } else {
          setDisplayUri(imageBase64);
        }
      };
      
      loadForDisplay();
    } else {
      // Sur web, utiliser directement l'URI
      setDisplayUri(imageBase64);
    }
    
  }, [imageBase64]);

  // Vérifier si l'image est valide (base64 ou file://)
  const isValidImage = validateImageBase64(displayUri) || imageBase64.startsWith('file://');

  const styles = createStyles(theme);

  return (
    <View style={styles.imageContainer}>
      {selectionMode && (
        <TouchableOpacity 
          style={styles.selectionCheckbox}
          onPress={onPress}
        >
          {isSelected ? (
            <CheckSquare size={18} color={theme.colors.primary} />
          ) : (
            <Square size={18} color={theme.colors.textTertiary} />
          )}
        </TouchableOpacity>
      )}
      <TouchableOpacity
        style={[
          styles.imageButton,
          isSelected && styles.imageButtonSelected
        ]}
        onPress={onPress}
        activeOpacity={0.8}
      >
        {!isValidImage ? (
          <View style={styles.imagePlaceholder}>
            <Text style={styles.errorText}>❌</Text>
            <Text style={styles.errorTextSmall}>Image invalide</Text>
          </View>
        ) : imageError ? (
          <View style={styles.errorPlaceholder}>
            <Text style={styles.errorText}>❌</Text>
            <Text style={styles.errorTextSmall}>Erreur image</Text>
          </View>
        ) : (
          <Image
            source={{ uri: displayUri }}
            style={styles.image}
            onLoad={() => {
              console.log(`✅ Image ${index} chargée avec succès dans miniature`);
              setImageLoaded(true);
            }}
            onError={(error) => {
              console.error(`❌ Erreur chargement miniature ${index}:`, error.nativeEvent?.error);
              console.error(`❌ URI problématique:`, displayUri?.substring(0, 100));
              setImageError(true);
            }}
            resizeMode="cover"
          />
        )}
      </TouchableOpacity>
      {editable && !selectionMode && (
        <TouchableOpacity 
          style={styles.removeButton} 
          onPress={onRemove}
        >
          <Trash2 size={14} color="#FFFFFF" />
        </TouchableOpacity>
      )}
    </View>
  );
}

export function NoteImageGallery({ images, onRemoveImage, onRemoveMultipleImages, editable = false, noteId, isEditMode = false, disableViewer = false }: NoteImageGalleryProps) {
  const { theme } = useTheme();
  const { showModal, hideModal } = useModal();
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedImages, setSelectedImages] = useState<Set<number>>(new Set());

  const handleImageSelection = (index: number) => {
    const newSelection = new Set(selectedImages);
    if (newSelection.has(index)) {
      newSelection.delete(index);
    } else {
      newSelection.add(index);
    }
    setSelectedImages(newSelection);
  };

  const handleSelectionMode = () => {
    setSelectionMode(!selectionMode);
    setSelectedImages(new Set());
  };

  const handleBulkDelete = () => {
    if (selectedImages.size === 0) return;

    showModal(
      <BulkRemoveImagesModal 
        count={selectedImages.size}
        onConfirm={() => {
          if (onRemoveMultipleImages) {
            onRemoveMultipleImages(Array.from(selectedImages));
          } else {
            // Fallback: supprimer une par une
            const sortedIndices = Array.from(selectedImages).sort((a, b) => b - a);
            sortedIndices.forEach(index => onRemoveImage(index));
          }
          setSelectedImages(new Set());
          setSelectionMode(false);
          hideModal();
        }}
        onCancel={hideModal}
      />
    );
  };

  const handleSelectAll = () => {
    if (selectedImages.size === images.length) {
      setSelectedImages(new Set());
    } else {
      const allIndices = new Set(images.map((_, index) => index));
      setSelectedImages(allIndices);
    }
  };

  const handleRemoveImage = (index: number) => {
    if (!editable) return;

    showModal(
      <RemoveImageModal 
        onConfirm={() => {
          onRemoveImage(index);
          hideModal();
        }}
        onCancel={hideModal}
      />
    );
  };

  const handleImagePress = (index: number) => {
    // Si on est en mode sélection, sélectionner/désélectionner l'image
    if (selectionMode) {
      handleImageSelection(index);
      return;
    }

    // Si le visualiseur est désactivé, ne rien faire
    if (disableViewer) {
      return;
    }
    
    try {
      console.log('🖼️ Ouverture image - noteId:', noteId, 'editable:', editable, 'isEditMode:', isEditMode);
      
      // CORRECTION: Vérifier que l'image est valide avant d'ouvrir le visualiseur
      const imageToView = images[index];
      if (!validateImageBase64(imageToView)) {
        console.error('❌ Image invalide pour le visualiseur:', imageToView?.substring(0, 30));
        Alert.alert('Erreur', 'Cette image ne peut pas être affichée.');
        return;
      }
      
      // Encoder toutes les images pour les passer en paramètre
      const validImages = images.filter(img => validateImageBase64(img));
      const allImagesParam = encodeURIComponent(JSON.stringify(validImages));
      
      const params: any = {
        imageUri: imageToView,
        imageIndex: (index + 1).toString(),
        totalImages: validImages.length.toString(),
        allImages: allImagesParam,
      };
      
      if (noteId) {
        params.noteId = noteId;
        // Si on est en mode édition, retourner vers l'édition, sinon vers le détail
        params.returnTo = isEditMode ? 'edit' : 'detail';
      } else {
        // Si pas de noteId, on est en création
        params.returnTo = 'create';
      }
      
      console.log('📱 Navigation vers visualiseur avec params:', params);
      
      router.push({
        pathname: '/(tabs)/image-viewer',
        params
      });
    } catch (error) {
      console.error('Erreur navigation vers visualiseur:', error);
      Alert.alert('Erreur', 'Impossible d\'ouvrir le visualiseur d\'images.');
    }
  };

  if (!images || images.length === 0) {
    return null;
  }

  const styles = createStyles(theme);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Images ({images.length})</Text>
        {editable && images.length > 1 && (
          <View style={styles.headerActions}>
            <TouchableOpacity onPress={handleSelectionMode} style={styles.selectionButton}>
              <Text style={styles.selectionButtonText}>
                {selectionMode ? 'Annuler' : 'Sélect.'}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {selectionMode && (
        <View style={styles.selectionToolbar}>
          <Text style={styles.selectionCount}>
            {selectedImages.size} sélectionnée{selectedImages.size > 1 ? 's' : ''}
          </Text>
          <View style={styles.selectionActions}>
            <TouchableOpacity 
              style={[
                styles.selectAllButton,
                selectedImages.size === images.length 
                  ? styles.selectAllButtonActive 
                  : styles.selectAllButtonInactive
              ]}
              onPress={handleSelectAll}
            >
              {selectedImages.size === images.length ? (
                <CheckSquare size={16} color="#FFFFFF" />
              ) : (
                <Square size={16} color={theme.colors.textTertiary} />
              )}
              <Text style={[
                styles.selectAllButtonText,
                selectedImages.size === images.length 
                  ? styles.selectAllButtonTextActive 
                  : styles.selectAllButtonTextInactive
              ]}>
                {selectedImages.size === images.length ? 'Tout désélectionner' : 'Tout sélectionner'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={styles.deleteButton}
              onPress={handleBulkDelete}
              disabled={selectedImages.size === 0}
            >
              <Trash2 size={16} color={selectedImages.size > 0 ? theme.colors.error : theme.colors.textTertiary} />
              <Text style={[styles.deleteButtonText, { color: selectedImages.size > 0 ? theme.colors.error : theme.colors.textTertiary }]}>
                Supprimer ({selectedImages.size})
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      <FlatList
        data={images}
        renderItem={({ item: imageBase64, index }) => (
          <OptimizedImageItem
            imageBase64={imageBase64}
            index={index}
            editable={editable}
            selectionMode={selectionMode}
            isSelected={selectedImages.has(index)}
            onPress={() => handleImagePress(index)}
            onRemove={() => handleRemoveImage(index)}
            theme={theme}
            isVisible={true}
            shouldLoad={true}
          />
        )}
        keyExtractor={(item, index) => `image-${index}`}
        numColumns={3}
        columnWrapperStyle={styles.imageRow}
        showsVerticalScrollIndicator={false}
        removeClippedSubviews={false}
        maxToRenderPerBatch={10}
        windowSize={10}
        initialNumToRender={10}
      />
    </View>
  );
}


// Modal de confirmation pour supprimer plusieurs images
function BulkRemoveImagesModal({ count, onConfirm, onCancel }: {
  count: number;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { theme } = useTheme();
  const styles = createStyles(theme);

  return (
    <View style={styles.modalContent}>
      <View style={styles.modalHeader}>
        <Text style={styles.modalTitle}>Supprimer {count} image{count > 1 ? 's' : ''}</Text>
        <TouchableOpacity onPress={onCancel} style={styles.closeButton}>
          <X size={20} color={theme.colors.textSecondary} />
        </TouchableOpacity>
      </View>
      
      <View style={styles.modalBody}>
        <Text style={styles.modalText}>
          Êtes-vous sûr de vouloir supprimer {count} image{count > 1 ? 's' : ''} ?
        </Text>
        <Text style={[styles.modalText, styles.modalBold]}>
          Cette action est irréversible.
        </Text>
      </View>

      <View style={styles.modalFooter}>
        <TouchableOpacity
          style={[styles.modalButton, { backgroundColor: theme.colors.surfaceSecondary }]}
          onPress={onCancel}
        >
          <Text style={[styles.modalButtonText, { color: theme.colors.textSecondary }]}>
            Annuler
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.modalButton, { backgroundColor: theme.colors.error }]}
          onPress={onConfirm}
        >
          <Text style={[styles.modalButtonText, { color: 'white' }]}>
            Supprimer {count > 1 ? 'tout' : ''}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// Modal de confirmation pour supprimer une image
function RemoveImageModal({ onConfirm, onCancel }: {
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { theme } = useTheme();
  const styles = createStyles(theme);

  return (
    <View style={styles.modalContent}>
      <View style={styles.modalHeader}>
        <Text style={styles.modalTitle}>Supprimer l'image</Text>
        <TouchableOpacity onPress={onCancel} style={styles.closeButton}>
          <X size={20} color={theme.colors.textSecondary} />
        </TouchableOpacity>
      </View>
      
      <View style={styles.modalBody}>
        <Text style={styles.modalText}>
          Êtes-vous sûr de vouloir supprimer cette image ?
        </Text>
        <Text style={[styles.modalText, styles.modalBold]}>
          Cette action est irréversible.
        </Text>
      </View>

      <View style={styles.modalFooter}>
        <TouchableOpacity
          style={[styles.modalButton, { backgroundColor: theme.colors.surfaceSecondary }]}
          onPress={onCancel}
        >
          <Text style={[styles.modalButtonText, { color: theme.colors.textSecondary }]}>
            Annuler
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.modalButton, { backgroundColor: theme.colors.error }]}
          onPress={onConfirm}
        >
          <Text style={[styles.modalButtonText, { color: 'white' }]}>
            Supprimer
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const createStyles = (theme: any) => StyleSheet.create({
  container: {
    marginTop: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 14,
    fontFamily: 'Inter-SemiBold',
    color: theme.colors.textSecondary,
  },
  headerActions: {
    flexDirection: 'row',
    gap: 8,
  },
  selectionButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: theme.colors.surfaceSecondary,
  },
  selectionButtonText: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
    color: theme.colors.textSecondary,
  },
  selectionToolbar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 6,
    backgroundColor: theme.colors.surface,
    borderRadius: 8,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  selectionCount: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
    color: theme.colors.text,
  },
  selectionActions: {
    flexDirection: 'row',
    gap: 4,
  },
  selectAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
  },
  selectAllButtonActive: {
    backgroundColor: theme.colors.primary,
  },
  selectAllButtonInactive: {
    backgroundColor: theme.colors.surfaceSecondary,
  },
  selectAllButtonText: {
    fontSize: 10,
    fontFamily: 'Inter-SemiBold',
  },
  selectAllButtonTextActive: {
    color: '#FFFFFF',
  },
  selectAllButtonTextInactive: {
    color: theme.colors.textTertiary,
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: theme.colors.surfaceSecondary,
  },
  deleteButtonText: {
    fontSize: 10,
    fontFamily: 'Inter-Medium',
  },
  imageGrid: {
    flex: 1,
  },
  imageRow: {
    justifyContent: 'space-between',
    paddingHorizontal: 4,
  },
  imageContainer: {
    width: '31%', // Trois images par ligne avec espacement
    marginBottom: 8,
    backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: 6,
    padding: 4,
    borderWidth: 1,
    borderColor: theme.colors.border,
    position: 'relative',
  },
  selectionCheckbox: {
    position: 'absolute',
    top: 6,
    left: 6,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  imageButton: {
    borderRadius: 4,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 3,
  },
  imageButtonSelected: {
    borderWidth: 2,
    borderColor: theme.colors.primary,
  },
  image: {
    width: '100%',
    height: 60,
    borderRadius: 4,
  },
  imagePlaceholder: {
    width: '100%',
    height: 60,
    backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: 4,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  placeholderText: {
    fontSize: 20,
    opacity: 0.5,
  },
  removeButton: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: 'rgba(239, 68, 68, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  errorPlaceholder: {
    width: '100%',
    height: 60,
    backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: 4,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  errorText: {
    fontSize: 24,
    marginBottom: 4,
  },
  errorTextSmall: {
    fontSize: 10,
    fontFamily: 'Inter-Regular',
    color: theme.colors.textTertiary,
  },
  // Styles pour le modal
  modalContent: {
    backgroundColor: theme.colors.surface,
    borderRadius: 16,
    padding: 20,
    width: '100%',
    maxWidth: 400,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontFamily: 'Inter-SemiBold',
    color: theme.colors.text,
    flex: 1,
  },
  closeButton: {
    padding: 4,
  },
  modalBody: {
    marginBottom: 20,
  },
  modalText: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    color: theme.colors.textSecondary,
    lineHeight: 20,
    marginBottom: 8,
  },
  modalBold: {
    fontFamily: 'Inter-SemiBold',
    color: theme.colors.text,
  },
  modalFooter: {
    flexDirection: 'row',
    gap: 12,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  modalButtonText: {
    fontSize: 16,
    fontFamily: 'Inter-Medium',
  },
  modalBold: {
    fontFamily: 'Inter-SemiBold',
    color: theme.colors.text,
  },
});