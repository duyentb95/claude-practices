import { formatUnits } from 'ethers';
import * as Web3 from 'web3';
import { isAddress, toChecksumAddress } from 'web3-utils';

export class Web3Utils {
  static generateWeb3(url) {
    return new (Web3 as any)(
      new (Web3 as any).providers.HttpProvider(url, {
        timeout: 10000,
      }),
    );
  }

  static checksumAddress(address: string): string {
    try {
      return toChecksumAddress(address);
    } catch (error) {
      return address;
    }
  }

  static validateAndChecksumAddress(address: string): string {
    try {
      return toChecksumAddress(address);
    } catch (error) {
      return '';
    }
  }

  static filterInvalidAddresses(addresses: string[]): string[] {
    return addresses.filter((address) => !isAddress(address));
  }

  static formatUnitToFloat(value: string, decimals = 18) {
    return parseFloat(parseFloat(formatUnits(value, decimals)).toFixed(9));
  }

  static reverseString(str: string): string {
    return str.split('').reverse().join('');
  }

  static weiToEth(wei: string): number {
    return parseFloat((Web3 as any).utils.fromWei(wei, 'ether'));
  }

  static ethToWei(eth: string): BigInt {
    return BigInt(Web3.utils.toWei(eth, 'ether'));
  }
}
