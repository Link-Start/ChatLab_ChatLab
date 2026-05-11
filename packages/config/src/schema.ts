/**
 * 配置 Zod Schema 定义
 *
 * 同时服务于 TOML 文件校验和环境变量解析。
 */

import { z } from 'zod'

export const llmConfigSchema = z.object({
  provider: z.string().default(''),
  api_key: z.string().default(''),
  model: z.string().default(''),
  base_url: z.string().default(''),
})

export const dataConfigSchema = z.object({
  dir: z.string().default(''),
})

export const apiConfigSchema = z.object({
  port: z.number().int().min(1).max(65535).default(3210),
  host: z.string().default('127.0.0.1'),
})

export const localeConfigSchema = z.object({
  lang: z.string().default('zh-CN'),
})

export const configSchema = z.object({
  llm: llmConfigSchema.default({}),
  data: dataConfigSchema.default({}),
  api: apiConfigSchema.default({}),
  locale: localeConfigSchema.default({}),
})

export type ChatLabConfig = z.infer<typeof configSchema>
export type LlmConfig = z.infer<typeof llmConfigSchema>
export type DataConfig = z.infer<typeof dataConfigSchema>
export type ApiConfig = z.infer<typeof apiConfigSchema>
export type LocaleConfig = z.infer<typeof localeConfigSchema>
