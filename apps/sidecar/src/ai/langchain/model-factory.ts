import { ChatOpenAI } from '@langchain/openai';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { OpenAIEmbeddings } from '@langchain/openai';
import { GoogleGenerativeAIEmbeddings } from '@langchain/google-genai';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { Embeddings } from '@langchain/core/embeddings';
import type { ProviderProfile } from './provider-config';

type GenerationOpts = {
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  modelId?: string | null;
};

function createOpenAiCompatibleChat(
  profile: ProviderProfile,
  generation: GenerationOpts | undefined,
  timeoutMs: number
): BaseChatModel {
  const model = String(generation?.modelId || profile.chatModel);
  return new ChatOpenAI({
    model,
    apiKey: profile.apiKey,
    temperature: generation?.temperature,
    maxTokens: generation?.maxTokens,
    topP: generation?.topP,
    timeout: timeoutMs,
    configuration: {
      baseURL: profile.baseUrl
    }
  });
}

function createOpenAiCompatibleEmbeddings(profile: ProviderProfile, timeoutMs: number): Embeddings {
  return new OpenAIEmbeddings({
    model: profile.embeddingModel,
    apiKey: profile.apiKey,
    timeout: timeoutMs,
    configuration: {
      baseURL: profile.baseUrl
    }
  });
}

export function createChatModel(profile: ProviderProfile, generation?: GenerationOpts): BaseChatModel {
  const timeoutMs = Number(process.env.AI_PROVIDER_TIMEOUT_MS || 90_000);

  if (profile.id === 'zhipu' || profile.id === 'deepseek') {
    return createOpenAiCompatibleChat(profile, generation, timeoutMs);
  }

  const model = String(generation?.modelId || profile.chatModel);
  return new ChatGoogleGenerativeAI({
    model,
    apiKey: profile.apiKey,
    baseUrl: profile.baseUrl,
    apiVersion: process.env.GEMINI_API_VERSION || 'v1beta',
    temperature: generation?.temperature,
    maxOutputTokens: generation?.maxTokens
  });
}

export function createEmbeddingsModel(profile: ProviderProfile): Embeddings {
  const timeoutMs = Number(process.env.AI_PROVIDER_TIMEOUT_MS || 90_000);

  if (profile.id === 'zhipu' || profile.id === 'deepseek') {
    return createOpenAiCompatibleEmbeddings(profile, timeoutMs);
  }

  return new GoogleGenerativeAIEmbeddings({
    model: profile.embeddingModel,
    apiKey: profile.apiKey,
    baseUrl: profile.baseUrl
  });
}
