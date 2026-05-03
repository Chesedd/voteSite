import { PrismaClient, SessionStage } from '@prisma/client'
import { generateAccessKey, generateJoinToken, hashKey } from '@/lib/crypto'

const prisma = new PrismaClient()

// TODO(P2-01): replace with a real bcrypt hash of "admin" once src/lib/crypto.ts
// exists. Bcrypt is not a dependency yet — pulling it in here would expand this
// ticket's scope. The placeholder is bcrypt-shape so the column accepts it; the
// admin login endpoint that actually verifies the hash arrives in P2-04.
const PLACEHOLDER_ADMIN_HASH = '$2b$10$placeholderplaceholderplaceholderplaceholderplaceholderxx'

const PARTICIPANT_NAMES = ['Алиса', 'Боб', 'Клара', 'Денис', 'Ева'] as const

// submitterIdx points into PARTICIPANT_NAMES. Distribution: Алиса 3, Боб 2, Клара 1.
// Service metadata uses placeholder values so P4-05 (TrackEmbed) has realistic
// shapes to render against. The IDs are not required to resolve to real songs.
const YANDEX_COVER = 'https://avatars.yandex.net/get-music-content/dummy/cover.jpg'
const TRACKS = [
  {
    submitterIdx: 0,
    title: 'Город спит',
    artist: 'Кино',
    service: 'yandex',
    serviceTrackId: '12345',
    coverUrl: YANDEX_COVER,
    embedSupported: true,
  },
  {
    submitterIdx: 0,
    title: 'Прогулки по воде',
    artist: 'Наутилус Помпилиус',
    service: 'yandex',
    serviceTrackId: '12346',
    coverUrl: YANDEX_COVER,
    embedSupported: true,
  },
  {
    submitterIdx: 0,
    title: 'Скованные одной цепью',
    artist: 'Наутилус Помпилиус',
    service: 'yandex',
    serviceTrackId: '12347',
    coverUrl: YANDEX_COVER,
    embedSupported: true,
  },
  {
    submitterIdx: 1,
    title: 'Вечно молодой',
    artist: 'Смысловые галлюцинации',
    service: 'yandex',
    serviceTrackId: '12348',
    coverUrl: YANDEX_COVER,
    embedSupported: true,
  },
  {
    submitterIdx: 1,
    title: 'Я свободен',
    artist: 'Кипелов',
    service: 'youtube',
    serviceTrackId: 'dQw4w9WgXcQ',
    coverUrl: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
    embedSupported: true,
  },
  {
    submitterIdx: 2,
    title: 'Группа крови',
    artist: 'Кино',
    service: 'vk',
    serviceTrackId: null,
    coverUrl: null,
    embedSupported: false,
  },
] as const

// Three of five participants cast a full top-3. Денис and Ева abstain so the
// "no votes yet" UI branch has data to render. Indices reference TRACKS.
const BALLOTS: { participantIdx: number; ranks: [number, number, number] }[] = [
  { participantIdx: 0, ranks: [4, 0, 2] },
  { participantIdx: 1, ranks: [0, 3, 4] },
  { participantIdx: 2, ranks: [3, 4, 1] },
]

async function main() {
  const participantSeed = PARTICIPANT_NAMES.map((displayName) => ({
    displayName,
    accessKey: generateAccessKey(),
  }))
  const joinToken = generateJoinToken()

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
        joinToken,
      },
    })

    const participants = await Promise.all(
      participantSeed.map((p) =>
        tx.participant.create({
          data: {
            sessionId: session.id,
            displayName: p.displayName,
            accessKey: p.accessKey,
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
            service: t.service,
            serviceTrackId: t.serviceTrackId,
            coverUrl: t.coverUrl,
            embedSupported: t.embedSupported,
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

  const longestName = Math.max(...participantSeed.map((p) => p.displayName.length))
  console.log(`[seed] Join link: /join/${joinToken}`)
  console.log('[seed] Test access keys:')
  for (const p of participantSeed) {
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
