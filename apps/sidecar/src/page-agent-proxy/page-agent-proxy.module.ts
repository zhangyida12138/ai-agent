import { Module } from '@nestjs/common';
import { PageAgentLlmProxyController } from './page-agent-llm-proxy.controller';

@Module({
  controllers: [PageAgentLlmProxyController]
})
export class PageAgentProxyModule {}
