import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export default function Home() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">Готово к работе</h1>
        <p className="text-muted-foreground text-sm">
          Скелет проекта. Контент появится в следующих тикетах.
        </p>
      </div>
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>shadcn/ui готов</CardTitle>
          <CardDescription>Базовые компоненты подключены.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button>Поехали</Button>
        </CardContent>
      </Card>
    </div>
  )
}
