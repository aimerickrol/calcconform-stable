import React, { useState, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert, KeyboardAvoidingView, Platform, TextInput, TouchableOpacity } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Camera } from 'lucide-react-native';
import { Header } from '@/components/Header';
import { Input } from '@/components/Input';
import { Button } from '@/components/Button';
import { NoteImageGallery } from '@/components/NoteImageGallery';
import { useStorage } from '@/contexts/StorageContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTheme } from '@/contexts/ThemeContext';
import { compressImageFromFile, validateImageBase64, formatFileSize } from '@/utils/imageCompression';
import { useCallback } from 'react';

export default function CreateNoteScreen() {
  const { strings } = useLanguage();
  const { theme } = useTheme();
  const { createNote, notes } = useStorage();
  const { preserveData } = useLocalSearchParams<{ preserveData?: string }>();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [tags, setTags] = useState('');
  const [content, setContent] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{ content?: string }>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [shouldReset, setShouldReset] = useState(true);

  // Réinitialiser le formulaire au focus de la page
  useFocusEffect(
    useCallback(() => {
      console.log('📝 Page de création de note focalisée - shouldReset:', shouldReset);
      
      // Réinitialiser le formulaire si nécessaire
      if (shouldReset) {
        console.log('🔄 Réinitialisation du formulaire');
        setTitle('');
        setDescription('');
        setLocation('');
        setTags('');
        setContent('');
        setImages([]);
        setErrors({});
        setLoading(false);
        setShouldReset(false);
      }
    }, [shouldReset])
  );

  const handleBack = () => {
    safeNavigate('/(tabs)/notes');
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
    // Aucune validation requise - les notes peuvent être créées vides
    setErrors({});
    return true;
  };

  const handleCreate = async () => {
    if (!validateForm()) return;
    
    console.log('🚀 Début création note avec:', {
      title: title.trim(),
      description: description.trim(),
      location: location.trim(),
      tags: tags.trim(),
      content: content.trim(),
      imagesCount: images.length
    });

    setLoading(true);
    try {
      // Générer un titre automatique si aucun titre n'est fourni
      let finalTitle = title.trim();
      if (!finalTitle) {
        const existingTitles = notes.map(n => n.title).filter(t => t.startsWith('Note sans titre'));
        const nextNumber = existingTitles.length + 1;
        finalTitle = `Note sans titre ${nextNumber}`;
      }
      
      // CORRECTION: Validation plus robuste des images pour la création
      const validImages = images.filter(img => 
        validateImageBase64(img) || img.startsWith('file://')
      );
      
      console.log(`📸 Images validées pour création: ${validImages.length}/${images.length}`);
      
      const noteData = {
        title: finalTitle,
        description: description.trim() || undefined,
        location: location.trim() || undefined,
        tags: tags.trim() || undefined,
        content: content.trim(),
        images: validImages.length > 0 ? validImages : undefined,
      };
      
      console.log('📋 Données de la note à créer:', {
        ...noteData,
        images: `${noteData.images?.length || 0} images`
      });
      
      // Créer la note
      const note = await createNote(noteData);

      if (note) {
        console.log('✅ Note créée avec succès:', note.id);
        
        // Marquer qu'il faut réinitialiser le formulaire au prochain focus
        setShouldReset(true);
        safeNavigate(`/(tabs)/note/${note.id}`);
      } else {
        console.error('❌ createNote a retourné null');
        Alert.alert('Erreur', 'Impossible de créer la note. Veuillez réessayer.');
        setShouldReset(true);
        safeNavigate('/(tabs)/notes');
      }
    } catch (error) {
      console.error('❌ Erreur lors de la création de la note:', error);
      Alert.alert('Erreur', 'Impossible de créer la note. Veuillez réessayer.');
      setShouldReset(true);
      safeNavigate('/(tabs)/notes');
    } finally {
      setLoading(false);
    }
  };

  const processImage = async (file: File): Promise<string> => {
    console.log('📸 Traitement image création avec compression:', file.name, formatFileSize(file.size));
    
    // Vérification de la taille avant traitement
    const maxSize = 50 * 1024 * 1024; // 50MB max par image (augmenté pour permettre la compression)
    if (file.size > maxSize) {
      throw new Error(`Image trop volumineuse: ${formatFileSize(file.size)} > ${formatFileSize(maxSize)}`);
    }
    
    try {
      // Compresser l'image avec des paramètres optimisés
      const compressionResult = await compressImageFromFile(file, {
        maxWidth: 1200,
        maxHeight: 1200,
        quality: 0.85, // Qualité élevée pour garder la lisibilité
        format: 'jpeg'
      });
      
      console.log('✅ Image création compressée avec succès:');
      console.log(`   Taille originale: ${formatFileSize(compressionResult.originalSize)}`);
      console.log(`   Taille compressée: ${formatFileSize(compressionResult.compressedSize)}`);
      console.log(`   Compression: ${compressionResult.compressionRatio.toFixed(1)}%`);
      
      return compressionResult.compressedBase64;
    } catch (error) {
      console.error('❌ Erreur compression image création:', error);
      throw new Error('Impossible de traiter l\'image');
    }
  };

  const handleAddImage = () => {
    if (Platform.OS === 'web' && fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleRemoveImage = (index: number) => {
    setImages(prev => prev.filter((_, i) => i !== index));
  };

  const handleFileSelect = async (event: Event) => {
    const target = event.target as HTMLInputElement;
    const files = target.files;
    
    if (files && files.length > 0) {
      console.log('📸 Traitement de', files.length, 'images...');
      
      // Limite simple sur le nombre d'images
      if (images.length + files.length > 10) {
        Alert.alert('Limite atteinte', 'Maximum 10 images par note pour éviter les problèmes de performance.');
        target.value = '';
        return;
      }
      
      try {
        const processedImages: string[] = [];
        
        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          
          if (!file || !file.type.startsWith('image/')) {
            continue;
          }
          
          try {
            const compressedImage = await compressImageFromFile(file, {
              maxWidth: 1280,
              maxHeight: 1280,
              quality: 0.75
            });
            
            if (compressedImage && validateImageBase64(compressedImage)) {
              processedImages.push(compressedImage);
            }
          } catch (error) {
            console.warn(`Erreur traitement image ${i}:`, error);
          }
        }
        
        if (processedImages.length > 0) {
          setImages(prev => [...prev, ...processedImages]);
        }
        
      } catch (error) {
        console.error('Erreur traitement images:', error);
        Alert.alert('Erreur', 'Impossible de traiter certaines images.');
      }
    }
    
    target.value = '';
  };


  const styles = createStyles(theme);

  return (
    <View style={styles.container}>
      <Header
        title={strings.newNote}
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
            label={strings.noteTitle}
            value={title}
            onChangeText={setTitle}
          />

          <Input
            label={strings.description}
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

          <NoteImageGallery 
            images={images}
            onRemoveImage={handleRemoveImage}
            editable={true}
            disableViewer={true}
          />

          {images.length > 0 && (
            <Text style={styles.maxPhotosNote}>Max. 10 photos</Text>
          )}

          <View style={styles.imageButtonContainer}>
            <TouchableOpacity
              style={styles.addPhotoButton}
              onPress={handleAddImage}
            >
              <Camera size={16} color={theme.colors.primary} />
              <Text style={styles.addPhotoText}>Ajouter une photo</Text>
            </TouchableOpacity>
          </View>

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
          {errors.content && (
            <Text style={styles.errorText}>{errors.content}</Text>
          )}

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

      <View style={styles.fixedFooter}>
        <Button
          title={loading ? "Création..." : strings.createNote}
          onPress={handleCreate}
          disabled={false}
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
  maxPhotosNote: {
    fontSize: 11,
    fontFamily: 'Inter-Regular',
    color: theme.colors.textTertiary,
    textAlign: 'center',
    marginTop: 8,
    fontStyle: 'italic',
  },
  errorText: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    color: theme.colors.error,
    marginTop: 8,
  },
});