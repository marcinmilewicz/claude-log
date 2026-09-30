import { parseZip, type Progress } from '../core/zip';
import type { Dataset } from '../core/types';

export type WorkerMessage =
  | { type: 'progress'; progress: Progress }
  | { type: 'done'; dataset: Dataset }
  | { type: 'error'; message: string };

self.onmessage = async (e: MessageEvent<{ file: File }>) => {
  const post = (m: WorkerMessage) => self.postMessage(m);
  try {
    const { file } = e.data;
    const dataset = await parseZip(file, file.name, (progress) => post({ type: 'progress', progress }));
    post({ type: 'done', dataset });
  } catch (err) {
    post({ type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
};
