import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  StatusBar,
} from 'react-native';
import { Call } from '../../types/call.types';

interface ActiveCallProps {
  call: Call;
  onHangup: () => void;
  onMute: () => void;
  onSpeaker: () => void;
  isMuted?: boolean;
  isSpeakerOn?: boolean;
}

export const ActiveCall: React.FC<ActiveCallProps> = ({
  call,
  onHangup,
  onMute,
  onSpeaker,
  isMuted = false,
  isSpeakerOn = false,
}) => {
  const [callDuration, setCallDuration] = React.useState(0);

  React.useEffect(() => {
    const interval = setInterval(() => {
      const startTime = new Date(call.startTimeISO);
      const now = new Date();
      const duration = Math.floor((now.getTime() - startTime.getTime()) / 1000);
      setCallDuration(duration);
    }, 1000);

    return () => clearInterval(interval);
  }, [call.startTimeISO]);

  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const getStatusColor = () => {
    switch (call.status) {
      case 'active': return '#4CAF50';
      case 'connecting': return '#FF9800';
      case 'ringing': return '#2196F3';
      default: return '#666';
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={getStatusColor()} />
      
      <View style={[styles.header, { backgroundColor: getStatusColor() }]}>
        <View style={styles.callInfo}>
          <Text style={styles.phoneNumber}>
            {call.phoneNumber || call.calledUri || 'Unknown'}
          </Text>
          <Text style={styles.callStatus}>
            {call.status === 'active' ? formatDuration(callDuration) : call.status}
          </Text>
          <Text style={styles.callDirection}>
            {call.direction === 'outbound' ? 'Outgoing call' : 'Incoming call'}
          </Text>
        </View>
      </View>

      <View style={styles.content}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {(call.phoneNumber || call.calledUri || 'U').charAt(0).toUpperCase()}
          </Text>
        </View>

        <View style={styles.callDetails}>
          <Text style={styles.callerName}>
            {call.callerName || `Call ${call.direction === 'outbound' ? 'to' : 'from'} ${call.phoneNumber || call.calledUri}`}
          </Text>
          <Text style={styles.callTime}>
            Started at {new Date(call.startTimeISO).toLocaleTimeString()}
          </Text>
        </View>
      </View>

      <View style={styles.controls}>
        <View style={styles.controlRow}>
          <TouchableOpacity
            style={[styles.controlButton, styles.secondaryButton, isMuted && styles.activeButton]}
            onPress={onMute}
          >
            <Text style={[styles.controlButtonText, isMuted && styles.activeButtonText]}>
              {isMuted ? '🔇' : '🎤'}
            </Text>
            <Text style={[styles.controlLabel, isMuted && styles.activeButtonText]}>
              {isMuted ? 'Unmute' : 'Mute'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.controlButton, styles.hangupButton]}
            onPress={onHangup}
          >
            <Text style={styles.hangupButtonText}>📞</Text>
            <Text style={styles.hangupLabel}>End Call</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.controlButton, styles.secondaryButton, isSpeakerOn && styles.activeButton]}
            onPress={onSpeaker}
          >
            <Text style={[styles.controlButtonText, isSpeakerOn && styles.activeButtonText]}>
              {isSpeakerOn ? '🔊' : '🔈'}
            </Text>
            <Text style={[styles.controlLabel, isSpeakerOn && styles.activeButtonText]}>
              {isSpeakerOn ? 'Speaker' : 'Speaker'}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.additionalControls}>
          <TouchableOpacity style={[styles.controlButton, styles.tertiaryButton]}>
            <Text style={styles.controlButtonText}>⌨️</Text>
            <Text style={styles.controlLabel}>Keypad</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.controlButton, styles.tertiaryButton]}>
            <Text style={styles.controlButtonText}>📹</Text>
            <Text style={styles.controlLabel}>Video</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.controlButton, styles.tertiaryButton]}>
            <Text style={styles.controlButtonText}>➕</Text>
            <Text style={styles.controlLabel}>Add Call</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a1a',
  },
  header: {
    paddingVertical: 20,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  callInfo: {
    alignItems: 'center',
  },
  phoneNumber: {
    fontSize: 24,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 4,
  },
  callStatus: {
    fontSize: 16,
    color: 'white',
    opacity: 0.9,
    marginBottom: 2,
  },
  callDirection: {
    fontSize: 14,
    color: 'white',
    opacity: 0.7,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  avatar: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#333',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 30,
  },
  avatarText: {
    fontSize: 48,
    fontWeight: 'bold',
    color: 'white',
  },
  callDetails: {
    alignItems: 'center',
  },
  callerName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: 'white',
    textAlign: 'center',
    marginBottom: 8,
  },
  callTime: {
    fontSize: 14,
    color: '#ccc',
  },
  controls: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  controlRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    marginBottom: 30,
  },
  additionalControls: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  controlButton: {
    alignItems: 'center',
    padding: 15,
  },
  secondaryButton: {
    backgroundColor: '#444',
    borderRadius: 35,
    width: 70,
    height: 70,
    justifyContent: 'center',
  },
  tertiaryButton: {
    backgroundColor: '#333',
    borderRadius: 30,
    width: 60,
    height: 60,
    justifyContent: 'center',
  },
  hangupButton: {
    backgroundColor: '#f44336',
    borderRadius: 40,
    width: 80,
    height: 80,
    justifyContent: 'center',
  },
  activeButton: {
    backgroundColor: '#2196F3',
  },
  controlButtonText: {
    fontSize: 24,
    color: 'white',
  },
  activeButtonText: {
    color: 'white',
  },
  hangupButtonText: {
    fontSize: 32,
    color: 'white',
    transform: [{ rotate: '135deg' }],
  },
  controlLabel: {
    fontSize: 12,
    color: '#ccc',
    marginTop: 5,
  },
  hangupLabel: {
    fontSize: 12,
    color: 'white',
    marginTop: 5,
  },
});

export default ActiveCall;