/** 后台回传敏感字段时的占位；提交时若仍为此值则跳过写入 */
export const SECRET_MASK = '********';

export function maskSecret(value: string | null | undefined): string {
  if (!value) return '';
  return SECRET_MASK;
}

export function isSecretMask(value: string | null | undefined): boolean {
  return String(value || '') === SECRET_MASK;
}
