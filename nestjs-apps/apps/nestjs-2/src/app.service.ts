import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHello(): string {
    return `🚀 nestjs-2 API is running!`;
  }
}
