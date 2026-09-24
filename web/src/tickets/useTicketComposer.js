import { useCallback, useEffect, useRef, useState } from 'react';
import { postTicketMessage } from './ticketsApi.js';

const initialState = {
  draft: '',
  sending: false,
  error: '',
  lastMessage: null,
};

export function useTicketComposer({
  guildId,
  ticketId,
  requireRelogin,
}) {
  const [state, setState] = useState(initialState);
  const controllerRef = useRef(null);

  useEffect(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    setState(initialState);

    return () => {
      controllerRef.current?.abort();
      controllerRef.current = null;
    };
  }, [guildId, ticketId]);

  const setDraft = useCallback(value => {
    setState(previous => ({
      ...previous,
      draft: value,
      error: '',
    }));
  }, []);

  const clearError = useCallback(() => {
    setState(previous => ({
      ...previous,
      error: '',
    }));
  }, []);

  const send = useCallback(async ({ clientMessageId, content }) => {
    if (controllerRef.current) return null;

    const controller = new AbortController();
    controllerRef.current = controller;

    setState(previous => ({
      ...previous,
      sending: true,
      error: '',
    }));

    try {
      const result = await postTicketMessage(
        guildId,
        ticketId,
        {
          clientMessageId,
          content,
        },
        controller.signal,
      );

      if (controller.signal.aborted) return null;

      setState(previous => ({
        ...previous,
        sending: false,
        error: '',
        lastMessage: result.message,
      }));

      return result.message;
    } catch (error) {
      if (controller.signal.aborted) return null;

      if (error.reloginRequired) {
        requireRelogin();
      }

      setState(previous => ({
        ...previous,
        sending: false,
        error: error.message,
      }));

      throw error;
    } finally {
      if (controllerRef.current === controller) {
        controllerRef.current = null;
      }
    }
  }, [guildId, ticketId, requireRelogin]);

  return {
    ...state,
    setDraft,
    clearError,
    send,
  };
}