import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-3xl font-bold tracking-tight">Голосование за песню</h1>
      <p className="text-muted-foreground text-sm">
        Скелет проекта. Контент появится в следующих тикетах.
      </p>
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>shadcn/ui готов</CardTitle>
          <CardDescription>Базовые компоненты подключены.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button>Поехали</Button>
        </CardContent>
      </Card>
    </main>
  )
}
