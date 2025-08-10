import React, { useState, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Platform, ScrollView, TextInput, Animated, Image, Alert } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Plus, FileText, Trash2, CreditCard as Edit3, Calendar, X, Star, SquareCheck as CheckSquare, Square, Filter, Dessert as SortDesc, Clock, Image as ImageIcon } from 'lucide-react-native';
import { Settings } from 'lucide-react-native';
import { Header } from '@/components/Header';
import { Button } from '@/components/Button';
import { Note } from '@/types';
import { useStorage } from '@/contexts/StorageContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useModal } from '@/contexts/ModalContext';
import { AnimatedCard } from '@/components/AnimatedCard';

type SortOption = 'newest' | 'oldest' | 'title' | 'updated';
type FilterOption = 'all' | 'with-images' | 'text-only';

// Composant optimisé pour l'aperçu d'image
function OptimizedImagePreview({ imageBase64, size = 20 }: { imageBase64: string; size?: number }) {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  
  // Vérifier si l'image est valide
  const isValidImage = imageBase64 && 
    typeof imageBase64 === 'string' && 
    imageBase64.trim() !== '' && 
    imageBase64.startsWith('data:image/');
  
  if (imageError || !isValidImage) {
    console.log('🖼️ Image invalide ou erreur, affichage icône par défaut');
    return <ImageIcon size={size} color="#9CA3AF" />;
  }
  
  return (
    <Image
      source={{ uri: imageBase64 }}
      style={{ 
        width: size, 
        height: size, 
        borderRadius: size / 4,
        backgroundColor: '#F3F4F6'
      }}
      onError={(error) => {
        console.error('❌ Erreur chargement aperçu image:', error.nativeEvent?.error);
        console.error('❌ URI problématique aperçu:', imageBase64?.substring(0, 100));
        setImageError(true);
      }}
      onLoad={() => setImageLoaded(true)}
      resizeMode="cover"
    />
  );
}

// Composant séparé pour chaque note
function NoteItem({ item, index, onPress, onEdit, onDelete, onToggleFavorite, isSelected, isFavorite, selectionMode, onLongPress, theme, strings }: {
  item: Note;
  index: number;
  onPress: () => void;
  onEdit: (note: Note) => void;
  onDelete: (note: Note) => void;
  onToggleFavorite: (noteId: string) => void;
  isSelected: boolean;
  isFavorite: boolean;
  selectionMode: boolean;
  onLongPress: () => void;
  theme: any;
  strings: any;
}) {

  const formatDate = (date: Date) => {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 1) return 'À l\'instant';
    if (diffMins < 60) return `${diffMins}min`;
    if (diffHours < 24) return `${diffHours}h`;
    if (diffDays < 7) return `${diffDays}j`;
    
    return new Intl.DateTimeFormat('fr-FR', {
      day: 'numeric',
      month: 'short'
    }).format(date);
  };

  const getPreviewText = (content: string) => {
    return content.length > 120 ? content.substring(0, 120) + '...' : content;
  };

  const styles = createStyles(theme);

  return (
    <TouchableOpacity
      style={[
        styles.noteCard,
        isSelected && styles.selectedCard,
        isFavorite && styles.favoriteCard
      ]}
      onPress={onPress}
      onLongPress={onLongPress}
    >
      {/* En-tête simplifié */}
      <View style={styles.noteHeader}>
        <View style={styles.noteHeaderLeft}>
          {selectionMode && (
            <TouchableOpacity 
              style={styles.checkbox}
              onPress={onPress}
            >
              {isSelected ? (
                <CheckSquare size={18} color={theme.colors.primary} />
              ) : (
                <Square size={18} color={theme.colors.textTertiary} />
              )}
            </TouchableOpacity>
          )}
          
          <View style={styles.noteMainInfo}>
            <View style={styles.noteTitleRow}>
              <Text style={styles.noteTitle} numberOfLines={1}>
                {item.title || strings.untitledNote}
              </Text>
              {item.images && item.images.length > 0 && (
                <Text style={styles.photoIndicator}>
                  {item.images.length} photo{item.images.length > 1 ? 's' : ''}
                </Text>
              )}
            </View>
          </View>
        </View>
        {!selectionMode && (
          <View style={styles.noteActions}>
            <TouchableOpacity 
              style={styles.actionButton}
              onPress={() => onToggleFavorite(item.id)}
            >
              <Star 
                size={16} 
                color={isFavorite ? "#F59E0B" : theme.colors.textTertiary} 
                fill={isFavorite ? "#F59E0B" : "none"}
              />
            </TouchableOpacity>
            <TouchableOpacity 
              style={styles.actionButton}
              onPress={() => onEdit(item)}
            >
              <Settings size={16} color={theme.colors.primary} />
            </TouchableOpacity>
            <TouchableOpacity 
              style={styles.actionButton}
              onPress={() => onDelete(item)}
            >
              <Trash2 size={16} color={theme.colors.error} />
            </TouchableOpacity>
          </View>
        )}
      </View>

      {item.description && (
        <View style={styles.descriptionRow}>
          <View style={styles.descriptionContainer}>
            <Text style={styles.noteDescription} numberOfLines={1} ellipsizeMode="tail">Description : {item.description}</Text>
          </View>
        </View>
      )}

      {(item.location || item.tags) && (
        <View style={styles.badgesRow}>
          {item.location && (
            <View style={styles.locationBadge}>
              <Text style={styles.badgeText} numberOfLines={1} ellipsizeMode="tail">Lieu : {item.location}</Text>
            </View>
          )}
          {item.tags && (
            <View style={styles.tagsBadge}>
              <Text style={styles.badgeText} numberOfLines={1} ellipsizeMode="tail">Mots-clés : {item.tags}</Text>
            </View>
          )}
        </View>
      )}

      {item.content && (
        <View style={styles.contentPreviewContainer}>
          <Text style={styles.notePreview} numberOfLines={2}>Description : {item.description}</Text>
        </View>
      )}

      <View style={styles.noteFooter}>
        <Text style={styles.noteDate}>
          {formatDate(item.updatedAt)}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

export default function NotesScreen() {
  const { strings } = useLanguage();
  const { theme } = useTheme();
  const { showModal, hideModal } = useModal();
  const { 
    notes, 
    deleteNote, 
    favoriteNotes, 
    setFavoriteNotes,
    updateNote 
  } = useStorage();
  const [loading, setLoading] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedNotes, setSelectedNotes] = useState<Set<string>>(new Set());
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const [filterVisible, setFilterVisible] = useState(false);
  const [sortOption, setSortOption] = useState<SortOption>('newest');
  const [filterOption, setFilterOption] = useState<FilterOption>('all');

  // Recharger les données quand on revient sur la page
  useFocusEffect(
    useCallback(() => {
      console.log('Notes screen focused, animating...');
      setLoading(false); // S'assurer que le loading est désactivé
      
      // Animation de fondu à l'entrée
      fadeAnim.setValue(0);
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start();
    }, [])
  );

  const safeNavigate = (path: string) => {
    try {
      // Vérifier que le router est prêt avant de naviguer
      if (router.canGoBack !== undefined) {
        router.push(path);
      } else {
        // Fallback avec délai si le router n'est pas encore prêt
        setTimeout(() => {
          router.push(path);
        }, 100);
      }
    } catch (error) {
      console.error('Erreur de navigation:', error);
      // Retry après un délai
      setTimeout(() => {
        try {
          router.push(path);
        } catch (retryError) {
          console.error('Erreur de navigation retry:', retryError);
        }
      }, 200);
    }
  };

  const handleCreateNote = () => {
    console.log('📝 Navigation vers création de note');
    safeNavigate('/(tabs)/note/create');
  };

  const handleNotePress = (note: Note) => {
    if (selectionMode) {
      handleNoteSelection(note.id);
    } else {
      console.log('📖 Navigation vers note:', note.id);
      safeNavigate(`/(tabs)/note/${note.id}`);
    }
  };

  const handleNoteLongPress = (note: Note) => {
    if (!selectionMode) {
      setSelectionMode(true);
      handleNoteSelection(note.id);
    }
  };

  const handleNoteSelection = (noteId: string) => {
    const newSelection = new Set(selectedNotes);
    if (newSelection.has(noteId)) {
      newSelection.delete(noteId);
    } else {
      newSelection.add(noteId);
    }
    setSelectedNotes(newSelection);
  };

  const handleEditNote = (note: Note) => {
    console.log('✏️ Navigation vers édition note:', note.id);
    safeNavigate(`/(tabs)/note/edit/${note.id}`);
  };

  const handleDeleteNote = (note: Note) => {
    console.log('🗑️ Demande de suppression note:', note.id);
    showModal(<DeleteNoteModal 
      note={note}
      onConfirm={() => confirmDeleteNote(note)}
      onCancel={() => hideModal()}
      strings={strings}
    />);
  };

  const handleToggleFavorite = async (noteId: string) => {
    console.log('⭐ Toggle favori note:', noteId);
    const newFavorites = new Set(favoriteNotes || []);
    if (newFavorites.has(noteId)) {
      newFavorites.delete(noteId);
      console.log('➖ Note retirée des favoris');
    } else {
      newFavorites.add(noteId);
      console.log('➕ Note ajoutée aux favoris');
    }
    
    await setFavoriteNotes(Array.from(newFavorites));
  };

  const handleSelectionMode = () => {
    setSelectionMode(!selectionMode);
    setSelectedNotes(new Set());
  };

  const handleBulkDelete = () => {
    if (selectedNotes.size === 0) return;

    showModal(<BulkDeleteNotesModal 
      count={selectedNotes.size}
      onConfirm={() => confirmBulkDeleteNotes()}
      onCancel={() => hideModal()}
      strings={strings}
    />);
  };

  const confirmBulkDeleteNotes = async () => {
    try {
      for (const noteId of selectedNotes) {
        const success = await deleteNote(noteId);
        if (!success) {
          console.error('Erreur lors de la suppression de la note:', noteId);
        }
      }
      setSelectedNotes(new Set());
      setSelectionMode(false);
      hideModal();
    } catch (error) {
      console.error('Erreur lors de la suppression en lot:', error);
      hideModal();
    }
  };

  const handleBulkFavorite = async () => {
    if (selectedNotes.size === 0) return;

    const newFavorites = new Set(favoriteNotes || []);
    for (const noteId of selectedNotes) {
      if (newFavorites.has(noteId)) {
        newFavorites.delete(noteId);
      } else {
        newFavorites.add(noteId);
      }
    }
    
    setFavoriteNotes(Array.from(newFavorites));
    setSelectedNotes(new Set());
    setSelectionMode(false);
  };

  const handleSelectAll = () => {
    if (selectedNotes.size === filteredNotes.length) {
      setSelectedNotes(new Set());
    } else {
      const allNoteIds = new Set(filteredNotes.map(n => n.id));
      setSelectedNotes(allNoteIds);
    }
  };

  // Fonction pour filtrer et trier les notes
  const getFilteredAndSortedNotes = () => {
    let filteredNotes = [...notes];
    
    // Appliquer le filtre
    switch (filterOption) {
      case 'with-images':
        filteredNotes = notes.filter(note => note.images && note.images.length > 0);
        break;
      case 'text-only':
        filteredNotes = notes.filter(note => !note.images || note.images.length === 0);
        break;
      default:
        filteredNotes = notes;
    }
    
    // Appliquer le tri
    switch (sortOption) {
      case 'oldest':
        filteredNotes.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        break;
      case 'title':
        filteredNotes.sort((a, b) => (a.title || strings.untitledNote).localeCompare(b.title || strings.untitledNote));
        break;
      case 'updated':
        filteredNotes.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
        break;
      default: // newest
        filteredNotes.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }
    
    // Trier les favoris en premier
    return filteredNotes.sort((a, b) => {
      const aIsFavorite = favoriteNotes?.includes(a.id) || false;
      const bIsFavorite = favoriteNotes?.includes(b.id) || false;
      
      if (aIsFavorite && !bIsFavorite) return -1;
      if (!aIsFavorite && bIsFavorite) return 1;
      return 0;
    });
  };

  const confirmDeleteNote = async (note: Note) => {
    try {
      const success = await deleteNote(note.id);
      if (success) {
        hideModal();
      } else {
        hideModal();
      }
    } catch (error) {
      console.error('Erreur lors de la suppression:', error);
      hideModal();
    }
  };

  // Version memoized du renderNote pour éviter les re-renders inutiles
  const MemoizedNoteItem = React.memo(({ item, index }: { item: Note; index: number }) => {
    const isSelected = selectedNotes.has(item.id);
    const isFavorite = favoriteNotes?.includes(item.id) || false;
    
    return (
      <NoteItem
        item={item}
        index={index}
        onPress={() => handleNotePress(item)}
        onEdit={handleEditNote}
        onDelete={handleDeleteNote}
        onToggleFavorite={handleToggleFavorite}
        isSelected={isSelected}
        isFavorite={isFavorite}
        selectionMode={selectionMode}
        onLongPress={() => handleNoteLongPress(item)}
        theme={theme}
        strings={strings}
      />
    );
  }, (prevProps, nextProps) => {
    // Comparaison personnalisée pour éviter les re-renders inutiles
    const prevSelected = selectedNotes.has(prevProps.item.id);
    const nextSelected = selectedNotes.has(nextProps.item.id);
    const prevFavorite = favoriteNotes?.includes(prevProps.item.id) || false;
    const nextFavorite = favoriteNotes?.includes(nextProps.item.id) || false;
    
    return (
      prevProps.item.id === nextProps.item.id &&
      prevProps.item.updatedAt.getTime() === nextProps.item.updatedAt.getTime() &&
      prevSelected === nextSelected &&
      prevFavorite === nextFavorite &&
      selectionMode === selectionMode
    );
  });

  const filteredNotes = getFilteredAndSortedNotes();

  const styles = createStyles(theme);

  return (
    <View style={styles.container}>
      <Header
        title={strings.notesTitle}
        subtitle={strings.notesSubtitle}
        rightComponent={
          <View style={styles.headerActions}>
            <TouchableOpacity onPress={handleSelectionMode} style={styles.selectionButton}>
              <Text style={styles.selectionButtonText}>
                {selectionMode ? strings.cancel : 'Sélect.'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setFilterVisible(!filterVisible)} style={styles.actionButton}>
              <Filter size={20} color={theme.colors.primary} />
            </TouchableOpacity>
            <TouchableOpacity onPress={handleCreateNote} style={styles.actionButton}>
              <Plus size={24} color={theme.colors.primary} />
            </TouchableOpacity>
          </View>
        }
      />

      {selectionMode && (
        <View style={styles.selectionToolbar}>
          <Text style={styles.selectionCount}>
            {selectedNotes.size} {strings.selected}{selectedNotes.size > 1 ? 's' : ''}
          </Text>
          <View style={styles.selectionActionsColumn}>
            <TouchableOpacity 
              onPress={handleSelectAll}
              style={[
                styles.selectAllButton,
                selectedNotes.size === filteredNotes.length 
                  ? styles.selectAllButtonActive 
                  : styles.selectAllButtonInactive
              ]}
            >
              <Text style={[
                styles.selectAllButtonText,
                selectedNotes.size === filteredNotes.length 
                  ? styles.selectAllButtonTextActive 
                  : styles.selectAllButtonTextInactive
              ]}>
                {selectedNotes.size === filteredNotes.length ? 'Tout désélectionner' : 'Tout sélectionner'}
              </Text>
            </TouchableOpacity>
            <View style={styles.selectionActionsRow}>
              <TouchableOpacity 
                style={styles.toolbarButton}
                onPress={handleBulkFavorite}
                disabled={selectedNotes.size === 0}
              >
                <Star size={20} color={selectedNotes.size > 0 ? "#F59E0B" : theme.colors.textTertiary} />
                <Text style={[styles.toolbarButtonText, { color: selectedNotes.size > 0 ? "#F59E0B" : theme.colors.textTertiary }]}>
                  {strings.favorites}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={styles.toolbarButton}
                onPress={handleBulkDelete}
                disabled={selectedNotes.size === 0}
              >
                <Trash2 size={20} color={selectedNotes.size > 0 ? theme.colors.error : theme.colors.textTertiary} />
                <Text style={[styles.toolbarButtonText, { color: selectedNotes.size > 0 ? theme.colors.error : theme.colors.textTertiary }]}>
                  {strings.delete}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {/* Barre de filtres */}
      {filterVisible && (
        <View style={styles.compactFilterBar}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.compactFilterScroll}>
            <View style={styles.compactFilterButtons}>
              {/* Tri */}
              <TouchableOpacity
                style={[styles.compactFilterButton, sortOption === 'newest' && styles.compactFilterButtonActive]}
                onPress={() => setSortOption('newest')}
              >
                <Text style={[styles.compactFilterButtonText, sortOption === 'newest' && styles.compactFilterButtonTextActive]}>
                  Récentes
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.compactFilterButton, sortOption === 'updated' && styles.compactFilterButtonActive]}
                onPress={() => setSortOption('updated')}
              >
                <Text style={[styles.compactFilterButtonText, sortOption === 'updated' && styles.compactFilterButtonTextActive]}>
                  Modifiées
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.compactFilterButton, sortOption === 'title' && styles.compactFilterButtonActive]}
                onPress={() => setSortOption('title')}
              >
                <Text style={[styles.compactFilterButtonText, sortOption === 'title' && styles.compactFilterButtonTextActive]}>
                  A-Z
                </Text>
              </TouchableOpacity>
              
              {/* Séparateur visuel */}
              <View style={styles.filterSeparator} />
              
              {/* Contenu */}
              <TouchableOpacity
                style={[styles.compactFilterButton, filterOption === 'all' && styles.compactFilterButtonActive]}
                onPress={() => setFilterOption('all')}
              >
                <Text style={[styles.compactFilterButtonText, filterOption === 'all' && styles.compactFilterButtonTextActive]}>
                  Toutes ({notes.length})
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.compactFilterButton, filterOption === 'with-images' && styles.compactFilterButtonActive]}
                onPress={() => setFilterOption('with-images')}
              >
                <Text style={[styles.compactFilterButtonText, filterOption === 'with-images' && styles.compactFilterButtonTextActive]}>
                  📷 ({notes.filter(n => n.images && n.images.length > 0).length})
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.compactFilterButton, filterOption === 'text-only' && styles.compactFilterButtonActive]}
                onPress={() => setFilterOption('text-only')}
              >
                <Text style={[styles.compactFilterButtonText, filterOption === 'text-only' && styles.compactFilterButtonTextActive]}>
                  📝 ({notes.filter(n => !n.images || n.images.length === 0).length})
                </Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      )}

      <View style={[styles.content, Platform.OS === 'web' && styles.contentWeb]}>
        {filteredNotes.length === 0 && notes.length === 0 ? (
          <Animated.View style={[styles.emptyContainer, { opacity: fadeAnim }]}>
            <FileText size={64} color={theme.colors.textTertiary} />
            <Text style={styles.emptyTitle}>{strings.noNotes}</Text>
            <Text style={styles.emptySubtitle}>
              {strings.noNotesDesc}
            </Text>
            <Button
              title={strings.createFirstNote}
              onPress={handleCreateNote}
              style={styles.createButton}
            />
          </Animated.View>
        ) : filteredNotes.length === 0 ? (
          <Animated.View style={[styles.emptyContainer, { opacity: fadeAnim }]}>
            <Filter size={64} color={theme.colors.textTertiary} />
            <Text style={styles.emptyTitle}>Aucune note trouvée</Text>
            <Text style={styles.emptySubtitle}>
              Aucune note ne correspond aux filtres sélectionnés
            </Text>
          </Animated.View>
        ) : (
          <Animated.View style={[{ flex: 1 }, { opacity: fadeAnim }]}>
            <FlatList
              data={filteredNotes}
              renderItem={({ item, index }) => (
                <MemoizedNoteItem item={item} index={index} />
              )}
              keyExtractor={(item) => item.id}
              extraData={`${selectedNotes.size}-${selectionMode}-${favoriteNotes?.length || 0}-${notes.length}`}
              style={styles.flatList}
              contentContainerStyle={[
                styles.listContent,
                Platform.OS === 'web' && styles.listContentWeb
              ]}
              showsVerticalScrollIndicator={false}
              scrollEnabled={true}
              removeClippedSubviews={true}
              maxToRenderPerBatch={5}
              windowSize={10}
              initialNumToRender={8}
              updateCellsBatchingPeriod={50}
              getItemLayout={(data, index) => ({
                length: 120, // hauteur approximative d'une note
                offset: 120 * index,
                index,
              })}
            />
          </Animated.View>
        )}
      </View>

    </View>
  );
}

// Modal de confirmation pour la suppression d'une note
const DeleteNoteModal = ({ note, onConfirm, onCancel, strings }: {
  note: Note;
  onConfirm: () => void;
  onCancel: () => void;
  strings: any;
}) => {
  const { theme } = useTheme();
  const modalStyles = createStyles(theme);

  return (
    <View style={modalStyles.modalContent}>
      <View style={modalStyles.modalHeader}>
        <Text style={modalStyles.modalTitle}>
          {strings.deleteNote}
        </Text>
        <TouchableOpacity onPress={onCancel} style={modalStyles.closeButton}>
          <X size={20} color={theme.colors.textSecondary} />
        </TouchableOpacity>
      </View>
      <View style={modalStyles.modalBody}>
        <Text style={modalStyles.modalText}>
          {strings.deleteNoteConfirm} "{note.title || strings.untitledNote}" ?
        </Text>
        <Text style={[modalStyles.modalText, modalStyles.modalBold]}>
          Cette action est irréversible.
        </Text>
      </View>
      <View style={modalStyles.modalFooter}>
        <Button
          title={strings.cancel}
          onPress={onCancel}
          variant="secondary"
          style={modalStyles.modalButton}
        />
        <Button
          title={strings.delete}
          onPress={onConfirm}
          variant="danger"
          style={modalStyles.modalButton}
        />
      </View>
    </View>
  );
};

// Modal de confirmation pour la suppression en lot
const BulkDeleteNotesModal = ({ count, onConfirm, onCancel, strings }: {
  count: number;
  onConfirm: () => void;
  onCancel: () => void;
  strings: any;
}) => {
  const { theme } = useTheme();
  const modalStyles = createStyles(theme);

  return (
    <View style={modalStyles.modalContent}>
      <View style={modalStyles.modalHeader}>
        <Text style={modalStyles.modalTitle}>
          Supprimer {count} note{count > 1 ? 's' : ''}
        </Text>
        <TouchableOpacity onPress={onCancel} style={modalStyles.closeButton}>
          <X size={20} color={theme.colors.textSecondary} />
        </TouchableOpacity>
      </View>
      <View style={modalStyles.modalBody}>
        <Text style={modalStyles.modalText}>
          <Text>⚠️ </Text>
          <Text style={modalStyles.modalBold}>Cette action est irréversible !</Text>
          <Text>{'\n\n'}</Text>
          <Text>Êtes-vous sûr de vouloir supprimer </Text>
          <Text style={modalStyles.modalBold}>{count} note{count > 1 ? 's' : ''}</Text>
          <Text> ?</Text>
        </Text>
      </View>
      <View style={modalStyles.modalFooter}>
        <Button
          title={strings.cancel || 'Annuler'}
          onPress={onCancel}
          variant="secondary"
          style={modalStyles.modalButton}
        />
        <Button
          title={`Supprimer ${count > 1 ? 'tout' : 'la note'}`}
          onPress={onConfirm}
          variant="danger"
          style={modalStyles.modalButton}
        />
      </View>
    </View>
  );
};

// Modal d'édition du titre de note
const EditNoteTitleModal = ({ note, onCancel, strings }: {
  note: Note;
  onCancel: () => void;
  strings: any;
}) => {
  const { theme } = useTheme();
  const { hideModal } = useModal();
  const { updateNote } = useStorage();
  const [title, setTitle] = useState(note.title || '');
  const modalStyles = createStyles(theme);

  const handleSave = async () => {
    if (!note) return;

    try {
      await updateNote(note.id, {
        title: title.trim() || strings.untitledNote,
      });
      
      hideModal();
    } catch (error) {
      console.error('Erreur lors de la modification du titre:', error);
    }
  };

  return (
    <View style={modalStyles.modalContent}>
      <View style={modalStyles.modalHeader}>
        <Text style={modalStyles.modalTitle}>Modifier le titre de la note</Text>
        <TouchableOpacity onPress={onCancel} style={modalStyles.closeButton}>
          <X size={20} color={theme.colors.textSecondary} />
        </TouchableOpacity>
      </View>

      <View style={modalStyles.modalBody}>
        <Text style={modalStyles.inputLabel}>Titre de la note *</Text>
        <TextInput
          style={modalStyles.titleTextInput}
          value={title}
          onChangeText={setTitle}
          placeholder="Ex: Observations chantier, Mesures particulières..."
          placeholderTextColor={theme.colors.textTertiary}
          autoFocus={true}
          selectTextOnFocus={true}
          returnKeyType="done"
          blurOnSubmit={true}
        />
      </View>

      <View style={modalStyles.modalFooter}>
        <Button
          title={strings.cancel}
          onPress={onCancel}
          variant="secondary"
          style={modalStyles.modalButton}
        />
        <Button
          title={strings.save}
          onPress={handleSave}
          style={modalStyles.modalButton}
        />
      </View>
    </View>
  );
};

const createStyles = (theme: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  content: {
    flex: 1,
  },
  contentWeb: {
    paddingBottom: 0,
  },
  flatList: {
    flex: 1,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  actionButton: {
    padding: 4,
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
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: theme.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  selectionCount: {
    fontSize: 16,
    fontFamily: 'Inter-Medium',
    color: theme.colors.text,
  },
  selectionActions: {
    flexDirection: 'column',
    gap: 8,
  },
  selectionActionsColumn: {
    flexDirection: 'column',
    gap: 8,
  },
  selectionActionsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  selectAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: theme.colors.surfaceSecondary,
  },
  selectAllButtonActive: {
    backgroundColor: theme.colors.primary,
  },
  selectAllButtonInactive: {
    backgroundColor: theme.colors.surfaceSecondary,
  },
  selectAllButtonText: {
    fontSize: 14,
    fontFamily: 'Inter-SemiBold',
  },
  selectAllButtonTextActive: {
    color: '#FFFFFF',
  },
  selectAllButtonTextInactive: {
    color: theme.colors.textTertiary,
  },
  toolbarButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: theme.colors.surfaceSecondary,
  },
  toolbarButtonText: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
  },
  filterBar: {
    backgroundColor: theme.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  // Nouveaux styles pour la barre de filtres compacte
  compactFilterBar: {
    backgroundColor: theme.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  compactFilterScroll: {
    flexGrow: 0,
  },
  compactFilterButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 4,
  },
  filterSeparator: {
    width: 1,
    height: 20,
    backgroundColor: theme.colors.border,
    marginHorizontal: 4,
  },
  compactFilterButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: theme.colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  compactFilterButtonActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  compactFilterButtonText: {
    fontSize: 11,
    fontFamily: 'Inter-Medium',
    color: theme.colors.textSecondary,
  },
  compactFilterButtonTextActive: {
    color: '#ffffff',
  },
  filterSection: {
    marginBottom: 16,
  },
  filterSectionTitle: {
    fontSize: 15,
    fontFamily: 'Inter-SemiBold',
    color: theme.colors.text,
    marginBottom: 12,
  },
  filterScroll: {
    flexGrow: 0,
  },
  filterButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  filterButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: theme.colors.surfaceSecondary,
  },
  filterButtonActive: {
    backgroundColor: theme.colors.primary,
    shadowColor: theme.colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  filterButtonText: {
    fontSize: 13,
    fontFamily: 'Inter-SemiBold',
    color: theme.colors.textSecondary,
    textAlign: 'center',
  },
  filterButtonTextActive: {
    color: '#ffffff',
  },
  noteCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  selectedCard: {
    borderWidth: 2,
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primary + '10',
  },
  favoriteCard: {
    borderLeftWidth: 3,
    borderLeftColor: '#F59E0B',
  },
  noteHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  noteHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 12,
  },
  noteHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  checkbox: {
    padding: 4,
    flexShrink: 0,
  },
  noteMainInfo: {
    flex: 1,
    minWidth: 0,
  },
  noteTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  noteTitle: {
    fontSize: 17,
    fontFamily: 'Inter-Bold',
    color: theme.colors.text,
    flex: 1,
    minWidth: 0,
    marginRight: 8,
  },
  priorityBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    marginRight: 8,
  },
  priorityBadgeText: {
    fontSize: 10,
    fontFamily: 'Inter-Bold',
    color: '#FFFFFF',
    textTransform: 'uppercase',
  },
  noteDate: {
    fontSize: 13,
    fontFamily: 'Inter-Medium',
    color: theme.colors.textSecondary,
  },
  photoIndicator: {
    fontSize: 10,
    fontFamily: 'Inter-Bold',
    color: theme.colors.primary,
    backgroundColor: theme.colors.primary + '20',
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: theme.colors.primary + '40',
    flexShrink: 0,
  },
  photoIndicatorText: {
    fontSize: 10,
    fontFamily: 'Inter-Bold',
    color: theme.colors.primary,
  },
  noteActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  descriptionRow: {
    marginBottom: 8,
  },
  descriptionContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.primary + '15',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderLeftWidth: 3,
    borderLeftColor: theme.colors.primary,
  },
  descriptionIcon: {
    fontSize: 12,
    marginRight: 6,
  },
  noteDescription: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
    color: theme.colors.primary,
    flex: 1,
  },
  badgesRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
    flexWrap: 'wrap',
  },
  locationBadge: {
    backgroundColor: theme.colors.success + '20',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: theme.colors.success + '40',
    flex: 1,
    minWidth: 0,
  },
  tagsBadge: {
    backgroundColor: theme.colors.warning + '20',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: theme.colors.warning + '40',
    flex: 1,
    minWidth: 0,
  },
  badgeText: {
    fontSize: 11,
    fontFamily: 'Inter-Medium',
    color: theme.colors.textSecondary,
  },
  contentPreviewContainer: {
    marginTop: 4,
  },
  notePreview: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    color: theme.colors.textSecondary,
    lineHeight: 20,
  },
  noteFooter: {
    marginTop: 12,
  },
  metaInfoRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 4,
  },
  noteLocation: {
    fontSize: 13,
    fontFamily: 'Inter-Medium',
    color: theme.colors.textSecondary,
    fontStyle: 'italic',
  },
  noteTags: {
    fontSize: 13,
    fontFamily: 'Inter-Regular',
    color: theme.colors.textSecondary,
    flex: 1,
  },
  listContent: {
    padding: 16,
    paddingBottom: Platform.OS === 'web' ? 120 : 100,
  },
  listContentWeb: {
    paddingBottom: 120,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
    paddingVertical: 80,
    minHeight: '60%',
  },
  emptyTitle: {
    fontSize: 26,
    fontFamily: 'Inter-Bold',
    color: theme.colors.text,
    marginTop: 32,
    marginBottom: 16,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 16,
    fontFamily: 'Inter-Regular',
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 24,
  },
  createButton: {
    paddingHorizontal: 32,
  },
  modalContent: {
    backgroundColor: theme.colors.surface,
    borderRadius: 16,
    padding: 20,
    width: '100%',
    maxWidth: 400,
    maxHeight: '70%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 20,
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
  },
  inputLabel: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
    color: theme.colors.textSecondary,
    marginBottom: 6,
  },
  titleTextInput: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    fontFamily: 'Inter-Regular',
    backgroundColor: theme.colors.inputBackground,
    color: theme.colors.text,
    minHeight: 48,
  },
});