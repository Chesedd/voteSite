'use client'

import { useRouter } from 'next/navigation'
import { useState, type FormEvent } from 'react'
import { CopyIcon } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { ApiResponse } from '@/lib/api/responses'

const MIN_PASSWORD_LENGTH = 8
const MIN_PARTICIPANTS = 2
const MAX_PARTICIPANTS = 100
const DEFAULT_MAX_PARTICIPANTS = 20

type SetupResponse = ApiResponse<{ joinToken: string }>

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

export function SetupForm() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [maxParticipants, setMaxParticipants] = useState<number>(DEFAULT_MAX_PARTICIPANTS)
  const [pending, setPending] = useState(false)
  const [joinToken, setJoinToken] = useState<string | null>(null)

  function validate(): string | null {
    if (password.length < MIN_PASSWORD_LENGTH) {
      return `Пароль должен быть не короче ${MIN_PASSWORD_LENGTH} символов.`
    }
    if (password !== confirmPassword) {
      return 'Пароли не совпадают.'
    }
    if (
      !Number.isInteger(maxParticipants) ||
      maxParticipants < MIN_PARTICIPANTS ||
      maxParticipants > MAX_PARTICIPANTS
    ) {
      return `Лимит участников — от ${MIN_PARTICIPANTS} до ${MAX_PARTICIPANTS}.`
    }
    return null
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const validationError = validate()
    if (validationError) {
      toast.error(validationError)
      return
    }

    setPending(true)
    try {
      const res = await fetch('/api/setup', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password, maxParticipants }),
      })
      const body = (await res.json()) as SetupResponse
      if (!res.ok || !body.ok) {
        const message = body.ok === false ? body.error.message : 'Не удалось создать голосование.'
        toast.error(message)
        return
      }
      setJoinToken(body.data.joinToken)
    } catch {
      toast.error('Сеть недоступна. Попробуйте ещё раз.')
    } finally {
      setPending(false)
    }
  }

  if (joinToken) {
    return <SetupJoinLinkView joinToken={joinToken} onContinue={() => router.push('/admin')} />
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Параметры</CardTitle>
      </CardHeader>
      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="password">Пароль администратора</Label>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={MIN_PASSWORD_LENGTH}
              required
              disabled={pending}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="confirmPassword">Повторите пароль</Label>
            <Input
              id="confirmPassword"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              minLength={MIN_PASSWORD_LENGTH}
              required
              disabled={pending}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="maxParticipants">Максимум участников</Label>
            <Input
              id="maxParticipants"
              type="number"
              min={MIN_PARTICIPANTS}
              max={MAX_PARTICIPANTS}
              value={Number.isFinite(maxParticipants) ? maxParticipants : ''}
              onChange={(e) => setMaxParticipants(e.target.valueAsNumber)}
              required
              disabled={pending}
            />
            <p className="text-muted-foreground text-xs">
              Лимит на количество регистраций. После заполнения новые участники зайти не смогут.
            </p>
          </div>
        </CardContent>
        <CardFooter className="justify-end">
          <Button type="submit" disabled={pending}>
            {pending ? 'Создаётся...' : 'Создать'}
          </Button>
        </CardFooter>
      </form>
    </Card>
  )
}

function SetupJoinLinkView({
  joinToken,
  onContinue,
}: {
  joinToken: string
  onContinue: () => void
}) {
  const joinUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/join/${joinToken}`
      : `/join/${joinToken}`

  async function handleCopyLink() {
    const ok = await copyText(joinUrl)
    if (ok) toast.success('Ссылка скопирована')
    else toast.error('Скопируйте вручную')
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Голосование создано</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-sm">Поделитесь этой ссылкой с участниками:</p>
        <div className="flex items-center gap-2 rounded-md border px-3 py-2">
          <code className="flex-1 truncate font-mono text-sm">{joinUrl}</code>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleCopyLink}
            aria-label="Скопировать ссылку"
          >
            <CopyIcon />
            Скопировать
          </Button>
        </div>
        <p className="text-muted-foreground text-sm">
          Они зарегистрируются по ссылке, выберут имя и получат свой ключ.
        </p>
        <p className="text-muted-foreground text-sm">
          Управление участниками — в админке: <code>/admin/participants</code>
        </p>
      </CardContent>
      <CardFooter className="justify-end">
        <Button type="button" onClick={onContinue}>
          Перейти в админку
        </Button>
      </CardFooter>
    </Card>
  )
}
