export interface DependencyCheck {
  name: string;
  check(): Promise<void>;
}

export interface DependencyStatus {
  name: string;
  status: 'up' | 'down';
  latencyMs: number;
}
