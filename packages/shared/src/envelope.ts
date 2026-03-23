export type OkEnvelope<T> = {
  ok: true;
  code: "SUCCESS";
  data: T;
};

export type ErrorEnvelope = {
  ok: false;
  code: string;
  message: string;
  retryable: boolean;
  nextAction?: string;
};

export type Envelope<T> = OkEnvelope<T> | ErrorEnvelope;

