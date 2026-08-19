import { safePublicDiagnostic } from "../protocol/warnings.js";

export interface VideoErrorOptions {
  code: string;
  status?: number;
  requestId?: string;
  runId?: string;
  recoverable?: boolean;
}

/** A safe, actionable error returned by a VanillaSky video endpoint. */
export class VideoError extends Error {
  readonly code: string;
  readonly status?: number;
  readonly requestId?: string;
  readonly runId?: string;
  readonly recoverable?: boolean;

  constructor(message: string, options: VideoErrorOptions) {
    super(safePublicDiagnostic(message, "Video response failed"));
    this.name = "VideoError";
    this.code = /^[a-z][a-z0-9_]{0,63}$/.test(options.code) ? options.code : "video_failed";
    this.status = options.status;
    this.requestId = options.requestId?.slice(0, 128);
    this.runId = options.runId?.slice(0, 128);
    this.recoverable = options.recoverable;
  }
}
