import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert, KeyboardAvoidingView, Platform, TextInput, TouchableOpacity } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Camera, CircleAlert as AlertCircle } from 'lucide-react-native';
import { Header } from '@/components/Header';
import { Input } from '@/components/Input';
import { Button } from '@/components/Button';
import { NoteImageGallery } from '@/components/NoteImageGallery';
import { Note } from '@/types';
import { useStorage } from '@/contexts/StorageContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTheme } from '@/contexts/ThemeContext';
import { compressImageFromFile, validateImageBase64, formatFileSize } from '@/utils/imageCompression';
import { useAndroidBackButton } from '@/utils/BackHandler';

export default function EditNoteScreen() {
  const { strings } = useLanguage();
  const { theme } = useTheme();
  const { notes, updateNote } = useStorage();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [note, setNote] = useState<Note | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [tags, setTags] = useState('');
  const [content, setContent] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [errors, setErrors] = useState<{ title?: string }>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Configure Android back button
  useAndroidBackButton(() => {
    handleBack();
    return true;
  });

  useEffect(() => {
    loadNote();
  }, [id, notes]);

  const loadNote = async () => {
    try {
      console.log('🔍 Recherche de la note avec ID:', id);
      const foundNote = notes.find(n => n.id === id);
      if (foundNote) {
        console.log('✅ Note trouvée:', foundNote.title);
        setNote(foundNote);
        setTitle(foundNote.title);
        setDescription(foundNote.description || '');
        setLocation(foundNote.location || '');
        setTags(foundNote.tags || '');
        setContent(foundNote.content);
        setImages(foundNote.images || []);
      } else {
        console.error('❌ Note non trouvée avec ID:', id);
      }
    } catch (error) {
      console.error('Erreur lors du chargement de la note:', error);
    } finally {
      setInitialLoading(false);
    }
  };

  const handleBack = () => {
    if (note) {
      safeNavigate(`/(tabs)/note/${note.id}`);
    } else {
      safeNavigate('/(tabs)/notes');
    }
  };

  const safeNavigate = (path: string) => {
    try {
      if (router.canGoBack !== undefined) {
        router.push(path);
      } else {
        setTimeout(() => {
          router.push(path);
        }, 100);
      }
    } catch (error) {
      console.error('Erreur de navigation:', error);
      setTimeout(() => {
        try {
          router.push(path);
        } catch (retryError) {
          console.error('Erreur de navigation retry:', retryError);
        }
      }, 200);
    }
  };


  const validateForm = () => {
    // Aucune validation requise - les notes peuvent être modifiées librement
    setErrors({});
    return true;
  };

  const handleSave = async () => {
    if (!validateForm()) return;
    
    if (!note) return;

    setLoading(true);
    try {
      console.log('💾 Sauvegarde de la note:', note.id, 'avec', images.length, 'images');
      
      // Validation des images avant sauvegarde
      const validImages = images.filter(img => 
        validateImageBase64(img) || img.startsWith('file://')
      );
      
      console.log(`📸 Images validées pour sauvegarde: ${validImages.length}/${images.length}`);
      
      // Sauvegarder la note avec toutes les données
      const updatedNote = await updateNote(note.id, {
        title: title.trim() || strings.untitledNote,
        description: description.trim() || undefined,
        location: location.trim() || undefined,
        tags: tags.trim() || undefined,
        content: content.trim(),
        images: validImages.length > 0 ? validImages : undefined,
      });

      if (updatedNote) {
        console.log('✅ Note mise à jour avec succès');
        safeNavigate(`/(tabs)/note/${note.id}`);
      } else {
        console.error('❌ updateNote a retourné null');
        Alert.alert('Erreur', 'Impossible de sauvegarder la note. Veuillez réessayer.');
        safeNavigate(`/(tabs)/note/${note.id}`);
      }
    } catch (error) {
      console.error('Erreur lors de la modification de la note:', error);
      Alert.alert('Erreur', 'Impossible de sauvegarder la note. Veuillez réessayer.');
      safeNavigate(`/(tabs)/note/${note.id}`);
    } finally {
      setLoading(false);
    }
  };

  const handleAddImage = () => {
    if (Platform.OS === 'web' && fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const processImage = async (file: File): Promise<string> => {
    console.log('📸 Traitement image édition avec compression:', file.name, formatFileSize(file.size));
    
    // Vérification de la taille avant traitement
    const maxSize = 50 * 1024 * 1024; // 50MB max par image
    if (file.size > maxSize) {
      throw new Error(`Image trop volumineuse: ${formatFileSize(file.size)} > ${formatFileSize(maxSize)}`);
    }
    
    try {
      // Compresser l'image
      const compressionResult = await compressImageFromFile(file, {
        maxWidth: 1200,
        maxHeight: 1200,
        quality: 0.85,
        format: 'jpeg'
      });
      
      console.log('✅ Image édition compressée avec succès:');
      console.log(`   Compression: ${compressionResult.compressionRatio.toFixed(1)}%`);
      
      return compressionResult.compressedBase64;
    } catch (error) {
      console.error('❌ Erreur compression image édition:', error);
      throw new Error('Impossible de traiter l\'image');
    }
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const { target } = event;
    const { files } = target;
    
    if (files && files.length > 0) {
      // Vérifications de sécurité
      const totalSize = Array.from(files).reduce((sum, file) => sum + file.size, 0);
      const totalSizeMB = totalSize / 1024 / 1024;
      const newTotalImages = images.length + files.length;
      
      if (totalSizeMB > 50) {
        console.warn('⚠️ Taille totale trop importante:', totalSizeMB.toFixed(2), 'MB');
        Alert.alert(
          'Images trop volumineuses',
          `La taille totale des images (${totalSizeMB.toFixed(1)}MB) dépasse la limite de 50MB.`,
          [{ text: 'OK' }]
        );
        target.value = '';
        return;
      }
      
      if (newTotalImages > 20) {
        console.warn('⚠️ Limite d\'images atteinte (20 max)');
        Alert.alert(
          'Limite d\'images atteinte',
          'Vous ne pouvez pas ajouter plus de 20 images par note.',
          [{ text: 'OK' }]
        );
        target.value = '';
        return;
      }
      
      try {
        // CORRECTION : Traiter les images une par une avec compression
        const processedImages: string[] = [];
        
        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          
          if (!file || !file.type.startsWith('image/')) {
            console.warn(`⚠️ Fichier ${i} ignoré (pas une image):`, file?.type);
            continue;
          }
          
          try {
            console.log(`📸 Traitement image ${i + 1}/${files.length}:`, file.name);
            const compressedImage = await processImage(file);
            
            if (compressedImage && validateImageBase64(compressedImage)) {
              processedImages.push(compressedImage);
              console.log(`✅ Image ${i + 1} traitée et validée avec succès`);
            } else {
              console.error(`❌ Image ${i + 1} invalide après traitement`);
            }
            
            // Pause pour éviter de bloquer l'UI
            if (i < files.length - 1) {
              await new Promise(resolve => setTimeout(resolve, 100));
            }
          } catch (error) {
            console.error(`❌ Erreur traitement image ${i + 1}:`, error);
          }
        }
        
        // Ajouter toutes les images traitées avec succès
        if (processedImages.length > 0) {
          setImages(prev => [...prev, ...processedImages]);
          console.log(`✅ ${processedImages.length}/${files.length} images ajoutées en édition`);
          
          if (processedImages.length < files.length) {
            Alert.alert(
              'Information',
              `${processedImages.length} image(s) sur ${files.length} ont été ajoutées avec succès.`,
              [{ text: 'OK' }]
            );
          }
        } else {
          console.warn('⚠️ Aucune image n\'a pu être traitée en édition');
          Alert.alert('Erreur', 'Aucune image n\'a pu être traitée. Vérifiez le format des fichiers.');
        }
        
      } catch (error) {
        console.error('❌ Erreur générale lors du traitement des images en édition:', error);
        Alert.alert('Erreur', 'Erreur lors du traitement des images.');
      }
    }
    
    // Réinitialiser l'input
    target.value = '';
  };


  const handleRemoveImage = (index: number) => {
    setImages(prev => prev.filter((_, i) => i !== index));
  };

  const handleRemoveMultipleImages = (indices: number[]) => {
    setImages(prev => prev.filter((_, i) => !indices.includes(i)));
  };

  const styles = createStyles(theme);

  if (initialLoading) {
    return (
      <View style={styles.container}>
        <Header title={strings.loading} onBack={handleBack} />
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>{strings.loadingData}</Text>
        </View>
      </View>
    );
  }

  if (!note) {
    return (
      <View style={styles.container}>
        <Header title={strings.itemNotFound} onBack={handleBack} />
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{strings.dataNotFound}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Header
        title={strings.editNote}
        subtitle={note.title || strings.untitledNote}
        onBack={handleBack}
      />
      
      <KeyboardAvoidingView 
        style={styles.keyboardContainer}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        <ScrollView 
          style={styles.content} 
          contentContainerStyle={styles.contentContainer}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Input
            label="Titre de la note"
            value={title}
            onChangeText={setTitle}
            error={errors.title}
          />

          <Input
            label="Description"
            value={description}
            onChangeText={setDescription}
          />

          <Input
            label="Lieu"
            value={location}
            onChangeText={setLocation}
          />

          <Input
            label="Mots-clés"
            value={tags}
            onChangeText={setTags}
          />

          {/* Galerie d'images */}
          <NoteImageGallery 
            images={images}
            onRemoveImage={handleRemoveImage}
            onRemoveMultipleImages={handleRemoveMultipleImages}
            editable={true}
            noteId={note.id}
            isEditMode={true}
          />

          {/* Bouton ajouter image */}
          <View style={styles.imageButtonContainer}>
            <TouchableOpacity
              style={styles.addPhotoButton}
              onPress={handleAddImage}
            >
              <Camera size={16} color={theme.colors.primary} />
              <Text style={styles.addPhotoText}>Ajouter une photo</Text>
            </TouchableOpacity>
          </View>

          {/* Contenu de la note */}
          <Text style={styles.contentLabel}>{strings.noteContent}</Text>
          <TextInput
            style={styles.contentTextInput}
            value={content}
            onChangeText={setContent}
            placeholder={strings.writeYourNote}
            placeholderTextColor={theme.colors.textTertiary}
            multiline={true}
            textAlignVertical="top"
            scrollEnabled={true}
            autoCorrect={true}
            spellCheck={true}
            returnKeyType="default"
            blurOnSubmit={false}
          />

          {/* Input caché pour web */}
          {Platform.OS === 'web' && (
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              style={{ display: 'none' }}
              onChange={(e) => handleFileSelect(e as any)}
            />
          )}

        </ScrollView>
      </KeyboardAvoidingView>

      {/* Bouton fixe en bas du viewport */}
      <View style={styles.fixedFooter}>
        <Button
          title={loading ? "Sauvegarde..." : strings.saveChanges}
          onPress={handleSave}
          disabled={loading}
          style={styles.footerButton}
        />
      </View>
    </View>
  );
}

const createStyles = (theme: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  keyboardContainer: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
    paddingBottom: 140, // Espace augmenté pour le bouton fixe
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 16,
    fontFamily: 'Inter-Regular',
    color: theme.colors.textSecondary,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  errorText: {
    fontSize: 16,
    fontFamily: 'Inter-Regular',
    color: theme.colors.textSecondary,
    textAlign: 'center',
  },
  imageButtonContainer: {
    marginTop: 16,
    alignItems: 'center',
    marginBottom: 16,
  },
  addPhotoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    height: 36,
    backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  addPhotoText: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
    color: theme.colors.primary,
  },
  contentLabel: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
    color: theme.colors.textSecondary,
    marginBottom: 12,
    marginTop: 16,
  },
  contentTextInput: {
    fontSize: 16,
    fontFamily: 'Inter-Regular',
    color: theme.colors.text,
    lineHeight: 24,
    minHeight: 200,
    padding: 0,
    margin: 0,
    backgroundColor: 'transparent',
    borderWidth: 0,
    textAlignVertical: 'top',
    ...(Platform.OS === 'web' && {
      outlineWidth: 0,
      resize: 'none',
      fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
    }),
  },
  fixedFooter: {
    position: Platform.OS === 'web' ? 'fixed' : 'absolute',
    bottom: Platform.OS === 'web' ? 20 : 0,
    left: 0,
    right: 0,
    padding: 20,
    backgroundColor: theme.colors.surface,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 8,
    zIndex: 1000,
  },
  footerButton: {
    width: '100%',
  },
});