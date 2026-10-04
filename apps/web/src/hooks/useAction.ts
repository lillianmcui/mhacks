import { useCallback, useState } from 'react';
import type { ActionInput, ActionName, ActionOutput } from '@ch4se/contracts';
import { callAction, CoreApiError } from '../data/source';

export interface ActionState<N extends ActionName> {
  pending: boolean;
  error: { code: string; message: string } | null;
  result: ActionOutput<N> | null;
  run: (body: ActionInput<N>) => Promise<void>;
}

/** Wraps a Core API action with pending/error state. Never updates rows optimistically. */
export function useAction<N extends ActionName>(name: N): ActionState<N> {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ActionState<N>['error']>(null);
  const [result, setResult] = useState<ActionOutput<N> | null>(null);

  const run = useCallback(
    async (body: ActionInput<N>) => {
      setPending(true);
      setError(null);
      try {
        setResult(await callAction(name, body));
      } catch (e) {
        setError(
          e instanceof CoreApiError ? { code: e.code, message: e.message } : { code: 'NETWORK', message: String(e) },
        );
      } finally {
        setPending(false);
      }
    },
    [name],
  );

  return { pending, error, result, run };
}
