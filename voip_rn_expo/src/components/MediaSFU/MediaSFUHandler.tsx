import React, { useRef, useEffect } from "react";
import {
  CreateMediaSFURoomOptions,
  Credentials,
  JoinMediaSFURoomOptions,
  MediasfuGeneric,
  PreJoinPage,
} from "mediasfu-reactnative-expo";
import { View } from "react-native";
import AsyncStorage from '@react-native-async-storage/async-storage';
import { roomLogger } from '../../utils/logger';

export interface MediaSFUHandlerProps {
  action: "create" | "join";
  duration?: number;
  capacity?: number;
  name: string;
  meetingID?: string;
  sourceParameters: Record<string, any>;
  updateSourceParameters: (params: Record<string, any>) => void;
}

/**
 * MediaSFUHandler Component for React Native Expo
 *
 * This component handles MediaSFU room creation and joining using the official
 * mediasfu-reactnative-expo package. It operates headlessly (no UI) and integrates
 * with the MediaSFU SDK to provide real-time communication functionality.
 * 
 * Based on the working implementation from mediasfu_react_native_expo reference.
 */
const MediaSFUHandler: React.FC<MediaSFUHandlerProps> = ({
  action,
  duration,
  capacity,
  name,
  meetingID,
  sourceParameters,
  updateSourceParameters,
}) => {
  const noUIOptions = useRef<
    CreateMediaSFURoomOptions | JoinMediaSFURoomOptions | undefined
  >(undefined);

  // Stable reference to prevent re-renders
  const initializedRef = useRef(false);
  const lastPropsRef = useRef({ action, duration, capacity, name, meetingID });

  // Get credentials from AsyncStorage (React Native equivalent of localStorage)
  const getCredentials = async (): Promise<Credentials> => {
    try {
      const mediaSFUCredentials = await AsyncStorage.getItem('mediaSFUCredentials');
      if (mediaSFUCredentials) {
        const credentials = JSON.parse(mediaSFUCredentials);
        return {
          apiUserName: credentials.apiUserName || "",
          apiKey: credentials.apiKey || "",
        };
      }
    } catch (error) {
      roomLogger.error('Error getting MediaSFU credentials:', error);
    }
    return {
      apiUserName: "",
      apiKey: "",
    };
  };

  const credentials = useRef<Credentials>({ apiUserName: "", apiKey: "" });

  // Initialize credentials
  useEffect(() => {
    const initializeCredentials = async () => {
      credentials.current = await getCredentials();
    };
    initializeCredentials();
  }, []);

  // Only initialize options once or when key props change
  useEffect(() => {
    const currentProps = { action, duration, capacity, name, meetingID };
    const propsChanged = JSON.stringify(currentProps) !== JSON.stringify(lastPropsRef.current);
    
    if (initializedRef.current && !propsChanged) {
      return; // Skip re-initialization if already initialized and props haven't changed
    }

    try {

      if (action === "create") {
        // Prepare parameters for creating a room
        noUIOptions.current = {
          action: "create",
          duration: duration || 5,
          capacity: capacity || 5,
          userName: name,
          eventType: "webinar",
          supportSIP: true,
          directionSIP: "both",
        };
      } else if (action === "join") {
        if (!meetingID) {
          throw new Error("Meeting ID is required for joining a room.");
        }

        // Prepare parameters for joining a room
        noUIOptions.current = {
          action: "join",
          userName: name,
          meetingID,
        };
      } else {
        throw new Error('Invalid action. Must be either "create" or "join".');
      }

      initializedRef.current = true;
      lastPropsRef.current = currentProps;

    } catch (error) {
      roomLogger.error("Error handling MediaSFU action:", error);
    }
  }, [action, duration, capacity, name, meetingID]); // Only re-run when these key props change

  return (
    <View
      style={{
        width: 0,
        height: 0,
        maxHeight: 0,
        maxWidth: 0,
        overflow: "hidden",
      }}
    >
      {noUIOptions.current && (
        <MediasfuGeneric
          PrejoinPage={(options: any) => <PreJoinPage {...options} />}
          sourceParameters={sourceParameters}
          updateSourceParameters={updateSourceParameters}
          returnUI={false}
          noUIPreJoinOptions={noUIOptions.current}
          connectMediaSFU={true}
          credentials={credentials.current}
        />
      )}
    </View>
  );
};
export default MediaSFUHandler;