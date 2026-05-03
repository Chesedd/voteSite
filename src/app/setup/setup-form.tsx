'use client'

import { useRouter } from 'next/navigation'
import { useState, type FormEvent } from 'react'
import { CopyIcon } from 'lucide-react'
import { toast } from 'sonner'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { ApiResponse } from '@/lib/api/responses'

const MIN_PASSWORD_LENGTH = 8
const MIN_PARTICIPANTS = 2
const MAX_PARTICIPANTS = 30
const DEFAULT_PARTICIPANTS = 5

type SetupResponse = ApiResponse<{ accessKeys: string[] }>

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
  const [participantCount, setParticipantCount] = useState<number>(DEFAULT_PARTICIPANTS)
  const [pending, setPending] = useState(false)
  const [accessKeys, setAccessKeys] = useState<string[] | null>(null)

  function validate(): string | null {
    if (password.length < MIN_PASSWORD_LENGTH) {
      return `Пароль должен быть не короче ${MIN_PASSWORD_LENGTH} символов.`
    }
    if (password !== confirmPassword) {
      return 'Пароли не совпадают.'
    }
    if (
      !Number.isInteger(participantCount) ||
      participantCount < MIN_PARTICIPANTS ||
      participantCount > MAX_PARTICIPANTS
    ) {
      return `Число участников — от ${MIN_PARTICIPANTS} до ${MAX_PARTICIPANTS}.`
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
        body: JSON.stringify({ password, participantCount }),
      })
      const body = (await res.json()) as SetupResponse
      if (!res.ok || !body.ok) {
        const message = body.ok === false ? body.error.message : 'Не удалось создать голосование.'
        toast.error(message)
        return
      }
      setAccessKeys(body.data.accessKeys)
    } catch {
      toast.error('Сеть недоступна. Попробуйте ещё раз.')
    } finally {
      setPending(false)
    }
  }

  if (accessKeys) {
    return <SetupKeysView accessKeys={accessKeys} onContinue={() => router.push('/login')} />
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
            <Label htmlFor="participantCount">Количество участников</Label>
            <Input
              id="participantCount"
              type="number"
              min={MIN_PARTICIPANTS}
              max={MAX_PARTICIPANTS}
              value={Number.isFinite(participantCount) ? participantCount : ''}
              onChange={(e) => setParticipantCount(e.target.valueAsNumber)}
              required
              disabled={pending}
            />
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

function SetupKeysView({
  accessKeys,
  onContinue,
}: {
  accessKeys: string[]
  onContinue: () => void
}) {
  async function handleCopyOne(key: string) {
    const ok = await copyText(key)
    if (ok) toast.success('Ключ скопирован')
    else toast.error('Скопируйте вручную')
  }

  async function handleCopyAll() {
    const ok = await copyText(accessKeys.join('\n'))
    if (ok) toast.success('Все ключи скопированы')
    else toast.error('Скопируйте вручную')
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Сохраните ключи участников</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Alert variant="destructive">
          <AlertTitle>Это единственная возможность увидеть ключи</AlertTitle>
          <AlertDescription>
            После ухода со страницы ключи нельзя будет посмотреть снова — только сгенерировать
            заново. Скопируйте их сейчас.
          </AlertDescription>
        </Alert>
        <div className="flex justify-end">
          <Button type="button" variant="outline" size="sm" onClick={handleCopyAll}>
            <CopyIcon />
            Скопировать всё
          </Button>
        </div>
        <ul className="flex flex-col gap-2">
          {accessKeys.map((key, idx) => (
            <li
              key={key}
              className="flex items-center justify-between gap-3 rounded-md border px-3 py-2"
            >
              <div className="flex items-center gap-3">
                <span className="text-muted-foreground w-6 text-right text-xs tabular-nums">
                  {idx + 1}
                </span>
                <code className="font-mono text-sm tracking-wider">{key}</code>
              </div>
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
      </CardContent>
      <CardFooter className="justify-end">
        <Button type="button" onClick={onContinue}>
          Я сохранил ключи, продолжить
        </Button>
      </CardFooter>
    </Card>
  )
}
