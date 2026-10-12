export class BudgetExceededError extends Error {
  constructor(limitUsd: number, spentUsd: number) {
    super(
      `budget exceeded: spent $${spentUsd.toFixed(2)} of $${limitUsd.toFixed(2)}`,
    );
    this.name = "BudgetExceededError";
  }
}

export class Budget {
  readonly limitUsd: number;
  #spentUsd = 0;

  constructor(limitUsd: number) {
    this.limitUsd = limitUsd;
  }

  get spent(): number {
    return this.#spentUsd;
  }

  get remaining(): number {
    return Math.max(0, this.limitUsd - this.#spentUsd);
  }

  assertAvailable(): void {
    if (this.#spentUsd >= this.limitUsd) {
      throw new BudgetExceededError(this.limitUsd, this.#spentUsd);
    }
  }

  /** Records the actual cost of a call, even if it pushes spending past the limit. */
  record(costUsd: number): void {
    if (costUsd < 0) {
      throw new Error(`cost must not be negative, got ${costUsd}`);
    }
    this.#spentUsd += costUsd;
  }
}
