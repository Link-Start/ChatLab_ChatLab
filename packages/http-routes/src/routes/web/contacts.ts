import type { FastifyInstance } from 'fastify'
import { createContactsService } from '@openchatlab/node-runtime'
import { CONTACTS_TIME_RANGE_PRESETS, type ContactsTimeRangePreset } from '@openchatlab/shared-types'
import type { HttpRouteContext } from '../../context'

type ContactsQuery = { acceptStale?: string; timeRange?: string }

export function registerContactsRoutes(server: FastifyInstance, ctx: HttpRouteContext): void {
  const service =
    ctx.contactsService ??
    createContactsService({
      adapter: ctx.sessionAdapter,
      pathProvider: ctx.pathProvider,
      runtimeIdentity: ctx.runtimeIdentity,
      nativeBinding: ctx.nativeBinding,
    })
  server.addHook('onClose', async () => {
    await service.close()
  })

  server.get<{ Querystring: ContactsQuery }>('/_web/contacts', async (request) => {
    return service.getContacts({
      acceptStale: isTruthy(request.query.acceptStale),
      timeRangePreset: parseContactsTimeRangePreset(request.query.timeRange),
    })
  })

  server.post<{ Querystring: ContactsQuery }>('/_web/contacts/recompute', async (request) => {
    return service.startRecompute({ timeRangePreset: parseContactsTimeRangePreset(request.query.timeRange) })
  })
}

function isTruthy(value: string | undefined): boolean {
  return value === '1' || value === 'true' || value === 'yes'
}

function parseContactsTimeRangePreset(value: string | undefined): ContactsTimeRangePreset {
  return CONTACTS_TIME_RANGE_PRESETS.includes(value as ContactsTimeRangePreset)
    ? (value as ContactsTimeRangePreset)
    : '1y'
}
