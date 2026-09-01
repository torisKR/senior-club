export const DATABASE_HEALTH_PROBE = Symbol("DATABASE_HEALTH_PROBE");

export interface DatabaseHealthProbe {
  ping(): Promise<void>;
}

