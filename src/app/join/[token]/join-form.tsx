'use client'

import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useState, type FormEvent } from 'react'
import { CopyIcon } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { ApiResponse } from '@/lib/api/responses'

const NAME_MAX = 40

const ERROR_MESSAGES: Record<string, string> = {
  INVALID_INPUT: `Имя должно быть от 1 до ${NAME_MAX} символов`,
  NOT_FOUND: 'Ссылка недействительна',
  REGISTRATION_CLOSED: 'Регистрация закрыта',
  CAPACITY_REACHED: 'Все места заняты',
}

const FALLBACK_ERROR = 'Что-то пошло не так. Попробуйте ещё раз.'

type JoinResponse = ApiResponse<{
  accessKey: string
  participant: { id: string; displayName: string }
}>

type Stage = 'STAGE1' | 'STAGE2' | 'FINISHED'

type JoinFormProps = {
  token: string
  sessionTitle: string
  stage: Stage
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

export function JoinForm({ token, sessionTitle, stage }: JoinFormProps) {
  const [issuedKey, setIssuedKey] = useState<string | null>(null)

  if (issuedKey) {
    return <PostRegistrationView accessKey={issuedKey} />
  }

  if (stage !== 'STAGE1') {
    return <RegistrationClosedView />
  }

  return (
    <RegistrationFormView
      token={token}
      sessionTitle={sessionTitle}
      onRegistered={(accessKey) => setIssuedKey(accessKey)}
    />
  )
}

function RegistrationFormView({
  token,
  sessionTitle,
  onRegistered,
}: {
  token: string
  sessionTitle: string
  onRegistered: (accessKey: string) => void
}) {
  const [displayName, setDisplayName] = useState('')
  const [pending, setPending] = useState(false)

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const trimmed = displayName.trim()
    if (trimmed.length === 0 || trimmed.length > NAME_MAX) {
      toast.error(ERROR_MESSAGES.INVALID_INPUT)
      return
    }

    setPending(true)
    try {
      const res = await fetch(`/api/join/${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ displayName: trimmed }),
      })
      const body = (await res.json()) as JoinResponse
      if (!res.ok || !body.ok) {
        const code = body.ok === false ? body.error.code : undefined
        toast.error((code && ERROR_MESSAGES[code]) || FALLBACK_ERROR)
        return
      }
      onRegistered(body.data.accessKey)
    } catch {
      toast.error(FALLBACK_ERROR)
    } finally {
      setPending(false)
    }
  }

  const showSubtitle = sessionTitle && sessionTitle !== 'Голосование'

  return (
    <Card>
      <CardHeader>
        <CardTitle>Регистрация на голосование</CardTitle>
        {showSubtitle ? <p className="text-muted-foreground text-sm">{sessionTitle}</p> : null}
      </CardHeader>
      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="displayName">Как вас зовут?</Label>
            <Input
              id="displayName"
              type="text"
              autoComplete="nickname"
              maxLength={NAME_MAX}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required
              disabled={pending}
            />
            <p className="text-muted-foreground text-xs">Это имя увидят остальные участники.</p>
          </div>
        </CardContent>
        <CardFooter className="justify-end">
          <Button type="submit" disabled={pending}>
            {pending ? 'Регистрация...' : 'Зарегистрироваться'}
          </Button>
        </CardFooter>
      </form>
    </Card>
  )
}

function RegistrationClosedView() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Регистрация закрыта</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground text-sm">
          Голосование уже идёт. Новые участники зайти не смогут.
        </p>
      </CardContent>
      <CardFooter className="justify-end">
        <Button asChild variant="outline">
          <Link href="/">На главную</Link>
        </Button>
      </CardFooter>
    </Card>
  )
}

function PostRegistrationView({ accessKey }: { accessKey: string }) {
  const router = useRouter()

  async function handleCopyKey() {
    const ok = await copyText(accessKey)
    if (ok) toast.success('Ключ скопирован')
    else toast.error('Скопируйте вручную')
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Готово!</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-sm">Ваш ключ:</p>
        <div className="flex items-center gap-2 rounded-md border px-3 py-2">
          <code className="flex-1 truncate font-mono text-base tracking-widest">{accessKey}</code>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleCopyKey}
            aria-label="Скопировать ключ"
          >
            <CopyIcon />
            Скопировать
          </Button>
        </div>
        <p className="text-muted-foreground text-sm">
          Запомните или сохраните ключ — он понадобится для входа. Через эту ссылку повторно войти
          нельзя — для входа используйте страницу <code>/login</code>.
        </p>
      </CardContent>
      <CardFooter className="justify-end">
        <Button type="button" onClick={() => router.push('/login')}>
          Перейти ко входу
        </Button>
      </CardFooter>
    </Card>
  )
}
