import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Linking, Platform, Clipboard } from 'react-native';
import { Info, ChevronRight, Shield, Smartphone, CircleCheck as CheckCircle, FileText, Calculator, Sparkles, X, Download, Share, Plus } from 'lucide-react-native';
import { Header } from '@/components/Header';
import { Button } from '@/components/Button';
import * as WebBrowser from 'expo-web-browser';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useModal } from '@/contexts/ModalContext';
import { useAuth } from '@/contexts/AuthContext';
import { useInstallPrompt } from '@/hooks/useInstallPrompt';
import { AndroidInstallTutorial, IOSInstallTutorial } from '@/components/InstallPrompt';

export default function AboutScreen() {
  const { strings } = useLanguage();
  const { theme } = useTheme();
  const { logout } = useAuth();
  const { showModal } = useModal();
  const { showInstallButton, handleInstallClick, isInstalled, isIOSDevice } = useInstallPrompt();

  const appVersion = "2.1.1";

  const handleVersionPress = () => {
    showModal(<VersionModal appVersion={appVersion} />);
  };

  const handlePrivacyPress = () => {
    showModal(<PrivacyModal />);
  };

  const handleCalculationsPress = () => {
    showModal(<CalculationsModal />);
  };

  const handleUpcomingFeaturesPress = () => {
    showModal(<UpcomingFeaturesModal />);
  };

  const handleInstallTutorialPress = () => {
    // Détecter le type d'appareil
    const userAgent = navigator.userAgent.toLowerCase();
    const isIOSDevice = /iphone|ipad|ipod/.test(userAgent) || 
                       (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const isAndroidDevice = /android/i.test(userAgent);
    
    if (isIOSDevice) {
      showModal(<IOSInstallTutorial />);
    } else if (isAndroidDevice) {
      showModal(<AndroidInstallTutorial />);
    } else {
      // Sur PC, afficher un message informatif
      showModal(<DesktopInstallInfoModal />);
    }
  };

  const handleContactPress = () => {
    showModal(<ContactDeveloperModal />);
  };

  const handleLinkedInPress = () => {
    showModal(<LinkedInModal />);
  };

  const handleLogout = () => {
    showModal(<LogoutAboutModal />);
  };

  const confirmLogout = async () => {
    try {
      await logout();
    } catch (error) {
      console.error('Erreur lors de la déconnexion:', error);
    }
  };

  const handleOpenPDF = async () => {
    try {
      const pdfUrl = 'https://www.anitec.fr/wp-content/uploads/2017/04/VN_INCENDIE_NFS_61-933.pdf';
      
      if (Platform.OS === 'web') {
        window.open(pdfUrl, '_blank');
      } else {
        const result = await WebBrowser.openBrowserAsync(pdfUrl);
        
        if (result.type === 'cancel' || result.type === 'dismiss')  {
          console.log('Navigateur fermé');
        }
      }
    } catch (error) {
      console.error('Erreur lors de l\'ouverture du PDF:', error);
      Alert.alert(
        strings.error,
        strings.pdfOpenError,
        [{ text: strings.ok }]
      );
    }
  };

  const renderInfoItem = (icon: React.ReactNode, title: string, subtitle?: string, onPress?: () => void) => (
    <TouchableOpacity 
      style={styles.infoItem} 
      onPress={onPress}
      disabled={!onPress}
    >
      <View style={styles.infoItemLeft}>
        <View style={styles.iconContainer}>
          {icon}
        </View>
        <View style={styles.infoTextContainer}>
          <Text style={styles.infoTitle}>{title}</Text>
          {subtitle && <Text style={styles.infoSubtitle}>{subtitle}</Text>}
        </View>
      </View>
      {onPress && (
        <ChevronRight size={20} color={theme.colors.textTertiary} />
      )}
    </TouchableOpacity>
  );

  const styles = createStyles(theme);

  return (
    <View style={styles.container}>
      <Header title={strings.aboutTitle} subtitle={strings.aboutSubtitle} />
      
      <View style={{ flex: 1 }}>
        <ScrollView 
          style={styles.content} 
          contentContainerStyle={[
            styles.contentContainer,
            Platform.OS === 'web' && styles.contentContainerWeb
          ]}
          showsVerticalScrollIndicator={false}
        >
          {/* En-tête de l'application */}
          <View style={styles.appHeader}>
            <View style={styles.appIconContainer}>
              <Info size={48} color={theme.colors.primary} />
            </View>
            <Text style={styles.appTitle}>
              Siemens CalcConform
            </Text>
            <Text style={styles.developer}>{strings.developedBy}</Text>
            <Text style={styles.copyright}>{strings.copyright}</Text>
          </View>

          {(showInstallButton || (isIOSDevice && !isInstalled)) && Platform.OS === 'web' && (
            <View style={styles.installSection}>
              <TouchableOpacity 
                style={styles.installItem} 
                onPress={isIOSDevice ? undefined : handleInstallClick}
                disabled={isIOSDevice}
              >
                <View style={styles.installItemLeft}>
                  <View style={styles.installIconContainer}>
                    <Download size={20} color={theme.colors.success} />
                  </View>
                  <View style={styles.infoTextContainer}>
                    <Text style={styles.installTitle}>
                      {isIOSDevice ? 'Installation disponible' : 'Installer l\'application'}
                    </Text>
                    <Text style={styles.installSubtitle}>
                      {isIOSDevice 
                        ? 'Utilisez le bouton Partager > Ajouter à l\'écran d\'accueil'
                        : 'Ajouter à l\'écran d\'accueil pour un accès rapide'
                      }
                    </Text>
                  </View>
                </View>
                {!isIOSDevice && (
                  <ChevronRight size={20} color={theme.colors.textTertiary} />
                )}
              </TouchableOpacity>
            </View>
          )}

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{strings.application}</Text>
            
            {Platform.OS === 'web' && renderInfoItem(
              <Download size={20} color={theme.colors.success} />,
              'Installer l\'application',
              'Ajouter à l\'écran d\'accueil',
              handleInstallTutorialPress
            )}
            
            {renderInfoItem(
              <Smartphone size={20} color={theme.colors.primary} />,
              strings.version,
              `${strings.version} ${appVersion}`,
              handleVersionPress
            )}


            {renderInfoItem(
              <Shield size={20} color={theme.colors.primary} />,
              strings.privacy,
              strings.dataProtection,
              handlePrivacyPress
            )}
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{strings.compliance}</Text>
            
            {renderInfoItem(
              <FileText size={20} color={theme.colors.primary} />,
              'NF S61-933 Annexe H',
              strings.consultDocument,
              handleOpenPDF
            )}

            {renderInfoItem(
              <Calculator size={20} color={theme.colors.success} />,
              strings.complianceCalculations,
              'Formules et algorithmes utilisés',
              handleCalculationsPress
            )}
          </View>

          <View style={styles.section}>
            <Button
              title={strings.contactDeveloper}
              onPress={handleContactPress}
              variant="secondary"
            />
            <Button
              title="Profil LinkedIn"
              onPress={handleLinkedInPress}
              variant="secondary"
              style={styles.linkedinButton}
            />
            <Button
              title="Se déconnecter"
              onPress={handleLogout}
              variant="danger"
              style={styles.linkedinButton}
            />
          </View>
        </ScrollView>
      </View>
    </View>
  );
}

// Modal de déconnexion depuis la page À propos
function LogoutAboutModal() {
  const { theme } = useTheme();
  const { hideModal } = useModal();
  const { logout } = useAuth();
  const styles = createStyles(theme);

  const handleConfirm = async () => {
    try {
      await logout();
      hideModal();
    } catch (error) {
      console.error('Erreur lors de la déconnexion:', error);
      hideModal();
    }
  };

  return (
    <View style={styles.modalContent}>
      <View style={styles.modalHeader}>
        <Shield size={32} color={theme.colors.error} />
        <Text style={styles.modalTitle}>Confirmer la déconnexion</Text>
        <TouchableOpacity 
          onPress={hideModal}
          style={styles.closeButton}
        >
          <X size={20} color={theme.colors.textSecondary} />
        </TouchableOpacity>
      </View>
      
      <View style={styles.contactContent}>
        <Text style={styles.contactIntro}>
          Êtes-vous sûr de vouloir vous déconnecter de l'application ?
        </Text>
        
        <Text style={styles.contactEncouragement}>
          Vous devrez saisir à nouveau le code d'authentification pour accéder à l'application. Vos données resteront sauvegardées sur cet appareil.
        </Text>
      </View>

      <View style={styles.contactButtons}>
        <Button
          title="Annuler"
          onPress={hideModal}
          variant="secondary"
          style={styles.contactButton}
        />
        <Button
          title="Se déconnecter"
          onPress={handleConfirm}
          variant="danger"
          style={styles.contactButton}
        />
      </View>
    </View>
  );
}

// Modal pour PC/Desktop
function DesktopInstallInfoModal() {
  const { theme } = useTheme();
  const { hideModal } = useModal();
  const styles = createStyles(theme);

  return (
    <View style={styles.modalContent}>
      <View style={styles.modalHeader}>
        <Smartphone size={32} color={theme.colors.primary} />
        <Text style={styles.modalTitle}>Installation sur ordinateur</Text>
        <TouchableOpacity 
          onPress={hideModal}
          style={styles.closeButton}
        >
          <X size={20} color={theme.colors.textSecondary} />
        </TouchableOpacity>
      </View>
      
      <View style={styles.contactContent}>
        <Text style={styles.contactIntro}>
          CalcConform est optimisé pour les appareils mobiles (smartphones et tablettes).
        </Text>
        
        <Text style={styles.contactEncouragement}>
          Pour une meilleure expérience, utilisez l'application sur votre téléphone ou tablette où vous pourrez l'installer comme une vraie application.
        </Text>
      </View>
      
      <Button
        title="Compris"
        onPress={hideModal}
        style={styles.modalButton}
      />
    </View>
  );
}

// Composants modaux séparés
function VersionModal({ appVersion }: { appVersion: string }) {
  const { strings } = useLanguage();
  const { theme } = useTheme();
  const { hideModal } = useModal();
  const styles = createStyles(theme);

  return (
    <View style={styles.modalContent}>
      <View style={styles.modalHeader}>
        <CheckCircle size={32} color={theme.colors.success} />
        <Text style={styles.modalTitle}>{strings.appUpToDate}</Text>
      </View>
      <Text style={styles.modalText}>
        {strings.appUpToDate}.{'\n'}
        {strings.currentVersion} : {appVersion}
      </Text>
      <Button
        title={strings.ok}
        onPress={hideModal}
        style={styles.modalButton}
      />
    </View>
  );
}

function PrivacyModal() {
  const { strings } = useLanguage();
  const { theme } = useTheme();
  const { hideModal } = useModal();
  const styles = createStyles(theme);

  return (
    <View style={styles.modalContent}>
      <View style={styles.modalHeader}>
        <Shield size={32} color={theme.colors.primary} />
        <Text style={styles.modalTitle}>{strings.privacyTitle}</Text>
        <TouchableOpacity 
          onPress={hideModal}
          style={styles.closeButton}
        >
          <X size={20} color={theme.colors.textSecondary} />
        </TouchableOpacity>
      </View>
      
      <View style={styles.privacyContent}>
        <View style={styles.privacyItem}>
          <Text style={styles.privacyItemTitle}>🔒 {strings.dataProtectionTitle}</Text>
          <Text style={styles.privacyItemText}>Données stockées localement uniquement.</Text>
        </View>
        
        <View style={styles.privacyItem}>
          <Text style={styles.privacyItemTitle}>💾 {strings.localStorageTitle}</Text>
          <Text style={styles.privacyItemText}>Aucune transmission vers des serveurs externes.</Text>
        </View>
        
        <View style={styles.privacyWarning}>
          <Text style={styles.privacyWarningTitle}>⚠️ {strings.unofficialApp}</Text>
          <Text style={styles.privacyWarningText}>Application non approuvée officiellement.</Text>
        </View>
      </View>
      
      <Button
        title={strings.understood}
        onPress={hideModal}
        style={styles.modalButton}
      />
    </View>
  );
}

function CalculationsModal() {
  const { strings } = useLanguage();
  const { theme } = useTheme();
  const { hideModal } = useModal();
  const styles = createStyles(theme);

  return (
    <View style={styles.modalContent}>
      <View style={styles.modalHeader}>
        <Calculator size={32} color={theme.colors.success} />
        <Text style={styles.modalTitle}>Calculs de conformité</Text>
        <TouchableOpacity 
          onPress={hideModal}
          style={styles.closeButton}
        >
          <X size={20} color={theme.colors.textSecondary} />
        </TouchableOpacity>
      </View>
      
      <ScrollView 
        style={styles.modalScrollView} 
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.modalScrollContent}
      >
        {/* Formule principale */}
        <View style={styles.calculationSection}>
          <Text style={styles.calculationTitle}>📐 Formule de calcul de l'écart</Text>
          <View style={styles.formulaContainer}>
            <Text style={styles.formulaText}>
              Écart (%) = ((Débit mesuré - Débit de référence) / Débit de référence) × 100
            </Text>
          </View>
          <Text style={styles.calculationDescription}>
            Cette formule calcule l'écart relatif entre la valeur mesurée et la valeur de référence, exprimé en pourcentage.
          </Text>
        </View>

        {/* Critères de conformité */}
        <View style={styles.calculationSection}>
          <Text style={styles.calculationTitle}>⚖️ Critères de conformité NF S61-933 Annexe H</Text>
          
          <View style={styles.criteriaContainer}>
            <View style={styles.criteriaItem}>
              <View style={[styles.criteriaIndicator, { backgroundColor: '#10B981' }]} />
              <View style={styles.criteriaContent}>
                <Text style={styles.criteriaLabel}>Fonctionnel (|Écart| ≤ 10%)</Text>
                <Text style={styles.criteriaDescription}>
                  Un écart inférieur à ±10% entre les valeurs retenues lors de l'essai fonctionnel et les valeurs de référence conduit au constat du fonctionnement attendu du système de désenfumage mécanique.
                </Text>
              </View>
            </View>

            <View style={styles.criteriaItem}>
              <View style={[styles.criteriaIndicator, { backgroundColor: '#F59E0B' }]} />
              <View style={styles.criteriaContent}>
                <Text style={styles.criteriaLabel}>Acceptable (10% {'<'} |Écart| ≤ 20%)</Text>
                <Text style={styles.criteriaDescription}>
                  Un écart compris entre ±10% et ±20% conduit à signaler cette dérive, par une proposition d'action corrective à l'exploitant ou au chef d'établissement.
                </Text>
              </View>
            </View>

            <View style={styles.criteriaItem}>
              <View style={[styles.criteriaIndicator, { backgroundColor: '#EF4444' }]} />
              <View style={styles.criteriaContent}>
                <Text style={styles.criteriaLabel}>Non conforme (|Écart| {'>'} 20%)</Text>
                <Text style={styles.criteriaDescription}>
                  Un écart supérieur à ±20% doit conduire à une action corrective obligatoire, la valeur étant jugée non conforme à la mise en service.
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* Exemples de calcul */}
        <View style={styles.calculationSection}>
          <Text style={styles.calculationTitle}>🧮 Exemples de calcul</Text>
          
          <View style={styles.exampleContainer}>
            <Text style={styles.exampleTitle}>Exemple 1 : Volet fonctionnel</Text>
            <Text style={styles.exampleData}>
              • Débit de référence : 5000 m³/h{'\n'}
              • Débit mesuré : 4900 m³/h
            </Text>
            <Text style={styles.exampleCalculation}>
              Écart = ((4900 - 5000) / 5000) × 100 = -2%
            </Text>
            <Text style={styles.exampleResult}>
              ✅ Résultat : <Text style={{ color: '#10B981', fontWeight: 'bold' }}>Fonctionnel</Text> (|2%| ≤ 10%)
            </Text>
          </View>

          <View style={styles.exampleContainer}>
            <Text style={styles.exampleTitle}>Exemple 2 : Volet acceptable</Text>
            <Text style={styles.exampleData}>
              • Débit de référence : 3000 m³/h{'\n'}
              • Débit mesuré : 3450 m³/h
            </Text>
            <Text style={styles.exampleCalculation}>
              Écart = ((3450 - 3000) / 3000) × 100 = +15%
            </Text>
            <Text style={styles.exampleResult}>
              ⚠️ Résultat : <Text style={{ color: '#F59E0B', fontWeight: 'bold' }}>Acceptable</Text> (10% {'<'} |15%| ≤ 20%)
            </Text>
          </View>

          <View style={styles.exampleContainer}>
            <Text style={styles.exampleTitle}>Exemple 3 : Volet non conforme</Text>
            <Text style={styles.exampleData}>
              • Débit de référence : 4000 m³/h{'\n'}
              • Débit mesuré : 3000 m³/h
            </Text>
            <Text style={styles.exampleCalculation}>
              Écart = ((3000 - 4000) / 4000) × 100 = -25%
            </Text>
            <Text style={styles.exampleResult}>
              ❌ Résultat : <Text style={{ color: '#EF4444', fontWeight: 'bold' }}>Non conforme</Text> (|25%| {'>'} 20%)
            </Text>
          </View>
        </View>

        {/* Algorithme de validation */}
        <View style={styles.calculationSection}>
          <Text style={styles.calculationTitle}>🔧 Algorithme de validation</Text>
          <View style={styles.algorithmContainer}>
            <Text style={styles.algorithmStep}>1. Vérification des données d'entrée</Text>
            <Text style={styles.algorithmDetail}>   • Débit de référence > 0</Text>
            <Text style={styles.algorithmDetail}>   • Débit mesuré ≥ 0</Text>
            
            <Text style={styles.algorithmStep}>2. Calcul de l'écart relatif</Text>
            <Text style={styles.algorithmDetail}>   • Écart = ((Mesuré - Référence) / Référence) × 100</Text>
            
            <Text style={styles.algorithmStep}>3. Détermination du statut</Text>
            <Text style={styles.algorithmDetail}>   • Si |Écart| ≤ 10% → Fonctionnel</Text>
            <Text style={styles.algorithmDetail}>   • Si 10% {'<'} |Écart| ≤ 20% → Acceptable</Text>
            <Text style={styles.algorithmDetail}>   • Si |Écart| {'>'} 20% → Non conforme</Text>
          </View>
        </View>

        {/* Note technique */}
        <View style={styles.technicalNote}>
          <Text style={styles.technicalNoteTitle}>📋 Note technique</Text>
          <Text style={styles.technicalNoteText}>
            Les calculs sont effectués en temps réel lors de la saisie des données. L'application utilise la précision JavaScript standard (IEEE 754) et arrondit les résultats à une décimale pour l'affichage.
            {'\n\n'}
            La conformité est évaluée selon les critères officiels de la norme française NF S61-933 Annexe H, version en vigueur.
          </Text>
        </View>
      </ScrollView>

      <Button
        title={strings.understood}
        onPress={hideModal}
        style={styles.modalButton}
      />
    </View>
  );
}

function ContactDeveloperModal() {
  const { strings } = useLanguage();
  const { theme } = useTheme();
  const { hideModal } = useModal();
  const styles = createStyles(theme);

  const developerEmail = 'aimeric.krol@siemens.com';
  const emailSubject = 'Contact depuis CalcConform';
  const emailBody = 'Bonjour,\n\nJe vous contacte concernant l\'application CalcConform.\n\n';

  const handleSendEmail = async () => {
    try {
      const mailtoUrl = `mailto:${developerEmail}?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailBody)}`;
      
      if (Platform.OS === 'web') {
        window.open(mailtoUrl, '_blank');
      } else {
        const canOpen = await Linking.canOpenURL(mailtoUrl);
        if (canOpen) {
          await Linking.openURL(mailtoUrl);
        } else {
          Alert.alert('Erreur', 'Impossible d\'ouvrir l\'application email');
        }
      }
    } catch (error) {
      console.error('Erreur lors de l\'ouverture de l\'email:', error);
      Alert.alert('Erreur', 'Impossible d\'ouvrir l\'application email');
    }
  };

  const handleCopyEmail = async () => {
    try {
      if (Platform.OS === 'web') {
        await navigator.clipboard.writeText(developerEmail);
      } else {
        Clipboard.setString(developerEmail);
      }
      Alert.alert('Succès', 'Adresse email copiée dans le presse-papiers');
    } catch (error) {
      console.error('Erreur lors de la copie:', error);
      Alert.alert('Erreur', 'Impossible de copier l\'adresse email');
    }
  };

  return (
    <View style={styles.modalContent}>
      <View style={styles.modalHeader}>
        <Info size={32} color={theme.colors.primary} />
        <Text style={styles.modalTitle}>Contacter le développeur</Text>
        <TouchableOpacity 
          onPress={hideModal}
          style={styles.closeButton}
        >
          <X size={20} color={theme.colors.textSecondary} />
        </TouchableOpacity>
      </View>
      
      <View style={styles.contactContent}>
        <Text style={styles.contactIntro}>
          Vous avez des questions, suggestions ou rencontrez un problème ? N'hésitez pas à me contacter !
        </Text>
        
        <View style={styles.contactInfo}>
          <Text style={styles.contactLabel}>Email :</Text>
          <Text style={styles.contactEmail}>{developerEmail}</Text>
        </View>
        
        <Text style={styles.contactEncouragement}>
          Vos retours sont précieux pour améliorer l'application et ajouter de nouvelles fonctionnalités utiles.
        </Text>
      </View>

      <View style={styles.contactButtons}>
        <Button
          title="Envoyer un email"
          onPress={handleSendEmail}
          style={[styles.contactButton, { marginBottom: 8 }]}
        />
        <Button
          title="Copier l'email"
          onPress={handleCopyEmail}
          variant="secondary"
          style={styles.contactButton}
        />
      </View>
    </View>
  );
}

// Modal pour LinkedIn
function LinkedInModal() {
  const { theme } = useTheme();
  const { hideModal } = useModal();
  const styles = createStyles(theme);

  const linkedInUrl = 'https://www.linkedin.com/in/aimeric-krol-11850a254/?originalSubdomain=fr';

  const handleOpenLinkedIn = async () => {
    try {
      if (Platform.OS === 'web') {
        window.open(linkedInUrl, '_blank');
      } else {
        const canOpen = await Linking.canOpenURL(linkedInUrl);
        if (canOpen) {
          await Linking.openURL(linkedInUrl);
        } else {
          Alert.alert('Erreur', 'Impossible d\'ouvrir LinkedIn');
        }
      }
    } catch (error) {
      console.error('Erreur lors de l\'ouverture de LinkedIn:', error);
      Alert.alert('Erreur', 'Impossible d\'ouvrir LinkedIn');
    }
  };

  const handleCopyLinkedIn = async () => {
    try {
      if (Platform.OS === 'web') {
        await navigator.clipboard.writeText(linkedInUrl);
      } else {
        Clipboard.setString(linkedInUrl);
      }
      Alert.alert('Succès', 'Lien LinkedIn copié dans le presse-papiers');
    } catch (error) {
      console.error('Erreur lors de la copie:', error);
      Alert.alert('Erreur', 'Impossible de copier le lien LinkedIn');
    }
  };

  return (
    <View style={styles.modalContent}>
      <View style={styles.modalHeader}>
        <Info size={32} color={theme.colors.primary} />
        <Text style={styles.modalTitle}>Profil LinkedIn</Text>
        <TouchableOpacity 
          onPress={hideModal}
          style={styles.closeButton}
        >
          <X size={20} color={theme.colors.textSecondary} />
        </TouchableOpacity>
      </View>
      
      <View style={styles.contactContent}>
        <Text style={styles.contactIntro}>
          Accédez à mon profil LinkedIn juste ici
        </Text>
        
        <View style={styles.contactInfo}>
          <Text style={styles.contactLabel}>LinkedIn :</Text>
          <Text style={styles.contactEmail}>Aimeric Krol</Text>
        </View>
        
        <Text style={styles.contactEncouragement}>
        </Text>
      </View>

      <View style={styles.contactButtons}>
        <Button
          title="Ouvrir LinkedIn"
          onPress={handleOpenLinkedIn}
          style={[styles.contactButton, { marginBottom: 8 }]}
        />
        <Button
          title="Copier le lien"
          onPress={handleCopyLinkedIn}
          variant="secondary"
          style={styles.contactButton}
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
  contentContainer: {
    padding: 16,
  },
  contentContainerWeb: {
    paddingBottom: Platform.OS === 'web' ? 100 : 16,
  },
  appHeader: {
    alignItems: 'center',
    paddingVertical: 32,
    marginBottom: 24,
  },
  appIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 20,
    backgroundColor: theme.colors.primary + '20',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  appTitle: {
    fontSize: 20,
    fontFamily: 'Inter-SemiBold',
    color: theme.colors.text,
    textAlign: 'center',
    marginBottom: 8,
    lineHeight: 28,
  },
  developer: {
    fontSize: 16,
    fontFamily: 'Inter-Medium',
    color: theme.colors.primary,
    marginBottom: 8,
  },
  copyright: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    color: theme.colors.textSecondary,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontFamily: 'Inter-SemiBold',
    color: theme.colors.text,
    marginBottom: 12,
  },
  infoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  infoItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: theme.colors.primary + '20',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  infoTextContainer: {
    flex: 1,
  },
  infoTitle: {
    fontSize: 16,
    fontFamily: 'Inter-Medium',
    color: theme.colors.text,
  },
  infoSubtitle: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  installItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.colors.success + '20',
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
    borderWidth: 1,
    borderColor: theme.colors.success + '40',
  },
  installItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  installIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: theme.colors.success + '20',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  installTitle: {
    fontSize: 16,
    fontFamily: 'Inter-Medium',
    color: theme.colors.success,
  },
  installSubtitle: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    color: theme.colors.success,
    marginTop: 2,
    opacity: 0.8,
  },
  installSection: {
    marginBottom: 24,
  },
  modalContent: {
    backgroundColor: theme.colors.surface,
    borderRadius: 16,
    padding: 20,
    width: '100%',
    maxWidth: 350,
    maxHeight: '75%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 20,
    fontFamily: 'Inter-SemiBold',
    color: theme.colors.text,
    flex: 1,
    marginLeft: 12,
  },
  closeButton: {
    padding: 8,
  },
  modalScrollView: {
    maxHeight: 250,
    marginBottom: 16,
  },
  modalScrollContent: {
    paddingBottom: 10,
  },
  modalText: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    color: theme.colors.textSecondary,
    lineHeight: 20,
    marginBottom: 20,
  },
  modalBold: {
    fontFamily: 'Inter-SemiBold',
    color: theme.colors.text,
  },
  modalButton: {
    marginTop: 8,
  },

  // Styles pour le modal de confidentialité
  privacyContent: {
    marginBottom: 16,
  },
  privacyItem: {
    marginBottom: 10,
    backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  privacyItemTitle: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    color: theme.colors.text,
    marginBottom: 8,
  },
  privacyItemText: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    color: theme.colors.textSecondary,
    lineHeight: 20,
  },
  privacyWarning: {
    backgroundColor: theme.colors.warning + '15',
    borderRadius: 8,
    padding: 12,
    borderLeftWidth: 3,
    borderLeftColor: theme.colors.warning,
    borderWidth: 1,
    borderColor: theme.colors.warning + '40',
  },
  privacyWarningTitle: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    color: theme.colors.warning,
    marginBottom: 8,
  },
  privacyWarningText: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    color: theme.colors.warning,
    lineHeight: 20,
  },

  // Styles pour le contenu des calculs
  calculationSection: {
    marginBottom: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.separator,
  },
  calculationTitle: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    color: theme.colors.text,
    marginBottom: 10,
  },
  formulaContainer: {
    backgroundColor: theme.colors.primary + '20',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    borderLeftWidth: 4,
    borderLeftColor: theme.colors.success,
  },
  formulaText: {
    fontSize: 13,
    fontFamily: 'Inter-Medium',
    color: theme.colors.primary,
    textAlign: 'center',
  },
  calculationDescription: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    color: theme.colors.textSecondary,
    lineHeight: 16,
  },
  criteriaContainer: {
    gap: 10,
  },
  criteriaItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  criteriaIndicator: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginTop: 3,
  },
  criteriaContent: {
    flex: 1,
  },
  criteriaLabel: {
    fontSize: 13,
    fontFamily: 'Inter-SemiBold',
    color: theme.colors.text,
    marginBottom: 3,
  },
  criteriaDescription: {
    fontSize: 11,
    fontFamily: 'Inter-Regular',
    color: theme.colors.textSecondary,
    lineHeight: 15,
  },
  exampleContainer: {
    backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: 8,
    padding: 10,
    marginBottom: 10,
  },
  exampleTitle: {
    fontSize: 13,
    fontFamily: 'Inter-SemiBold',
    color: theme.colors.text,
    marginBottom: 5,
  },
  exampleData: {
    fontSize: 11,
    fontFamily: 'Inter-Regular',
    color: theme.colors.textSecondary,
    marginBottom: 3,
  },
  exampleCalculation: {
    fontSize: 11,
    fontFamily: 'Inter-Medium',
    color: theme.colors.primary,
    marginBottom: 5,
    fontStyle: 'italic',
  },
  exampleResult: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
    color: theme.colors.text,
  },
  algorithmContainer: {
    backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: 8,
    padding: 10,
  },
  algorithmStep: {
    fontSize: 12,
    fontFamily: 'Inter-SemiBold',
    color: theme.colors.text,
    marginTop: 6,
    marginBottom: 3,
  },
  algorithmDetail: {
    fontSize: 11,
    fontFamily: 'Inter-Regular',
    color: theme.colors.textSecondary,
    marginBottom: 2,
  },
  technicalNote: {
    backgroundColor: theme.colors.warning + '20',
    borderRadius: 8,
    padding: 10,
    borderLeftWidth: 4,
    borderLeftColor: theme.colors.warning,
  },
  technicalNoteTitle: {
    fontSize: 13,
    fontFamily: 'Inter-SemiBold',
    color: theme.colors.warning,
    marginBottom: 5,
  },
  technicalNoteText: {
    fontSize: 11,
    fontFamily: 'Inter-Regular',
    color: theme.colors.warning,
    lineHeight: 15,
  },

  // Styles pour le modal de contact
  contactContent: {
    marginBottom: 20,
  },
  contactIntro: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    color: theme.colors.textSecondary,
    lineHeight: 20,
    marginBottom: 16,
    textAlign: 'center',
  },
  contactInfo: {
    backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  contactLabel: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
    color: theme.colors.textSecondary,
    marginBottom: 4,
  },
  contactEmail: {
    fontSize: 14,
    fontFamily: 'Inter-SemiBold',
    color: theme.colors.primary,
  },
  contactEncouragement: {
    fontSize: 13,
    fontFamily: 'Inter-Regular',
    color: theme.colors.textSecondary,
    lineHeight: 18,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  contactButtons: {
    gap: 8,
  },
  contactButton: {
    width: '100%',
  },
  linkedinButton: {
    marginTop: 12,
  },
});