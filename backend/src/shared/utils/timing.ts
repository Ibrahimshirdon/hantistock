// Step-level timing for diagnosing where a request's time actually goes —
// token verification vs. a Firestore read vs. a cold start — logged to
// stdout so it shows up in Render's logs without a separate APM tool.
export async function time<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const start = Date.now();
  try {
    return await fn();
  } finally {
    console.log(`[timing] ${label}: ${Date.now() - start}ms`);
  }
}
