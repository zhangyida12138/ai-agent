import type { Request, Response } from 'express';

export function createClientAbortSignal(req: Request, res: Response): AbortSignal {
  const controller = new AbortController();
  const abort = () => {
    if (!controller.signal.aborted) {
      controller.abort(new Error('client disconnected'));
    }
  };
  req.on('aborted', abort);
  req.on('close', abort);
  res.on('close', abort);
  return controller.signal;
}

export function isClientAbortError(err: unknown, signal?: AbortSignal): boolean {
  if (signal?.aborted) return true;
  if (!err || typeof err !== 'object') return false;
  const name = String((err as { name?: string }).name ?? '');
  if (name === 'AbortError') return true;
  const code = String((err as { code?: string }).code ?? '');
  return code === 'ABORTED' || code === 'ERR_STREAM_PREMATURE_CLOSE' || code === 'ECONNRESET';
}
