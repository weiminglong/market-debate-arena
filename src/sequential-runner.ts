export function createSequentialRunner<TArgs extends unknown[], TResult>(
  fn: (...args: TArgs) => Promise<TResult>
): (...args: TArgs) => Promise<TResult> {
  let queue: Promise<unknown> = Promise.resolve();

  return (...args: TArgs): Promise<TResult> => {
    const run = queue.then(() => fn(...args));

    // Keep queue alive regardless of individual call failures.
    queue = run.then(
      () => undefined,
      () => undefined
    );

    return run;
  };
}
