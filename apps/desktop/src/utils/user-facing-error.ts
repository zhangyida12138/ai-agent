/** 与 packages/shared/src/user-facing-error.ts 保持文案一致 */
export const GENERIC_SERVER_ERROR_MESSAGE = '服务器似乎出现了点问题，请稍后再试。';

const USER_FACING_MESSAGES: Readonly<Record<string, string>> = {
  UNAUTHORIZED: '请先登录',
  FORBIDDEN: '无权访问该会话',
  INVALID_CREDENTIALS: '用户名或密码错误',
  USER_EXISTS: '用户名已存在',
  NOT_FOUND: '找不到对应内容',
  INVALID_PARAMS: '请检查填写的内容',
  REQUEST_ENTITY_TOO_LARGE: '上传内容体积过大',
  IMPORT_FAILED: '导入失败',
  REGISTER_FAILED: '注册失败',
  INVALID_IMPORT_PAYLOAD: '导入数据格式无效',
  DOC_NOT_FOUND: '文档不存在',
  CONVERSATION_NOT_FOUND: '会话不存在',
  AVATAR_TOO_LARGE: '图片过大（最大 1MB）',
  AUTH_FIELDS_REQUIRED: '用户名和密码必填',
  REGISTER_INVALID: '用户名不能为空且密码至少 6 位'
};

export function resolveUserFacingMessage(code: string): string {
  return USER_FACING_MESSAGES[code] ?? GENERIC_SERVER_ERROR_MESSAGE;
}

export function logClientError(context: string, detail: unknown) {
  console.error(`[client:${context}]`, detail);
}

export function messageFromEnvelope(resp: { ok: false; code: string; message: string }): string {
  const msg = resolveUserFacingMessage(resp.code);
  if (msg === GENERIC_SERVER_ERROR_MESSAGE) {
    logClientError('api-envelope', { code: resp.code, message: resp.message });
  }
  return msg;
}
