import {
  generation,
  isActive,
  readActiveNativeSession,
  type SecuritySession,
  type SecurityUser,
  securityFailure,
} from '@auth/account-security'
import type { prismaAdapter } from '@better-auth/prisma-adapter'
import type { DBTransactionAdapter, Where } from 'better-auth'

type Observation = Readonly<{
  userId: string | null
  email: string
  authVersion: number
  platformVersion: number
  primary: boolean
  parent?: Readonly<{ id: string; loginAt: number | null }>
}>
type Proof = Readonly<Observation & { request: Request; createdAt: number }>
const advance = (date: Date) => {
  const time = date.getTime()
  if (!Number.isFinite(time)) throw securityFailure()
  return new Date(Math.max(Date.now(), time + 1))
}

/** Single-use native issuance capability. Only the native hook can attach its private symbol. */
export const createSessionAdmissionFence = () => {
  const key = Symbol('native-session-admission')
  const observations = new WeakMap<Request, Observation>()
  const pending = new WeakMap<Request, Proof>()
  const originals = new WeakMap<
    DBTransactionAdapter,
    Pick<DBTransactionAdapter, 'create' | 'updateMany' | 'deleteMany'>
  >()
  const fencedUsers = new WeakMap<DBTransactionAdapter, Set<string>>()
  const fetchedRows = new WeakMap<object, Where[]>()
  const deletions = new WeakMap<Where[], { request: Request; observation: Observation }>()
  const deletedParents = new WeakSet<Observation>()
  const observe = (
    request: Request | undefined,
    user: SecurityUser | null,
    email: string,
    primary: boolean,
  ) => {
    if (!request || (user && !isActive(user))) throw securityFailure()
    observations.set(
      request,
      Object.freeze({
        userId: user?.id ?? null,
        email: email.toLowerCase(),
        authVersion: generation(user?.authVersion),
        platformVersion: generation(user?.platformVersion),
        primary,
      }),
    )
  }
  const observeReplacement = (
    request: Request | undefined,
    active: { user: SecurityUser; session: SecuritySession },
  ) => {
    observe(request, active.user, active.user.email, false)
    if (!request) throw securityFailure()
    const observation = observations.get(request)
    if (!observation) throw securityFailure()
    const createdAt = active.session.createdAt.getTime()
    const loginAt = active.session.loginAt?.getTime()
    const safeLoginAt =
      loginAt !== undefined &&
      Number.isFinite(loginAt) &&
      Number.isFinite(createdAt) &&
      loginAt <= createdAt &&
      createdAt <= Date.now()
        ? loginAt
        : null
    observations.set(
      request,
      Object.freeze({
        ...observation,
        parent: Object.freeze({ id: active.session.id, loginAt: safeLoginAt }),
      }),
    )
  }
  const stampDeletion = (
    row: object & { id: string; userId: string },
    request: Request | undefined,
  ) => {
    if (!request) return
    const observation = observations.get(request)
    if (!observation?.parent || observation.userId !== row.userId) return
    const where = fetchedRows.get(row)
    if (!where) throw securityFailure()
    deletions.set(where, { request, observation })
  }
  const stamp = <T extends { userId: string; createdAt: Date }>(
    data: T,
    request: Request | undefined,
    user: SecurityUser | null,
  ): T => {
    if (!request || !isActive(user)) throw securityFailure()
    const observation = observations.get(request)
    observations.delete(request)
    if (
      !observation ||
      (observation.userId !== null && observation.userId !== data.userId) ||
      user.id !== data.userId ||
      observation.email !== user.email.toLowerCase()
    )
      throw securityFailure()
    if (observation.parent && !deletedParents.delete(observation)) throw securityFailure()
    const proof = Object.freeze({
      ...observation,
      userId: data.userId,
      request,
      createdAt: data.createdAt.getTime(),
    })
    pending.set(request, proof)
    return { ...data, [key]: proof }
  }
  const adapter = (factory: ReturnType<typeof prismaAdapter>): ReturnType<typeof prismaAdapter> => {
    const decorate = <A extends DBTransactionAdapter>(instance: A, inTransaction: boolean): A => {
      if (originals.has(instance)) return instance
      const create = instance.create
      originals.set(instance, {
        create,
        updateMany: instance.updateMany,
        deleteMany: instance.deleteMany,
      })
      instance.create = async <T extends Record<string, unknown>, R = T>(args: {
        model: string
        data: Omit<T, 'id'>
        select?: string[]
        forceAllowId?: boolean
      }): Promise<R> => {
        if (args.model !== 'session') return create<T, R>(args)
        const data = { ...args.data }
        const proof = (data as Record<symbol, Proof>)[key]
        delete (data as Record<symbol, Proof>)[key]
        if (
          !proof ||
          pending.get(proof.request) !== proof ||
          proof.userId !== data.userId ||
          !(data.createdAt instanceof Date) ||
          data.createdAt.getTime() !== proof.createdAt
        )
          throw securityFailure()
        pending.delete(proof.request)
        const insert = async (tx: DBTransactionAdapter) => {
          const local = await tx.findOne<SecurityUser>({
            model: 'user',
            where: [{ field: 'id', value: proof.userId }],
          })
          if (
            !isActive(local) ||
            generation(local.authVersion) !== proof.authVersion ||
            generation(local.platformVersion) !== proof.platformVersion
          )
            throw securityFailure()
          if (
            (await tx.updateMany({
              model: 'user',
              where: [
                { field: 'id', value: local.id },
                { field: 'updatedAt', value: local.updatedAt },
              ],
              update: { updatedAt: advance(local.updatedAt) },
            })) !== 1
          )
            throw securityFailure()
          const original = originals.get(tx)?.create
          if (!original) throw securityFailure()
          return original<T, R>({
            ...args,
            data: {
              ...data,
              authVersion: proof.authVersion,
              loginAt: proof.primary
                ? data.createdAt
                : proof.parent?.loginAt != null
                  ? new Date(proof.parent.loginAt)
                  : null,
            },
          })
        }
        if (inTransaction) return insert(instance)
        const root = instance as A & {
          transaction: ReturnType<ReturnType<typeof prismaAdapter>>['transaction']
        }
        return root.transaction(insert)
      }
      const mutate = async (
        tx: DBTransactionAdapter,
        args: Parameters<DBTransactionAdapter['update']>[0],
      ) => {
        // Native renewal and Google's exact session timestamp fence only. Broad/OR updates fail closed.
        if (
          !args.where?.some(
            (p) =>
              ['id', 'token'].includes(p.field) &&
              (p.operator ?? 'eq') === 'eq' &&
              typeof p.value === 'string',
          ) ||
          args.where.some((p) => (p.connector ?? 'AND') !== 'AND')
        )
          throw securityFailure()
        if (
          Object.keys(args.update).some((field) =>
            ['id', 'token', 'userId', 'createdAt', 'authVersion', 'loginAt'].includes(field),
          )
        )
          throw securityFailure()
        const session = await tx.findOne<SecuritySession>({ model: 'session', where: args.where })
        if (!session) throw securityFailure()
        const active = await readActiveNativeSession(tx, session.id, session.userId)
        if (!active) throw securityFailure()
        const user = active.user
        // Reuse a meaningful owner fence already taken by the composed Google account guard.
        if (
          !fencedUsers.get(tx)?.has(user.id) &&
          (await tx.updateMany({
            model: 'user',
            where: [
              { field: 'id', value: user.id },
              { field: 'updatedAt', value: user.updatedAt },
            ],
            update: { updatedAt: advance(user.updatedAt) },
          })) !== 1
        )
          throw securityFailure()
        const raw = originals.get(tx)
        if (
          !raw ||
          (await raw.updateMany({
            ...args,
            where: [
              ...args.where,
              { field: 'id', value: session.id },
              { field: 'updatedAt', value: session.updatedAt },
            ],
            update: { ...args.update, updatedAt: advance(session.updatedAt) },
          })) !== 1
        )
          throw securityFailure()
        return tx.findOne({ model: 'session', where: [{ field: 'id', value: session.id }] })
      }
      const inBoundary = <R>(fn: (tx: DBTransactionAdapter) => Promise<R>) =>
        inTransaction
          ? fn(instance)
          : (
              instance as A & {
                transaction: ReturnType<ReturnType<typeof prismaAdapter>>['transaction']
              }
            ).transaction(fn)
      const findMany = instance.findMany
      instance.findMany = async <T>(args: Parameters<A['findMany']>[0]) => {
        const rows = await findMany<T>(args)
        if (args.model === 'session' && args.where)
          for (const row of rows)
            if (typeof row === 'object' && row !== null) fetchedRows.set(row, args.where)
        return rows
      }
      const deleteMany = instance.deleteMany
      instance.deleteMany = async (args) => {
        const proof = args.where ? deletions.get(args.where) : undefined
        if (args.model !== 'session' || !proof || !args.where) return deleteMany(args)
        deletions.delete(args.where)
        const observation = proof.observation
        const parent = observation.parent
        if (!parent || !observation.userId || observations.get(proof.request) !== observation)
          throw securityFailure()
        const userId = observation.userId
        const where = args.where
        const count = await inBoundary(async (tx) => {
          // Native delete hooks snapshot only the first page. Prove the exact parent is actually in the deletion predicate, even when it was beyond that page.
          if (
            !(await tx.findOne({
              model: 'session',
              where: [
                ...where,
                { field: 'id', value: parent.id },
                { field: 'userId', value: userId },
              ],
            }))
          )
            throw securityFailure()
          const active = await readActiveNativeSession(tx, parent.id, userId)
          if (
            !active ||
            generation(active.user.authVersion) !== observation.authVersion ||
            generation(active.user.platformVersion) !== observation.platformVersion
          )
            throw securityFailure()
          if (
            (await tx.updateMany({
              model: 'user',
              where: [
                { field: 'id', value: active.user.id },
                { field: 'updatedAt', value: active.user.updatedAt },
              ],
              update: { updatedAt: advance(active.user.updatedAt) },
            })) !== 1
          )
            throw securityFailure()
          const raw = originals.get(tx)
          if (!raw) throw securityFailure()
          return raw.deleteMany(args)
        })
        if (count < 1) throw securityFailure()
        deletedParents.add(observation)
        return count
      }
      const update = instance.update
      const updateMany = instance.updateMany
      const incrementOne = instance.incrementOne
      instance.update = async <T>(args: Parameters<A['update']>[0]) =>
        args.model === 'session'
          ? ((await inBoundary((tx) => mutate(tx, args))) as T | null)
          : update<T>(args)
      instance.updateMany = async (args) => {
        if (args.model === 'session') {
          await inBoundary((tx) => mutate(tx, args))
          return 1
        }
        const count = await updateMany(args)
        if (
          inTransaction &&
          args.model === 'user' &&
          count === 1 &&
          args.where.every((p) => (p.connector ?? 'AND') === 'AND')
        ) {
          const id = args.where.find(
            (p) => p.field === 'id' && (p.operator ?? 'eq') === 'eq',
          )?.value
          const previous = args.where.find(
            (p) => p.field === 'updatedAt' && (p.operator ?? 'eq') === 'eq',
          )?.value
          const next = args.update.updatedAt
          if (
            typeof id === 'string' &&
            previous instanceof Date &&
            next instanceof Date &&
            next.getTime() > previous.getTime()
          ) {
            const users = fencedUsers.get(instance) ?? new Set<string>()
            users.add(id)
            fencedUsers.set(instance, users)
          }
        }
        return count
      }
      instance.incrementOne = async <T>(args: Parameters<A['incrementOne']>[0]) => {
        if (args.model === 'session') throw securityFailure()
        return incrementOne<T>(args)
      }
      return instance
    }
    return (options) => {
      const instance = factory(options)
      if (typeof instance.options?.adapterConfig.transaction !== 'function')
        throw new Error('Session admission requires a transactional adapter')
      const transaction = instance.transaction
      decorate(instance, false)
      instance.transaction = (callback) => transaction((tx) => callback(decorate(tx, true)))
      return instance
    }
  }
  return { adapter, observe, observeReplacement, stampDeletion, stamp }
}
