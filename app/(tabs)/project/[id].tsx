import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ScrollView, TextInput, Platform, Animated } from 'react-native';
import { useLocalSearchParams, router, useFocusEffect } from 'expo-router';
import { Plus, Settings, Building, Wind, Star, Trash2, SquareCheck as CheckSquare, Square, X } from 'lucide-react-native';
import { Header } from '@/components/Header';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { Project, Building as BuildingType, FunctionalZone } from '@/types';
import { useStorage } from '@/contexts/StorageContext';
import { calculateCompliance, formatDeviation } from '@/utils/compliance';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useAndroidBackButton } from '@/utils/BackHandler';
import { LoadingScreen } from '@/components/LoadingScreen';
import { useModal } from '@/contexts/ModalContext';

export default function ProjectDetailScreen() {
  const { strings } = useLanguage();
  const { theme } = useTheme();
  const { showModal, hideModal } = useModal();
  const { 
    projects,
    favoriteBuildings,
    createBuilding,
    deleteBuilding,
    setFavoriteBuildings,
    updateBuilding,
    storage
  } = useStorage();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedBuildings, setSelectedBuildings] = useState<Set<string>>(new Set());
  const fadeAnim = useRef(new Animated.Value(0)).current;
  
  // Form states
  const [buildingName, setBuildingName] = useState('');
  const [buildingDescription, setBuildingDescription] = useState('');
  const [formLoading, setFormLoading] = useState(false);
  const [errors, setErrors] = useState<{ name?: string }>({});


  // Configure Android back button to go back to the home screen
  useAndroidBackButton(() => {
    handleBack();
    return true;
  });


  const loadProject = useCallback(async () => {
    try {
      const foundProject = projects.find(p => p.id === id);
      setProject(foundProject || null);
    } catch (error) {
      console.error('Erreur lors du chargement du projet:', error);
    } finally {
      setLoading(false);
    }
  }, [id, projects]);

  // NOUVEAU : Utiliser useFocusEffect pour recharger les données quand on revient sur la page
  useFocusEffect(
    useCallback(() => {
      console.log('Project screen focused, reloading data...');
      loadProject();
      
      // Animation de fondu à l'entrée
      fadeAnim.setValue(0);
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start();
    }, [loadProject])
  );

  useEffect(() => {
    loadProject();
  }, [loadProject]);

  const handleBack = () => {
    try {
      // CORRIGÉ : Retourner vers la liste des projets
      router.push('/(tabs)/');
    } catch (error) {
      console.error('Erreur de navigation:', error);
      // Fallback vers l'accueil
      router.push('/(tabs)/');
    }
  };

  const resetForm = () => {
    setBuildingName('');
    setBuildingDescription('');
    setErrors({});
  };

  const handleCreateBuilding = () => {
    try {
      router.push(`/(tabs)/building/create?projectId=${id}`);
    } catch (error) {
      console.error('Erreur de navigation vers création bâtiment:', error);
    }
  };

  const handleSelectionMode = () => {
    setSelectionMode(!selectionMode);
    setSelectedBuildings(new Set());
  };

  const handleBuildingSelection = (buildingId: string) => {
    const newSelection = new Set(selectedBuildings);
    if (newSelection.has(buildingId)) {
      newSelection.delete(buildingId);
    } else {
      newSelection.add(buildingId);
    }
    setSelectedBuildings(newSelection);
  };

  const handleBulkDelete = () => {
    if (selectedBuildings.size === 0) return;

    showModal(<BulkDeleteBuildingsModal 
      count={selectedBuildings.size}
      onConfirm={() => confirmBulkDeleteBuildings()}
      onCancel={() => hideModal()}
      strings={strings}
    />);
  };

  const confirmBulkDeleteBuildings = async () => {
    try {
      console.log('🗑️ Suppression en lot de', selectedBuildings.size, 'bâtiments');
      for (const buildingId of selectedBuildings) {
        const success = await deleteBuilding(buildingId);
        if (!success) {
          console.error('Erreur lors de la suppression du bâtiment:', buildingId);
        }
      }
      setSelectedBuildings(new Set());
      setSelectionMode(false);
      hideModal();
    } catch (error) {
      console.error('Erreur lors de la suppression en lot:', error);
      hideModal();
    }
  };

  const handleBulkFavorite = async () => {
    if (selectedBuildings.size === 0) return;

    const newFavorites = new Set(favoriteBuildings);
    for (const buildingId of selectedBuildings) {
      if (newFavorites.has(buildingId)) {
        newFavorites.delete(buildingId);
      } else {
        newFavorites.add(buildingId);
      }
    }
    
    await setFavoriteBuildings(Array.from(newFavorites));
    setSelectedBuildings(new Set());
    setSelectionMode(false);
  };

  const handleSelectAll = () => {
    if (selectedBuildings.size === sortedBuildings.length) {
      // Si tout est sélectionné, tout désélectionner
      setSelectedBuildings(new Set());
    } else {
      // Sinon, tout sélectionner
      const allBuildingIds = new Set(sortedBuildings.map(b => b.id));
      setSelectedBuildings(allBuildingIds);
    }
  };

  const handleToggleFavorite = async (buildingId: string) => {
    const newFavorites = new Set(favoriteBuildings);
    if (newFavorites.has(buildingId)) {
      newFavorites.delete(buildingId);
    } else {
      newFavorites.add(buildingId);
    }
    
    await setFavoriteBuildings(Array.from(newFavorites));
  };

  const validateForm = () => {
    const newErrors: { name?: string } = {};

    if (!buildingName.trim()) {
      newErrors.name = strings.nameRequired;
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleBuildingPress = (building: BuildingType) => {
    if (selectionMode) {
      handleBuildingSelection(building.id);
    } else {
      router.push(`/(tabs)/building/${building.id}`);
    }
  };

  // NOUVEAU : Fonction pour ouvrir le modal d'édition du nom
  const openNameEditModal = (building: BuildingType) => {
    showModal(<EditBuildingNameModal 
      building={building}
      onSave={saveNameChange}
      onCancel={() => hideModal()}
      strings={strings}
    />);
  };

  // CORRIGÉ : Fonction pour sauvegarder le changement de nom avec mise à jour instantanée
  const saveNameChange = async (building: BuildingType, newName: string) => {
    if (!building || !newName.trim()) return;

    try {
      console.log('✏️ Modification du nom du bâtiment:', building.id, 'nouveau nom:', newName.trim());
      
      const updatedBuilding = await updateBuilding(building.id, {
        name: newName.trim(),
      });
      
      if (updatedBuilding) {
        console.log('✅ Nom du bâtiment modifié avec succès');
        
        // CORRIGÉ : Mise à jour instantanée de l'état local du projet
        setProject(prevProject => {
          if (!prevProject) return prevProject;
          
          return {
            ...prevProject,
            buildings: prevProject.buildings.map(b => 
              b.id === building.id 
                ? { ...b, name: newName.trim() }
                : b
            )
          };
        });
        
        hideModal();
      } else {
        console.error('❌ Erreur: Bâtiment non trouvé pour la modification');
        Alert.alert(strings.error, 'Impossible de modifier le nom du bâtiment');
      }
    } catch (error) {
      console.error('❌ Erreur lors de la modification du nom:', error);
      Alert.alert(strings.error, 'Impossible de modifier le nom du bâtiment');
    }
  };

  const handleEditBuilding = (building: BuildingType) => {
    try {
      router.push(`/(tabs)/building/edit/${building.id}`);
    } catch (error) {
      console.error('Erreur de navigation vers édition bâtiment:', error);
    }
  };

  const handleDeleteBuilding = async (building: BuildingType) => {
    showModal(<DeleteBuildingModal 
      building={building}
      onConfirm={() => confirmDeleteBuilding(building)}
      onCancel={() => hideModal()}
      strings={strings}
    />);
  };

  const confirmDeleteBuilding = async (building: BuildingType) => {
    try {
      console.log('🗑️ Confirmation suppression bâtiment:', building.id);
      const success = await deleteBuilding(building.id);
      if (success) {
        console.log('✅ Bâtiment supprimé avec succès');
        hideModal();
      } else {
        console.error('❌ Erreur: Bâtiment non trouvé pour la suppression');
        hideModal();
      }
    } catch (error) {
      console.error('Erreur lors de la suppression:', error);
      hideModal();
    }
  };

  const handleEditProject = () => {
    try {
      router.push(`/(tabs)/project/edit/${id}`);
    } catch (error) {
      console.error('Erreur de navigation:', error);
      Alert.alert(strings.error, 'Impossible d\'ouvrir la page de modification.');
    }
  };

  const getBuildingStats = (building: BuildingType) => {
    const zoneCount = building.functionalZones.length;
    const shutterCount = building.functionalZones.reduce((total, zone) => total + zone.shutters.length, 0);
    
    let compliantCount = 0;
    let acceptableCount = 0;
    let nonCompliantCount = 0;
    let totalMeasuredShutters = 0;

    building.functionalZones.forEach(zone => {
      zone.shutters.forEach(shutter => {
        // Ne compter que les volets qui ont des valeurs de référence
        if (shutter.referenceFlow > 0) {
          totalMeasuredShutters++;
          const compliance = calculateCompliance(shutter.referenceFlow, shutter.measuredFlow);
          switch (compliance.status) {
            case 'compliant':
              compliantCount++;
              break;
            case 'acceptable':
              acceptableCount++;
              break;
            case 'non-compliant':
              nonCompliantCount++;
              break;
          }
        }
      });
    });

    // CORRIGÉ : Le taux de conformité inclut maintenant les volets fonctionnels ET acceptables
    const complianceRate = totalMeasuredShutters > 0 ? 
      ((compliantCount + acceptableCount) / totalMeasuredShutters) * 100 : 0;

    return {
      zoneCount,
      shutterCount,
      compliantCount,
      acceptableCount,
      nonCompliantCount,
      complianceRate,
      totalMeasuredShutters
    };
  };

  // Fonction pour déterminer la taille de police adaptative
  const getAdaptiveFontSize = (text: string, hasActions: boolean) => {
    const baseSize = 18;
    const minSize = 15;
    const maxLength = hasActions ? 25 : 35;
    
    if (text.length <= maxLength) {
      return baseSize;
    } else if (text.length <= maxLength + 8) {
      return 16;
    } else {
      return minSize;
    }
  };

  // Trier les bâtiments : favoris en premier
  const sortedBuildings = project ? [...project.buildings].sort((a, b) => {
    const aIsFavorite = Array.isArray(favoriteBuildings) && favoriteBuildings.includes(a.id);
    const bIsFavorite = Array.isArray(favoriteBuildings) && favoriteBuildings.includes(b.id);
    
    if (aIsFavorite && !bIsFavorite) return -1;
    if (!aIsFavorite && bIsFavorite) return 1;
    return 0;
  }) : [];

  const renderBuilding = ({ item }: { item: BuildingType }) => {
    const stats = getBuildingStats(item);
    const isSelected = selectedBuildings.has(item.id);
    const isFavorite = Array.isArray(favoriteBuildings) && favoriteBuildings.includes(item.id);
    const hasActions = !selectionMode;
    const adaptiveFontSize = getAdaptiveFontSize(item.name, hasActions);

    return (
      <TouchableOpacity
        style={[
          styles.buildingCard,
          isSelected && styles.selectedCard,
          isFavorite && styles.favoriteCard
        ]}
        onPress={() => handleBuildingPress(item)}
        onLongPress={() => {
          if (!selectionMode) {
            setSelectionMode(true);
            handleBuildingSelection(item.id);
          }
        }}
      >
        <View style={styles.buildingHeader}>
          <View style={styles.buildingTitleSection}>
            <View style={styles.titleRow}>
              {selectionMode && (
                <TouchableOpacity 
                  style={styles.checkbox}
                  onPress={() => handleBuildingSelection(item.id)}
                >
                  {isSelected ? (
                    <CheckSquare size={20} color={theme.colors.primary} />
                  ) : (
                    <Square size={20} color={theme.colors.textTertiary} />
                  )}
                </TouchableOpacity>
              )}
              <Building size={20} color={theme.colors.primary} />
              <TouchableOpacity 
                style={[styles.buildingNameContainer, selectionMode && styles.buildingNameContainerSelection]}
                onPress={() => !selectionMode && openNameEditModal(item)}
                disabled={selectionMode}
              >
                <Text 
                  style={[styles.buildingName, { fontSize: adaptiveFontSize }]}
                  numberOfLines={1}
                  ellipsizeMode="tail"
                >
                  {item.name}
                </Text>
                {!selectionMode && <Text style={styles.editIcon}>✏️</Text>}
              </TouchableOpacity>
            </View>
            {item.description && (
              <Text style={styles.buildingDescription} numberOfLines={2}>
                {item.description}
              </Text>
            )}
          </View>
          
          {!selectionMode && (
            <View style={styles.actionButtons}>
              <TouchableOpacity 
                style={styles.actionButton}
                onPress={() => handleToggleFavorite(item.id)}
              >
                <Star 
                  size={14} 
                  color={isFavorite ? "#F59E0B" : theme.colors.textTertiary} 
                  fill={isFavorite ? "#F59E0B" : "none"}
                />
              </TouchableOpacity>
              <TouchableOpacity 
                style={styles.actionButton}
                onPress={() => handleEditBuilding(item)}
              >
                <Settings size={14} color={theme.colors.primary} />
              </TouchableOpacity>
              <TouchableOpacity 
                style={styles.actionButton}
                onPress={() => handleDeleteBuilding(item)}
              >
                <Trash2 size={14} color={theme.colors.error} />
              </TouchableOpacity>
            </View>
          )}
        </View>

        <View style={styles.buildingContent}>
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Wind size={16} color={theme.colors.primary} />
              <Text style={styles.statText}>{stats.zoneCount} {strings.zones.toLowerCase()}</Text>
            </View>
            
            <View style={styles.statItem}>
              <View style={[styles.complianceIndicator, { 
                backgroundColor: stats.complianceRate >= 80 ? '#10B981' : stats.complianceRate >= 60 ? '#F59E0B' : '#EF4444' 
              }]} />
              <Text style={styles.statText}>{stats.shutterCount} {strings.shutters.toLowerCase()}</Text>
            </View>

            {stats.shutterCount > 0 && (
              <View style={styles.statItem}>
                <Text style={[styles.complianceRate, { 
                  color: stats.complianceRate >= 80 ? '#10B981' : stats.complianceRate >= 60 ? '#F59E0B' : '#EF4444' 
                }]}>
                  {stats.complianceRate.toFixed(0)}%
                </Text>
              </View>
            )}
          </View>

          {stats.shutterCount > 0 && (
            <View style={styles.complianceBar}>
              <View style={[styles.complianceSegment, { 
                flex: stats.compliantCount, 
                backgroundColor: '#10B981' 
              }]} />
              <View style={[styles.complianceSegment, { 
                flex: stats.acceptableCount, 
                backgroundColor: '#F59E0B' 
              }]} />
              <View style={[styles.complianceSegment, { 
                flex: stats.nonCompliantCount, 
                backgroundColor: '#EF4444' 
              }]} />
            </View>
          )}
        </View>
        </TouchableOpacity>
    );
  };

  const styles = createStyles(theme);

  if (loading) {
    return <LoadingScreen title={strings.loading} message={strings.loadingData} />;
  }

  if (!project) {
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
        title={project.name}
        subtitle={project.city}
        onBack={handleBack}
        rightComponent={
          <View style={styles.headerActions}>
            <TouchableOpacity onPress={handleSelectionMode} style={styles.selectionButton}>
              <Text style={styles.selectionButtonText}>
                {selectionMode ? strings.cancel : 'Sélect.'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleEditProject} style={styles.actionButton}>
              <Settings size={18} color={theme.colors.primary} />
            </TouchableOpacity>
            <TouchableOpacity onPress={handleCreateBuilding} style={styles.actionButton}>
              <Plus size={22} color={theme.colors.primary} />
            </TouchableOpacity>
          </View>
        }
      />

      {selectionMode && (
        <View style={styles.selectionToolbar}>
          <Text style={styles.selectionCount}>
            {selectedBuildings.size} {strings.selected}{selectedBuildings.size > 1 ? 's' : ''}
          </Text>
          <View style={styles.selectionActionsColumn}>
            <TouchableOpacity 
              onPress={handleSelectAll}
              style={[
                styles.selectAllButton,
                selectedBuildings.size === sortedBuildings.length 
                  ? styles.selectAllButtonActive 
                  : styles.selectAllButtonInactive
              ]}
            >
              {selectedBuildings.size === sortedBuildings.length ? (
                <CheckSquare size={20} color="#FFFFFF" />
              ) : (
                <Square size={20} color={theme.colors.textTertiary} />
              )}
              <Text style={[
                styles.selectAllButtonText,
                selectedBuildings.size === sortedBuildings.length 
                  ? styles.selectAllButtonTextActive 
                  : styles.selectAllButtonTextInactive
              ]}>
                {selectedBuildings.size === sortedBuildings.length ? 'Tout désélectionner' : 'Tout sélectionner'}
              </Text>
            </TouchableOpacity>
            <View style={styles.selectionActionsRow}>
              <TouchableOpacity 
                style={styles.toolbarButton}
                onPress={handleBulkFavorite}
                disabled={selectedBuildings.size === 0}
              >
                <Star size={20} color={selectedBuildings.size > 0 ? "#F59E0B" : theme.colors.textTertiary} />
                <Text style={[styles.toolbarButtonText, { color: selectedBuildings.size > 0 ? "#F59E0B" : theme.colors.textTertiary }]}>
                  {strings.favorites}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={styles.toolbarButton}
                onPress={handleBulkDelete}
                disabled={selectedBuildings.size === 0}
              >
                <Trash2 size={20} color={selectedBuildings.size > 0 ? theme.colors.error : theme.colors.textTertiary} />
                <Text style={[styles.toolbarButtonText, { color: selectedBuildings.size > 0 ? theme.colors.error : theme.colors.textTertiary }]}>
                  {strings.delete}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      <View style={styles.content}>
        {project.buildings.length === 0 ? (
          <Animated.View style={[styles.emptyContainer, { opacity: fadeAnim }]}>
            <Building size={48} color={theme.colors.textTertiary} />
            <Text style={styles.emptyTitle}>Aucun bâtiment</Text>
            <Text style={styles.emptySubtitle}>
              Ajoutez votre premier bâtiment pour commencer l'analyse de conformité.
            </Text>
            <Button
              title={strings.createBuilding || "Créer un bâtiment"}
              onPress={handleCreateBuilding}
              style={styles.createButton}
            />
          </Animated.View>
        ) : (
          <Animated.View style={[{ flex: 1 }, { opacity: fadeAnim }]}>
            <FlatList
              data={sortedBuildings}
              renderItem={renderBuilding}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.listContainer}
              showsVerticalScrollIndicator={false}
            />
          </Animated.View>
        )}
      </View>

    </View>
  );
}

const createStyles = (theme: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  content: {
    flex: 1,
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
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
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
  actionButton: {
    padding: 6,
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
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontSize: 24,
    fontFamily: 'Inter-Bold',
    color: theme.colors.text,
    marginTop: 24,
    marginBottom: 12,
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
  listContainer: {
    padding: 16,
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
  nameTextInput: {
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
  buildingCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  selectedCard: {
    borderWidth: 2,
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primary + '20',
  },
  favoriteCard: {
    borderLeftWidth: 4,
    borderLeftColor: '#F59E0B',
  },
  buildingHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  buildingTitleSection: {
    flex: 1,
    minWidth: 0,
    marginRight: 6,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
    minWidth: 0,
  },
  checkbox: {
    padding: 2,
    flexShrink: 0,
  },
  buildingNameContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
    backgroundColor: theme.colors.surfaceSecondary,
    minWidth: 0,
  },
  buildingNameContainerSelection: {
    backgroundColor: 'transparent',
  },
  buildingName: {
    fontFamily: 'Inter-Bold',
    color: theme.colors.text,
    flex: 1,
    minWidth: 0,
  },
  editIcon: {
    fontSize: 12,
  },
  buildingDescription: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    color: theme.colors.textSecondary,
    marginTop: 4,
    marginLeft: 28,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 2,
    flexShrink: 0,
  },
  buildingContent: {
    gap: 12,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statText: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
    color: theme.colors.textSecondary,
  },
  complianceIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  complianceRate: {
    fontSize: 16,
    fontFamily: 'Inter-Bold',
  },
  complianceBar: {
    flexDirection: 'row',
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
    backgroundColor: theme.colors.border,
  },
  complianceSegment: {
    height: '100%',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Platform.OS === 'web' ? 0 : 20,
    ...(Platform.OS === 'web' && {
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      zIndex: 9999,
      paddingTop: 40,
      paddingBottom: 100,
      paddingHorizontal: 20,
    }),
  },
});

// Composants modaux définis au niveau du fichier
function CreateBuildingModal({ 
  onSubmit, 
  onCancel, 
  buildingName, 
  setBuildingName, 
  buildingDescription, 
  setBuildingDescription, 
  errors, 
  loading, 
  strings 
}: any) {
  const { theme } = useTheme();
  const styles = createStyles(theme);

  return (
    <View style={styles.modalContent}>
      <View style={styles.modalHeader}>
        <Text style={styles.modalTitle}>{strings.newBuilding}</Text>
        <TouchableOpacity onPress={onCancel} style={styles.closeButton}>
          <X size={20} color={theme.colors.textSecondary} />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
        <Input
          label={strings.buildingName + " *"}
          value={buildingName}
          onChangeText={setBuildingName}
          placeholder="Ex: Bâtiment A, Tour Nord"
          error={errors.name}
        />

        <Input
          label={strings.description + " (" + strings.optional + ")"}
          value={buildingDescription}
          onChangeText={setBuildingDescription}
          placeholder="Ex: Bâtiment principal, 5 étages"
          multiline
          numberOfLines={3}
        />
      </ScrollView>

      <View style={styles.modalFooter}>
        <Button
          title={strings.cancel}
          onPress={onCancel}
          variant="secondary"
          style={styles.modalButton}
        />
        <Button
          title={loading ? "Création..." : strings.create}
          onPress={onSubmit}
          disabled={loading}
          style={styles.modalButton}
        />
      </View>
    </View>
  );
}

function DeleteBuildingModal({ building, onConfirm, onCancel, strings }: any) {
  const { theme } = useTheme();
  const styles = createStyles(theme);

  return (
    <View style={styles.modalContent}>
      <View style={styles.modalHeader}>
        <Text style={styles.modalTitle}>Supprimer le bâtiment</Text>
        <TouchableOpacity onPress={onCancel} style={styles.closeButton}>
          <X size={20} color={theme.colors.textSecondary} />
        </TouchableOpacity>
      </View>
      
      <View style={styles.modalBody}>
        <Text style={styles.modalText}>
          <Text>⚠️ </Text>
          <Text style={styles.modalBold}>Cette action est irréversible !</Text>
          <Text>{'\n\n'}</Text>
          <Text>Êtes-vous sûr de vouloir supprimer le bâtiment </Text>
          <Text style={styles.modalBold}>"{building.name}"</Text>
          <Text> ?</Text>
          <Text>{'\n\n'}</Text>
          <Text>Toutes les zones et volets associés seront également supprimés.</Text>
        </Text>
      </View>

      <View style={styles.modalFooter}>
        <Button
          title={strings.cancel}
          onPress={onCancel}
          variant="secondary"
          style={styles.modalButton}
        />
        <Button
          title="Supprimer"
          onPress={onConfirm}
          variant="danger"
          style={styles.modalButton}
        />
      </View>
    </View>
  );
}

function BulkDeleteBuildingsModal({ count, onConfirm, onCancel, strings }: any) {
  const { theme } = useTheme();
  const styles = createStyles(theme);

  return (
    <View style={styles.modalContent}>
      <View style={styles.modalHeader}>
        <Text style={styles.modalTitle}>Supprimer {count} bâtiment{count > 1 ? 's' : ''}</Text>
        <TouchableOpacity onPress={onCancel} style={styles.closeButton}>
          <X size={20} color={theme.colors.textSecondary} />
        </TouchableOpacity>
      </View>
      
      <View style={styles.modalBody}>
        <Text style={styles.modalText}>
          <Text>⚠️ </Text>
          <Text style={styles.modalBold}>Cette action est irréversible !</Text>
          <Text>{'\n\n'}</Text>
          <Text>Êtes-vous sûr de vouloir supprimer </Text>
          <Text style={styles.modalBold}>{count} bâtiment{count > 1 ? 's' : ''}</Text>
          <Text> ?</Text>
          <Text>{'\n\n'}</Text>
          <Text>Toutes les zones et volets associés seront également supprimés.</Text>
        </Text>
      </View>

      <View style={styles.modalFooter}>
        <Button
          title={strings.cancel}
          onPress={onCancel}
          variant="secondary"
          style={styles.modalButton}
        />
        <Button
          title={`Supprimer ${count > 1 ? 'tout' : 'les bâtiments'}`}
          onPress={onConfirm}
          variant="danger"
          style={styles.modalButton}
        />
      </View>
    </View>
  );
}

function EditBuildingNameModal({ building, onSave, onCancel, strings }: any) {
  const { theme } = useTheme();
  const [name, setName] = useState(building.name);
  const styles = createStyles(theme);

  const handleSave = () => {
    onSave(building, name);
  };

  return (
    <View style={styles.modalContent}>
      <View style={styles.modalHeader}>
        <Text style={styles.modalTitle}>Modifier le nom du bâtiment</Text>
        <TouchableOpacity onPress={onCancel} style={styles.closeButton}>
          <X size={20} color={theme.colors.textSecondary} />
        </TouchableOpacity>
      </View>

      <View style={styles.modalBody}>
        <Text style={styles.inputLabel}>Nom du bâtiment *</Text>
        <TextInput
          style={styles.nameTextInput}
          value={name}
          onChangeText={setName}
          placeholder="Ex: Bâtiment A, Tour Nord"
          placeholderTextColor={theme.colors.textTertiary}
          autoFocus={true}
          selectTextOnFocus={true}
          returnKeyType="done"
          blurOnSubmit={true}
        />
      </View>

      <View style={styles.modalFooter}>
        <Button
          title={strings.cancel}
          onPress={onCancel}
          variant="secondary"
          style={styles.modalButton}
        />
        <Button
          title={strings.save}
          onPress={handleSave}
          style={styles.modalButton}
        />
      </View>
    </View>
  );
}