'use client'

import { useRouter } from 'next/navigation'
import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { ApiResponse } from '@/lib/api/responses'

type AuthResponse = ApiResponse<unknown>

const ERROR_MESSAGES: Record<string, string> = {
  INVALID_PASSWORD: 'Неверный пароль',
  INVALID_KEY: 'Неверный ключ',
  RATE_LIMITED: 'Слишком много неудачных попыток. Попробуйте через 5 минут.',
  INVALID_INPUT: 'Проверьте введённые данные',
}

const FALLBACK_ERROR = 'Что-то пошло не так. Попробуйте ещё раз.'

function showError(code: string | undefined): void {
  toast.error(code && ERROR_MESSAGES[code] ? ERROR_MESSAGES[code] : FALLBACK_ERROR)
}

export function LoginForm() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Вход</CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="participant">
          <TabsList className="w-full">
            <TabsTrigger value="participant">У меня ключ</TabsTrigger>
            <TabsTrigger value="admin">Я админ</TabsTrigger>
          </TabsList>
          <TabsContent value="participant" className="pt-4">
            <ParticipantTab />
          </TabsContent>
          <TabsContent value="admin" className="pt-4">
            <AdminTab />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  )
}

function ParticipantTab() {
  const router = useRouter()
  const [accessKey, setAccessKey] = useState('')
  const [pending, setPending] = useState(false)

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setPending(true)
    try {
      const res = await fetch('/api/auth/participant', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ accessKey: accessKey.trim() }),
      })
      const body = (await res.json()) as AuthResponse
      if (!res.ok || !body.ok) {
        showError(body.ok === false ? body.error.code : undefined)
        return
      }
      // refresh() invalidates RSC cache so the next page render sees the
      // freshly-set cookie. Without it, push('/') can race the cookie write
      // and render the unauthenticated branch of decideHomeRoute.
      router.refresh()
      router.push('/')
    } catch {
      toast.error(FALLBACK_ERROR)
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="accessKey">Ключ участника</Label>
        <Input
          id="accessKey"
          type="text"
          autoComplete="off"
          autoCapitalize="characters"
          maxLength={8}
          value={accessKey}
          onChange={(e) => setAccessKey(e.target.value)}
          required
          disabled={pending}
        />
      </div>
      <CardFooter className="justify-end px-0">
        <Button type="submit" disabled={pending}>
          {pending ? 'Вход...' : 'Войти'}
        </Button>
      </CardFooter>
    </form>
  )
}

function AdminTab() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [pending, setPending] = useState(false)

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setPending(true)
    try {
      const res = await fetch('/api/auth/admin', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      const body = (await res.json()) as AuthResponse
      if (!res.ok || !body.ok) {
        showError(body.ok === false ? body.error.code : undefined)
        return
      }
      router.refresh()
      router.push('/')
    } catch {
      toast.error(FALLBACK_ERROR)
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="password">Пароль администратора</Label>
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          disabled={pending}
        />
      </div>
      <CardFooter className="justify-end px-0">
        <Button type="submit" disabled={pending}>
          {pending ? 'Вход...' : 'Войти'}
        </Button>
      </CardFooter>
    </form>
  )
}
