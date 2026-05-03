/**
 * Join-link card on the /admin overview.
 *
 * Renders the public `/join/{token}` URL with a copy button plus a count of
 * registrations vs the configured cap. URL construction relies on
 * `window.location.origin`, so this is a client component (matches the
 * post-setup screen in src/app/setup/setup-form.tsx).
 */

'use client'

import type { SessionStage } from '@prisma/client'
import { CopyIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'

type JoinLinkCardProps = {
  joinToken: string
  maxParticipants: number
  registered: number
  stage: SessionStage
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

export function JoinLinkCard({ joinToken, maxParticipants, registered, stage }: JoinLinkCardProps) {
  // Render the relative path on the server pass; swap to the absolute URL once
  // the component hydrates. Avoids a hydration mismatch and still gives the
  // admin a copyable link from the same domain they're on.
  const [origin, setOrigin] = useState<string | null>(null)
  useEffect(() => {
    setOrigin(window.location.origin)
  }, [])

  const joinUrl = origin ? `${origin}/join/${joinToken}` : `/join/${joinToken}`
  const atCap = registered >= maxParticipants

  async function handleCopy() {
    const ok = await copyText(joinUrl)
    if (ok) toast.success('Ссылка скопирована')
    else toast.error('Скопируйте вручную')
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Ссылка для регистрации</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-muted-foreground text-sm">
          Поделитесь ссылкой с участниками. Они зарегистрируются и получат ключ для входа.
        </p>
        <div className="flex items-center gap-2 rounded-md border px-3 py-2">
          <code className="flex-1 truncate font-mono text-sm">{joinUrl}</code>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleCopy}
            aria-label="Скопировать ссылку"
          >
            <CopyIcon />
            Скопировать
          </Button>
        </div>
        <p
          className={cn(
            'text-sm tabular-nums',
            atCap ? 'text-destructive font-medium' : 'text-muted-foreground',
          )}
        >
          {atCap
            ? 'Регистрация заполнена'
            : `Зарегистрировано: ${registered} из ${maxParticipants}`}
        </p>
        {stage !== 'STAGE1' && (
          <p className="text-muted-foreground text-xs">
            Регистрация закрыта (этап 2). Ссылка копируется, но новые участники её не используют.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
