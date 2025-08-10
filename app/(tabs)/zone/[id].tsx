import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Alert, TextInput, Platform, Animated } from 'react-native';
import { useLocalSearchParams, router, useFocusEffect } from 'expo-router';
import { Plus, Settings, Wind, Star, Trash2, SquareCheck as CheckSquare, Square, X, Filter } from 'lucide-react-native';
import { Header } from '@/components/Header';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { ComplianceIndicator } from '@/components/ComplianceIndicator';
import { Project, Building, FunctionalZone, Shutter } from '@/types';
import { useStorage } from '@/contexts/StorageContext';
import { calculateCompliance, formatDeviation } from '@/utils/compliance';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useAndroidBackButton } from '@/utils/BackHandler';
import { LoadingScreen } from '@/components/LoadingScreen';
import { useModal } from '@/contexts/ModalContext';

export default function ZoneDetailScreen() {
  const { strings } = useLanguage();
  const { theme } = useTheme();
  const { showModal, hideModal } = useModal();
  const { 
    projects, 
    favoriteShutters, 
    setFavoriteShutters, 
    deleteShutter, 
    updateShutter 
  } = useStorage();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [zone, setZone] = useState<FunctionalZone | null>(null);
  const [building, setBuilding] = useState<Building | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedShutters, setSelectedShutters] = useState<Set<string>>(new Set());
  const fadeAnim = useRef(new Animated.Value(0)).current;

  // États pour les filtres
  const [filtersVisible, setFiltersVisible] = useState(false);
  const [shutterTypeFilter, setShutterTypeFilter] = useState<'all' | 'high' | 'low'>('all');
  const [complianceFilter, setComplianceFilter] = useState<'all' | 'compliant' | 'acceptable' | 'non-compliant'>('all');

  // États pour l'édition directe des débits
  const [editingFlows, setEditingFlows] = useState<{
    [shutterId: string]: {
      referenceFlow: string;
      measuredFlow: string;
      remarks: string;
      hasBeenFocused: { referenceFlow: boolean; measuredFlow: boolean };
    }
  }>({});

  // Configure Android back button to go back to the building screen
  useAndroidBackButton(() => {
    handleBack();
    return true;
  });

  const loadZone = useCallback(async () => {
    try {
      for (const proj of projects) {
        for (const bldg of proj.buildings) {
          const foundZone = bldg.functionalZones.find(z => z.id === id);
          if (foundZone) {
            setZone(foundZone);
            setBuilding(bldg);
            setProject(proj);
            
            // Initialiser les états d'édition pour tous les volets
            const initialEditingFlows: typeof editingFlows = {};
            foundZone.shutters.forEach(shutter => {
              initialEditingFlows[shutter.id] = {
                referenceFlow: shutter.referenceFlow > 0 ? shutter.referenceFlow.toString() : '',
                measuredFlow: shutter.measuredFlow > 0 ? shutter.measuredFlow.toString() : '',
                remarks: shutter.remarks || '',
                hasBeenFocused: { referenceFlow: false, measuredFlow: false }
              };
            });
            setEditingFlows(initialEditingFlows);
            break;
          }
        }
      }
    } catch (error) {
      console.error('Erreur lors du chargement de la zone:', error);
    } finally {
      setLoading(false);
    }
  }, [id, projects]);

  useFocusEffect(
    useCallback(() => {
      console.log('Zone screen focused, reloading data...');
      loadZone();
      
      // Animation de fondu à l'entrée
      fadeAnim.setValue(0);
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start();
    }, [loadZone])
  );

  useEffect(() => {
    loadZone();
  }, [loadZone]);

  const handleBack = () => {
    try {
      if (building) {
        router.push(`/(tabs)/building/${building.id}`);
      } else {
        router.push('/(tabs)/');
      }
    } catch (error) {
      console.error('Erreur de navigation:', error);
      router.push('/(tabs)/');
    }
  };

  const handleEditZone = () => {
    try {
      router.push(`/(tabs)/zone/edit/${id}`);
    } catch (error) {
      console.error('Erreur de navigation vers édition:', error);
    }
  };

  const handleCreateShutter = () => {
    try {
      router.push(`/(tabs)/shutter/create?zoneId=${id}`);
    } catch (error) {
      console.error('Erreur de navigation vers création volet:', error);
    }
  };

  const handleShutterPress = (shutter: Shutter) => {
    if (selectionMode) {
      handleShutterSelection(shutter.id);
    } else {
      router.push(`/(tabs)/shutter/${shutter.id}`);
    }
  };

  const handleSelectionMode = () => {
    setSelectionMode(!selectionMode);
    setSelectedShutters(new Set());
  };

  const handleShutterSelection = (shutterId: string) => {
    const newSelection = new Set(selectedShutters);
    if (newSelection.has(shutterId)) {
      newSelection.delete(shutterId);
    } else {
      newSelection.add(shutterId);
    }
    setSelectedShutters(newSelection);
  };

  const handleBulkDelete = () => {
    if (selectedShutters.size === 0) return;

    showModal(<BulkDeleteShuttersModal 
      count={selectedShutters.size}
      onConfirm={() => confirmBulkDeleteShutters()}
      onCancel={() => hideModal()}
      strings={strings}
    />);
  };

  const confirmBulkDeleteShutters = async () => {
    try {
      console.log('🗑️ Suppression en lot de', selectedShutters.size, 'volets');
      for (const shutterId of selectedShutters) {
        const success = await deleteShutter(shutterId);
        if (!success) {
          console.error('Erreur lors de la suppression du volet:', shutterId);
        }
      }
      setSelectedShutters(new Set());
      setSelectionMode(false);
      hideModal();
    } catch (error) {
      console.error('Erreur lors de la suppression en lot:', error);
      hideModal();
    }
  };

  const handleBulkFavorite = async () => {
    if (selectedShutters.size === 0) return;

    const newFavorites = new Set(favoriteShutters);
    for (const shutterId of selectedShutters) {
      if (newFavorites.has(shutterId)) {
        newFavorites.delete(shutterId);
      } else {
        newFavorites.add(shutterId);
      }
    }
    
    await setFavoriteShutters(Array.from(newFavorites));
    setSelectedShutters(new Set());
    setSelectionMode(false);
  };

  const handleSelectAll = () => {
    if (selectedShutters.size === sortedShutters.length) {
      setSelectedShutters(new Set());
    } else {
      const allShutterIds = new Set(sortedShutters.map(s => s.id));
      setSelectedShutters(allShutterIds);
    }
  };

  const handleToggleFavorite = async (shutterId: string) => {
    const newFavorites = new Set(favoriteShutters);
    if (newFavorites.has(shutterId)) {
      newFavorites.delete(shutterId);
    } else {
      newFavorites.add(shutterId);
    }
    
    await setFavoriteShutters(Array.from(newFavorites));
  };

  const handleEditShutter = (shutter: Shutter) => {
    try {
      router.push(`/(tabs)/shutter/edit/${shutter.id}`);
    } catch (error) {
      console.error('Erreur de navigation vers édition volet:', error);
    }
  };

  const handleDeleteShutter = async (shutter: Shutter) => {
    showModal(<DeleteShutterModal 
      shutter={shutter}
      onConfirm={() => confirmDeleteShutter(shutter)}
      onCancel={() => hideModal()}
      strings={strings}
    />);
  };

  // Fonction pour ouvrir le modal d'édition du nom
  const openNameEditModal = (shutter: Shutter) => {
    showModal(<EditShutterNameModal 
      shutter={shutter}
      onCancel={() => hideModal()}
      strings={strings}
    />);
  };

  const confirmDeleteShutter = async (shutter: Shutter) => {
    try {
      console.log('🗑️ Confirmation suppression volet:', shutter.id);
      const success = await deleteShutter(shutter.id);
      if (success) {
        console.log('✅ Volet supprimé avec succès');
        hideModal();
      } else {
        console.error('❌ Erreur: Volet non trouvé pour la suppression');
        hideModal();
      }
    } catch (error) {
      console.error('Erreur lors de la suppression:', error);
      hideModal();
    }
  };

  // Fonctions pour l'édition directe des débits
  const handleFlowChange = useCallback((shutterId: string, field: 'referenceFlow' | 'measuredFlow' | 'remarks', value: string) => {
    setEditingFlows(prev => ({
      ...prev,
      [shutterId]: {
        ...prev[shutterId],
        [field]: value
      }
    }));
  }, []);

  const handleFlowFocus = useCallback((shutterId: string, field: 'referenceFlow' | 'measuredFlow') => {
    setEditingFlows(prev => ({
      ...prev,
      [shutterId]: {
        ...prev[shutterId],
        hasBeenFocused: {
          ...prev[shutterId]?.hasBeenFocused,
          [field]: true
        }
      }
    }));
  }, []);

  const handleFlowBlur = useCallback(async (shutterId: string, field: 'referenceFlow' | 'measuredFlow') => {
    const shutter = zone?.shutters.find(s => s.id === shutterId);
    if (!shutter) return;

    const editingData = editingFlows[shutterId];
    if (!editingData) return;

    const refFlow = parseFloat(editingData.referenceFlow) || 0;
    const measFlow = parseFloat(editingData.measuredFlow) || 0;

    if (isNaN(refFlow) || refFlow < 0) {
      setEditingFlows(prev => ({
        ...prev,
        [shutterId]: {
          ...prev[shutterId],
          referenceFlow: shutter.referenceFlow > 0 ? shutter.referenceFlow.toString() : ''
        }
      }));
      return;
    }

    if (isNaN(measFlow) || measFlow < 0) {
      setEditingFlows(prev => ({
        ...prev,
        [shutterId]: {
          ...prev[shutterId],
          measuredFlow: shutter.measuredFlow > 0 ? shutter.measuredFlow.toString() : ''
        }
      }));
      return;
    }

    const hasChanged = refFlow !== shutter.referenceFlow || measFlow !== shutter.measuredFlow;
    
    if (hasChanged) {
      try {
        const updatedShutter = await updateShutter(shutter.id, {
          referenceFlow: refFlow,
          measuredFlow: measFlow,
        });
        
        if (updatedShutter) {
          // Mise à jour instantanée de l'état local de la zone
          setZone(prevZone => {
            if (!prevZone) return prevZone;
            return {
              ...prevZone,
              shutters: prevZone.shutters.map(s => 
                s.id === shutterId 
                  ? { ...s, referenceFlow: refFlow, measuredFlow: measFlow, updatedAt: new Date() }
                  : s
              )
            };
          });
          
          console.log(`✅ Volet ${shutter.name} mis à jour instantanément: ${refFlow}/${measFlow}`);
        }
        
      } catch (error) {
        console.error('Erreur lors de la sauvegarde automatique:', error);
        setEditingFlows(prev => ({
          ...prev,
          [shutterId]: {
            ...prev[shutterId],
            referenceFlow: shutter.referenceFlow > 0 ? shutter.referenceFlow.toString() : '',
            measuredFlow: shutter.measuredFlow > 0 ? shutter.measuredFlow.toString() : ''
          }
        }));
      }
    }
  }, [editingFlows, zone, updateShutter]);

  const handleRemarksBlur = useCallback(async (shutterId: string) => {
    const shutter = zone?.shutters.find(s => s.id === shutterId);
    if (!shutter) return;

    const editingData = editingFlows[shutterId];
    if (!editingData) return;

    const newRemarks = editingData.remarks.trim();
    const hasChanged = newRemarks !== (shutter.remarks || '');
    
    if (hasChanged) {
      try {
        const updatedShutter = await updateShutter(shutter.id, {
          remarks: newRemarks || undefined,
        });
        
        if (updatedShutter) {
          // Mise à jour instantanée de l'état local de la zone
          setZone(prevZone => {
            if (!prevZone) return prevZone;
            return {
              ...prevZone,
              shutters: prevZone.shutters.map(s => 
                s.id === shutterId 
                  ? { ...s, remarks: newRemarks || undefined, updatedAt: new Date() }
                  : s
              )
            };
          });
          
          console.log(`✅ Remarques du volet ${shutter.name} mises à jour: "${newRemarks}"`);
        }
        
      } catch (error) {
        console.error('Erreur lors de la sauvegarde des remarques:', error);
        setEditingFlows(prev => ({
          ...prev,
          [shutterId]: {
            ...prev[shutterId],
            remarks: shutter.remarks || ''
          }
        }));
      }
    }
  }, [editingFlows, zone, updateShutter]);

  // Trier les volets : favoris en premier
  const getFilteredShutters = () => {
    if (!zone) return [];
    
    let filtered = [...zone.shutters];
    
    // Filtre par type de volet
    if (shutterTypeFilter !== 'all') {
      filtered = filtered.filter(shutter => shutter.type === shutterTypeFilter);
    }
    
    // Filtre par niveau de conformité
    if (complianceFilter !== 'all') {
      filtered = filtered.filter(shutter => {
        const editingData = editingFlows[shutter.id];
        const currentRefFlow = parseFloat(editingData?.referenceFlow || '0') || 0;
        const currentMeasFlow = parseFloat(editingData?.measuredFlow || '0') || 0;
        const compliance = calculateCompliance(currentRefFlow, currentMeasFlow);
        return compliance.status === complianceFilter;
      });
    }
    
    return filtered;
  };

  const sortedShutters = getFilteredShutters().sort((a, b) => {
    const aIsFavorite = favoriteShutters.includes(a.id);
    const bIsFavorite = favoriteShutters.includes(b.id);
    
    if (aIsFavorite && !bIsFavorite) return -1;
    if (!aIsFavorite && bIsFavorite) return 1;
    return 0;
  });

  // Obtenir les statistiques pour les filtres
  const getShutterStats = () => {
    if (!zone) return { total: 0, high: 0, low: 0, compliant: 0, acceptable: 0, nonCompliant: 0 };
    
    const total = zone.shutters.length;
    const high = zone.shutters.filter(s => s.type === 'high').length;
    const low = zone.shutters.filter(s => s.type === 'low').length;
    
    let compliant = 0;
    let acceptable = 0;
    let nonCompliant = 0;
    
    zone.shutters.forEach(shutter => {
      const editingData = editingFlows[shutter.id];
      const currentRefFlow = parseFloat(editingData?.referenceFlow || '0') || 0;
      const currentMeasFlow = parseFloat(editingData?.measuredFlow || '0') || 0;
      const compliance = calculateCompliance(currentRefFlow, currentMeasFlow);
      
      switch (compliance.status) {
        case 'compliant':
          compliant++;
          break;
        case 'acceptable':
          acceptable++;
          break;
        case 'non-compliant':
          nonCompliant++;
          break;
      }
    });
    
    return { total, high, low, compliant, acceptable, nonCompliant };
  };

  const shutterStats = getShutterStats();

  const toggleFilters = () => {
    setFiltersVisible(!filtersVisible);
  };

  const clearFilters = () => {
    setShutterTypeFilter('all');
    setComplianceFilter('all');
  };

  const hasActiveFilters = shutterTypeFilter !== 'all' || complianceFilter !== 'all';

  const renderShutter = ({ item }: { item: Shutter }) => {
    const isSelected = selectedShutters.has(item.id);
    const isFavorite = favoriteShutters.includes(item.id);
    const editingData = editingFlows[item.id];
    
    const currentRefFlow = parseFloat(editingData?.referenceFlow || '0') || 0;
    const currentMeasFlow = parseFloat(editingData?.measuredFlow || '0') || 0;
    const compliance = calculateCompliance(currentRefFlow, currentMeasFlow);

    return (
      <View
        style={[
          styles.shutterCard,
          isSelected && styles.selectedCard,
          isFavorite && styles.favoriteCard
        ]}
      >
        <View style={styles.shutterHeader}>
          <View style={styles.shutterTitleSection}>
            {selectionMode && (
              <TouchableOpacity 
                style={styles.checkbox}
                onPress={() => {
                  if (selectionMode) {
                    handleShutterSelection(item.id);
                  } else {
                    setSelectionMode(true);
                    handleShutterSelection(item.id);
                  }
                }}
              >
                {isSelected ? (
                  <CheckSquare size={18} color={theme.colors.primary} />
                ) : (
                  <Square size={18} color={theme.colors.textTertiary} />
                )}
              </TouchableOpacity>
            )}
            <TouchableOpacity 
              style={[styles.shutterNameContainer, selectionMode && styles.shutterNameContainerSelection]}
              onPress={() => !selectionMode && openNameEditModal(item)}
              disabled={selectionMode}
              onLongPress={() => {
                if (!selectionMode) {
                  setSelectionMode(true);
                  handleShutterSelection(item.id);
                }
              }}
            >
              <Text style={styles.shutterName} numberOfLines={1} ellipsizeMode="tail">
                {item.name}
              </Text>
              {!selectionMode && <Text style={styles.editIcon}>✏️</Text>}
            </TouchableOpacity>
            <View style={[styles.shutterTypeBadge, { 
              backgroundColor: item.type === 'high' ? '#10B981' : '#F59E0B' 
            }]}>
              <Text style={styles.shutterTypeText}>
                {item.type === 'high' ? 'VH' : 'VB'}
              </Text>
            </View>
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
                onPress={() => handleEditShutter(item)}
              >
                <Settings size={14} color={theme.colors.primary} />
              </TouchableOpacity>
              <TouchableOpacity 
                style={styles.actionButton}
                onPress={() => handleDeleteShutter(item)}
              >
                <Trash2 size={14} color={theme.colors.error} />
              </TouchableOpacity>
            </View>
          )}
        </View>

        <View style={styles.flowEditingContainer}>
          <Text style={styles.flowSectionTitle}>Mesures de débit</Text>
          <View style={styles.flowEditingRow}>
            <View style={styles.flowEditingField}>
              <View style={styles.flowLabelContainer}>
                <Text style={styles.flowEditingLabel}>Débit de</Text>
                <Text style={styles.flowEditingLabel}>référence</Text>
                <Text style={styles.flowEditingUnit}>({strings.cubicMeterPerHour})</Text>
              </View>
              <TextInput
                style={styles.flowEditingInput}
                value={editingData?.referenceFlow || ''}
                onChangeText={(text) => handleFlowChange(item.id, 'referenceFlow', text)}
                onFocus={() => handleFlowFocus(item.id, 'referenceFlow')}
                onBlur={() => handleFlowBlur(item.id, 'referenceFlow')}
                keyboardType="numeric"
                placeholder="Ex: 5000"
                placeholderTextColor={theme.colors.textTertiary}
                selectTextOnFocus={true}
              />
            </View>
            
            <View style={styles.flowEditingField}>
              <View style={styles.flowLabelContainer}>
                <Text style={styles.flowEditingLabel}>Débit mesuré</Text>
                <Text style={styles.flowEditingUnit}>({strings.cubicMeterPerHour})</Text>
              </View>
              <TextInput
                style={styles.flowEditingInput}
                value={editingData?.measuredFlow || ''}
                onChangeText={(text) => handleFlowChange(item.id, 'measuredFlow', text)}
                onFocus={() => handleFlowFocus(item.id, 'measuredFlow')}
                onBlur={() => handleFlowBlur(item.id, 'measuredFlow')}
                keyboardType="numeric"
                placeholder="Ex: 4800"
                placeholderTextColor={theme.colors.textTertiary}
                selectTextOnFocus={true}
              />
            </View>
            
            <View style={styles.flowEditingField}>
              <View style={styles.flowLabelContainer}>
                <Text style={styles.flowEditingLabel}>Écart</Text>
                <Text style={styles.flowEditingUnit}>(%)</Text>
              </View>
              <View style={styles.deviationDisplay}>
                <Text style={[styles.deviationValue, { color: compliance.color }]}>
                  {formatDeviation(compliance.deviation)}
                </Text>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.remarksEditingContainer}>
          <TextInput
            style={styles.remarksEditingInput}
            value={editingData?.remarks || ''}
            onChangeText={(text) => handleFlowChange(item.id, 'remarks', text)}
            onBlur={() => handleRemarksBlur(item.id)}
            placeholder="Remarques"
            placeholderTextColor={theme.colors.textTertiary}
            multiline={false}
            textAlignVertical="top"
          />
        </View>

        {/* Bouton pour accéder aux détails du volet */}
        <View style={styles.detailButtonContainer}>
          <TouchableOpacity
            style={styles.detailButton}
            onPress={() => router.push(`/(tabs)/shutter/${item.id}`)}
          >
            <Text style={styles.detailButtonText}>Voir détails</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.complianceSection}>
          <ComplianceIndicator compliance={compliance} size="small" />
        </View>

      </View>
    );
  };

  const styles = createStyles(theme);

  if (loading) {
    return <LoadingScreen title={strings.loading} message={strings.loadingData} />;
  }

  if (!zone || !building || !project) {
    return (
      <View style={styles.container}>
        <Header title={strings.itemNotFound} onBack={handleBack} />
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{strings.dataNotFound}</Text>
        </View>
      </View>
    );
  }

  const locationInfo = project.city ? `${building.name} • ${project.name} • ${project.city}` : `${building.name} • ${project.name}`;

  return (
    <View style={styles.container}>
      <Header
        title={zone.name}
        subtitle={locationInfo}
        onBack={handleBack}
        rightComponent={
          <View style={styles.headerActions}>
            <View style={styles.topButtonsRow}>
              <TouchableOpacity onPress={toggleFilters} style={styles.actionButton}>
                <Filter size={18} color={hasActiveFilters ? "#F59E0B" : theme.colors.primary} />
              </TouchableOpacity>
              <TouchableOpacity onPress={handleEditZone} style={styles.actionButton}>
                <Settings size={18} color={theme.colors.primary} />
              </TouchableOpacity>
              <TouchableOpacity onPress={handleCreateShutter} style={styles.actionButton}>
                <Plus size={22} color={theme.colors.primary} />
              </TouchableOpacity>
            </View>
            <View style={styles.selectionButtonRow}>
              <TouchableOpacity onPress={handleSelectionMode} style={styles.selectionButton}>
                <Text style={styles.selectionButtonText}>
                  {selectionMode ? strings.cancel : 'Sélect.'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        }
      />

      {selectionMode && (
        <View style={styles.selectionToolbar}>
          <Text style={styles.selectionCount}>
            {selectedShutters.size} {strings.selected}{selectedShutters.size > 1 ? 's' : ''}
          </Text>
          <View style={styles.selectionActionsColumn}>
            <TouchableOpacity 
              style={[
                styles.selectAllButton,
                selectedShutters.size === sortedShutters.length
                  ? styles.selectAllButtonActive 
                  : styles.selectAllButtonInactive
              ]}
              onPress={handleSelectAll}
            >
              {selectedShutters.size === sortedShutters.length ? (
                <CheckSquare size={20} color="#FFFFFF" />
              ) : (
                <Square size={20} color={theme.colors.textTertiary} />
              )}
              <Text style={[
  selectedShutters.size === sortedShutters.length
    ? styles.selectAllButtonTextActive
    : styles.selectAllButtonTextInactive
]}>
  {selectedShutters.size === sortedShutters.length ? 'Tout désélectionner' : 'Tout sélectionner'}
</Text>
            </TouchableOpacity>
            <View style={styles.selectionActionsRow}>
              <TouchableOpacity 
                style={styles.toolbarButton}
                onPress={handleBulkFavorite}
                disabled={selectedShutters.size === 0}
              >
                <Star size={20} color={selectedShutters.size > 0 ? "#F59E0B" : theme.colors.textTertiary} />
                <Text style={[styles.toolbarButtonText, { color: selectedShutters.size > 0 ? "#F59E0B" : theme.colors.textTertiary }]}>
                  {strings.favorites}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={styles.toolbarButton}
                onPress={handleBulkDelete}
                disabled={selectedShutters.size === 0}
              >
                <Trash2 size={20} color={selectedShutters.size > 0 ? theme.colors.error : theme.colors.textTertiary} />
                <Text style={[styles.toolbarButtonText, { color: selectedShutters.size > 0 ? theme.colors.error : theme.colors.textTertiary }]}>
                  {strings.delete}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {/* Barre de filtres compacte */}
      {filtersVisible && (
        <View style={styles.compactFilterBar}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.compactFilterScroll}>
            <View style={styles.compactFilterButtons}>
              {/* Type de volet */}
              <TouchableOpacity
                style={[styles.compactFilterButton, shutterTypeFilter === 'all' && styles.compactFilterButtonActive]}
                onPress={() => setShutterTypeFilter('all')}
              >
                <Text style={[styles.compactFilterButtonText, shutterTypeFilter === 'all' && styles.compactFilterButtonTextActive]}>
                  Tous ({shutterStats.total})
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.compactFilterButton, shutterTypeFilter === 'high' && styles.compactFilterButtonActive]}
                onPress={() => setShutterTypeFilter('high')}
              >
                <Text style={[styles.compactFilterButtonText, shutterTypeFilter === 'high' && styles.compactFilterButtonTextActive]}>
                  VH ({shutterStats.high})
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.compactFilterButton, shutterTypeFilter === 'low' && styles.compactFilterButtonActive]}
                onPress={() => setShutterTypeFilter('low')}
              >
                <Text style={[styles.compactFilterButtonText, shutterTypeFilter === 'low' && styles.compactFilterButtonTextActive]}>
                  VB ({shutterStats.low})
                </Text>
              </TouchableOpacity>
              
              {/* Séparateur visuel */}
              <View style={styles.filterSeparator} />
              
              {/* Conformité */}
              <TouchableOpacity
                style={[styles.compactFilterButton, complianceFilter === 'all' && styles.compactFilterButtonActive]}
                onPress={() => setComplianceFilter('all')}
              >
                <Text style={[styles.compactFilterButtonText, complianceFilter === 'all' && styles.compactFilterButtonTextActive]}>
                  Tous ({shutterStats.total})
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.compactFilterButton, complianceFilter === 'compliant' && styles.compactFilterButtonActive]}
                onPress={() => setComplianceFilter('compliant')}
              >
                <Text style={[styles.compactFilterButtonText, complianceFilter === 'compliant' && styles.compactFilterButtonTextActive]}>
                  Conforme ({shutterStats.compliant})
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.compactFilterButton, complianceFilter === 'acceptable' && styles.compactFilterButtonActive]}
                onPress={() => setComplianceFilter('acceptable')}
              >
                <Text style={[styles.compactFilterButtonText, complianceFilter === 'acceptable' && styles.compactFilterButtonTextActive]}>
                  Acceptable ({shutterStats.acceptable})
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.compactFilterButton, complianceFilter === 'non-compliant' && styles.compactFilterButtonActive]}
                onPress={() => setComplianceFilter('non-compliant')}
              >
                <Text style={[styles.compactFilterButtonText, complianceFilter === 'non-compliant' && styles.compactFilterButtonTextActive]}>
                  Non conforme ({shutterStats.nonCompliant})
                </Text>
              </TouchableOpacity>
              
              {hasActiveFilters && (
                <TouchableOpacity style={styles.clearFiltersCompactButton} onPress={clearFilters}>
                  <X size={14} color={theme.colors.error} />
                  <Text style={styles.clearFiltersCompactText}>Effacer</Text>
                </TouchableOpacity>
              )}
            </View>
          </ScrollView>
        </View>
      )}

      <View style={styles.content}>
        {zone.shutters.length === 0 ? (
          <Animated.View style={[styles.emptyContainer, { opacity: fadeAnim }]}>
            <Wind size={64} color={theme.colors.textTertiary} />
            <Text style={styles.emptyTitle}>{strings.noShutters}</Text>
            <Text style={styles.emptySubtitle}>
              {strings.noShuttersDesc}
            </Text>
            <Button
              title={strings.addFirstShutter}
              onPress={handleCreateShutter}
              style={styles.createButton}
            />
          </Animated.View>
        ) : (
          <Animated.View style={[{ flex: 1 }, { opacity: fadeAnim }]}>
            <FlatList
              data={sortedShutters}
              renderItem={renderShutter}
              keyExtractor={(item) => item.id}
              contentContainerStyle={[
                styles.listContainer,
                Platform.OS === 'web' && styles.listContainerWeb
              ]}
              showsVerticalScrollIndicator={false}
            />
          </Animated.View>
        )}
      </View>
    </View>
  );
}

// Composants modaux
function DeleteShutterModal({ shutter, onConfirm, onCancel, strings }: any) {
  const { theme } = useTheme();
  const styles = createStyles(theme);

  return (
    <View style={styles.modalContent}>
      <View style={styles.modalHeader}>
        <Text style={styles.modalTitle}>Supprimer le volet</Text>
        <TouchableOpacity onPress={onCancel} style={styles.closeButton}>
          <X size={20} color={theme.colors.textSecondary} />
        </TouchableOpacity>
      </View>
      
      <View style={styles.modalBody}>
        <Text style={styles.modalText}>
          <Text>⚠️ </Text>
          <Text style={styles.modalBold}>Cette action est irréversible !</Text>
          <Text>{'\n\n'}</Text>
          <Text>Êtes-vous sûr de vouloir supprimer le volet </Text>
          <Text style={styles.modalBold}>"{shutter.name}"</Text>
          <Text> ?</Text>
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

function BulkDeleteShuttersModal({ count, onConfirm, onCancel, strings }: any) {
  const { theme } = useTheme();
  const styles = createStyles(theme);

  return (
    <View style={styles.modalContent}>
      <View style={styles.modalHeader}>
        <Text style={styles.modalTitle}>Supprimer {count} volet{count > 1 ? 's' : ''}</Text>
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
          <Text style={styles.modalBold}>{count} volet{count > 1 ? 's' : ''}</Text>
          <Text> ?</Text>
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
          title={`Supprimer ${count > 1 ? 'tout' : 'le volet'}`}
          onPress={onConfirm}
          variant="danger"
          style={styles.modalButton}
        />
      </View>
    </View>
  );
}

// Composant modal pour l'édition du nom de volet
function EditShutterNameModal({ shutter, onCancel, strings }: {
  shutter: Shutter;
  onCancel: () => void;
  strings: any;
}) {
  const { theme } = useTheme();
  const { hideModal } = useModal();
  const { updateShutter } = useStorage();
  const [name, setName] = useState(shutter.name);
  const styles = createStyles(theme);

  const handleSave = async () => {
    if (!shutter || !name.trim()) return;

    try {
      const updatedShutter = await updateShutter(shutter.id, {
        name: name.trim(),
      });
      
      if (updatedShutter) {
        hideModal();
      } else {
        console.error('Erreur lors de la modification du nom du volet');
      }
    } catch (error) {
      console.error('Erreur lors de la modification du nom du volet:', error);
    }
  };

  return (
    <View style={styles.modalContent}>
      <View style={styles.modalHeader}>
        <Text style={styles.modalTitle}>Modifier le nom du volet</Text>
        <TouchableOpacity onPress={onCancel} style={styles.closeButton}>
          <X size={20} color={theme.colors.textSecondary} />
        </TouchableOpacity>
      </View>

      <View style={styles.modalBody}>
        <Input
          label="Nom du volet *"
          value={name}
          onChangeText={setName}
          placeholder="Ex: VH01, VB01"
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

const createStyles = (theme: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  content: {
    flex: 1,
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
    flexDirection: 'column',
    alignItems: 'center',
    gap: 8,
  },
  topButtonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  selectionButtonRow: {
    flexDirection: 'row',
    justifyContent: 'center',
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: theme.colors.primary,
  },
  selectAllButtonInactive: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
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
    fontSize: 20,
    fontFamily: 'Inter-SemiBold',
    color: theme.colors.text,
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 16,
    fontFamily: 'Inter-Regular',
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 24,
  },
  createButton: {
    paddingHorizontal: 32,
  },
  listContainer: {
    padding: 16,
  },
  listContainerWeb: {
    paddingBottom: 100,
  },
  shutterCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  selectedCard: {
    borderWidth: 2,
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primary + '10',
  },
  favoriteCard: {
    borderLeftWidth: 4,
    borderLeftColor: '#F59E0B',
  },
  shutterHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  shutterTitleSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  checkbox: {
    padding: 2,
  },
  // Conteneur pour le nom du volet cliquable
  shutterNameContainer: {
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
  shutterNameContainerSelection: {
    backgroundColor: 'transparent',
  },
  shutterName: {
    fontSize: 18,
    fontFamily: 'Inter-Bold',
    color: theme.colors.text,
    flex: 1,
    minWidth: 0,
  },
  editIcon: {
    fontSize: 12,
  },
  shutterTypeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  shutterTypeText: {
    fontSize: 12,
    fontFamily: 'Inter-Bold',
    color: '#FFFFFF',
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 4,
  },
  
  // Styles pour l'édition des débits (identiques à la page de détail)
  flowEditingContainer: {
    backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  flowSectionTitle: {
    fontSize: 14,
    fontFamily: 'Inter-SemiBold',
    color: theme.colors.text,
    marginBottom: 8,
  },
  flowEditingRow: {
    flexDirection: 'row',
    gap: 8,
  },
  flowEditingField: {
    flex: 1,
  },
  flowLabelContainer: {
    height: 44,
    justifyContent: 'flex-start',
    marginBottom: 4,
  },
  flowEditingLabel: {
    fontSize: 10,
    fontFamily: 'Inter-Medium',
    color: theme.colors.textSecondary,
    lineHeight: 12,
  },
  flowEditingUnit: {
    fontSize: 9,
    fontFamily: 'Inter-Regular',
    color: theme.colors.textTertiary,
    marginTop: 2,
  },
  flowEditingInput: {
    borderWidth: 1,
    borderColor: theme.mode === 'dark' 
      ? theme.colors.primary + '80'
      : theme.colors.border,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 8,
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    backgroundColor: theme.mode === 'dark' 
      ? theme.colors.primary + '15'
      : theme.colors.inputBackground,
    color: theme.colors.text,
    textAlign: 'center',
    height: 40,
  },
  deviationDisplay: {
    borderWidth: 1,
    borderColor: theme.mode === 'dark' 
      ? theme.colors.border + '80'
      : theme.colors.border,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 8,
    backgroundColor: theme.colors.surfaceSecondary,
    alignItems: 'center',
    justifyContent: 'center',
    height: 40,
  },
  deviationValue: {
    fontSize: 14,
    fontFamily: 'Inter-Bold',
  },
  complianceSection: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  invalidReferenceText: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
    color: theme.colors.warning,
    fontStyle: 'italic',
  },
  remarksSection: {
    backgroundColor: theme.colors.primary + '20',
    borderRadius: 6,
    padding: 8,
    borderLeftWidth: 3,
    borderLeftColor: theme.colors.primary,
  },
  remarksText: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    color: theme.colors.primary,
    lineHeight: 16,
  },
  remarksEditingInput: {
    borderWidth: 1,
    borderColor: theme.mode === 'dark' 
      ? theme.colors.primary + '80'
      : theme.colors.border,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 8,
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    backgroundColor: theme.mode === 'dark' 
      ? theme.colors.primary + '15'
      : theme.colors.inputBackground,
    color: theme.colors.text,
    height: 36,
  },
  remarksEditingContainer: {
    backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: 6,
    padding: 4,
    marginBottom: 12,
  },
  detailButtonContainer: {
    marginBottom: 12,
    alignItems: 'center',
  },
  detailButton: {
    backgroundColor: theme.colors.primary,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  detailButtonText: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
    color: '#FFFFFF',
    textAlign: 'center',
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
  clearFiltersCompactButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 16,
    backgroundColor: theme.colors.error + '20',
    borderWidth: 1,
    borderColor: theme.colors.error + '40',
  },
  clearFiltersCompactText: {
    fontSize: 10,
    fontFamily: 'Inter-Medium',
    color: theme.colors.error,
  },
});