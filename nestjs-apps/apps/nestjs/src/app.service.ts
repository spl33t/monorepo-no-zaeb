import { Injectable } from '@nestjs/common';
import { greet } from '@monorepo/hello';

@Injectable()
export class AppService {
  getHello(): string {
    return `🚀 nestjs API | ${greet('nestjs')}`;
  }
}
