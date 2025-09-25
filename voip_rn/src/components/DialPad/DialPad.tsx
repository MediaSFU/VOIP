import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Vibration,
} from 'react-native';

interface DialPadProps {
  onNumberPress: (number: string) => void;
  onCallPress: () => void;
  onDeletePress: () => void;
  disabled?: boolean;
  currentNumber: string;
}

const dialPadNumbers = [
  [
    { number: '1', letters: '' },
    { number: '2', letters: 'ABC' },
    { number: '3', letters: 'DEF' },
  ],
  [
    { number: '4', letters: 'GHI' },
    { number: '5', letters: 'JKL' },
    { number: '6', letters: 'MNO' },
  ],
  [
    { number: '7', letters: 'PQRS' },
    { number: '8', letters: 'TUV' },
    { number: '9', letters: 'WXYZ' },
  ],
  [
    { number: '*', letters: '' },
    { number: '0', letters: '+' },
    { number: '#', letters: '' },
  ],
];

export const DialPad: React.FC<DialPadProps> = ({
  onNumberPress,
  onCallPress,
  onDeletePress,
  disabled = false,
  currentNumber,
}) => {
  const handleNumberPress = (number: string) => {
    if (disabled) {return;}

    // Provide haptic feedback
    Vibration.vibrate(50);
    onNumberPress(number);
  };

  const handleLongPressZero = () => {
    if (disabled) {return;}

    // Long press on 0 adds +
    Vibration.vibrate(100);
    onNumberPress('+');
  };

  const handleDeletePress = () => {
    if (disabled || currentNumber.length === 0) {return;}

    Vibration.vibrate(50);
    onDeletePress();
  };

  const handleCallPress = () => {
    if (disabled || currentNumber.length === 0) {return;}

    Vibration.vibrate(100);
    onCallPress();
  };

  return (
    <View style={styles.container}>
      <View style={styles.dialPadContainer}>
        {dialPadNumbers.map((row, rowIndex) => (
          <View key={rowIndex} style={styles.row}>
            {row.map((item) => (
              <TouchableOpacity
                key={item.number}
                style={[
                  styles.numberButton,
                  disabled && styles.disabledButton,
                ]}
                onPress={() => handleNumberPress(item.number)}
                onLongPress={item.number === '0' ? handleLongPressZero : undefined}
                disabled={disabled}
                activeOpacity={0.7}
              >
                <Text style={[styles.numberText, disabled && styles.disabledText]}>
                  {item.number}
                </Text>
                {item.letters ? (
                  <Text style={[styles.lettersText, disabled && styles.disabledText]}>
                    {item.letters}
                  </Text>
                ) : null}
              </TouchableOpacity>
            ))}
          </View>
        ))}
      </View>

      <View style={styles.actionButtons}>
        <TouchableOpacity
          style={[styles.actionButton, styles.deleteButton]}
          onPress={handleDeletePress}
          disabled={disabled || currentNumber.length === 0}
          activeOpacity={0.7}
        >
          <Text style={[
            styles.actionButtonText,
            (disabled || currentNumber.length === 0) && styles.disabledText,
          ]}>
            ⌫
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.actionButton,
            styles.callButton,
            (disabled || currentNumber.length === 0) && styles.disabledCallButton,
          ]}
          onPress={handleCallPress}
          disabled={disabled || currentNumber.length === 0}
          activeOpacity={0.8}
        >
          <Text style={[
            styles.callButtonText,
            (disabled || currentNumber.length === 0) && styles.disabledText,
          ]}>
            📞
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionButton, styles.optionsButton]}
          disabled={disabled}
          activeOpacity={0.7}
        >
          <Text style={[styles.actionButtonText, disabled && styles.disabledText]}>
            ⋯
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  dialPadContainer: {
    flex: 1,
    justifyContent: 'center',
    maxHeight: 400,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 20,
  },
  numberButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#f5f5f5',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  disabledButton: {
    backgroundColor: '#e0e0e0',
    shadowOpacity: 0.05,
    elevation: 2,
  },
  numberText: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#333',
  },
  lettersText: {
    fontSize: 12,
    color: '#666',
    marginTop: -5,
    fontWeight: '500',
  },
  disabledText: {
    color: '#999',
  },
  actionButtons: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    marginTop: 30,
    paddingBottom: 20,
  },
  actionButton: {
    width: 70,
    height: 70,
    borderRadius: 35,
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteButton: {
    backgroundColor: '#ff5722',
  },
  callButton: {
    backgroundColor: '#4CAF50',
    width: 80,
    height: 80,
    borderRadius: 40,
  },
  disabledCallButton: {
    backgroundColor: '#c8e6c9',
  },
  optionsButton: {
    backgroundColor: '#2196F3',
  },
  actionButtonText: {
    fontSize: 24,
    color: 'white',
    fontWeight: 'bold',
  },
  callButtonText: {
    fontSize: 28,
    color: 'white',
    fontWeight: 'bold',
  },
});

export default DialPad;
