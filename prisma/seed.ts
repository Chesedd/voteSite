import { PrismaClient, SessionStage } from '@prisma/client'
import { createHash } from 'node:crypto'

const prisma = new PrismaClient()

// SHA-256 hex of plaintext access key. Mirrors the production hashing in
// docs/ARCHITECTURE.md (Hashing). The dedicated helper lands in P2-01; this
// inline call keeps the seed independent of unmerged tickets.
function hashKey(plaintext: string): string {
  return createHash('sha256').update(plaintext).digest('hex')
}

// TODO(P2-01): replace with a real bcrypt hash of "admin" once src/lib/crypto.ts
// exists. Bcrypt is not a dependency yet — pulling it in here would expand this
// ticket's scope. The placeholder is bcrypt-shape so the column accepts it; the
// admin login endpoint that actually verifies the hash arrives in P2-04.
const PLACEHOLDER_ADMIN_HASH = '$2b$10$placeholderplaceholderplaceholderplaceholderplaceholderxx'

const PARTICIPANTS = [
  { displayName: 'Алиса', accessKey: 'TESTKEY1' },
  { displayName: 'Боб', accessKey: 'TESTKEY2' },
  { displayName: 'Клара', accessKey: 'TESTKEY3' },
  { displayName: 'Денис', accessKey: 'TESTKEY4' },
  { displayName: 'Ева', accessKey: 'TESTKEY5' },
] as const

// submitterIdx points into PARTICIPANTS. Distribution: Алиса 3, Боб 2, Клара 1.
const TRACKS = [
  { submitterIdx: 0, title: 'Город спит', artist: 'Кино' },
  { submitterIdx: 0, title: 'Прогулки по воде', artist: 'Наутилус Помпилиус' },
  { submitterIdx: 0, title: 'Скованные одной цепью', artist: 'Наутилус Помпилиус' },
  { submitterIdx: 1, title: 'Вечно молодой', artist: 'Смысловые галлюцинации' },
  { submitterIdx: 1, title: 'Я свободен', artist: 'Кипелов' },
  { submitterIdx: 2, title: 'Группа крови', artist: 'Кино' },
] as const

// Three of five participants cast a full top-3. Денис and Ева abstain so the
// "no votes yet" UI branch has data to render. Indices reference TRACKS.
const BALLOTS: { participantIdx: number; ranks: [number, number, number] }[] = [
  { participantIdx: 0, ranks: [4, 0, 2] },
  { participantIdx: 1, ranks: [0, 3, 4] },
  { participantIdx: 2, ranks: [3, 4, 1] },
]

async function main() {
  await prisma.$transaction(async (tx) => {
    // Explicit deletion in dependency order (Vote → Track → Participant → Session).
    // Schema cascades from Session would be enough today, but explicit deletes
    // are robust against future relation changes and read clearer.
    await tx.vote.deleteMany()
    await tx.track.deleteMany()
    await tx.participant.deleteMany()
    await tx.session.deleteMany()

    const session = await tx.session.create({
      data: {
        title: 'Тестовое голосование',
        stage: SessionStage.STAGE2,
        adminPasswordHash: PLACEHOLDER_ADMIN_HASH,
      },
    })

    const participants = await Promise.all(
      PARTICIPANTS.map((p) =>
        tx.participant.create({
          data: {
            sessionId: session.id,
            displayName: p.displayName,
            accessKeyHash: hashKey(p.accessKey),
            hasJoined: true,
          },
        }),
      ),
    )

    const tracks = await Promise.all(
      TRACKS.map((t) =>
        tx.track.create({
          data: {
            sessionId: session.id,
            submittedById: participants[t.submitterIdx].id,
            title: t.title,
            artist: t.artist,
          },
        }),
      ),
    )

    for (const ballot of BALLOTS) {
      await Promise.all(
        ballot.ranks.map((trackIdx, i) =>
          tx.vote.create({
            data: {
              sessionId: session.id,
              participantId: participants[ballot.participantIdx].id,
              trackId: tracks[trackIdx].id,
              rank: i + 1,
            },
          }),
        ),
      )
    }
  })

  const longestName = Math.max(...PARTICIPANTS.map((p) => p.displayName.length))
  console.log('[seed] Test participant access keys:')
  for (const p of PARTICIPANTS) {
    console.log(`  ${p.displayName.padEnd(longestName, ' ')}  ${p.accessKey}`)
  }
}

main()
  .catch((err) => {
    console.error('[seed] Failed:', err)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
