import type { RecoveryRequest } from '@broke-oclock/contracts/ingestion-recovery'
import {
  getCurrentInstance,
  type InjectionKey,
  inject,
  nextTick,
  onBeforeUnmount,
  provide,
  reactive,
} from 'vue'

export type RecoveryAttempt = {
  expectedUpdatedAt: string
  expectedContentHash: string
  mode: RecoveryRequest['mode']
  recoveryId?: string
  previousRecoveryId?: string
  stale?: boolean
  terminalKnown?: boolean
  terminalAfter?: number
}
const createWorkspace = () =>
  reactive({
    attempts: new Map<string, RecoveryAttempt>(),
    highest: new Map<string, string>(),
    epoch: 0,
    clock: 0,
    owners: 0,
  })
type Workspace = ReturnType<typeof createWorkspace>
const workspaces = new WeakMap<object, Workspace>()
const workspaceKey: InjectionKey<Workspace> = Symbol('recovery-workspace')

export const clearRecoveryWorkspace = (workspace: Workspace) => {
  workspace.epoch++
  workspace.attempts.clear()
  workspace.highest.clear()
}

export const useRecoveryWorkspace = (): Workspace => {
  const inherited = inject(workspaceKey, null)
  if (inherited) return inherited
  const root = getCurrentInstance()?.root
  const workspace = (root && workspaces.get(root)) ?? createWorkspace()
  if (root) workspaces.set(root, workspace)
  workspace.owners++
  provide(workspaceKey, workspace)
  onBeforeUnmount(() => {
    workspace.owners--
    void nextTick(() => {
      if (workspace.owners) return
      clearRecoveryWorkspace(workspace)
      if (root && workspaces.get(root) === workspace) workspaces.delete(root)
    })
  })
  return workspace
}
