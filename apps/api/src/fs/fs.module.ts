import { Module } from '@nestjs/common';
import { FsController } from './fs.controller.js';

@Module({
  controllers: [FsController],
})
export class FsModule {}
