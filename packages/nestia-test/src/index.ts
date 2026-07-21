import { TypedRoute } from '@nestia/core';
import { Controller } from '@nestjs/common';


@Controller()
export class TestController {
  @TypedRoute.Get('test')
  getTest() {
    return 'test';
  }
}


