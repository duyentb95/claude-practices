export class NumberUtil {
  static checkNaN(val: number): number {
    return !isFinite(val) ? 0 : val;
  }
}
