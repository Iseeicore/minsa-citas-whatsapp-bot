import type { LogLevel, LogSink } from "@/lib/observability/types";

export const LOG_TIME_ZONE = "America/Lima";

export function dateFolder(at: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: LOG_TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  })
    .format(at)
    .replace(/\//g, "-");
}

export type FileSystemPort = {
  mkdir: (path: string, options: { recursive: true }) => Promise<unknown>;
  appendFile: (path: string, data: string) => Promise<void>;
};

async function nodeFileSystem(): Promise<FileSystemPort> {
  const fs = await import("node:fs/promises");
  return { mkdir: fs.mkdir, appendFile: (path, data) => fs.appendFile(path, data) };
}

export type DailyFileSink = LogSink & { flush: () => Promise<void> };

export function createDailyFileSink(options: {
  dir: string;
  now?: () => Date;
  fileSystem?: () => Promise<FileSystemPort>;
}): DailyFileSink {
  const now = options.now ?? (() => new Date());
  const loadFileSystem = options.fileSystem ?? nodeFileSystem;
  const madeFolders = new Set<string>();
  let queue: Promise<void> = Promise.resolve();

  const write = async (level: LogLevel, line: string, at: Date): Promise<void> => {
    try {
      const fs = await loadFileSystem();
      const folder = `${options.dir}/${dateFolder(at)}`;
      if (!madeFolders.has(folder)) {
        await fs.mkdir(folder, { recursive: true });
        madeFolders.add(folder);
      }
      await fs.appendFile(`${folder}/app.ndjson`, `${line}\n`);
      if (level !== "info") await fs.appendFile(`${folder}/alerts.ndjson`, `${line}\n`);
    } catch {
    }
  };

  const sink = ((level: LogLevel, line: string) => {
    const at = now();
    queue = queue.then(() => write(level, line, at));
  }) as DailyFileSink;

  sink.flush = () => queue;
  return sink;
}
