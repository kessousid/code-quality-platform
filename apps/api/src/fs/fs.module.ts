import { Module } from '@nestjs/common';
import { BullMqDirectoryBrowseQueueRegistry, createRedisConnection } from '@cqp/queue';
import { DIRECTORY_BROWSE_QUEUE_REGISTRY } from '../tokens.js';
import { FsController } from './fs.controller.js';

@Module({
  controllers: [FsController],
  providers: [
    {
      // Real BullMQ producer, one real (queue, QueueEvents) pair per workerId (see docs/adr/0031, docs/adr/0032) — mirrors the other queue registries' wiring.
      provide: DIRECTORY_BROWSE_QUEUE_REGISTRY,
      useFactory: () => {
        const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';
        const connection = createRedisConnection(redisUrl);
        return new BullMqDirectoryBrowseQueueRegistry(connection);
      },
    },
  ],
})
export class FsModule {}
