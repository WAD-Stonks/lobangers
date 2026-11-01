import {
  generation,
  readActiveNativeSession,
  type SecuritySession,
  type SecurityUser,
  securityFailure,
} from '@auth/account-security'
import type { prismaAdapter } from '@better-auth/prisma-adapter'
import type { DBTransactionAdapter, Where } from 'better-auth'

type Authorization = Readonly<{
  userId: string
  sessionId: string
  authVersion: number
  platformVersion: number
}>
type Proof = Readonly<{ request: Request; authorization: Authorization }>
const advance = (date: Date) => {
  const value = date.getTime()
  if (!Number.isFinite(value)) throw securityFailure()
  return new Date(Math.max(Date.now(), value + 1))
}
/** Session-authorized profile/credential writes compete with revocation on both exact persisted rows. */
export const createNativeOperationFence = () => {
  const key = Symbol('native-account-operation')
  const requests = new WeakMap<Request, Authorization>()
  const trusted = new WeakSet<Proof>()
  const originals = new WeakMap<
    DBTransactionAdapter,
    Pick<DBTransactionAdapter, 'updateMany' | 'delete' | 'deleteMany'>
  >()
  const fetched = new WeakMap<object, Where[]>()
  const deletions = new WeakMap<Where[], Proof>()
  const authorize = (
    request: Request | undefined,
    active: { user: SecurityUser; session: SecuritySession },
  ) => {
    if (request)
      requests.set(
        request,
        Object.freeze({
          userId: active.user.id,
          sessionId: active.session.id,
          authVersion: generation(active.user.authVersion),
          platformVersion: generation(active.user.platformVersion),
        }),
      )
  }
  const stamp = <T extends object>(data: T, request: Request | undefined): T => {
    const authorization = request ? requests.get(request) : undefined
    if (!request || !authorization) throw securityFailure()
    const proof = Object.freeze({ request, authorization })
    trusted.add(proof)
    return { ...data, [key]: proof }
  }
  const stampDeletion = (row: object, request: Request | undefined) => {
    const authorization = request ? requests.get(request) : undefined
    const where = fetched.get(row)
    if (!request || !authorization || !where) throw securityFailure()
    const proof = Object.freeze({ request, authorization })
    trusted.add(proof)
    deletions.set(where, proof)
  }
  const fence = async (tx: DBTransactionAdapter, authorization: Authorization) => {
    const active = await readActiveNativeSession(tx, authorization.sessionId, authorization.userId)
    if (
      !active ||
      generation(active.user.authVersion) !== authorization.authVersion ||
      generation(active.user.platformVersion) !== authorization.platformVersion
    )
      throw securityFailure()
    const raw = originals.get(tx)
    if (
      !raw ||
      (await raw.updateMany({
        model: 'user',
        where: [
          { field: 'id', value: active.user.id },
          { field: 'updatedAt', value: active.user.updatedAt },
        ],
        update: { updatedAt: advance(active.user.updatedAt) },
      })) !== 1
    )
      throw securityFailure()
    if (
      (await tx.updateMany({
        model: 'session',
        where: [
          { field: 'id', value: active.session.id },
          { field: 'userId', value: active.user.id },
          { field: 'updatedAt', value: active.session.updatedAt },
        ],
        update: { updatedAt: advance(active.session.updatedAt) },
      })) !== 1
    )
      throw securityFailure()
    return raw
  }
  const adapter = (factory: ReturnType<typeof prismaAdapter>): ReturnType<typeof prismaAdapter> => {
    const decorate = <A extends DBTransactionAdapter>(instance: A, inTransaction: boolean): A => {
      if (originals.has(instance)) return instance
      const update = instance.update
      const updateMany = instance.updateMany
      originals.set(instance, {
        updateMany,
        delete: instance.delete,
        deleteMany: instance.deleteMany,
      })
      const mutate = async (args: Parameters<A['update']>[0], proof: Proof) => {
        if (
          !trusted.delete(proof) ||
          requests.get(proof.request) !== proof.authorization ||
          !['user', 'account'].includes(args.model) ||
          args.where.some((p) => (p.connector ?? 'AND') !== 'AND')
        )
          throw securityFailure()
        const data = { ...args.update }
        delete (data as Record<symbol, Proof>)[key]
        if (
          Object.keys(data).some((field) =>
            [
              'id',
              'userId',
              'createdAt',
              'authVersion',
              'loginAt',
              'platformVersion',
              'suspendedAt',
              'role',
            ].includes(field),
          )
        )
          throw securityFailure()
        const run = async (tx: DBTransactionAdapter) => {
          const authorization = proof.authorization
          const active = await readActiveNativeSession(
            tx,
            authorization.sessionId,
            authorization.userId,
          )
          if (
            !active ||
            generation(active.user.authVersion) !== authorization.authVersion ||
            generation(active.user.platformVersion) !== authorization.platformVersion
          )
            throw securityFailure()
          const target = await tx.findOne<{ id: string; userId?: string; updatedAt: Date }>({
            model: args.model,
            where: args.where,
          })
          if (
            !target ||
            (args.model === 'user' ? target.id : target.userId) !== authorization.userId
          )
            throw securityFailure()
          const raw = await fence(tx, authorization)
          if (
            (await raw.updateMany({
              ...args,
              where: [
                ...args.where,
                { field: 'id', value: target.id },
                ...(args.model === 'account'
                  ? [{ field: 'updatedAt', value: target.updatedAt }]
                  : []),
              ],
              update: data,
            })) !== 1
          )
            throw securityFailure()
          return tx.findOne({ model: args.model, where: [{ field: 'id', value: target.id }] })
        }
        if (inTransaction) return run(instance)
        return (
          instance as A & {
            transaction: ReturnType<ReturnType<typeof prismaAdapter>>['transaction']
          }
        ).transaction(run)
      }
      const findMany = instance.findMany
      instance.findMany = async <T>(args: Parameters<A['findMany']>[0]) => {
        const rows = await findMany<T>(args)
        if (['account', 'session'].includes(args.model) && args.where)
          for (const row of rows) if (row && typeof row === 'object') fetched.set(row, args.where)
        return rows
      }
      const remove = async (args: Parameters<A['delete']>[0], proof: Proof, many: boolean) => {
        if (
          !trusted.delete(proof) ||
          requests.get(proof.request) !== proof.authorization ||
          !['account', 'session'].includes(args.model) ||
          !args.where ||
          args.where.some((p) => (p.connector ?? 'AND') !== 'AND')
        )
          throw securityFailure()
        const where = args.where
        const run = async (tx: DBTransactionAdapter) => {
          // Keep native predicate identity: the composed replacement guard owns this same capability.
          where.push({ field: 'userId', value: proof.authorization.userId })
          if (!(await tx.findOne({ model: args.model, where }))) throw securityFailure()
          const raw = await fence(tx, proof.authorization)
          if (many) return raw.deleteMany({ ...args, where })
          await raw.delete({ ...args, where })
          return 1
        }
        if (inTransaction) return run(instance)
        return (
          instance as A & {
            transaction: ReturnType<ReturnType<typeof prismaAdapter>>['transaction']
          }
        ).transaction(run)
      }
      const deleteOne = instance.delete
      const deleteMany = instance.deleteMany
      instance.delete = async (args) => {
        const proof = args.where ? deletions.get(args.where) : undefined
        if (!proof || !args.where) return deleteOne(args)
        deletions.delete(args.where)
        await remove(args, proof, false)
      }
      instance.deleteMany = async (args) => {
        const proof = args.where ? deletions.get(args.where) : undefined
        if (!proof || !args.where) return deleteMany(args)
        deletions.delete(args.where)
        return remove(args, proof, true)
      }
      instance.update = async <T>(args: Parameters<A['update']>[0]) => {
        const proof = (args.update as Record<symbol, Proof>)[key]
        return proof ? ((await mutate(args, proof)) as T | null) : update<T>(args)
      }
      instance.updateMany = async (args) => {
        const proof = (args.update as Record<symbol, Proof>)[key]
        if (!proof) return updateMany(args)
        await mutate(args, proof)
        return 1
      }
      return instance
    }
    return (options) => {
      const instance = factory(options)
      if (typeof instance.options?.adapterConfig.transaction !== 'function')
        throw new Error('Native account operations require a transactional adapter')
      const transaction = instance.transaction
      decorate(instance, false)
      instance.transaction = (callback) => transaction((tx) => callback(decorate(tx, true)))
      return instance
    }
  }
  const hasAuthorization = (request: Request | undefined) =>
    request !== undefined && requests.has(request)
  return { adapter, authorize, stamp, stampDeletion, hasAuthorization }
}
