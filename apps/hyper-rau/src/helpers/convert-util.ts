import { formatUnits, parseUnits } from 'ethers';

export class ConvertUtils {
  static fromGmxUnitToUsd(val): number {
    return parseFloat(parseFloat(formatUnits(val, 30)).toFixed(4));
  }

  static fromUsdToGmxUnit(val: string): string {
    return parseUnits(val, 30).toString();
  }

  static parseNumberWithFixedDecimal(val, decimal): number {
    return parseFloat(val.toFixed(decimal));
  }
  static parseNumberToStrWithFixedDecimal(
    val: number,
    decimal: number,
  ): string {
    const fixedNumber = val.toFixed(decimal);
    const splitNumber = fixedNumber.split('.');
    const decimalStr = splitNumber[1]
      ? `.${splitNumber[1].replace(/0+$/, '')}`
      : '';
    return `${splitNumber[0]}${decimalStr === '.' ? '' : `${decimalStr}`}`;
  }

  static roundToStepPrice(
    price: number,
    stepPrice: number,
    decimal: number,
  ): number {
    // Calculate the remainder when dividing price by stepPrice
    const remainder = price % stepPrice;

    // Round down or up based on the remainder
    let roundedNum;
    if (remainder < stepPrice / 2) {
      roundedNum = price - remainder;
    } else {
      roundedNum = price - remainder + stepPrice;
    }

    return this.parseNumberWithFixedDecimal(roundedNum, decimal);
  }

  static parseFloat(val: string, defaultValue = 0): number {
    try {
      return parseFloat(val);
    } catch (e) {}
    return defaultValue;
  }
}
