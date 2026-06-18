import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { api } from '../../api/client';
import { isValidProjectId, slugifyProjectId } from '../../lib/projectSlug';

const schema = z.object({
  name: z.string().trim().min(1, '请输入项目名称').max(40, '名称过长'),
  id: z
    .string()
    .trim()
    .min(1, '请输入项目 ID')
    .max(32, 'ID 过长')
    .refine(isValidProjectId, '以小写字母开头，仅含小写字母、数字、连字符或下划线'),
  description: z.string().max(200, '描述过长').optional(),
});

type FormValues = z.infer<typeof schema>;

type Props = {
  open: boolean;
  existingIds: string[];
  onClose: () => void;
  onCreated: (projectId: string) => void;
};

export function CreateProjectModal({ open, existingIds, onClose, onCreated }: Props) {
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    setError,
    reset,
    formState: { errors, isValid },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    mode: 'onChange',
    defaultValues: { name: '', id: '', description: '' },
  });

  const name = watch('name');
  const id = watch('id');
  const description = watch('description') ?? '';

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) reset();
  }, [open, reset]);

  const create = useMutation({
    mutationFn: (values: FormValues) =>
      api.createProject(values.id.trim(), values.name.trim(), values.description?.trim() ?? ''),
    onSuccess: (project) => {
      onCreated(project.id);
      onClose();
    },
    onError: (e: Error) => setError('root', { message: e.message }),
  });

  if (!open) return null;

  const suggestId = () => {
    const next = slugifyProjectId(name);
    if (next) setValue('id', next, { shouldValidate: true, shouldDirty: true });
  };

  const onSubmit = handleSubmit((values) => {
    if (existingIds.includes(values.id.trim())) {
      setError('id', { message: '该 ID 已被占用' });
      return;
    }
    create.mutate(values);
  });

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/60"
        aria-label="关闭"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-project-title"
        className="relative w-full max-w-md overflow-hidden rounded-lg border border-surface-border bg-surface"
      >
        <div className="border-b border-surface-border px-4 py-3">
          <h2 id="create-project-title" className="text-sm font-semibold">
            新建项目
          </h2>
          <p className="mt-1 text-xs text-[#6b7280]">
            每个项目有独立的事件、动作与模板目录
          </p>
        </div>

        <form onSubmit={onSubmit} className="space-y-3 px-4 py-4">
          <div>
            <label className="label" htmlFor="project-name">项目名称</label>
            <input
              id="project-name"
              className="input"
              placeholder="例如：枫之谷日常"
              autoFocus
              {...register('name')}
              onBlur={() => {
                if (!id.trim() && name.trim()) suggestId();
              }}
            />
            {errors.name && <p className="mt-1 text-xs text-red-300">{errors.name.message}</p>}
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between gap-2">
              <label className="label mb-0" htmlFor="project-id">项目 ID</label>
              <button
                type="button"
                className="text-xs text-[#9aa3b2] hover:text-accent"
                onClick={suggestId}
              >
                从名称生成
              </button>
            </div>
            <input
              id="project-id"
              className="input font-mono text-sm"
              placeholder="maple-daily"
              {...register('id')}
            />
            <p className="mt-1 text-xs text-[#6b7280]">目录名，创建后不可修改</p>
            {errors.id && <p className="mt-1 text-xs text-red-300">{errors.id.message}</p>}
          </div>

          <div>
            <label className="label" htmlFor="project-desc">描述（可选）</label>
            <textarea
              id="project-desc"
              className="input min-h-[68px] resize-none"
              placeholder="简要说明用途…"
              maxLength={200}
              {...register('description')}
            />
            <p className="mt-1 text-right text-xs text-[#6b7280]">{description.length}/200</p>
          </div>

          {errors.root && (
            <p className="text-xs text-red-300">{errors.root.message}</p>
          )}

          <div className="flex justify-end gap-2 border-t border-surface-border pt-3">
            <button type="button" className="btn" onClick={onClose}>
              取消
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={!isValid || create.isPending}
            >
              {create.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  创建中…
                </>
              ) : (
                '创建并打开'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
