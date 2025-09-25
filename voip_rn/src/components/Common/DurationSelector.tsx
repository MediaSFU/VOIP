import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  ScrollView,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';

interface DurationSelectorProps {
  selectedDuration: number;
  onDurationChange: (duration: number) => void;
  disabled?: boolean;
  style?: any;
  inline?: boolean;
  hideLabel?: boolean;
}

interface DurationOption {
  value: number;
  label: string;
  description: string;
}

const durationOptions: DurationOption[] = [
  { value: 5, label: '5 min', description: 'Quick Call' },
  { value: 15, label: '15 min', description: 'Short Meeting' },
  { value: 30, label: '30 min', description: 'Standard Call' },
  { value: 60, label: '1 hour', description: 'Extended Call' },
  { value: 120, label: '2 hours', description: 'Long Meeting' },
];

const DurationSelector: React.FC<DurationSelectorProps> = ({
  selectedDuration,
  onDurationChange,
  disabled = false,
  style,
  inline = false,
  hideLabel = false,
}) => {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  const selectedOption = durationOptions.find(option => option.value === selectedDuration) || durationOptions[0];

  const handleOptionSelect = (value: number) => {
    onDurationChange(value);
    setIsDropdownOpen(false);
  };

  return (
    <View style={[inline ? styles.containerInline : styles.container, style]}>
      {!hideLabel && (
        <Text style={inline ? styles.labelInline : styles.label}>Room Duration</Text>
      )}

      <TouchableOpacity
        style={[
          styles.dropdown,
          disabled && styles.dropdownDisabled,
          inline && styles.dropdownInline,
        ]}
        onPress={() => !disabled && setIsDropdownOpen(true)}
        disabled={disabled}
      >
        <View style={styles.dropdownContent}>
          <View style={styles.selectedOption}>
            <Text style={[
              styles.selectedLabel,
              disabled && styles.selectedLabelDisabled,
            ]}>
              {selectedOption.label}
            </Text>
          </View>
          <Ionicons
            name={isDropdownOpen ? 'chevron-up' : 'chevron-down'}
            size={20}
            color={disabled ? '#94a3b8' : '#64748b'}
          />
        </View>
      </TouchableOpacity>

      <Modal
        visible={isDropdownOpen}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setIsDropdownOpen(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setIsDropdownOpen(false)}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Duration</Text>
              <TouchableOpacity
                onPress={() => setIsDropdownOpen(false)}
                style={styles.closeButton}
              >
                <Ionicons name="close" size={24} color="#64748b" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.optionsList}>
              {durationOptions.map((option) => {
                const isSelected = selectedDuration === option.value;
                return (
                  <TouchableOpacity
                    key={option.value}
                    style={[
                      styles.optionItem,
                      isSelected && styles.optionItemSelected,
                    ]}
                    onPress={() => handleOptionSelect(option.value)}
                  >
                    <View style={styles.optionContent}>
                      <Text style={[
                        styles.optionLabel,
                        isSelected && styles.optionLabelSelected,
                      ]}>
                        {option.label}
                      </Text>
                      <Text style={[
                        styles.optionDescription,
                        isSelected && styles.optionDescriptionSelected,
                      ]}>
                        {option.description}
                      </Text>
                    </View>
                    {isSelected && (
                      <Ionicons name="checkmark" size={20} color="#667eea" />
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2d3748',
    marginBottom: 8,
  },
  dropdown: {
    backgroundColor: '#f7fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    padding: 12,
    minHeight: 44,
  },
  dropdownDisabled: {
    backgroundColor: '#f1f5f9',
    borderColor: '#cbd5e1',
    opacity: 0.6,
  },
  dropdownContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  selectedOption: {
    flex: 1,
  },
  selectedLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2d3748',
    marginBottom: 2,
  },
  selectedLabelDisabled: {
    color: '#94a3b8',
  },
  selectedDescription: {
    fontSize: 12,
    color: '#64748b',
  },
  selectedDescriptionDisabled: {
    color: '#94a3b8',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 12,
    width: '100%',
    maxWidth: 400,
    maxHeight: '80%',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 10,
    },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#2d3748',
  },
  closeButton: {
    padding: 4,
  },
  optionsList: {
    maxHeight: 300,
  },
  optionItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f7fafc',
  },
  optionItemSelected: {
    backgroundColor: '#f0f4ff',
  },
  optionContent: {
    flex: 1,
  },
  optionLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2d3748',
    marginBottom: 2,
  },
  optionLabelSelected: {
    color: '#667eea',
  },
  optionDescription: {
    fontSize: 12,
    color: '#64748b',
  },
  optionDescriptionSelected: {
    color: '#667eea',
  },
  containerInline: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 4,
  },
  labelInline: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2d3748',
    marginRight: 12,
    minWidth: 80,
  },
  dropdownInline: {
    flex: 1,
    maxWidth: 120,
  },
});

export default DurationSelector;
