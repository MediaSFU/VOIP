import { useState, useCallback, useEffect, useRef } from 'react';
import { callLogger } from '../utils/logger';
import { Call } from '../types/call.types';
import { storage } from '../utils/storage';

export interface CallHistoryHook {
  callHistory: Call[];
  addCallToHistory: (call: Call) => void;
  markCallAsTerminated: (sipCallId: string) => void;
  markCallsAsTerminated: (activeSipCallIds: string[]) => void;
  clearCallHistory: () => void;
  clearSpecificCallFromHistory: (sipCallId: string) => void;
  clearMultipleCallsFromHistory: (sipCallIds: string[]) => void;
  loadCallHistory: () => void;
  getCallHistoryStats: () => {
    totalCalls: number;
    activeCalls: number;
    completedCalls: number;
    failedCalls: number;
    averageDuration: number;
    totalDuration: number;
    connectedCalls: number;
    connectionRate: number;
    todaysCalls: number;
    thisWeeksCalls: number;
    inboundCalls: number;
    outboundCalls: number;
    missedCalls: number;
  };
}

const MAX_HISTORY_RECORDS = 1000;
const STORAGE_KEY = 'voip_call_history';

export const useCallHistory = (): CallHistoryHook => {
  const [callHistory, setCallHistory] = useState<Call[]>([]);
  // Prevent writes with empty state before initial load completes
  const hasLoadedRef = useRef(false);
  // Avoid redundant writes and empty wipe races
  const lastPersistedHashRef = useRef<string | null>(null);

  const saveCallHistory = useCallback(async (history: Call[]) => {
    try {
      if (!hasLoadedRef.current) {
        return;
      }

      // Prevent accidental wipe: if new is empty but existing storage has entries, skip
      if (!history || history.length === 0) {
        const existingRaw = await storage.getItem(STORAGE_KEY);
        if (existingRaw) {
          try {
            const existingParsed = JSON.parse(existingRaw) as Call[];
            if (Array.isArray(existingParsed) && existingParsed.length > 0) {
              return;
            }
          } catch {
            // If existing is corrupted, allow overwrite with empty to reset
          }
        }
      }

      const nextHash = JSON.stringify(history);
      if (lastPersistedHashRef.current === nextHash) {
        // No changes to persist
        return;
      }
      await storage.setItem(STORAGE_KEY, nextHash);
      lastPersistedHashRef.current = nextHash;
    } catch (error) {
      callLogger.error('Error saving call history:', error);
    }
  }, []);

  const loadCallHistory = useCallback(async () => {
    try {
      const savedHistory = await storage.getItem(STORAGE_KEY);
      if (savedHistory) {
        const parsed = JSON.parse(savedHistory) as Call[];
        setCallHistory(parsed);
        lastPersistedHashRef.current = savedHistory;
      }
      hasLoadedRef.current = true;
    } catch (error) {
      callLogger.error('Error loading call history:', error);
      setCallHistory([]);
      hasLoadedRef.current = true;
    }
  }, []);

  useEffect(() => {
    loadCallHistory();
  }, [loadCallHistory]);

  const addCallToHistory = useCallback(async (call: Call) => {
    // Upsert by sipCallId (preferred) or id (fallback)
    const key = call.sipCallId || call.id;
    if (!key) {
      return; // skip calls without identifiers
    }

    // Normalize minimal fields
    const normalized: Call = {
      ...call,
    };

    // Merge/Upsert while preserving most recent at top (by startTimeISO when present)
    const existingIndex = callHistory.findIndex(
      (c) => (c.sipCallId && c.sipCallId === call.sipCallId) || (c.id && c.id === call.id)
    );

    let updated = [...callHistory];
    if (existingIndex >= 0) {
      // Merge fields – prefer latest truthy values
      const merged: Call = {
        ...updated[existingIndex],
        ...normalized,
        // If status moved to a terminal state, keep it
        status: normalized.status || updated[existingIndex].status,
        durationSeconds:
          typeof normalized.durationSeconds === 'number'
            ? normalized.durationSeconds
            : updated[existingIndex].durationSeconds,
        startTimeISO: normalized.startTimeISO || updated[existingIndex].startTimeISO,
  endTime: normalized.endTime || updated[existingIndex].endTime,
      } as Call;
      updated[existingIndex] = merged;
    } else {
      updated = [normalized, ...updated];
    }

    // Sort by start time desc when present
    updated = updated
      .slice(0, MAX_HISTORY_RECORDS)
      .sort((a, b) => {
        const ta = a.startTimeISO ? new Date(a.startTimeISO).getTime() : 0;
        const tb = b.startTimeISO ? new Date(b.startTimeISO).getTime() : 0;
        return tb - ta;
      });

    setCallHistory(updated);
    callLogger.debug('Updated call history count:', updated.length);
    await saveCallHistory(updated);
  }, [callHistory, saveCallHistory]);

  const markCallAsTerminated = useCallback(async (identifier: string) => {
    // Avoid wiping storage with [] if initial load not finished
    if (!hasLoadedRef.current && callHistory.length === 0) {
      return;
    }
    const now = new Date();
    const updatedHistory = callHistory.map(call => {
      if ((call.sipCallId && call.sipCallId === identifier) || (call.id && call.id === identifier)) {
        const start = call.startTimeISO ? new Date(call.startTimeISO).getTime() : undefined;
        const end = call.endTime ? new Date(call.endTime).getTime() : now.getTime();
        const duration = start && end && end > start ? Math.floor((end - start) / 1000) : call.durationSeconds;
        return {
          ...call,
          status: 'ended' as const,
          endTime: call.endTime || now,
          durationSeconds: typeof duration === 'number' ? duration : call.durationSeconds,
        } as Call;
      }
      return call;
    });
    setCallHistory(updatedHistory);
    await saveCallHistory(updatedHistory);
  }, [callHistory, saveCallHistory]);

  const markCallsAsTerminated = useCallback(async (activeSipCallIds: string[]) => {
    // Avoid wiping storage with [] if initial load not finished
    if (!hasLoadedRef.current && callHistory.length === 0) {
      return;
    }
    const now = new Date();
    const activeSet = new Set(activeSipCallIds.filter(Boolean));
    const updatedHistory = callHistory.map(call => {
      // Only mark calls that are NOT in active set and are not already terminal
      const statusLower = (call.status || '').toLowerCase();
      const isTerminal = ['ended', 'completed', 'failed', 'rejected', 'terminated'].includes(statusLower);
      if (!activeSet.has(call.sipCallId) && !isTerminal) {
        const start = call.startTimeISO ? new Date(call.startTimeISO).getTime() : undefined;
        const end = call.endTime ? new Date(call.endTime).getTime() : now.getTime();
        const duration = start && end && end > start ? Math.floor((end - start) / 1000) : call.durationSeconds;
        return {
          ...call,
          status: 'ended' as const,
          endTime: call.endTime || now,
          durationSeconds: typeof duration === 'number' ? duration : call.durationSeconds,
        } as Call;
      }
      return call;
    });
    setCallHistory(updatedHistory);
    await saveCallHistory(updatedHistory);
  }, [callHistory, saveCallHistory]);

  const clearCallHistory = useCallback(async () => {
    setCallHistory([]);
    await storage.removeItem(STORAGE_KEY);
  }, []);

  const clearSpecificCallFromHistory = useCallback(async (sipCallId: string) => {
    const updatedHistory = callHistory.filter(call => call.sipCallId !== sipCallId);
    setCallHistory(updatedHistory);
    await saveCallHistory(updatedHistory);
  }, [callHistory, saveCallHistory]);

  const clearMultipleCallsFromHistory = useCallback(async (sipCallIds: string[]) => {
    const updatedHistory = callHistory.filter(call => !sipCallIds.includes(call.sipCallId));
    setCallHistory(updatedHistory);
    await saveCallHistory(updatedHistory);
  }, [callHistory, saveCallHistory]);

  const getCallHistoryStats = useCallback(() => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const thisWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const totalCalls = callHistory.length;
    const activeCalls = callHistory.filter(call => 
      call.status === 'active' || call.status === 'ringing' || call.status === 'connecting'
    ).length;
    const completedCalls = callHistory.filter(call => 
      call.status === 'completed' || call.status === 'ended'
    ).length;
    const failedCalls = callHistory.filter(call => 
      call.status === 'failed' || call.status === 'rejected'
    ).length;

    const inboundCalls = callHistory.filter(call => 
      call.direction === 'incoming' || call.direction === 'inbound'
    ).length;
    const outboundCalls = callHistory.filter(call => 
      call.direction === 'outgoing' || call.direction === 'outbound'
    ).length;
    const missedCalls = callHistory.filter(call => 
      (call.status || '').toLowerCase() === 'missed'
    ).length;

    const connectedCalls = callHistory.filter(call => 
      call.status === 'completed' || call.status === 'ended' || call.status === 'active'
    ).length;
    const connectionRate = totalCalls > 0 ? (connectedCalls / totalCalls) * 100 : 0;

    const totalDuration = callHistory.reduce((sum, call) => {
      return sum + (call.durationSeconds || 0);
    }, 0);
    const averageDuration = connectedCalls > 0 ? totalDuration / connectedCalls : 0;

    const todaysCalls = callHistory.filter(call => {
      if (!call.startTimeISO) return false;
      const callDate = new Date(call.startTimeISO);
      return callDate >= today;
    }).length;

    const thisWeeksCalls = callHistory.filter(call => {
      if (!call.startTimeISO) return false;
      const callDate = new Date(call.startTimeISO);
      return callDate >= thisWeek;
    }).length;

    return {
      totalCalls,
      activeCalls,
      completedCalls,
      failedCalls,
      averageDuration,
      totalDuration,
      connectedCalls,
      connectionRate,
      todaysCalls,
      thisWeeksCalls,
      inboundCalls,
      outboundCalls,
      missedCalls,
    };
  }, [callHistory]);

  return {
    callHistory,
    addCallToHistory,
    markCallAsTerminated,
    markCallsAsTerminated,
    clearCallHistory,
    clearSpecificCallFromHistory,
    clearMultipleCallsFromHistory,
    loadCallHistory,
    getCallHistoryStats,
  };
};