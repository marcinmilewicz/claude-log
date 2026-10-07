import { mergeDatasets } from '../core/merge';
import { parseZip, type Progress } from '../core/zip';
import type { Dataset } from '../core/types';

export type WorkerMessage =
  | { type: 'progress'; progress: Progress }
  | { type: 'done'; dataset: Dataset }
  | { type: 'error'; message: string };

self.onmessage = async (e: MessageEvent<{ files: File[] }>) => {
  const post = (m: WorkerMessage) => self.postMessage(m);
  try {
    const parsed: Dataset[] = [];
    for (const file of e.data.files) parsed.push(await parseZip(file, file.name, (progress) => post({ type: 'progress', progress })));
    post({ type: 'done', dataset: mergeDatasets(parsed) });
  } catch (err) {
    post({ type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
};
