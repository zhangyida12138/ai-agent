import { Module } from '@nestjs/common';
import { HealthModule } from './health/health.module';
import { ChatModule } from './chat/chat.module';
import { AuthModule } from './auth/auth.module';
import { PageAgentProxyModule } from './page-agent-proxy/page-agent-proxy.module';

@Module({
  imports: [HealthModule, ChatModule, AuthModule, PageAgentProxyModule]
})
export class AppModule {}

