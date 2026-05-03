/**
 * Admin /admin/participants screen.
 *
 * Self-registration era: plaintext access keys are now part of every row's
 * shape and rendered in the table (with copy buttons). The post-create /
 * post-regenerate "issued keys" modal is kept for moment-of-rotation UX
 * confirmation, but its previous "save now or lose it" warning is softened —
 * keys remain visible in the table afterwards.
 */

'use client'

import { useRouter } from 'next/navigation'
import { useState, type FormEvent } from 'react'
import { CopyIcon, MoreHorizontalIcon } from 'lucide-react'
import { toast } from 'sonner'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { ApiResponse } from '@/lib/api/responses'

const NAME_MAX = 40
const ADD_MIN = 1
const ADD_MAX = 30
const ADD_DEFAULT = 1

export type ParticipantRow = {
  id: string
  displayName: string | null
  accessKey: string
  hasJoined: boolean
  lastSeenAt: string | null
  createdAt: string
}

type ParticipantsManagerProps = {
  initialParticipants: ParticipantRow[]
}

const DATE_FORMATTER = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
})

function formatDate(iso: string): string {
  // Intl.DateTimeFormat('ru-RU', short month) yields "3 мая, 21:47" on modern
  // engines. The exact glyph between date and time can vary slightly across
  // Node/V8 versions, but the parts are stable, so we leave it to the locale.
  return DATE_FORMATTER.format(new Date(iso))
}

const ERROR_MESSAGES: Record<string, string> = {
  INVALID_INPUT: 'Проверьте введённые данные',
  LIMIT_EXCEEDED: 'Достигнут лимит участников (30)',
  NOT_FOUND: 'Участник не найден',
  UNAUTHORIZED: 'Сессия истекла, войдите снова',
  FORBIDDEN: 'Недостаточно прав',
}

function fallbackError(code?: string, message?: string): string {
  if (code && ERROR_MESSAGES[code]) return ERROR_MESSAGES[code]
  if (message) return message
  return 'Что-то пошло не так. Попробуйте ещё раз.'
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

export function ParticipantsManager({ initialParticipants }: ParticipantsManagerProps) {
  const router = useRouter()
  const [rows, setRows] = useState<ParticipantRow[]>(initialParticipants)

  // Three modal states: only one at a time.
  const [addOpen, setAddOpen] = useState(false)
  const [regenTarget, setRegenTarget] = useState<ParticipantRow | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<ParticipantRow | null>(null)

  function refresh() {
    // Re-fetch the server component so any subsequent navigation sees fresh
    // data; we already update local state optimistically for the table.
    router.refresh()
  }

  async function handleRename(participantId: string, nextName: string | null): Promise<boolean> {
    const previous = rows.find((r) => r.id === participantId)?.displayName ?? null

    // Optimistic: update local state first, revert on error.
    setRows((prev) =>
      prev.map((r) => (r.id === participantId ? { ...r, displayName: nextName } : r)),
    )

    try {
      const res = await fetch(`/api/admin/participants/${participantId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ displayName: nextName }),
      })
      const body = (await res.json()) as ApiResponse<{ participant: ParticipantRow }>
      if (!res.ok || !body.ok) {
        const code = body.ok === false ? body.error.code : undefined
        const message = body.ok === false ? body.error.message : undefined
        toast.error(fallbackError(code, message))
        // Revert.
        setRows((prev) =>
          prev.map((r) => (r.id === participantId ? { ...r, displayName: previous } : r)),
        )
        return false
      }
      // Sync with server-confirmed value (handles trim, etc.).
      const confirmed = body.data.participant
      setRows((prev) => prev.map((r) => (r.id === participantId ? { ...r, ...confirmed } : r)))
      refresh()
      return true
    } catch {
      toast.error(fallbackError())
      setRows((prev) =>
        prev.map((r) => (r.id === participantId ? { ...r, displayName: previous } : r)),
      )
      return false
    }
  }

  function handleAdded(newRows: ParticipantRow[]) {
    setRows((prev) => [...prev, ...newRows])
    refresh()
  }

  function handleRegenerated() {
    refresh()
  }

  function handleDeleted(participantId: string) {
    setRows((prev) => prev.filter((r) => r.id !== participantId))
    refresh()
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle>Участники</CardTitle>
          <Button type="button" onClick={() => setAddOpen(true)}>
            Создать слот
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          <ParticipantsTable
            rows={rows}
            onRename={handleRename}
            onRegenerate={(p) => setRegenTarget(p)}
            onDelete={(p) => setDeleteTarget(p)}
          />
        </CardContent>
      </Card>

      <AddParticipantsDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        existingCount={rows.length}
        onAdded={handleAdded}
      />

      {regenTarget && (
        <RegenerateKeyDialog
          participant={regenTarget}
          onClose={() => setRegenTarget(null)}
          onSuccess={handleRegenerated}
        />
      )}

      {deleteTarget && (
        <DeleteParticipantDialog
          participant={deleteTarget}
          isLast={rows.length <= 1}
          onClose={() => setDeleteTarget(null)}
          onSuccess={() => handleDeleted(deleteTarget.id)}
        />
      )}
    </div>
  )
}

function ParticipantsTable({
  rows,
  onRename,
  onRegenerate,
  onDelete,
}: {
  rows: ParticipantRow[]
  onRename: (id: string, displayName: string | null) => Promise<boolean>
  onRegenerate: (p: ParticipantRow) => void
  onDelete: (p: ParticipantRow) => void
}) {
  if (rows.length === 0) {
    return (
      <div className="text-muted-foreground p-6 text-center text-sm">
        Пока нет участников. Поделитесь join-ссылкой или нажмите «Создать слот».
      </div>
    )
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-muted-foreground border-b text-left">
          <tr>
            <th className="px-4 py-2 font-medium">Имя</th>
            <th className="px-4 py-2 font-medium">Ключ</th>
            <th className="px-4 py-2 font-medium">Статус</th>
            <th className="px-4 py-2 font-medium">Добавлен</th>
            <th className="w-12 px-4 py-2"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.id} className="border-b last:border-b-0">
              <td className="px-4 py-2 align-middle">
                <NameCell participant={p} onRename={onRename} />
              </td>
              <td className="px-4 py-2 align-middle">
                <KeyCell accessKey={p.accessKey} />
              </td>
              <td className="px-4 py-2 align-middle">
                <StatusBadge participant={p} />
              </td>
              <td className="text-muted-foreground px-4 py-2 align-middle tabular-nums">
                {formatDate(p.createdAt)}
              </td>
              <td className="px-4 py-2 align-middle">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Действия для ${p.displayName ?? 'участника'}`}
                    >
                      <MoreHorizontalIcon />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => onRegenerate(p)}>
                      Перегенерировать ключ
                    </DropdownMenuItem>
                    <DropdownMenuItem variant="destructive" onSelect={() => onDelete(p)}>
                      Удалить
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function KeyCell({ accessKey }: { accessKey: string }) {
  async function handleCopy() {
    const ok = await copyText(accessKey)
    if (ok) toast.success('Ключ скопирован')
    else toast.error('Скопируйте вручную')
  }
  return (
    <div className="flex items-center gap-2">
      <code className="font-mono text-xs tracking-wider">{accessKey}</code>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={handleCopy}
        aria-label="Скопировать ключ"
        className="h-7 w-7"
      >
        <CopyIcon className="h-3.5 w-3.5" />
      </Button>
    </div>
  )
}

function StatusBadge({ participant }: { participant: ParticipantRow }) {
  // Three states reflect the self-registration era:
  //   - displayName + hasJoined  → registered AND signed in at least once
  //   - displayName + !hasJoined → self-registered, not yet exchanged key for cookie
  //   - !displayName             → admin-created empty slot, never used
  if (participant.displayName !== null && participant.hasJoined) {
    return <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">Активен</Badge>
  }
  if (participant.displayName !== null) {
    return <Badge className="bg-blue-600 text-white hover:bg-blue-600">Зарегистрирован</Badge>
  }
  return <Badge variant="outline">Слот</Badge>
}

function NameCell({
  participant,
  onRename,
}: {
  participant: ParticipantRow
  onRename: (id: string, displayName: string | null) => Promise<boolean>
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(participant.displayName ?? '')
  const [saving, setSaving] = useState(false)

  function startEditing() {
    setDraft(participant.displayName ?? '')
    setEditing(true)
  }

  async function commit() {
    if (saving) return
    const trimmed = draft.trim()
    const nextValue = trimmed.length === 0 ? null : trimmed
    const currentValue = participant.displayName

    if (nextValue === currentValue) {
      setEditing(false)
      return
    }
    if (nextValue && nextValue.length > NAME_MAX) {
      toast.error(`Имя должно быть не длиннее ${NAME_MAX} символов`)
      return
    }

    setSaving(true)
    const ok = await onRename(participant.id, nextValue)
    setSaving(false)
    if (ok) setEditing(false)
  }

  function cancel() {
    setDraft(participant.displayName ?? '')
    setEditing(false)
  }

  if (editing) {
    return (
      <Input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            void commit()
          } else if (e.key === 'Escape') {
            e.preventDefault()
            cancel()
          }
        }}
        maxLength={NAME_MAX}
        disabled={saving}
        className="h-8"
        aria-label="Имя участника"
      />
    )
  }

  return (
    <button
      type="button"
      onClick={startEditing}
      className="hover:bg-accent w-full rounded-sm px-2 py-1 text-left transition-colors"
      aria-label="Редактировать имя"
    >
      {participant.displayName ?? <span className="text-muted-foreground">—</span>}
    </button>
  )
}

function AddParticipantsDialog({
  open,
  onOpenChange,
  existingCount,
  onAdded,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  existingCount: number
  onAdded: (rows: ParticipantRow[]) => void
}) {
  const [count, setCount] = useState<number>(ADD_DEFAULT)
  const [pending, setPending] = useState(false)
  const [issuedKeys, setIssuedKeys] = useState<string[] | null>(null)

  const remaining = Math.max(0, ADD_MAX - existingCount)

  function handleClose(next: boolean) {
    if (pending) return
    onOpenChange(next)
    if (!next) {
      // Drop the plaintext keys from memory as soon as the modal closes.
      setIssuedKeys(null)
      setCount(ADD_DEFAULT)
    }
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!Number.isInteger(count) || count < ADD_MIN || count > ADD_MAX) {
      toast.error(`Число — целое от ${ADD_MIN} до ${ADD_MAX}`)
      return
    }
    if (existingCount + count > ADD_MAX) {
      toast.error(`Можно добавить ещё не больше ${remaining}`)
      return
    }

    setPending(true)
    try {
      const res = await fetch('/api/admin/participants', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ count }),
      })
      const body = (await res.json()) as ApiResponse<{ accessKeys: string[] }>
      if (!res.ok || !body.ok) {
        const code = body.ok === false ? body.error.code : undefined
        const message = body.ok === false ? body.error.message : undefined
        toast.error(fallbackError(code, message))
        return
      }
      setIssuedKeys(body.data.accessKeys)
      // We don't have new ParticipantRow objects here — the server-side
      // listing has them. Push placeholder rows so the table reflects the
      // count immediately; the router.refresh() inside onAdded will replace
      // them with authoritative rows. The accessKey is real (returned by the
      // POST), only the synthetic id and createdAt get reconciled on refresh.
      const placeholders: ParticipantRow[] = body.data.accessKeys.map((key, i) => ({
        id: `pending-${Date.now()}-${i}`,
        displayName: null,
        accessKey: key,
        hasJoined: false,
        lastSeenAt: null,
        createdAt: new Date().toISOString(),
      }))
      onAdded(placeholders)
    } catch {
      toast.error(fallbackError())
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent>
        {issuedKeys ? (
          <IssuedKeysView title="Новые ключи" keys={issuedKeys} onDone={() => handleClose(false)} />
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Создать слот</DialogTitle>
              <DialogDescription>
                Слот — это пустое место для участника. Слот получит ключ сразу, имя — при первом
                входе ИЛИ когда вы его впишете.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="participants-count">Сколько слотов?</Label>
                <Input
                  id="participants-count"
                  type="number"
                  min={ADD_MIN}
                  max={Math.max(ADD_MIN, remaining)}
                  value={Number.isFinite(count) ? count : ''}
                  onChange={(e) => setCount(e.target.valueAsNumber)}
                  required
                  disabled={pending || remaining === 0}
                  autoFocus
                />
                <p className="text-muted-foreground text-xs">
                  Сейчас {existingCount} из {ADD_MAX}. Можно добавить ещё {remaining}.
                </p>
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => handleClose(false)}
                  disabled={pending}
                >
                  Отмена
                </Button>
                <Button type="submit" disabled={pending || remaining === 0}>
                  {pending ? 'Создаём…' : 'Создать'}
                </Button>
              </DialogFooter>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

function RegenerateKeyDialog({
  participant,
  onClose,
  onSuccess,
}: {
  participant: ParticipantRow
  onClose: () => void
  onSuccess: () => void
}) {
  const [pending, setPending] = useState(false)
  const [issuedKey, setIssuedKey] = useState<string | null>(null)

  function handleOpenChange(next: boolean) {
    if (pending) return
    if (!next) {
      setIssuedKey(null)
      onClose()
    }
  }

  async function handleConfirm() {
    setPending(true)
    try {
      const res = await fetch(`/api/admin/participants/${participant.id}/regenerate`, {
        method: 'POST',
      })
      const body = (await res.json()) as ApiResponse<{ accessKey: string }>
      if (!res.ok || !body.ok) {
        const code = body.ok === false ? body.error.code : undefined
        const message = body.ok === false ? body.error.message : undefined
        toast.error(fallbackError(code, message))
        return
      }
      setIssuedKey(body.data.accessKey)
      onSuccess()
    } catch {
      toast.error(fallbackError())
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open onOpenChange={handleOpenChange}>
      <DialogContent>
        {issuedKey ? (
          <IssuedKeysView
            title="Новый ключ"
            keys={[issuedKey]}
            onDone={() => handleOpenChange(false)}
          />
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Перегенерировать ключ</DialogTitle>
              <DialogDescription>
                Старый ключ {participant.displayName ? `участника ${participant.displayName}` : ''}{' '}
                перестанет работать сразу. Уже залогиненный участник останется в системе до
                истечения куки.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
                Отмена
              </Button>
              <Button type="button" onClick={handleConfirm} disabled={pending}>
                {pending ? 'Создаём…' : 'Перегенерировать'}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

function DeleteParticipantDialog({
  participant,
  isLast,
  onClose,
  onSuccess,
}: {
  participant: ParticipantRow
  isLast: boolean
  onClose: () => void
  onSuccess: () => void
}) {
  const [pending, setPending] = useState(false)

  async function handleConfirm() {
    if (isLast) {
      toast.error('Нельзя удалить последнего участника')
      return
    }
    setPending(true)
    try {
      const res = await fetch(`/api/admin/participants/${participant.id}`, {
        method: 'DELETE',
      })
      const body = (await res.json()) as ApiResponse<unknown>
      if (!res.ok || !body.ok) {
        const code = body.ok === false ? body.error.code : undefined
        const message = body.ok === false ? body.error.message : undefined
        toast.error(fallbackError(code, message))
        return
      }
      toast.success('Участник удалён')
      onSuccess()
      onClose()
    } catch {
      toast.error(fallbackError())
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open onOpenChange={(next) => !next && !pending && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Удалить {participant.displayName ?? 'участника'}?</DialogTitle>
          <DialogDescription>
            Также будут удалены его треки и голоса. Действие необратимо.
          </DialogDescription>
        </DialogHeader>
        {isLast && (
          <Alert variant="destructive">
            <AlertTitle>Это последний участник</AlertTitle>
            <AlertDescription>
              Удалить нельзя — без участников сессия станет нерабочей.
            </AlertDescription>
          </Alert>
        )}
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
            Отмена
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={handleConfirm}
            disabled={pending || isLast}
          >
            {pending ? 'Удаляем…' : 'Удалить'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function IssuedKeysView({
  title,
  keys,
  onDone,
}: {
  title: string
  keys: string[]
  onDone: () => void
}) {
  async function handleCopyOne(key: string) {
    const ok = await copyText(key)
    if (ok) toast.success('Ключ скопирован')
    else toast.error('Скопируйте вручную')
  }
  async function handleCopyAll() {
    const ok = await copyText(keys.join('\n'))
    if (ok) toast.success('Все ключи скопированы')
    else toast.error('Скопируйте вручную')
  }
  return (
    <>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>
          Ключи также видны в таблице участников — здесь показаны для удобства.
        </DialogDescription>
      </DialogHeader>
      <Alert>
        <AlertTitle>Скопируйте сейчас или найдёте в таблице</AlertTitle>
        <AlertDescription>
          Ключи доступны на странице участников всегда — это окно лишь для удобства сразу после
          создания.
        </AlertDescription>
      </Alert>
      {keys.length > 1 && (
        <div className="flex justify-end">
          <Button type="button" variant="outline" size="sm" onClick={handleCopyAll}>
            <CopyIcon />
            Скопировать всё
          </Button>
        </div>
      )}
      <ul className="flex flex-col gap-2">
        {keys.map((key, idx) => (
          <li
            key={key}
            className="flex items-center justify-between gap-3 rounded-md border px-3 py-2"
          >
            <code className="font-mono text-sm tracking-wider">{key}</code>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => handleCopyOne(key)}
              aria-label={`Скопировать ключ ${idx + 1}`}
            >
              <CopyIcon />
              Скопировать
            </Button>
          </li>
        ))}
      </ul>
      <DialogFooter>
        <Button type="button" onClick={onDone}>
          Готово
        </Button>
      </DialogFooter>
    </>
  )
}
