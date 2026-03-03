export class CommonUtil {
  static unionStringArray(array: string[][]): string[] {
    return Array.from(
      new Set(
        array.reduce(function (accumulator: string[], currentItem: string[]) {
          return [...accumulator, ...currentItem];
        }),
      ),
    ).sort();
  }
}
