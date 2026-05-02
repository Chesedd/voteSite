import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Голосование за песню</CardTitle>
          <CardDescription>Скелет проекта. Контент появится в следующих тикетах.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button>Начать</Button>
        </CardContent>
      </Card>
    </main>
  )
}
