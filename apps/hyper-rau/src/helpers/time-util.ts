const TIMESTAMP_1_DAY = 24 * 60 * 60 * 1000;

export class TimeUtil {
  static async sleep(ms) {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }

  static convertBlockchainTimeStamp(timeStamp: number) {
    return new Date(timeStamp * 1000);
  }

  static toStartOfDate(date: Date | number) {
    return typeof date === 'number'
      ? new Date(new Date(date).setHours(0, 0, 0, 0))
      : new Date(new Date(date.getTime()).setHours(0, 0, 0, 0));
  }

  static toEndOfDate(date: Date) {
    return new Date(new Date(date.getTime()).setHours(23, 59, 59, 0));
  }

  static toWeekOfDate(date: Date) {
    const day = this.toStartOfDate(date);
    // Make Sunday's day number 7
    const dayNum = day.getDay() || 7;
    // Thursday in current week decides the year. Thursday 's day number is 4.
    day.setDate(day.getDate() + 4 - dayNum);
    const yearStart = new Date(day.getFullYear(), 0, 1);
    const days = (day.getTime() - yearStart.getTime()) / TIMESTAMP_1_DAY + 1;
    return Math.ceil(days / 7);
  }
}
