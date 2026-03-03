export class AsyncUtil {
  static async awaitTimeout(delay: number, reason?: any) {
    return new Promise((resolve) =>
      setTimeout(
        () => (reason === undefined ? resolve(undefined) : resolve(reason)),
        delay,
      ),
    );
  }

  static async wrapPromise(promise: any, delay: number, reason?: any) {
    return Promise.race([promise, this.awaitTimeout(delay, reason)]);
  }
}
