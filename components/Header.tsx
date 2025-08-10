import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Info } from 'lucide-react-native';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTheme } from '@/contexts/ThemeContext';
import { router } from 'expo-router';

interface HeaderProps {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  rightComponent?: React.ReactNode;
  showSettings?: boolean;
}

export function Header({ title, subtitle, onBack, rightComponent, showSettings = true }: HeaderProps) {
  const { strings } = useLanguage();
  const { theme } = useTheme();

  const handleSettingsPress = () => {
    try {
      router.push('/(tabs)/settings');
    } catch (error) {
      console.error('Erreur de navigation vers paramètres:', error);
    }
  };

  const handleAboutPress = () => {
    try {
      router.push('/(tabs)/about');
    } catch (error) {
      console.error('Erreur de navigation vers à propos:', error);
    }
  };

  const styles = createStyles(theme);

  return (
    <View style={[styles.container, Platform.OS === 'web' && styles.containerWeb]}>
      {/* Barre supérieure avec logo plus grand et bouton paramètres TOUJOURS visible */}
      <View style={[styles.topBar, Platform.OS === 'web' && styles.topBarWeb]}>
        <View style={styles.topBarContent}>
          {/* Logo Siemens plus grand et centré */}
          <View style={styles.logoSection}>
            <Image 
              source={require('../assets/images/Siemens-Logo.png')}
              style={[styles.logo, Platform.OS === 'web' && styles.logoWeb]}
              resizeMode="contain"
            />
          </View>
          
          {/* Icône paramètres TOUJOURS affichée (sauf si explicitement désactivée) */}
          {showSettings && (
            <View style={styles.topBarActions}>
              <TouchableOpacity 
                style={styles.topBarButton}
                onPress={handleAboutPress}
              >
                <Info size={20} color={theme.colors.primary} />
              </TouchableOpacity>
              <TouchableOpacity 
                style={styles.topBarButton}
                onPress={handleSettingsPress}
              >
                <Ionicons name="settings-outline" size={20} color={theme.colors.primary} />
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
      
      {/* Header principal avec navigation */}
      <View style={[styles.mainHeader, Platform.OS === 'web' && styles.mainHeaderWeb]}>
        <View style={styles.left}>
          {onBack && (
            <TouchableOpacity onPress={onBack} style={styles.backButton}>
              <Ionicons name="chevron-back" size={24} color={theme.colors.primary} />
            </TouchableOpacity>
          )}
          <View style={styles.titleContainer}>
            {typeof title === 'string' ? <Text style={styles.pageTitle}>{title}</Text> : title}
            {subtitle && (
              <Text style={styles.subtitle}>{subtitle}</Text>
            )}
          </View>
        </View>
        {rightComponent && (
          <View style={styles.right}>
            {rightComponent}
          </View>
        )}
      </View>
    </View>
  );
}

const createStyles = (theme: any) => StyleSheet.create({
  container: {
    backgroundColor: theme.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    paddingTop: Platform.select({
      ios: 20, // Réduire pour iOS
      android: 10, // Réduire pour Android
      web: 10, // Réduire pour web
      default: 20
    }),
  },
  containerWeb: {
    paddingTop: Platform.select({
      web: 5, // Encore plus réduit sur web
      default: 10
    }),
  },
  topBar: {
    paddingHorizontal: 12, // Réduire le padding horizontal
    paddingVertical: 4, // Réduire le padding vertical
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.separator,
  },
  topBarWeb: {
    paddingVertical: 2, // Encore plus réduit sur web
  },
  topBarContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    minHeight: 28, // Réduire la hauteur minimale
  },
  logoSection: {
    alignItems: 'center',
  },
  logo: {
    height: 24, // Logo plus petit
    width: 79,
  },
  logoWeb: {
    height: 20, // Encore plus petit sur web
    width: 66,
  },
  settingsButton: {
    position: 'absolute',
    right: 0,
    top: '50%',
    transform: [{ translateY: -8 }], // Ajuster la position
    padding: 4, // Réduire le padding
    borderRadius: 6,
    backgroundColor: theme.colors.surfaceSecondary,
  },
  topBarActions: {
    position: 'absolute',
    right: 0,
    top: '50%',
    transform: [{ translateY: -8 }], // Ajuster la position
    flexDirection: 'row',
    gap: 4, // Réduire l'espacement
  },
  topBarButton: {
    padding: 4, // Réduire le padding des boutons
    borderRadius: 6,
  },
  mainHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12, // Réduire le padding horizontal
    paddingVertical: 8, // Réduire significativement le padding vertical
  },
  mainHeaderWeb: {
    paddingVertical: 4, // Encore plus réduit sur web
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  right: {
    marginLeft: 8, // Réduire la marge
  },
  backButton: {
    marginRight: 8, // Réduire la marge
    padding: 4,
  },
  titleContainer: {
    flex: 1,
  },
  pageTitle: {
    fontSize: 22, // Réduire la taille du titre
    fontFamily: 'Inter-Bold',
    color: theme.colors.text,
  },
  subtitle: {
    fontSize: 13, // Réduire la taille du sous-titre
    fontFamily: 'Inter-Regular',
    color: theme.colors.textSecondary,
    marginTop: 1, // Réduire l'espacement
  },
});