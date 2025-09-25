import React from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native';

interface NotificationModalProps {
  visible: boolean;
  title: string;
  message: string;
  type?: 'success' | 'error' | 'warning' | 'info';
  onClose: () => void;
}

const NotificationModal: React.FC<NotificationModalProps> = ({
  visible,
  title,
  message,
  type = 'info',
  onClose,
}) => {
  const getTypeStyles = () => {
    switch (type) {
      case 'success':
        return { backgroundColor: '#d4edda', borderColor: '#c3e6cb', textColor: '#155724' };
      case 'error':
        return { backgroundColor: '#f8d7da', borderColor: '#f5c6cb', textColor: '#721c24' };
      case 'warning':
        return { backgroundColor: '#fff3cd', borderColor: '#ffeaa7', textColor: '#856404' };
      default:
        return { backgroundColor: '#d1ecf1', borderColor: '#bee5eb', textColor: '#0c5460' };
    }
  };

  const typeStyles = getTypeStyles();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={[styles.container, { backgroundColor: typeStyles.backgroundColor, borderColor: typeStyles.borderColor }]}>
          <Text style={[styles.title, { color: typeStyles.textColor }]}>{title}</Text>
          <Text style={[styles.message, { color: typeStyles.textColor }]}>{message}</Text>
          <TouchableOpacity style={styles.button} onPress={onClose}>
            <Text style={styles.buttonText}>OK</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  container: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 20,
    maxWidth: 300,
    width: '100%',
    borderWidth: 1,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
    textAlign: 'center',
  },
  message: {
    fontSize: 16,
    marginBottom: 20,
    textAlign: 'center',
    lineHeight: 22,
  },
  button: {
    backgroundColor: '#007bff',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignSelf: 'center',
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default NotificationModal;
