import { Module } from '@nestjs/common';
import { ChatController } from './chat.controller';
import { KnowledgeController } from '../knowledge/knowledge.controller';

@Module({
  controllers: [ChatController, KnowledgeController]
})
export class ChatModule {}

