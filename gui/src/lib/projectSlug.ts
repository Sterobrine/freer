const PROJECT_ID_RE = /^[a-z][a-z0-9_-]*$/;

export function slugifyProjectId(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);
  if (!slug) return '';
  return PROJECT_ID_RE.test(slug) ? slug : slug.replace(/^[^a-z]+/, '') || '';
}

export function isValidProjectId(id: string): boolean {
  return PROJECT_ID_RE.test(id.trim());
}

export function projectIdHint(id: string): string | null {
  const trimmed = id.trim();
  if (!trimmed) return '项目 ID 不能为空';
  if (!PROJECT_ID_RE.test(trimmed)) {
    return '以小写字母开头，仅含小写字母、数字、连字符或下划线';
  }
  if (trimmed.length > 32) return '最长 32 个字符';
  return null;
}
