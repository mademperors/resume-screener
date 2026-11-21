import { useEffect, useState } from 'react'
import { Copy, KeyRound, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { ErrorState, LoadingState } from '@/components/PageState'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatDate, formatDateTime } from '@/lib/format'
import type { ApiKey, CreatedApiKey } from '@/types/api'
import { useAuth } from '@/features/auth/AuthContext'
import { createApiKey, listApiKeys, revokeApiKey } from './api'

type KeysState =
  { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; keys: ApiKey[] }

export function AccountPage() {
  const { user } = useAuth()
  const [state, setState] = useState<KeysState>({ status: 'loading' })
  const [reloadKey, setReloadKey] = useState(0)
  const [createOpen, setCreateOpen] = useState(false)
  const [keyName, setKeyName] = useState('')
  const [creating, setCreating] = useState(false)
  const [createdKey, setCreatedKey] = useState<CreatedApiKey | null>(null)
  const [copied, setCopied] = useState(false)
  const [keyToRevoke, setKeyToRevoke] = useState<ApiKey | null>(null)

  useEffect(() => {
    let active = true
    setState({ status: 'loading' })

    listApiKeys()
      .then((keys) => {
        if (active) setState({ status: 'ready', keys })
      })
      .catch((error: unknown) => {
        if (active) {
          setState({
            status: 'error',
            message: error instanceof Error ? error.message : 'Unable to load API keys',
          })
        }
      })

    return () => {
      active = false
    }
  }, [reloadKey])

  if (!user) return null

  const rateLimit = user.company.customRateLimitPerMinute ?? user.company.apiRateLimitPerMinute

  const handleCreate = async () => {
    if (!keyName.trim()) {
      toast.error('Enter a name for the API key')
      return
    }

    setCreating(true)
    try {
      const created = await createApiKey(keyName.trim())
      setCreatedKey(created)
      setKeyName('')
      setCreateOpen(false)
      setReloadKey((key) => key + 1)
      toast.success('API key created')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to create the API key')
    } finally {
      setCreating(false)
    }
  }

  const handleCopy = async () => {
    if (!createdKey) return
    try {
      await navigator.clipboard.writeText(createdKey.key)
      setCopied(true)
      toast.success('API key copied')
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('Could not copy the key. Select and copy it manually.')
    }
  }

  const handleRevoke = async () => {
    if (!keyToRevoke) return
    try {
      await revokeApiKey(keyToRevoke.id)
      setKeyToRevoke(null)
      setReloadKey((key) => key + 1)
      toast.success('API key revoked')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to revoke the API key')
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Account</h1>
        <p className="text-sm text-muted-foreground">
          Company plan and API keys for external systems.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Company</CardTitle>
            <CardDescription>Signed in as {user.email}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Name</span>
              <span className="font-medium">{user.company.name}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Plan</span>
              <Badge variant="outline" className="capitalize">
                {user.company.plan}
              </Badge>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">API limit</span>
              <span className="font-medium">{rateLimit} requests/min per key</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Your profile</CardTitle>
            <CardDescription>Account details from Google sign-in.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Name</span>
              <span className="font-medium">{user.name ?? '—'}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Email</span>
              <span className="font-medium">{user.email}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Session</span>
              <span className="font-medium">Signs out after 30 min idle</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {createdKey ? (
        <Card className="border-primary/50">
          <CardHeader>
            <CardTitle>New API key</CardTitle>
            <CardDescription>
              Copy this key now — it is shown only once and cannot be retrieved later.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <code className="flex-1 overflow-x-auto rounded-md border border-border bg-muted px-3 py-2 font-mono text-sm">
                {createdKey.key}
              </code>
              <Button type="button" variant="outline" size="sm" onClick={handleCopy}>
                <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                {copied ? 'Copied' : 'Copy'}
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">
              Use it in the <code>X-API-Key</code> header of external requests.
            </p>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle>API keys</CardTitle>
              <CardDescription>Used by external systems to call the screening API.</CardDescription>
            </div>
            <Button type="button" size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              Create API key
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {state.status === 'loading' ? <LoadingState label="Loading API keys…" /> : null}
          {state.status === 'error' ? (
            <ErrorState message={state.message} onRetry={() => setReloadKey((key) => key + 1)} />
          ) : null}

          {state.status === 'ready' && state.keys.length === 0 ? (
            <div className="flex flex-col items-start gap-2 text-sm text-muted-foreground">
              <KeyRound className="h-5 w-5" aria-hidden="true" />
              <p>No API keys yet.</p>
            </div>
          ) : null}

          {state.status === 'ready' && state.keys.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Key</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Last used</TableHead>
                  <TableHead>
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {state.keys.map((apiKey) => (
                  <TableRow key={apiKey.id}>
                    <TableCell className="font-medium">{apiKey.name}</TableCell>
                    <TableCell>
                      <code className="font-mono text-xs">{apiKey.displayPrefix}…</code>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDate(apiKey.createdAt)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {apiKey.lastUsedAt ? formatDateTime(apiKey.lastUsedAt) : 'Never'}
                    </TableCell>
                    <TableCell>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => setKeyToRevoke(apiKey)}
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                        Revoke
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : null}
        </CardContent>
      </Card>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create API key</DialogTitle>
            <DialogDescription>
              Give the key a name so you can recognise where it is used.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault()
              void handleCreate()
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="api-key-name">Name</Label>
              <Input
                id="api-key-name"
                value={keyName}
                onChange={(event) => setKeyName(event.target.value)}
                placeholder="e.g. ATS integration"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                maxLength={100}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={creating}>
                {creating ? 'Creating…' : 'Create key'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={keyToRevoke !== null}
        onOpenChange={(open) => {
          if (!open) setKeyToRevoke(null)
        }}
        title="Revoke this API key?"
        description={`Any integration using “${keyToRevoke?.name ?? ''}” will stop working immediately.`}
        confirmLabel="Revoke key"
        destructive
        onConfirm={handleRevoke}
      />
    </div>
  )
}
