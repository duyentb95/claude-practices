import { BadRequestException } from '@nestjs/common';

export class TextUtil {
  static extractByRegex(val: string, regex) {
    for (let i = 0; i < 10; i++) {
      const data = regex.exec(val)?.[0];
      if (data) {
        return data;
      }
    }
    throw new BadRequestException('regex_fail');
  }
}
